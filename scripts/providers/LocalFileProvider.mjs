import { SourceProvider, ProviderPlayer } from './Provider.mjs';

/**
 * Confirmado contra a doc oficial (foundryvtt.com/api/v13/classes/foundry.audio.Sound.html):
 * - `new foundry.audio.Sound(src)` + `await sound.load()`.
 * - Volume é SÓ LEITURA em `.volume` — pra alterar, é `.gain.value` (o GainNode
 *   por trás), não `.volume =`.
 * - `.currentTime` também é getter-only; não existe "seek" direto — a forma
 *   suportada é parar e tocar de novo com `play({ offset })`.
 * - Eventos são via `addEventListener()` (a classe estende EventEmitter), não
 *   `.on()`. O nome exato do evento de "faixa terminou" não veio confirmado
 *   pela doc consultada — usamos 'end', que é o valor historicamente usado
 *   pelo core (inclusive pelo próprio Playlist nativo pra avançar de faixa).
 *   Se não disparar na sua build, verifique `foundry.audio.Sound.emittedEvents`
 *   no console.
 */
export class LocalFileProvider extends SourceProvider {
  static id = 'local';

  async resolve(input) {
    const filename = input.split('/').pop() ?? input;
    const title = filename.replace(/\.[^./]+$/, ''); // tira a extensão pro título ficar apresentável
    return { id: foundry.utils.randomID(), title, provider: LocalFileProvider.id, sourceId: input };
  }

  createPlayer() {
    return new LocalPlayerHandle();
  }
}

class LocalPlayerHandle extends ProviderPlayer {
  constructor() {
    super();
    this._sound = null;
    this._pendingVolume = 1;
    this._isPlaying = false; // mantido à mão — não confiar num getter `.paused` não confirmado na API
    this._callbacks = { ready: [], ended: [], error: [] };
  }

  async load(track) {
    this._sound?.stop();
    this._isPlaying = false;
    this._sound = new foundry.audio.Sound(track.sourceId);
    await this._sound.load();
    this._sound.addEventListener('end', () => {
      this._isPlaying = false;
      this._callbacks.ended.forEach((cb) => cb());
    });
    this.setVolume(this._pendingVolume);
    this._callbacks.ready.forEach((cb) => cb());
  }

  play() { this._sound?.play(); this._isPlaying = true; }
  pause() { this._sound?.pause(); this._isPlaying = false; }

  seek(seconds) {
    if (!this._sound) return;
    const wasPlaying = this._isPlaying;
    this._sound.stop();
    if (wasPlaying) { this._sound.play({ offset: seconds }); this._isPlaying = true; }
  }

  setVolume(v) {
    this._pendingVolume = Math.min(1, Math.max(0, v));
    if (this._sound?.gain) this._sound.gain.value = this._pendingVolume;
  }

  onReady(cb) { this._callbacks.ready.push(cb); }
  onEnded(cb) { this._callbacks.ended.push(cb); }
  onError(cb) { this._callbacks.error.push(cb); }
  destroy() { this._sound?.stop(); }
}
