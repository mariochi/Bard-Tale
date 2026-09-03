import { MODULE_ID, LAYERS } from '../constants.mjs';

/**
 * Injeta na SceneConfig um campo pra atrelar uma playlist "theme" à cena, e
 * escuta `canvasReady` pra trocar a camada theme automaticamente quando a
 * flag `themeAutoSwitch` estiver ligada.
 *
 * Confirmado contra a doc oficial (SceneConfig no v13 é ApplicationV2 com PARTS
 * `basics`/`grid`/`lighting`/`ambience`, navegados pelo tabgroup "sheet") que a
 * aba de dados gerais da cena é `basics` — daí o seletor `.tab[data-tab="basics"]`.
 */
export function registerSceneConfigTab() {
  Hooks.on('renderSceneConfig', async (app, html) => {
    const scene = app.document;
    const themePlaylistId = scene.getFlag(MODULE_ID, 'themePlaylistId') ?? '';
    const autoSwitch = scene.getFlag(MODULE_ID, 'themeAutoSwitch') ?? false;
    const playlists = game.bardTale.library.getPlaylists();

    const section = await foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE_ID}/templates/scene-config-tab.hbs`,
      { playlists, autoSwitch }
    );

    const root = html instanceof HTMLElement ? html : html[0];
    const mount = root.querySelector('.tab[data-tab="basics"]') ?? root;
    mount.insertAdjacentHTML('beforeend', section);

    const select = root.querySelector('[name="flags.bard-tale.themePlaylistId"]');
    if (select) select.value = themePlaylistId;
    select?.addEventListener('change', (ev) => scene.setFlag(MODULE_ID, 'themePlaylistId', ev.target.value || null));

    root.querySelector('[name="flags.bard-tale.themeAutoSwitch"]')
      ?.addEventListener('change', (ev) => scene.setFlag(MODULE_ID, 'themeAutoSwitch', ev.target.checked));
  });

  Hooks.on('canvasReady', async (canvas) => {
    if (!game.user.isGM) return;
    const scene = canvas.scene;
    const autoSwitch = scene?.getFlag(MODULE_ID, 'themeAutoSwitch');
    const themePlaylistId = scene?.getFlag(MODULE_ID, 'themePlaylistId');
    if (!autoSwitch || !themePlaylistId) return;

    const playlist = game.bardTale.library.getPlaylist(themePlaylistId);
    const firstTrack = playlist?.tracks[0];
    if (!playlist || !firstTrack) return;

    await game.bardTale.engine.requestLoadLayer(LAYERS.THEME, playlist.id, firstTrack.id);
    await game.bardTale.engine.requestPlay(LAYERS.THEME);
  });
}
