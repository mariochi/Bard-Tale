# Bard Tale

🌐 **[English](#english)** · **[Português (Brasil)](#português-brasil)**

---

## English

Module for Foundry VTT (v13) that plays music from external sources (v1: YouTube + local files) across three layers — **background**, **overlay**, and **theme** — synced across every client in the session.

See the full design in [ARCHITECTURE.md](ARCHITECTURE.md) (Portuguese only, for now).

### Running locally

1. Find your Foundry installation's `Data/modules` folder (usually `%localappdata%/FoundryVTT/Data/modules` on Windows).
2. Create a symbolic link from this project folder there, instead of copying it (so edits here go straight to Foundry):

   ```powershell
   New-Item -ItemType SymbolicLink -Path "$env:localappdata\FoundryVTT\Data\modules\bard-tale" -Target "<path-to-this-project>"
   ```

3. Launch Foundry, enter a world, enable the **Bard Tale** module under *Game Settings → Manage Modules*.
4. Reload the world.

### Opening the panels

- **Floating menu**: two round buttons fixed near the bottom-left corner, above the player status box — the music note opens the Mixer (everyone sees it), the book icon opens the Library (GM/DJ only). Plain DOM buttons, always fire on click.
- **Console/macro** (always works, useful for debugging):

  ```js
  game.bardTale.mixerApp.render(true);
  game.bardTale.libraryApp.render(true);
  ```

### Basic test flow

1. Open the **Library**, create a playlist, paste a YouTube video URL under "Add track".
2. Open the **Mixer**, hit play on the `background` layer.
3. On another client (or an incognito tab logged in as a different user), confirm the same track starts playing.
4. Adjust the **local** volume/mute (headphone icon) on the Mixer on that second client and confirm it doesn't affect the first one.
5. Adjust the **world** volume (antenna icon, GM/DJ only) and confirm it affects everyone.

### Authorizing other players to control playback (DJs)

As GM: *Game Settings → Configure Settings → Module Settings → Bard Tale → Manage DJs*. Check the players who can control transport (play/pause/seek/stop) in addition to the GM.

### Known limitations (v1)

- **YouTube tracks show a visible video box, with native controls, on every connected client while playing.** This isn't optional — it's a requirement of the YouTube API Terms of Service (any video played via the API must show the complete player). If all 3 layers play YouTube content at once, 3 simultaneous boxes appear, one per layer — each starts at a different position, but is draggable by its title bar, and each player can place their own wherever suits them (saved locally, not synced between clients). Local file tracks don't have this box (they don't use the YouTube API).
- **The first play in a session may need one click per player to unlock sound.** GM/DJ play/pause/stop always controls the video for everyone — but since that command arrives over a socket rather than a direct click on the player, some browsers may block autoplay-with-sound the first time. When that happens the box still plays visibly but muted, with a speaker icon over the video — one click on it unlocks the sound (the same spirit as the "click to enable audio" prompt Foundry itself already shows).
- **Spotify isn't included** (see ARCHITECTURE.md, section 9) — it would require a different playback model (Web Playback SDK per client with Premium, or remote control via Spotify Connect on the GM's client only), incompatible with the synced pipeline used for YouTube/local.
- **Native YouTube playlists (`list=`) aren't imported.** Deliberate decision: importing would require a YouTube Data API v3 key, and a fully client-side module has no way to hide that key from a curious player (it would sit in `game.settings`, visible to any client). Instead, the GM builds Bard Tale playlists manually, adding individual videos or local files through the Library.
- **Multiplayer smoke test already passed** (GM + a real second player tested together). Still not exercised in a real test: local file playback through the Library's new file picker, and automatic theme switching by scene (`SceneConfigTab`) — if something looks off there, that's the next place to check.

---

## Português (Brasil)

Módulo para Foundry VTT (v13) que reproduz música de fontes externas (v1: YouTube + arquivos locais) em três camadas — **background**, **overlay** e **theme** — sincronizadas entre todos os clients da sessão.

Veja o desenho completo em [ARCHITECTURE.md](ARCHITECTURE.md).

### Rodando localmente

1. Descubra a pasta `Data/modules` da sua instalação do Foundry (normalmente em `%localappdata%/FoundryVTT/Data/modules` no Windows).
2. Crie um link simbólico da pasta deste projeto pra lá, em vez de copiar (assim edições aqui refletem direto no Foundry):

   ```powershell
   New-Item -ItemType SymbolicLink -Path "$env:localappdata\FoundryVTT\Data\modules\bard-tale" -Target "<caminho-para-este-projeto>"
   ```

3. Suba o Foundry, entre num mundo, ative o módulo **Bard Tale** em *Game Settings → Manage Modules*.
4. Recarregue o mundo.

### Abrindo os painéis

- **Menu flutuante**: dois botões redondos fixos perto do canto inferior esquerdo, acima da caixinha de status do jogador — a nota musical abre o Mixer (todo mundo vê), o ícone de livro abre a Library (só GM/DJ). Botões DOM comuns, sempre disparam o clique.
- **Console/macro** (sempre funciona, útil pra depurar):

  ```js
  game.bardTale.mixerApp.render(true);
  game.bardTale.libraryApp.render(true);
  ```

### Fluxo básico de teste

1. Abra a **Library**, crie uma playlist, cole uma URL de vídeo do YouTube em "Adicionar faixa".
2. Abra o **Mixer**, dê play na camada `background`.
3. Em outro client (ou aba anônima logada como outro usuário), confirme que a mesma faixa começa a tocar.
4. Ajuste o volume/mute **local** (ícone de fone) do Mixer nesse segundo client e confirme que não afeta o primeiro.
5. Ajuste o volume **de mundo** (ícone de antena, só visível pra GM/DJ) e confirme que afeta todo mundo.

### Autorizar outros jogadores a controlar (DJs)

Como GM: *Game Settings → Configure Settings → Module Settings → Bard Tale → Manage DJs*. Marque os jogadores que podem controlar o transporte (play/pause/seek/stop) além do GM.

### Limitações conhecidas da v1

- **Faixas do YouTube mostram uma caixinha de vídeo visível, com controles nativos, em TODO client conectado enquanto estiverem tocando.** Não é opcional — é exigência do Termos de Serviço da API do YouTube (qualquer vídeo tocando via API precisa mostrar o player completo). Se as 3 camadas estiverem tocando YouTube ao mesmo tempo, aparecem 3 caixinhas simultâneas, uma por camada — cada uma começa numa posição diferente, mas é arrastável pela barra de título, e cada jogador escolhe a sua (fica salvo localmente, não sincroniza entre clients). Faixas de arquivo local não têm essa caixinha (não usam a API do YouTube).
- **O primeiro play numa sessão pode pedir 1 clique por jogador pra ligar o som.** O play/pause/stop do GM/DJ sempre controla o vídeo em todo mundo — mas como esse comando chega por socket (não por clique direto no player), o navegador de alguns jogadores pode bloquear autoplay com som na primeira vez. Nesse caso a caixinha toca visivelmente mas muda, com um botão de alto-falante sobre o vídeo — um clique nele libera o som (parecido com o "clique pra ativar áudio" que o próprio Foundry já pede).
- **Spotify não está incluído** (ver ARCHITECTURE.md, seção 9) — exigiria um modelo de reprodução diferente (Web Playback SDK por client com Premium, ou controle remoto via Spotify Connect só no client do GM), incompatível com o pipeline síncrono usado para YouTube/local.
- **Playlists nativas do YouTube (`list=`) não são importadas.** Decisão deliberada: importar exigiria a YouTube Data API v3 com chave própria, e um módulo 100% client-side não tem como esconder essa chave de jogadores curiosos (ela fica visível em `game.settings` pra qualquer client). Em vez disso, o mestre monta as playlists do Bard Tale manualmente, adicionando vídeos individuais ou arquivos locais pela Library.
- **Smoke test multiplayer já passou** (GM + um segundo jogador de verdade testaram junto). Ainda sem exercitar num teste real: reprodução de arquivo local pelo seletor novo da Library, e a troca automática de tema por cena (`SceneConfigTab`) — se aparecer algo estranho aí, é o próximo lugar a olhar.
