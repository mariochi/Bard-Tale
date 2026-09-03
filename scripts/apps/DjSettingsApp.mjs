import { MODULE_ID } from '../constants.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Tela de configuração (aberta via game.settings.registerMenu) pra escolher
 * quais jogadores, além do GM, podem controlar o transporte do Bard Tale.
 */
export class DjSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'bard-tale-dj-settings',
    window: { title: `${MODULE_ID}.apps.djSettings.title`, icon: 'fas fa-headphones' },
    position: { width: 360 },
    actions: {
      save: DjSettingsApp.#onSave
    }
  };

  static PARTS = {
    content: { template: `modules/${MODULE_ID}/templates/dj-settings.hbs` }
  };

  async _prepareContext(_options) {
    const djIds = game.settings.get(MODULE_ID, 'djUserIds') ?? [];
    const players = game.users
      .filter((u) => !u.isGM)
      .map((u) => ({ id: u.id, name: u.name, isDJ: djIds.includes(u.id) }));
    return { players };
  }

  static async #onSave() {
    const checkboxes = this.element.querySelectorAll('[data-user-id]');
    const selected = Array.from(checkboxes)
      .filter((cb) => cb.checked)
      .map((cb) => cb.dataset.userId);
    await game.settings.set(MODULE_ID, 'djUserIds', selected);
    ui.notifications.info(game.i18n.localize(`${MODULE_ID}.apps.djSettings.saved`));
    this.close();
  }
}
