import { MODULE_ID, LAYERS } from './constants.mjs';
import { AudioEngine } from './engine/AudioEngine.mjs';
import { SyncManager } from './engine/SyncManager.mjs';
import { Library } from './data/Library.mjs';
import { MixerApp } from './apps/MixerApp.mjs';
import { LibraryApp } from './apps/LibraryApp.mjs';
import { registerSceneConfigTab } from './apps/SceneConfigTab.mjs';
import { createFloatingMenu } from './apps/FloatingMenu.mjs';
import { DjSettingsApp } from './apps/DjSettingsApp.mjs';

function emptyLayerState() {
  return {
    activePlaylistId: null,
    currentTrackId: null,
    standalone: false, // true = faixa específica escolhida no Mixer, sem a playlist anexada pra rotação
    isPlaying: false,
    startedAtEpoch: null,
    positionSeconds: 0
  };
}

function registerSettings() {
  // --- world scope: estado compartilhado por todo o mundo ---
  game.settings.register(MODULE_ID, 'library', {
    scope: 'world', config: false, type: Object, default: { playlists: [] },
    // Dispara em todo client (inclusive quem originou a mudança) sempre que
    // playlists/tracks são editadas — mantém LayerControllers sincronizados
    // com a versão mais recente enquanto a playlist está tocando.
    onChange: () => game.bardTale?.engine?.refreshActivePlaylists()
  });
  game.settings.register(MODULE_ID, 'layerAssignments', {
    scope: 'world', config: false, type: Object,
    default: { [LAYERS.BACKGROUND]: null, [LAYERS.OVERLAY]: null, [LAYERS.THEME]: null }
  });
  // Volume "de mundo" por camada: definido pelo GM/DJ, sincronizado a todo mundo —
  // distinto do volume local (client scope) de cada jogador, ver settings.volume.* abaixo.
  game.settings.register(MODULE_ID, 'layerVolume', {
    scope: 'world', config: false, type: Object,
    default: { [LAYERS.BACKGROUND]: 1, [LAYERS.OVERLAY]: 1, [LAYERS.THEME]: 1 }
  });
  game.settings.register(MODULE_ID, 'djUserIds', {
    scope: 'world', config: false, type: Array, default: []
  });
  game.settings.registerMenu(MODULE_ID, 'djSettingsMenu', {
    name: `${MODULE_ID}.apps.djSettings.title`,
    label: `${MODULE_ID}.apps.djSettings.menuLabel`,
    hint: `${MODULE_ID}.apps.djSettings.hint`,
    icon: 'fas fa-headphones',
    type: DjSettingsApp,
    restricted: true // só o GM vê esse item no menu de configurações
  });
  game.settings.register(MODULE_ID, 'playbackState', {
    scope: 'world', config: false, type: Object,
    default: {
      [LAYERS.BACKGROUND]: emptyLayerState(),
      [LAYERS.OVERLAY]: emptyLayerState(),
      [LAYERS.THEME]: emptyLayerState()
    }
  });

  // --- client scope: preferências locais de cada jogador ---
  // Posição em tela de cada caixinha de vídeo do YouTube — cada jogador arrasta
  // pra onde quiser, não sincronizado (não faria sentido, cada tela é diferente).
  game.settings.register(MODULE_ID, 'videoBoxPositions', {
    scope: 'client', config: false, type: Object, default: {}
  });

  game.settings.register(MODULE_ID, 'masterVolume', {
    name: `${MODULE_ID}.settings.masterVolume.name`,
    hint: `${MODULE_ID}.settings.masterVolume.hint`,
    scope: 'client', config: true, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.8
  });

  for (const layer of Object.values(LAYERS)) {
    game.settings.register(MODULE_ID, `volume.${layer}`, {
      name: `${MODULE_ID}.settings.volume.${layer}.name`,
      scope: 'client', config: true, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.8
    });
    game.settings.register(MODULE_ID, `mute.${layer}`, {
      name: `${MODULE_ID}.settings.mute.${layer}.name`,
      scope: 'client', config: true, type: Boolean, default: false
    });
  }
}

Hooks.once('init', () => {
  registerSettings();
  registerSceneConfigTab();
});

Hooks.once('ready', async () => {
  game.bardTale = {
    library: new Library(),
    sync: new SyncManager()
  };
  game.bardTale.engine = new AudioEngine(game.bardTale.sync);
  game.bardTale.sync.registerSocketHandlers(game.bardTale.engine);

  // Segunda camada de defesa: mesmo que resumeFromSnapshot falhe de um jeito
  // totalmente inesperado (já tem try/catch por camada lá dentro), isso não
  // pode impedir o Mixer/Library de serem criados — sem eles, não tem como
  // nem abrir o painel pra investigar o problema.
  try {
    await game.bardTale.engine.resumeFromSnapshot();
  } catch (err) {
    console.error(`${MODULE_ID} | resumeFromSnapshot falhou, seguindo sem restaurar playback:`, err);
  }

  game.bardTale.mixerApp = new MixerApp();
  game.bardTale.libraryApp = new LibraryApp();

  createFloatingMenu();

  console.log(`${MODULE_ID} | pronto.`);
});
