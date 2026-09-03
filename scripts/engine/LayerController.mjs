import { MODULE_ID } from '../constants.mjs';
import { YouTubeProvider } from '../providers/YouTubeProvider.mjs';
import { LocalFileProvider } from '../providers/LocalFileProvider.mjs';
import { fade } from './utils.mjs';

const PROVIDERS = {
  [YouTubeProvider.id]: YouTubeProvider,
  [LocalFileProvider.id]: LocalFileProvider
};

const CROSSFADE_MS = 1500;
const DUCK_MS = 400;
const DUCK_FACTOR = 0.3;

/**
 * Controla uma camada de áudio (background/overlay/theme): mantém o player ativo,
 * a playlist corrente, e aplica a fórmula de volume final descrita em ARCHITECTURE.md:
 *
 *   volumeFinal = master × volumeCamada(mundo) × volumeLocal(client) × duckFactor
 *
 * IMPORTANTE (compliance com o Termos de Serviço da API do YouTube): quando a
 * faixa carregada é do YouTube, o player TEM que ficar visível, com a interface
 * nativa completa (controles do YouTube), em TODO client conectado — não só em
 * quem abriu o Mixer. Como este container já é criado no `document.body` de
 * todo client (ver AudioEngine, instanciado no hook `ready`), basta parar de
 * escondê-lo: `_updateVideoVisibility()` mostra/esconde a caixinha de vídeo
 * conforme o provider da faixa atual — visível pra 'youtube', escondida pra
 * 'local' (que não usa a API do YouTube, sem essa exigência).
 */
export class LayerController {
  constructor(name, { duckable = false } = {}) {
    this.name = name;
    this.duckable = duckable; // true para 'background', que é abaixado quando 'overlay' toca
    this.playlist = null;
    this.currentTrack = null;
    this.isPlaying = false;
    this.isDucked = false;

    this._volumeInputs = { master: 1, worldLayerVolume: 1, localLayerVolume: 1, muted: false };
    this._endedCallbacks = [];
    this._container = this._createContainer(); // host onde o provider cria o player de verdade
    this._providerId = null;
    this._playerHandle = null;

    this._updateVideoVisibility();
  }

  _createContainer() {
    const wrapper = document.createElement('div');
    wrapper.className = 'bard-tale-video-box';
    wrapper.dataset.bardTaleLayer = this.name;
    wrapper.hidden = true;

    const label = document.createElement('div');
    label.className = 'bard-tale-video-label';
    wrapper.appendChild(label);

    const host = document.createElement('div');
    host.className = 'bard-tale-video-host';
    wrapper.appendChild(host);

    document.body.appendChild(wrapper);
    this._wrapper = wrapper;
    this._labelEl = label;
    return host;
  }

  /** Mostra a caixinha de vídeo (com o player completo do YouTube) só quando a faixa atual for do YouTube. */
  _updateVideoVisibility() {
    const isYouTube = this.currentTrack?.provider === YouTubeProvider.id;
    this._wrapper.hidden = !isYouTube;
    if (isYouTube) {
      const layerLabel = game.i18n.localize(`${MODULE_ID}.layers.${this.name}`);
      this._labelEl.textContent = `${layerLabel} — ${this.currentTrack.title}`;
    }
  }

  async _ensureProvider(providerId) {
    if (this._providerId === providerId && this._playerHandle) return this._playerHandle;
    this._playerHandle?.destroy();
    const ProviderClass = PROVIDERS[providerId];
    if (!ProviderClass) throw new Error(`Bard Tale | Provider desconhecido: ${providerId}`);
    this._playerHandle = new ProviderClass().createPlayer(this._container);
    this._providerId = providerId;
    this._playerHandle.onEnded(() => this._onTrackEnded());
    return this._playerHandle;
  }

  /**
   * Carrega uma faixa. Se a camada já estava tocando, faz fade-out da faixa
   * atual, troca, e fade-in na nova (crossfade).
   */
  async loadTrack(track, { crossfade = true } = {}) {
    const wasPlaying = this.isPlaying;

    if (wasPlaying && crossfade && this._playerHandle) {
      await new Promise((resolve) => fade(this._playerHandle, this._targetVolume(), 0, CROSSFADE_MS, resolve));
    }

    const handle = await this._ensureProvider(track.provider);
    await handle.load(track);
    this.currentTrack = track;
    this._updateVideoVisibility();

    if (wasPlaying) {
      handle.setVolume(0);
      handle.play();
      this.isPlaying = true;
      if (crossfade) fade(handle, 0, this._targetVolume(), CROSSFADE_MS);
      else handle.setVolume(this._targetVolume());
    } else {
      handle.setVolume(this._targetVolume());
    }
  }

  play() {
    this._playerHandle?.setVolume(this._targetVolume());
    this._playerHandle?.play();
    this.isPlaying = true;
  }

  pause() {
    this._playerHandle?.pause();
    this.isPlaying = false;
  }

  seek(seconds) {
    this._playerHandle?.seek(seconds);
  }

  /** Chamado pelo AudioEngine quando a camada 'overlay' começa/termina de tocar. */
  setDuck(isDucked) {
    if (!this.duckable || this.isDucked === isDucked) {
      this.isDucked = isDucked;
      return;
    }
    const from = this._targetVolume();
    this.isDucked = isDucked;
    const to = this._targetVolume();
    if (this._playerHandle && this.isPlaying) fade(this._playerHandle, from, to, DUCK_MS);
  }

  setVolumeInputs(inputs) {
    this._volumeInputs = { ...this._volumeInputs, ...inputs };
    if (this._playerHandle && this.isPlaying) this._playerHandle.setVolume(this._targetVolume());
  }

  onTrackEnded(cb) {
    this._endedCallbacks.push(cb);
  }

  /** Chamado pelo AudioEngine ao parar a camada (currentTrack não passa mais por loadTrack). */
  clearCurrentTrack() {
    this.currentTrack = null;
    this._updateVideoVisibility();
  }

  _targetVolume() {
    const { master, worldLayerVolume, localLayerVolume, muted } = this._volumeInputs;
    if (muted) return 0;
    const duckMult = this.duckable && this.isDucked ? DUCK_FACTOR : 1;
    return Math.min(1, Math.max(0, master * worldLayerVolume * localLayerVolume * duckMult));
  }

  async _onTrackEnded() {
    const nextId = this.playlist?.nextTrackId(this.currentTrack?.id) ?? null;
    const next = nextId ? this.playlist.getTrack(nextId) : null;
    if (next) {
      await this.loadTrack(next, { crossfade: true });
      this.play();
    } else {
      this.isPlaying = false;
      this._endedCallbacks.forEach((cb) => cb());
    }
  }

  destroy() {
    this._playerHandle?.destroy();
    this._wrapper.remove();
  }
}
