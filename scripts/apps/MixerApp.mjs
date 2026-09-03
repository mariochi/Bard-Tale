import { MODULE_ID, LAYERS } from '../constants.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Painel principal: 3 strips (background/overlay/theme) com transporte e volume. */
export class MixerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'bard-tale-mixer',
    window: { title: `${MODULE_ID}.apps.mixer.title`, icon: 'fas fa-music', resizable: true },
    position: { width: 360, height: 'auto' },
    actions: {
      togglePlay: MixerApp.#onTogglePlay,
      stop: MixerApp.#onStop,
      openLibrary: MixerApp.#onOpenLibrary
    }
  };

  static PARTS = {
    content: { template: `modules/${MODULE_ID}/templates/mixer.hbs` }
  };

  async _prepareContext(_options) {
    const engine = game.bardTale.engine;
    const isDJ = game.bardTale.sync.isAuthorized();
    const allPlaylists = game.bardTale.library.getPlaylists();
    const playlists = allPlaylists.map((p) => ({
      id: p.id,
      name: p.name,
      tracks: p.tracks.map((t) => ({ id: t.id, title: t.title }))
    }));

    const layers = Object.values(LAYERS).map((name) => {
      const controller = engine.layers[name];

      // Reconstrói o valor do <select> pro estado atual: playlist inteira
      // (controller.playlist setado) ou faixa avulsa (standalone — acha em
      // qual playlist ela mora só pra marcar a opção certa no dropdown).
      let selectValue = '';
      if (controller.playlist) {
        selectValue = controller.playlist.id;
      } else if (controller.currentTrack) {
        const owner = allPlaylists.find((p) => p.tracks.some((t) => t.id === controller.currentTrack.id));
        if (owner) selectValue = `${owner.id}::${controller.currentTrack.id}`;
      }

      return {
        name,
        label: game.i18n.localize(`${MODULE_ID}.layers.${name}`),
        trackTitle: controller.currentTrack?.title ?? game.i18n.localize(`${MODULE_ID}.apps.mixer.noTrack`),
        isPlaying: controller.isPlaying,
        volume: game.settings.get(MODULE_ID, `volume.${name}`),
        muted: game.settings.get(MODULE_ID, `mute.${name}`),
        worldVolume: game.settings.get(MODULE_ID, 'layerVolume')[name] ?? 1,
        selectValue
      };
    });
    return { layers, isDJ, playlists };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Marca a playlist ativa de cada camada no <select> (feito em JS pra não
    // depender de um helper 'eq' de Handlebars).
    for (const layer of context.layers) {
      const select = this.element.querySelector(`[data-layer-playlist="${layer.name}"]`);
      if (select) select.value = layer.selectValue;
    }

    this.element.querySelectorAll('[data-layer-volume]').forEach((input) => {
      input.addEventListener('input', async (ev) => {
        const layer = ev.target.dataset.layerVolume;
        await game.settings.set(MODULE_ID, `volume.${layer}`, Number(ev.target.value));
        game.bardTale.engine._refreshAllVolumeInputs();
      });
    });

    this.element.querySelectorAll('[data-layer-mute]').forEach((input) => {
      input.addEventListener('change', async (ev) => {
        const layer = ev.target.dataset.layerMute;
        await game.settings.set(MODULE_ID, `mute.${layer}`, ev.target.checked);
        game.bardTale.engine._refreshAllVolumeInputs();
      });
    });

    // Volume "de mundo": sincronizado a todo mundo, só quem é GM/DJ altera.
    // Usa 'change' (solta o mouse) em vez de 'input', pra não spammar o socket a cada pixel de arraste.
    this.element.querySelectorAll('[data-layer-world-volume]').forEach((input) => {
      input.addEventListener('change', async (ev) => {
        const layer = ev.target.dataset.layerWorldVolume;
        await game.bardTale.engine.requestSetLayerVolume(layer, Number(ev.target.value));
      });
    });

    // Selecionar uma playlist carrega a primeira faixa dela e mantém a rotação
    // (repetir/embaralhar conforme configurado na Library). Selecionar uma
    // faixa específica (dentro do optgroup da playlist) carrega só ela,
    // isolada — toca e para ao terminar, sem avançar pra próxima da playlist.
    this.element.querySelectorAll('[data-layer-playlist]').forEach((select) => {
      select.addEventListener('change', async (ev) => {
        const layer = ev.target.dataset.layerPlaylist;
        const raw = ev.target.value;
        if (!raw) return;

        const [playlistId, trackId] = raw.split('::');
        const playlist = game.bardTale.library.getPlaylist(playlistId);
        if (!playlist) { ev.target.value = ''; return; }

        if (trackId) {
          await game.bardTale.engine.requestLoadLayer(layer, playlistId, trackId, { standalone: true });
        } else {
          const firstTrack = playlist.tracks[0];
          if (!firstTrack) {
            ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.apps.mixer.emptyPlaylist`));
            ev.target.value = '';
            return;
          }
          await game.bardTale.engine.requestLoadLayer(layer, playlistId, firstTrack.id, { standalone: false });
        }
        this.render();
      });
    });
  }

  static async #onTogglePlay(_event, target) {
    const layer = target.closest('[data-layer]')?.dataset.layer;
    const controller = game.bardTale.engine.layers[layer];
    if (controller.isPlaying) await game.bardTale.engine.requestPause(layer);
    else await game.bardTale.engine.requestPlay(layer);
    this.render();
  }

  static async #onStop(_event, target) {
    const layer = target.closest('[data-layer]')?.dataset.layer;
    await game.bardTale.engine.requestStop(layer);
    this.render();
  }

  static #onOpenLibrary() {
    game.bardTale.libraryApp.render(true);
  }
}
