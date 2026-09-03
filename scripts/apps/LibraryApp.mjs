import { MODULE_ID, LAYERS } from '../constants.mjs';
import { YouTubeProvider } from '../providers/YouTubeProvider.mjs';
import { LocalFileProvider } from '../providers/LocalFileProvider.mjs';
import { Playlist, LOOP_MODES } from '../data/Playlist.mjs';

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { FilePicker } = foundry.applications.apps;

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Gerencia playlists/tracks da biblioteca (world setting). */
export class LibraryApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'bard-tale-library',
    window: { title: `${MODULE_ID}.apps.library.title`, icon: 'fas fa-book-music', resizable: true },
    position: { width: 480, height: 600 },
    actions: {
      newPlaylist: LibraryApp.#onNewPlaylist,
      renamePlaylist: LibraryApp.#onRenamePlaylist,
      deletePlaylist: LibraryApp.#onDeletePlaylist,
      setLoop: LibraryApp.#onSetLoop,
      shufflePlaylist: LibraryApp.#onShufflePlaylist,
      addFromUrl: LibraryApp.#onAddFromUrl,
      addFromFile: LibraryApp.#onAddFromFile,
      loadIntoLayer: LibraryApp.#onLoadIntoLayer,
      removeTrack: LibraryApp.#onRemoveTrack,
      moveTrack: LibraryApp.#onMoveTrack
    }
  };

  static PARTS = {
    content: { template: `modules/${MODULE_ID}/templates/library.hbs` }
  };

  static LAYER_ICONS = { [LAYERS.BACKGROUND]: 'fa-water', [LAYERS.OVERLAY]: 'fa-bolt', [LAYERS.THEME]: 'fa-theater-masks' };

  async _prepareContext(_options) {
    const layerButtons = Object.values(LAYERS).map((id) => ({
      id,
      icon: LibraryApp.LAYER_ICONS[id],
      label: game.i18n.localize(`${MODULE_ID}.layers.${id}`)
    }));
    const playlists = game.bardTale.library.getPlaylists().map((p) => ({
      id: p.id,
      name: p.name,
      loopPlaylist: p.loop === LOOP_MODES.PLAYLIST,
      loopTrack: p.loop === LOOP_MODES.TRACK,
      tracks: p.tracks
    }));
    return { playlists, layerButtons };
  }

  static async #onNewPlaylist() {
    const playlist = new Playlist({ name: game.i18n.localize(`${MODULE_ID}.apps.library.newPlaylistDefaultName`) });
    await game.bardTale.library.savePlaylist(playlist);
    this.render();
  }

  static async #onRenamePlaylist(_event, target) {
    const playlistId = target.closest('[data-playlist-id]')?.dataset.playlistId;
    const playlist = game.bardTale.library.getPlaylist(playlistId);
    if (!playlist) return;

    const name = await DialogV2.prompt({
      window: { title: game.i18n.localize(`${MODULE_ID}.apps.library.renamePlaylistTitle`) },
      content: `<input type="text" name="name" style="width:100%" value="${escapeAttr(playlist.name)}" autofocus>`,
      ok: { label: game.i18n.localize(`${MODULE_ID}.apps.library.rename`), callback: (_ev, btn) => btn.form.elements.name.value.trim() }
    }).catch(() => null);
    if (!name) return;

    playlist.name = name;
    await game.bardTale.library.savePlaylist(playlist);
    this.render();
  }

  static async #onDeletePlaylist(_event, target) {
    const playlistId = target.closest('[data-playlist-id]')?.dataset.playlistId;
    if (!playlistId) return;
    await game.bardTale.library.deletePlaylist(playlistId);
    this.render();
  }

  /** Alterna entre os dois marcadores de loop (repetir playlist / repetir faixa) — clicar no que já está ativo desliga (volta a OFF). */
  static async #onSetLoop(_event, target) {
    const playlistId = target.closest('[data-playlist-id]')?.dataset.playlistId;
    const requested = target.dataset.loop;
    const playlist = game.bardTale.library.getPlaylist(playlistId);
    if (!playlist) return;

    playlist.loop = playlist.loop === requested ? LOOP_MODES.OFF : requested;
    await game.bardTale.library.savePlaylist(playlist);
    this.render();
  }

  static async #onShufflePlaylist(_event, target) {
    const playlistId = target.closest('[data-playlist-id]')?.dataset.playlistId;
    const playlist = game.bardTale.library.getPlaylist(playlistId);
    if (!playlist) return;

    playlist.shuffleTracks();
    await game.bardTale.library.savePlaylist(playlist);
    this.render();
  }

  // Assinatura confirmada contra a doc oficial do DialogV2.prompt (v13):
  // ok.callback recebe (event, button, dialog) e o valor do input sai de
  // button.form.elements.<name>.
  static async #onAddFromUrl(_event, target) {
    const playlistId = target.closest('[data-playlist-id]')?.dataset.playlistId;
    const playlist = game.bardTale.library.getPlaylist(playlistId);
    if (!playlist) return;

    const url = await DialogV2.prompt({
      window: { title: game.i18n.localize(`${MODULE_ID}.apps.library.addTrackTitle`) },
      content: `<input type="text" name="url" style="width:100%" placeholder="https://www.youtube.com/watch?v=..." autofocus>`,
      ok: { label: game.i18n.localize(`${MODULE_ID}.apps.library.addTrack`), callback: (_ev, btn) => btn.form.elements.url.value }
    }).catch(() => null);
    if (!url) return;

    try {
      const resolved = await new YouTubeProvider().resolve(url);
      for (const track of Array.isArray(resolved) ? resolved : [resolved]) playlist.addTrack(track);
      await game.bardTale.library.savePlaylist(playlist);
    } catch (err) {
      ui.notifications.error(err.message);
    }
    this.render();
  }

  /**
   * FilePicker nativo do Foundry pra escolher um arquivo de áudio já hospedado
   * no servidor (em Data/...). O callback só dispara se o usuário selecionar
   * algo; se fechar sem escolher, o hook `closeFilePicker` resolve a Promise
   * com null (senão ficaria pendurada pra sempre nesse caso).
   */
  static async #onAddFromFile(_event, target) {
    const playlistId = target.closest('[data-playlist-id]')?.dataset.playlistId;
    const playlist = game.bardTale.library.getPlaylist(playlistId);
    if (!playlist) return;

    const path = await new Promise((resolve) => {
      let done = false;
      const finish = (value) => { if (!done) { done = true; resolve(value); } };
      Hooks.once('closeFilePicker', () => finish(null));
      new FilePicker({ type: 'audio', callback: (selected) => finish(selected) }).render(true);
    });
    if (!path) return;

    try {
      const track = await new LocalFileProvider().resolve(path);
      playlist.addTrack(track);
      await game.bardTale.library.savePlaylist(playlist);
    } catch (err) {
      ui.notifications.error(err.message);
    }
    this.render();
  }

  static async #onRemoveTrack(_event, target) {
    const playlistId = target.closest('[data-playlist-id]')?.dataset.playlistId;
    const trackId = target.closest('[data-track-id]')?.dataset.trackId;
    const playlist = game.bardTale.library.getPlaylist(playlistId);
    if (!playlist || !trackId) return;

    playlist.removeTrack(trackId);
    await game.bardTale.library.savePlaylist(playlist);
    this.render();
  }

  static async #onMoveTrack(_event, target) {
    const playlistId = target.closest('[data-playlist-id]')?.dataset.playlistId;
    const trackId = target.closest('[data-track-id]')?.dataset.trackId;
    const delta = Number(target.dataset.direction);
    const playlist = game.bardTale.library.getPlaylist(playlistId);
    if (!playlist || !trackId || !delta) return;

    playlist.moveTrack(trackId, delta);
    await game.bardTale.library.savePlaylist(playlist);
    this.render();
  }

  /** Carrega a faixa clicada na camada indicada (background/overlay/theme) — não dá play sozinho. */
  static async #onLoadIntoLayer(_event, target) {
    const layer = target.dataset.layer;
    const playlistId = target.closest('[data-playlist-id]')?.dataset.playlistId;
    const trackId = target.closest('[data-track-id]')?.dataset.trackId;
    if (!layer || !playlistId || !trackId) return;

    await game.bardTale.engine.requestLoadLayer(layer, playlistId, trackId);
    ui.notifications.info(game.i18n.format(`${MODULE_ID}.apps.library.loadedIntoLayer`, {
      layer: game.i18n.localize(`${MODULE_ID}.layers.${layer}`)
    }));
    LibraryApp.#refreshMixerIfOpen();
  }

  // Checagem por DOM (não por API interna do AppV2, incerta) — só re-renderiza
  // o Mixer se ele já estiver de fato aberto na tela.
  static #refreshMixerIfOpen() {
    if (game.bardTale.mixerApp?.element?.isConnected) game.bardTale.mixerApp.render();
  }
}
