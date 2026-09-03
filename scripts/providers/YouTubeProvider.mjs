import { SourceProvider, ProviderPlayer } from './Provider.mjs';

let apiPromise = null;

/** Carrega a IFrame Player API do YouTube uma única vez por sessão de navegador. */
function loadYouTubeAPI() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return apiPromise;
}

const VIDEO_ID_RE = /(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export class YouTubeProvider extends SourceProvider {
  static id = 'youtube';

  /**
   * Aceita link de vídeo único ou um videoId puro (11 chars). Playlists nativas
   * do YouTube (`list=`) não são importadas — o mestre monta as playlists do
   * Bard Tale manualmente, adicionando vídeos um a um pela Library. Se o link
   * colado tiver um `v=` além do `list=` (comum ao copiar um vídeo aberto
   * dentro de uma playlist), o `list=` é simplesmente ignorado e só o vídeo é
   * resolvido.
   */
  async resolve(input) {
    const value = input.trim();

    const videoId = value.match(VIDEO_ID_RE)?.[1] ?? (BARE_ID_RE.test(value) ? value : null);
    if (!videoId) {
      throw new Error(`Bard Tale | Não foi possível reconhecer um vídeo do YouTube em: ${input}. Cole o link de um vídeo específico, não de uma playlist.`);
    }

    const meta = await this._fetchOEmbed(videoId).catch(() => null);
    return {
      id: foundry.utils.randomID(),
      title: meta?.title ?? videoId,
      provider: YouTubeProvider.id,
      sourceId: videoId,
      thumbnail: meta?.thumbnail_url ?? null
    };
  }

  async _fetchOEmbed(videoId) {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`);
    if (!res.ok) throw new Error('oEmbed request failed');
    return res.json();
  }

  createPlayer(container) {
    return new YouTubePlayerHandle(container);
  }
}

class YouTubePlayerHandle extends ProviderPlayer {
  constructor(container) {
    super();
    this._container = container;
    this._player = null;
    this._callbacks = { ready: [], ended: [], error: [] };
    this._readyPromise = this._init();
  }

  async _init() {
    const YT = await loadYouTubeAPI();
    await new Promise((resolve) => {
      // Termos de Serviço da API do YouTube exigem o player COMPLETO e visível
      // sempre que um vídeo estiver tocando — daí o tamanho de verdade (a caixa
      // em bard-tale.css é do mesmo tamanho) e nada de `controls: 0`, que
      // esconderia a interface nativa deles.
      this._player = new YT.Player(this._container, {
        height: '158',
        width: '280',
        playerVars: { autoplay: 0 },
        events: {
          onReady: () => {
            resolve();
            this._callbacks.ready.forEach((cb) => cb());
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.ENDED) this._callbacks.ended.forEach((cb) => cb());
          },
          onError: (event) => this._callbacks.error.forEach((cb) => cb(event.data))
        }
      });
    });
  }

  async load(track) {
    await this._readyPromise;
    this._player.cueVideoById(track.sourceId);
  }

  play() { this._player?.playVideo(); }
  pause() { this._player?.pauseVideo(); }
  seek(seconds) { this._player?.seekTo(seconds, true); }
  setVolume(v) { this._player?.setVolume(Math.round(Math.min(1, Math.max(0, v)) * 100)); }
  onReady(cb) { this._callbacks.ready.push(cb); }
  onEnded(cb) { this._callbacks.ended.push(cb); }
  onError(cb) { this._callbacks.error.push(cb); }
  destroy() { this._player?.destroy(); }
}
