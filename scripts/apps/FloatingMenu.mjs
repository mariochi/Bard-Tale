import { MODULE_ID } from '../constants.mjs';

/**
 * Menu flutuante fixo na tela com atalhos pro Mixer (todo mundo) e pra
 * Library (só GM/DJ) — botões DOM comuns, sem depender do mecanismo dos
 * Scene Controls, que se mostrou pouco confiável pra ações repetidas (ver
 * ARCHITECTURE.md, seção 9: o botão ficava "travado apertado" e parava de
 * reabrir a janela depois do primeiro clique).
 *
 * Criado uma única vez no `ready`; sobrevive a troca de cena porque o
 * Foundry não recarrega a página inteira.
 */
export function createFloatingMenu() {
  if (document.getElementById('bard-tale-floating-menu')) return;

  const root = document.createElement('div');
  root.id = 'bard-tale-floating-menu';

  const mixerButton = document.createElement('button');
  mixerButton.type = 'button';
  mixerButton.title = game.i18n.localize(`${MODULE_ID}.controls.openMixer`);
  mixerButton.innerHTML = '<i class="fas fa-music"></i>';
  mixerButton.addEventListener('click', () => game.bardTale.mixerApp.render(true));
  root.appendChild(mixerButton);

  if (game.bardTale.sync.isAuthorized()) {
    const libraryButton = document.createElement('button');
    libraryButton.type = 'button';
    libraryButton.title = game.i18n.localize(`${MODULE_ID}.controls.openLibrary`);
    libraryButton.innerHTML = '<i class="fas fa-book-music"></i>';
    libraryButton.addEventListener('click', () => game.bardTale.libraryApp.render(true));
    root.appendChild(libraryButton);
  }

  document.body.appendChild(root);
}
