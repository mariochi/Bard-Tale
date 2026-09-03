import { MODULE_ID } from '../constants.mjs';

/**
 * Grupo próprio nos Scene Controls (coluna de ícones à esquerda), com um
 * flyout de dois botões: abrir Mixer / abrir Library.
 *
 * Existe um issue aberto do core no v13 relatando que ferramentas de um grupo
 * de controles novo ficam inutilizáveis ao entrar na categoria
 * (github.com/foundryvtt/foundryvtt#12258) — testado ao vivo nesta instalação
 * e não reproduziu, mas o issue upstream segue aberto, então vale reconferir
 * depois de qualquer atualização do Foundry no servidor.
 */
export function registerSceneControls() {
  Hooks.on('getSceneControlButtons', (controls) => {
    controls.bardTale = {
      name: 'bardTale',
      title: game.i18n.localize(`${MODULE_ID}.controls.groupTitle`),
      icon: 'fas fa-music',
      order: 100, // depois de todos os grupos nativos, fica por último na coluna
      activeTool: 'openMixer',
      visible: true,
      tools: {
        openMixer: {
          name: 'openMixer',
          title: game.i18n.localize(`${MODULE_ID}.controls.openMixer`),
          icon: 'fas fa-music',
          order: 0,
          button: true,
          visible: true,
          onChange: () => game.bardTale.mixerApp.render(true)
        },
        openLibrary: {
          name: 'openLibrary',
          title: game.i18n.localize(`${MODULE_ID}.controls.openLibrary`),
          icon: 'fas fa-book-music',
          order: 1,
          button: true,
          visible: game.bardTale?.sync?.isAuthorized() ?? false,
          onChange: () => game.bardTale.libraryApp.render(true)
        }
      }
    };
  });
}
