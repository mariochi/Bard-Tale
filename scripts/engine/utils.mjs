/**
 * Rampa linear de volume ao longo do tempo, chamando `handle.setVolume()` a cada
 * frame. Usado como "crossfade" — funciona igual para YouTube e arquivos locais
 * porque não depende de Web Audio GainNode (áudio de <iframe> cross-origin do
 * YouTube não pode ser roteado por um GainNode; só dá pra controlar via
 * player.setVolume()).
 *
 * @param {import('../providers/Provider.mjs').ProviderPlayer} handle
 * @param {number} from 0..1
 * @param {number} to 0..1
 * @param {number} ms duração da rampa
 * @param {() => void} [onComplete]
 */
export function fade(handle, from, to, ms, onComplete) {
  const start = performance.now();

  function step(now) {
    const t = Math.min(1, (now - start) / ms);
    handle.setVolume(from + (to - from) * t);
    if (t < 1) requestAnimationFrame(step);
    else onComplete?.();
  }

  requestAnimationFrame(step);
}
