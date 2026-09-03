# Bard Tale — Arquitetura (v1)

Módulo para Foundry VTT (alvo: **v13**) que reproduz música de fontes externas (v1: **YouTube** + arquivos locais) organizada em três camadas de áudio (**background / overlay / theme**), com reprodução **sincronizada entre todos os clients** conectados na sessão.

Decisões já fechadas:
- Sync: GM é autoridade; comandos de transporte se propagam via socket para todos os clients tocarem em paralelo.
- Spotify: fora do escopo v1 (limitações de Premium/OAuth por client e falta de sync real na Web Playback SDK inviabilizam o modelo síncrono). Arquitetura deixa um ponto de extensão (`SourceProvider`) para adicionar depois.
- UI: painel próprio (`ApplicationV2`), não estende a sidebar nativa de Playlists.

---

## 1. Camadas de áudio (conceito central)

| Camada | Papel | Comportamento |
|---|---|---|
| **background** | Cama ambiente contínua | Loop/playlist sequencial, crossfade entre faixas, prioridade baixa, sempre pode tocar sozinha |
| **overlay** | Cue temporário (stinger, tensão, jump scare) | Toca por cima, "duck" (abaixa) o volume do background automaticamente, ao terminar retoma o volume do background |
| **theme** | Tema contextual (cena, NPC, local) | Prioridade média, pode ser amarrado a uma Scene (flag) e trocar automaticamente ao mudar de cena |

Cada camada é independente: tem seu próprio player, playlist ativa, volume e estado de play/pause. Fórmula de volume final por camada e por client:

```
volumeFinal = masterVolume(client) × volumeCamada(mundo) × volumeLocalCamada(client) × duckFactor
```

`masterVolume` e `volumeLocalCamada` são **client-scoped** (cada jogador ajusta o próprio ouvido sem afetar os outros); o resto vem sincronizado do GM.

---

## 2. Abstração de fonte — `SourceProvider`

Contrato único para qualquer fonte de áudio, isolando o engine de sincronização dos detalhes de cada serviço:

```ts
interface SourceProvider {
  id: string; // 'youtube' | 'local' | futuramente 'spotify'
  resolve(input: string): Promise<ResolvedTrack | ResolvedTrack[]>; // URL de vídeo ou playlist -> track(s)
  createPlayer(container: HTMLElement): ProviderPlayer;
}

interface ProviderPlayer {
  load(trackId: string): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(v: number): void; // 0..1
  onReady(cb): void;
  onEnded(cb): void;
  onError(cb): void;
}
```

**v1 implementa:**
- `YouTubeProvider`: usa a IFrame Player API oficial (`https://www.youtube.com/iframe_api`), um player **visível, com controles nativos completos**, por camada, em todo client — exigência do Termos de Serviço da API do YouTube, não um detalhe opcional (ver seção 9). `resolve()` aceita link de vídeo único (ou videoId puro) e devolve título/thumbnail via oEmbed público — **playlists nativas do YouTube (`list=`) não são importadas**; o GM monta as playlists do Bard Tale manualmente, adicionando vídeos um a um (ver seção 9).
- `LocalFileProvider`: wrapper fino sobre `foundry.audio.Sound`/`AudioHelper` nativo, para quem quiser subir MP3/OGG próprios nas mesmas camadas.

Isso deixa `SpotifyProvider` como extensão futura sem tocar no engine — só precisaria decidir separadamente um modo "GM-only device" já que a Web Playback SDK não sincroniza entre clients.

---

## 3. Modelo de dados

```ts
Track {
  id, title, provider: 'youtube' | 'local',
  sourceId,          // videoId do YouTube ou path do arquivo
  duration, thumbnail,
  trimStart?, trimEnd?
}

Playlist {
  id, name,
  tracks: Track[],       // ordem é a ordem de reprodução; drag/reorder e shuffle mexem nisso
  loop: 'off' | 'playlist' | 'track'  // dois marcadores independentes de loop (não um "modo" só)
}

LayerState {           // por camada (background/overlay/theme)
  activePlaylistId,
  currentTrackId,
  isPlaying,
  startedAtEpoch,       // usado p/ calcular offset de jogadores que entram depois
  positionSeconds
}
```

**Persistência:**
- `game.settings` (**world**): `library` (playlists/tracks), `layerAssignments` (playlist padrão por camada), `layerVolume` (volume "de mundo" por camada, sincronizado — ver seção 4), `djUserIds` (jogadores autorizados a controlar além do GM), `playbackState` (snapshot das 3 `LayerState`, para reconectar/reload do GM).
- `game.settings` (**client**): volume master, volume/mute local por camada, posição do painel.
- **Scene flags**: `themePlaylistId`, `themeAutoSwitch` (bool) — permite o GM amarrar um tema a uma cena específica.

---

## 4. Sincronização (`SyncManager`)

- Canal: `game.socket` no namespace `module.bard-tale`.
- Só GM (ou usuário listado em `djUserIds`) pode emitir comandos de transporte: `loadLayer`, `play`, `pause`, `seek`, `stopLayer`, `setLayerVolume(mundo)`.
- **Validação sempre no client autorizado que originou** — nunca confiar em comandos vindos de outro client sem checar permissão no handler.
- Snapshot de estado (`playbackState`) fica em world setting; ao entrar na sessão (`ready` hook), o client lê o snapshot e calcula `elapsed = now - startedAtEpoch` para entrar praticamente no ponto certo, sem precisar esperar round-trip de socket.
- Heartbeat periódico (~10s) do GM rebroadcasta posição atual; clients com drift acima de um limiar re-seekam.
- **Desbloqueio de áudio**: navegadores bloqueiam autoplay com som sem gesto do usuário. O painel exige um clique inicial ("Ativar áudio") por client — reaproveita a mesma lógica que o Foundry já usa para liberar seu próprio `AudioHelper`.

---

## 5. Engine local (por client)

```
AudioEngine
 ├─ LayerController (background)
 ├─ LayerController (overlay)
 └─ LayerController (theme)
```

Cada `LayerController`:
- Instancia o `ProviderPlayer` certo conforme a track atual.
- Faz crossfade entre track antiga/nova via `GainNode` (Web Audio), não corte seco.
- Aplica ducking: quando `overlay` está tocando, `background.targetGain` é multiplicado por um fator configurável (ex.: 0.3) com fade suave; ao overlay terminar, volta ao normal.
- Aplica a fórmula de volume final (seção 1) recalculada sempre que qualquer um dos fatores muda.

---

## 6. UI

- **Mixer App** (`ApplicationV2` + `HandlebarsApplicationMixin`): 3 strips verticais (Background/Overlay/Theme) — now playing, dropdown pra escolher uma playlist salva e carregar a primeira faixa dela direto na camada (GM/DJ), transporte (só GM/DJ vê botões habilitados), fader de volume (visível a todos, local).
- **Library App**: CRUD de playlists/tracks — colar URL de um vídeo do YouTube → `resolve()` → adiciona à playlist escolhida (o GM monta a playlist manualmente, vídeo a vídeo; ver seção 9), ou escolher um arquivo de áudio já hospedado no servidor via `FilePicker` nativo do Foundry (`type: 'audio'`) → `LocalFileProvider#resolve()`; renomear/excluir playlist; dois marcadores de loop por playlist (repetir playlist / repetir faixa atual, mutuamente exclusivos — clicar no ativo desliga) e um botão de embaralhar a ordem das faixas; cada faixa tem botões de mover pra cima/baixo, remover, e 3 botõezinhos (background/overlay/theme) que chamam `engine.requestLoadLayer` pra carregar aquela faixa na camada — carregar não dá play sozinho, isso é feito no Mixer. Toda edição de playlist propaga pros `LayerController`s que já têm aquela playlist carregada via `onChange` do setting `library` (`AudioEngine#refreshActivePlaylists`), então editar uma playlist que já está tocando não deixa a camada presa numa cópia velha em memória.
- **Scene Config tab** (hook `renderSceneConfig`): escolher `themePlaylistId` da cena + toggle de auto-troca ao ativar a cena.
- **DJ Settings App** (via `game.settings.registerMenu`, só GM): checklist de jogadores autorizados a controlar o transporte além do GM — grava em `djUserIds`.
- **Scene Controls — grupo próprio**: um ícone `bardTale` (nota musical do FontAwesome) na coluna de controles de cena (depois de todos os grupos nativos), com um flyout de dois botões (Mixer/Library). Testamos primeiro pendurar os botões dentro do grupo "tokens" (pra fugir do bug do #12258, ver seção 9) e depois um menu flutuante injetado no `document.body` — nenhum dos dois deu o resultado esperado na prática (o flutuante simplesmente não apareceu na tela do usuário, causa não identificada), então voltamos a testar um grupo próprio de verdade, que é a forma "nativa" de fazer isso e a mais visível pro usuário.
- Painel "now playing" compacto opcional para jogadores (somente leitura + fader local) — não implementado na v1.

---

## 7. Estrutura de pastas do módulo

```
bard-tale/
  module.json
  scripts/
    main.mjs
    engine/
      AudioEngine.mjs
      LayerController.mjs
      SyncManager.mjs
    providers/
      Provider.mjs
      YouTubeProvider.mjs
      LocalFileProvider.mjs
    data/
      Track.mjs
      Playlist.mjs
      Library.mjs
    apps/
      MixerApp.mjs
      LibraryApp.mjs
      SceneConfigTab.mjs
      SceneControls.mjs
      DjSettingsApp.mjs
  templates/
    mixer.hbs
    library.hbs
    scene-config-tab.hbs
    dj-settings.hbs
  icons/
    mixer.svg
    library.svg
  styles/
    bard-tale.css
  lang/
    en.json
    pt-BR.json
```

---

## 8. Fluxo típico

1. GM cola URL do YouTube na Library App → `YouTubeProvider.resolve()` → vira `Track` → entra numa `Playlist`.
2. GM atribui a playlist à camada `background` e dá play no Mixer.
3. `SyncManager` valida permissão, grava `playbackState`, emite `play` via socket.
4. Todo client (GM incluso) recebe o evento → `LayerController.background` carrega o player do YouTube (visível, com controles nativos completos — ver seção 9 sobre compliance com o ToS da API do YouTube), aplica gain conforme fórmula de volume, dá play.
5. Jogador que entra depois: lê `playbackState` do world setting, calcula offset, entra sincronizado.

---

## 9. Riscos / pontos em aberto

- **Política de autoplay dos navegadores**: precisa do gesto de "ativar áudio" por client (mitigado, ver seção 4).
- **Deriva de sincronia** ao longo de sessões longas: mitigado com heartbeat + re-seek, mas não será sample-accurate — aceitável para trilha ambiente, não para efeitos que exigem sincronismo fino.
- **YouTube**: uso via IFrame Player API oficial é o modo de embed sancionado pelo próprio YouTube; ainda assim, disponibilidade de um vídeo específico é responsabilidade do dono do conteúdo (pode ser removido/bloqueado por região).
- **Player do YouTube precisa ser visível e completo (ToS) — não é opcional.** A v1 original escondia o player (iframe 1x1, `controls: 0`) por ser "só música de fundo". A revisão do time do Foundry apontou que isso viola o Termos de Serviço da API do YouTube: qualquer vídeo tocando via API precisa mostrar o player **completo** (controles nativos do YouTube), **em todo client conectado**, não só em quem abriu algum painel. Corrigido: o container de cada camada (que já existe no `document.body` de todo client, criado no `ready`) virou uma caixinha de vídeo de verdade (280×158, controles nativos), mostrada/escondida conforme o provider da faixa atual (`LayerController#_updateVideoVisibility`) — visível só quando a faixa é do YouTube, escondida pra faixas locais (que não usam essa API, sem essa exigência). Efeito colateral aceito: se as 3 camadas tocarem YouTube ao mesmo tempo, aparecem 3 players completos na tela de cada jogador simultaneamente — decisão consciente de cumprir a exigência à risca em vez de tentar restringir onde YouTube pode ser usado. Cada caixinha é arrastável (segurando a barra de título) e a posição escolhida fica salva num client setting (`videoBoxPositions`) — por jogador, não sincronizada, com um clamp pra tela atual em `_applySavedPosition` pra nunca "perder" a caixinha fora de vista numa resolução diferente.
- **Play remoto (via socket) pode não valer como "gesto do usuário" pra política de autoplay do navegador.** Um `play()` disparado pelo comando do GM/DJ chega em cada client via socket, não por clique direto naquele iframe do YouTube — alguns navegadores bloqueiam autoplay com som nesse caso, mesmo já tendo o player visível. Mitigado (não 100% eliminável, é política do navegador, não algo que dá pra forçar): `YouTubePlayerHandle#play()` sempre chama `mute()` antes de `playVideo()` (autoplay mudo é garantido em todo navegador) e tenta `unMute()` na sequência — se o navegador permitir, o som já sai na hora; se bloquear, `LayerController#_updateMuteIndicator` detecta via `isMuted()` (confere de novo depois de 300ms, pro caso do bloqueio não refletir na hora) e mostra um botão de desmutar sobre o vídeo — um clique nele é gesto de verdade, sempre funciona. Efeito prático: o GM/DJ sempre controla play/pause/stop pra todo mundo; o som pode precisar de 1 clique por jogador na primeira vez, parecido com o desbloqueio de áudio que o próprio Foundry já exige pro seu `AudioHelper`.
- **Playlists nativas do YouTube (`list=`) — decisão consciente de não importar.** Importar exigiria a YouTube Data API v3 (chave própria + `playlistItems.list`/`videos.list`). Como o módulo roda 100% no client, essa chave ficaria em `game.settings` do mundo e seria visível a qualquer jogador que abrisse o DevTools — não dá pra escondê-la de verdade sem um backend próprio, fora do escopo de um módulo Foundry. Em vez disso, o GM monta playlists manualmente na Library, adicionando vídeos individuais (só usa oEmbed público, sem chave). Se algum dia isso mudar, o ponto de extensão é só em `YouTubeProvider#resolve`.
- **Spotify (futuro)**: exigiria decidir entre (a) modo "GM-only device" via Spotify Connect (sem tocar no navegador dos jogadores) ou (b) cada jogador logando com conta Premium própria sem garantia de sync — ambos fora do modelo síncrono atual.
- **Grupo de controles de cena próprio — testado ao vivo, não reproduziu.** Existe um issue aberto do core ([foundryvtt/foundryvtt#12258](https://github.com/foundryvtt/foundryvtt/issues/12258)) relatando que ferramentas de um grupo novo ficam inutilizáveis ao entrar na categoria. Testamos o grupo `bardTale` próprio (`SceneControls.mjs`) na instalação real do usuário e o bug **não ocorreu** — clicar no ícone e nos botões do flyout funcionou normalmente. Como o issue upstream segue aberto (não foi corrigido, só não reproduziu nesta build específica do v13), vale reconferir isso depois de qualquer atualização do Foundry no servidor.
- **Smoke test multiplayer já validado** (GM + um segundo jogador de verdade), incluindo sync entre clients. Pontos ainda sem confirmação num teste real: o nome exato do evento de "faixa terminou" do `Sound` local (usamos `'end'` por convenção histórica do core — só afeta `LocalFileProvider`) e o seletor de aba da `SceneConfig` (`SceneConfigTab`, usado só pela troca automática de tema por cena, ainda não exercitado no teste).
- **(Corrigido) Comando na API do YouTube antes do `onReady` era silenciosamente ignorado.** `play()`/`pause()`/`seek()`/`setVolume()` de `YouTubePlayerHandle` chamavam o player direto, sem esperar a inicialização (só `load()` esperava). Sintoma real relatado pelo usuário: mandar "parar" logo depois de carregar uma faixa nova (janela pequena, mais provável na primeira faixa do YouTube da sessão, quando o script da API ainda está carregando) fazia a caixinha sumir (isso é independente do player, sempre funcionava) mas o `pauseVideo()` era descartado silenciosamente — vídeo continuava tocando escondido. Corrigido fazendo os 4 métodos aguardarem `_readyPromise` antes de chamar a API, igual `load()` já fazia.
