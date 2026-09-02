/**
 * Contrato que qualquer fonte de áudio externa precisa implementar.
 * O engine (LayerController/AudioEngine) só fala com este contrato — nunca
 * com detalhes de YouTube/Spotify/arquivo local diretamente.
 */
export class SourceProvider {
  static id = 'base';

  /**
   * Recebe uma URL/entrada colada pelo usuário e devolve um Track (ou lista de Tracks,
   * ex.: ao expandir uma playlist) já pronto para ser adicionado a uma Playlist.
   * @param {string} input
   * @returns {Promise<object|object[]>}
   */
  async resolve(input) {
    throw new Error(`${this.constructor.name} não implementa resolve()`);
  }

  /**
   * Cria um player anexado ao container (elemento DOM oculto) fornecido.
   * @param {HTMLElement} container
   * @returns {ProviderPlayer}
   */
  createPlayer(container) {
    throw new Error(`${this.constructor.name} não implementa createPlayer()`);
  }
}

/**
 * Handle de reprodução de uma única fonte. Uma instância por LayerController
 * (recriada quando o provider da camada muda).
 */
export class ProviderPlayer {
  /** @param {object} track */
  async load(track) { throw new Error('load() não implementado'); }
  play() { throw new Error('play() não implementado'); }
  pause() { throw new Error('pause() não implementado'); }
  /** @param {number} seconds */
  seek(seconds) { throw new Error('seek() não implementado'); }
  /** @param {number} v 0..1 */
  setVolume(v) { throw new Error('setVolume() não implementado'); }
  onReady(cb) { throw new Error('onReady() não implementado'); }
  onEnded(cb) { throw new Error('onEnded() não implementado'); }
  onError(cb) { throw new Error('onError() não implementado'); }
  /** Desmuta explicitamente — só faz sentido depois de um clique de verdade do usuário. */
  unmute() {}
  /** @returns {boolean} true se o player está mudo agora (default: nunca muda, providers sem essa noção). */
  isMuted() { return false; }
  destroy() {}
}
