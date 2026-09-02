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

    this._applySavedPosition();
    this._makeDraggable();
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

    // Play disparado por comando remoto (não é gesto do usuário nesse client)
    // toca sempre mudo primeiro (autoplay mudo é sempre permitido) e tenta
    // desmutar sozinho — se o navegador bloquear, este botão aparece (ver
    // _updateMuteIndicator) e um clique de verdade nele sempre funciona.
    const unmuteButton = document.createElement('button');
    unmuteButton.type = 'button';
    unmuteButton.className = 'bard-tale-video-unmute';
    unmuteButton.title = game.i18n.localize(`${MODULE_ID}.video.unmute`);
    unmuteButton.innerHTML = '<i class="fas fa-volume-mute"></i>';
    unmuteButton.addEventListener('click', () => {
      this._playerHandle?.unmute();
      this._updateMuteIndicator();
    });
    wrapper.appendChild(unmuteButton);

    document.body.appendChild(wrapper);
    this._wrapper = wrapper;
    this._labelEl = label;
    return host;
  }

  /**
   * Mostra o botão de desmutar só quando o player ficou mudo (autoplay
   * bloqueado nesse client). Confere de novo com um pequeno atraso porque o
   * bloqueio do navegador pode não refletir em `isMuted()` no instante exato
   * da chamada.
   */
  _updateMuteIndicator() {
    const check = () => this._wrapper.classList.toggle('bt-muted', this._playerHandle?.isMuted?.() ?? false);
    check();
    setTimeout(check, 300);
  }

  /** Posição de cada caixinha é escolha de cada jogador — salva local (client scope), não sincronizada. */
  _applySavedPosition() {
    const saved = game.settings.get(MODULE_ID, 'videoBoxPositions')?.[this.name];
    if (!saved) return;
    // Limita à tela atual — evita uma caixinha "perdida" fora de vista se a
    // posição foi salva numa resolução diferente da de agora.
    const left = Math.min(Math.max(saved.left, 0), window.innerWidth - 40);
    const top = Math.min(Math.max(saved.top, 0), window.innerHeight - 40);
    this._wrapper.style.left = `${left}px`;
    this._wrapper.style.top = `${top}px`;
    this._wrapper.style.right = 'auto';
    this._wrapper.style.bottom = 'auto';
  }

  _savePosition() {
    const rect = this._wrapper.getBoundingClientRect();
    const positions = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'videoBoxPositions') ?? {});
    positions[this.name] = { left: Math.round(rect.left), top: Math.round(rect.top) };
    game.settings.set(MODULE_ID, 'videoBoxPositions', positions);
  }

  /** Arrasta segurando a barra de título (onde mostra camada + nome da faixa). */
  _makeDraggable() {
    this._labelEl.classList.add('draggable');
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    this._labelEl.addEventListener('pointerdown', (ev) => {
      dragging = true;
      const rect = this._wrapper.getBoundingClientRect();
      startX = ev.clientX;
      startY = ev.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      this._wrapper.style.right = 'auto';
      this._wrapper.style.bottom = 'auto';
      this._wrapper.style.left = `${startLeft}px`;
      this._wrapper.style.top = `${startTop}px`;
      this._labelEl.setPointerCapture(ev.pointerId);
    });

    this._labelEl.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      this._wrapper.style.left = `${startLeft + (ev.clientX - startX)}px`;
      this._wrapper.style.top = `${startTop + (ev.clientY - startY)}px`;
    });

    const stopDrag = () => {
      if (!dragging) return;
      dragging = false;
      this._savePosition();
    };
    this._labelEl.addEventListener('pointerup', stopDrag);
    this._labelEl.addEventListener('pointercancel', stopDrag);
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
      this._updateMuteIndicator();
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
    this._updateMuteIndicator();
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
