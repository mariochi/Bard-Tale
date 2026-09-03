import { Track } from './Track.mjs';

export const LOOP_MODES = Object.freeze({
  OFF: 'off',           // toca até o fim e para
  PLAYLIST: 'playlist', // ao chegar no fim, volta pro início (repete a playlist)
  TRACK: 'track'        // repete a faixa atual indefinidamente
});

// Compat com o campo antigo `mode` (versões pré-0.2): mapeia pro `loop` novo.
const LEGACY_MODE_MAP = {
  sequential: LOOP_MODES.PLAYLIST,
  shuffle: LOOP_MODES.PLAYLIST,
  'loop-one': LOOP_MODES.TRACK,
  once: LOOP_MODES.OFF
};

export class Playlist {
  constructor({ id = foundry.utils.randomID(), name = 'New Playlist', tracks = [], loop, mode } = {}) {
    this.id = id;
    this.name = name;
    this.tracks = tracks.map(Track.fromJSON);
    this.loop = loop ?? LEGACY_MODE_MAP[mode] ?? LOOP_MODES.PLAYLIST;
  }

  addTrack(track) {
    this.tracks.push(Track.fromJSON(track));
  }

  removeTrack(trackId) {
    this.tracks = this.tracks.filter((t) => t.id !== trackId);
  }

  getTrack(trackId) {
    return this.tracks.find((t) => t.id === trackId) ?? null;
  }

  /** Move a faixa uma posição pra cima (-1) ou pra baixo (+1) na lista. */
  moveTrack(trackId, delta) {
    const idx = this.tracks.findIndex((t) => t.id === trackId);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= this.tracks.length) return;
    [this.tracks[idx], this.tracks[target]] = [this.tracks[target], this.tracks[idx]];
  }

  /** Embaralha a ordem das faixas (Fisher-Yates), em memória — quem chama salva depois. */
  shuffleTracks() {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
  }

  /**
   * Calcula o id da próxima faixa a tocar, ou null se a playlist "acabou"
   * (só acontece no modo OFF ao chegar na última faixa).
   */
  nextTrackId(currentTrackId) {
    if (!this.tracks.length) return null;

    if (this.loop === LOOP_MODES.TRACK) {
      return currentTrackId ?? this.tracks[0].id;
    }

    const idx = this.tracks.findIndex((t) => t.id === currentTrackId);
    if (idx < 0) return this.tracks[0].id; // nada tocando ainda nesta playlist — começa do início

    if (idx < this.tracks.length - 1) return this.tracks[idx + 1].id;

    // chegou no fim da lista
    return this.loop === LOOP_MODES.PLAYLIST ? this.tracks[0].id : null;
  }

  toJSON() {
    return { id: this.id, name: this.name, loop: this.loop, tracks: this.tracks.map((t) => t.toJSON()) };
  }

  static fromJSON(data) {
    return data instanceof Playlist ? data : new Playlist(data);
  }
}
