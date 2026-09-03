import { MODULE_ID } from '../constants.mjs';
import { Playlist } from './Playlist.mjs';

/**
 * CRUD fino sobre o world setting 'library'. Guarda apenas dados serializáveis
 * (JSON) — instâncias de Playlist/Track são reconstruídas a cada leitura.
 */
export class Library {
  _read() {
    return game.settings.get(MODULE_ID, 'library') ?? { playlists: [] };
  }

  async _write(raw) {
    await game.settings.set(MODULE_ID, 'library', raw);
  }

  getPlaylists() {
    return (this._read().playlists ?? []).map(Playlist.fromJSON);
  }

  getPlaylist(id) {
    if (!id) return null;
    return this.getPlaylists().find((p) => p.id === id) ?? null;
  }

  async savePlaylist(playlist) {
    const raw = foundry.utils.deepClone(this._read());
    raw.playlists ??= [];
    const data = playlist.toJSON();
    const idx = raw.playlists.findIndex((p) => p.id === data.id);
    if (idx >= 0) raw.playlists[idx] = data;
    else raw.playlists.push(data);
    await this._write(raw);
  }

  async deletePlaylist(id) {
    const raw = foundry.utils.deepClone(this._read());
    raw.playlists = (raw.playlists ?? []).filter((p) => p.id !== id);
    await this._write(raw);
  }
}
