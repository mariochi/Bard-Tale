/**
 * Uma faixa individual dentro de uma Playlist.
 * `provider` identifica qual SourceProvider sabe tocar essa faixa ('youtube' | 'local').
 * `sourceId` é o identificador específico do provider (videoId do YouTube, path do arquivo local, etc).
 */
export class Track {
  constructor({
    id = foundry.utils.randomID(),
    title = 'Untitled',
    provider,
    sourceId,
    duration = null,
    thumbnail = null,
    trimStart = null,
    trimEnd = null
  } = {}) {
    this.id = id;
    this.title = title;
    this.provider = provider;
    this.sourceId = sourceId;
    this.duration = duration;
    this.thumbnail = thumbnail;
    this.trimStart = trimStart;
    this.trimEnd = trimEnd;
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      provider: this.provider,
      sourceId: this.sourceId,
      duration: this.duration,
      thumbnail: this.thumbnail,
      trimStart: this.trimStart,
      trimEnd: this.trimEnd
    };
  }

  static fromJSON(data) {
    return data instanceof Track ? data : new Track(data);
  }
}
