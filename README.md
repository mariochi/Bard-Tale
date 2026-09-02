# Bard Tale

Módulo para Foundry VTT (v13) que reproduz música de fontes externas (v1: YouTube + arquivos locais) em três camadas — **background**, **overlay** e **theme** — sincronizadas entre todos os clients da sessão.

Veja o desenho completo em [ARCHITECTURE.md](ARCHITECTURE.md).

## Rodando localmente

1. Descubra a pasta `Data/modules` da sua instalação do Foundry (normalmente em `%localappdata%/FoundryVTT/Data/modules` no Windows).
2. Crie um link simbólico da pasta deste projeto pra lá, em vez de copiar (assim edições aqui refletem direto no Foundry):

   ```powershell
   New-Item -ItemType SymbolicLink -Path "$env:localappdata\FoundryVTT\Data\modules\bard-tale" -Target "H:\Documentos\Projetos-Solo\Bard Tale"
   ```

3. Suba o Foundry, entre num mundo, ative o módulo **Bard Tale** em *Game Settings → Manage Modules*.
4. Recarregue o mundo.

## Abrindo os painéis

- **Controles de cena**: um ícone novo "Bard Tale" (nota musical) no final da coluna de controles de cena, à esquerda — abaixo do último ícone nativo (paleta/arte). Clique nele pra abrir o flyout com os botões "Open Mixer" (todo mundo vê) e "Open Library" (só GM/DJ). Um bug conhecido do core no v13 pra grupos de controle novos ([issue #12258](https://github.com/foundryvtt/foundryvtt/issues/12258)) foi testado ao vivo e **não ocorreu** nesta instalação — vale reconferir se algum dia atualizarem o Foundry no servidor.
- **Console/macro** (sempre funciona, útil pra depurar):

  ```js
  game.bardTale.mixerApp.render(true);
  game.bardTale.libraryApp.render(true);
  ```

## Fluxo básico de teste

1. Abra a **Library**, crie uma playlist, cole uma URL de vídeo do YouTube em "Adicionar faixa".
2. Abra o **Mixer**, dê play na camada `background`.
3. Em outro client (ou aba anônima logada como outro usuário), confirme que a mesma faixa começa a tocar.
4. Ajuste o volume/mute **local** (ícone de fone) do Mixer nesse segundo client e confirme que não afeta o primeiro.
5. Ajuste o volume **de mundo** (ícone de antena, só visível pra GM/DJ) e confirme que afeta todo mundo.

## Autorizar outros jogadores a controlar (DJs)

Como GM: *Game Settings → Configure Settings → Module Settings → Bard Tale → Manage DJs*. Marque os jogadores que podem controlar o transporte (play/pause/seek/stop) além do GM.

## Limitações conhecidas da v1

- **Faixas do YouTube mostram uma caixinha de vídeo visível, com controles nativos, em TODO client conectado enquanto estiverem tocando.** Não é opcional — é exigência do Termos de Serviço da API do YouTube (qualquer vídeo tocando via API precisa mostrar o player completo). Se as 3 camadas estiverem tocando YouTube ao mesmo tempo, aparecem 3 caixinhas simultâneas, uma por camada — cada uma começa numa posição diferente, mas é arrastável pela barra de título, e cada jogador escolhe a sua (fica salvo localmente, não sincroniza entre clients). Faixas de arquivo local não têm essa caixinha (não usam a API do YouTube).
- **O primeiro play numa sessão pode pedir 1 clique por jogador pra ligar o som.** O play/pause/stop do GM/DJ sempre controla o vídeo em todo mundo — mas como esse comando chega por socket (não por clique direto no player), o navegador de alguns jogadores pode bloquear autoplay com som na primeira vez. Nesse caso a caixinha toca visivelmente mas muda, com um botão de alto-falante sobre o vídeo — um clique nele libera o som (parecido com o "clique pra ativar áudio" que o próprio Foundry já pede).
- **Spotify não está incluído** (ver ARCHITECTURE.md, seção 9) — exigiria um modelo de reprodução diferente (Web Playback SDK por client com Premium, ou controle remoto via Spotify Connect só no client do GM), incompatível com o pipeline síncrono usado para YouTube/local.
- **Playlists nativas do YouTube (`list=`) não são importadas.** Decisão deliberada: importar exigiria a YouTube Data API v3 com chave própria, e um módulo 100% client-side não tem como esconder essa chave de jogadores curiosos (ela fica visível em `game.settings` pra qualquer client). Em vez disso, o mestre monta as playlists do Bard Tale manualmente, adicionando vídeos individuais pela Library — sem chave nenhuma, usando só o oEmbed público do YouTube.
- **Smoke test multiplayer já passou** (GM + um segundo jogador de verdade testaram junto). Ainda sem exercitar num teste real: `LocalFileProvider` (o teste até agora foi todo via YouTube) e a troca automática de tema por cena (`SceneConfigTab`) — se aparecer algo estranho aí, é o próximo lugar a olhar.
