import { MODULE_ID, LAYERS } from '../constants.mjs';
import { LayerController } from './LayerController.mjs';

/**
 * Orquestra as 3 camadas de áudio no client local. Métodos `requestX` são a
 * API pública chamada pela UI (validação de permissão acontece no
 * SyncManager); métodos `applyRemoteX` são chamados pelo SyncManager quando
 * um comando (próprio ou de outro client) precisa ser refletido neste client.
 */
export class AudioEngine {
  constructor(syncManager) {
    this.sync = syncManager;
    this.layers = {
      [LAYERS.BACKGROUND]: new LayerController(LAYERS.BACKGROUND, { duckable: true }),
      [LAYERS.OVERLAY]: new LayerController(LAYERS.OVERLAY),
      [LAYERS.THEME]: new LayerController(LAYERS.THEME)
    };
    // Quando o overlay termina sozinho (fim de faixa em playlist modo ONCE), libera o duck.
    this.layers[LAYERS.OVERLAY].onTrackEnded(() => this.layers[LAYERS.BACKGROUND].setDuck(false));
    this._refreshAllVolumeInputs();
  }

  /**
   * Chamado via `onChange` do setting 'library' (dispara em todo client,
   * inclusive o que originou a mudança) sempre que playlists são editadas —
   * garante que uma faixa removida/reordenada/embaralhada enquanto a
   * playlist está tocando numa camada não fique presa numa cópia velha em
   * memória (`controller.playlist` é uma instância própria, não uma
   * referência ao setting).
   */
  refreshActivePlaylists() {
    for (const controller of Object.values(this.layers)) {
      if (!controller.playlist) continue;
      const fresh = game.bardTale.library.getPlaylist(controller.playlist.id);
      if (fresh) controller.playlist = fresh;
    }
  }

  _refreshAllVolumeInputs() {
    const master = game.settings.get(MODULE_ID, 'masterVolume');
    const worldVolumes = game.settings.get(MODULE_ID, 'layerVolume');
    for (const [name, controller] of Object.entries(this.layers)) {
      controller.setVolumeInputs({
        master,
        worldLayerVolume: worldVolumes[name] ?? 1,
        localLayerVolume: game.settings.get(MODULE_ID, `volume.${name}`),
        muted: game.settings.get(MODULE_ID, `mute.${name}`)
      });
    }
  }

  // ---- API pública (chamada pela UI de GM/DJ) ----
  requestLoadLayer(layer, playlistId, trackId) { return this.sync.loadLayer(layer, playlistId, trackId); }
  requestPlay(layer) { return this.sync.play(layer); }
  requestPause(layer) { return this.sync.pause(layer); }
  requestSeek(layer, seconds) { return this.sync.seek(layer, seconds); }
  requestStop(layer) { return this.sync.stopLayer(layer); }
  requestSetLayerVolume(layer, volume) { return this.sync.setLayerVolume(layer, volume); }

  // ---- Aplicação local (própria origem ou remota, via SyncManager) ----
  async applyRemoteLoadLayer({ layer, playlistId, trackId }) {
    const playlist = game.bardTale.library.getPlaylist(playlistId);
    const track = playlist?.getTrack(trackId) ?? playlist?.tracks[0] ?? null;
    if (!playlist || !track) return;

    const controller = this.layers[layer];
    controller.playlist = playlist;
    await controller.loadTrack(track);

    await this._persistSnapshot(layer, {
      activePlaylistId: playlist.id,
      currentTrackId: track.id,
      isPlaying: false,
      startedAtEpoch: null,
      positionSeconds: 0
    });
  }

  async applyRemotePlay({ layer }) {
    this.layers[layer]?.play();
    if (layer === LAYERS.OVERLAY) this.layers[LAYERS.BACKGROUND].setDuck(true);
    await this._persistSnapshot(layer, { isPlaying: true, startedAtEpoch: Date.now() });
  }

  async applyRemotePause({ layer }) {
    this.layers[layer]?.pause();
    if (layer === LAYERS.OVERLAY) this.layers[LAYERS.BACKGROUND].setDuck(false);
    await this._persistSnapshot(layer, { isPlaying: false });
  }

  async applyRemoteSeek({ layer, seconds }) {
    this.layers[layer]?.seek(seconds);
    await this._persistSnapshot(layer, { positionSeconds: seconds, startedAtEpoch: Date.now() });
  }

  async applyRemoteStopLayer({ layer }) {
    const controller = this.layers[layer];
    controller?.stop();
    if (layer === LAYERS.OVERLAY) this.layers[LAYERS.BACKGROUND].setDuck(false);
    await this._persistSnapshot(layer, {
      activePlaylistId: null,
      currentTrackId: null,
      isPlaying: false,
      startedAtEpoch: null,
      positionSeconds: 0
    });
  }

  async applyRemoteSetLayerVolume({ layer, volume }) {
    if (game.user.isGM) {
      const world = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'layerVolume'));
      world[layer] = volume;
      await game.settings.set(MODULE_ID, 'layerVolume', world);
    }
    this.layers[layer]?.setVolumeInputs({ worldLayerVolume: volume });
  }

  /** Só o GM grava o snapshot de mundo, pra evitar corrida entre settings.set concorrentes. */
  async _persistSnapshot(layer, patch) {
    if (!game.user.isGM) return;
    const state = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'playbackState'));
    state[layer] = { ...state[layer], ...patch };
    await game.settings.set(MODULE_ID, 'playbackState', state);
  }

  /** Chamado no hook `ready`: recoloca cada camada no ponto em que estava, calculando o offset decorrido. */
  async resumeFromSnapshot() {
    const state = game.settings.get(MODULE_ID, 'playbackState');
    for (const layer of Object.values(LAYERS)) {
      const layerState = state[layer];
      if (!layerState?.currentTrackId) continue;

      const playlist = game.bardTale.library.getPlaylist(layerState.activePlaylistId);
      const track = playlist?.getTrack(layerState.currentTrackId);
      if (!playlist || !track) continue;

      const controller = this.layers[layer];
      controller.playlist = playlist;
      await controller.loadTrack(track, { crossfade: false });

      if (layerState.isPlaying && layerState.startedAtEpoch) {
        const elapsed = (Date.now() - layerState.startedAtEpoch) / 1000;
        controller.seek(layerState.positionSeconds + elapsed);
        controller.play();
        if (layer === LAYERS.OVERLAY) this.layers[LAYERS.BACKGROUND].setDuck(true);
      }
    }
  }
}
