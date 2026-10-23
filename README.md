# CombaLista — pipeline semi-autônomo de shorts de Magic

> Canal sobre **interações divertidas** de Magic (Commander): cartas novas com antigas, joias esquecidas na pool e jogadas inusitadas. Combo barato virou só uma das pautas.

Pesquisa combos de Magic, escreve o roteiro, gera a narração e renderiza vídeos verticais (9:16) prontos para YouTube Shorts, TikTok e Reels, sempre com a mesma identidade visual.

```
Commander Spellbook ──► Scryfall + câmbio ──► Claude (roteiro) ──► ElevenLabs (voz + timestamps) ──► Remotion (render)
   combos populares       imagens e preço        JSON validado         áudio por cena + legenda         mp4 + capa + textos
```

## 1. Instalação (uma vez)

Requisitos: **Node 20+** (você já tem o 24) e ~2 GB livres.

```powershell
cd mtg-shorts
npm install
copy .env.example .env
```

Preencha o `.env`:
- `ANTHROPIC_API_KEY` — **opcional**. Sem ela, os roteiros são escritos pelo Claude Code instalado na máquina (usa o seu plano do Claude, não a API).
- `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` — **opcionais**. Sem assinatura, use `TTS_PROVIDER=windows` (voz Microsoft Maria, grátis) ou `mudo`
- `HANDLE` — o @ do canal

Na primeira execução o Remotion baixa sozinho o Chrome headless que ele usa para renderizar.

## Painel (interface visual)

- **🎲 RAMPAGE ×5** ("estou com sorte"): pesquisa, escreve, aprova e renderiza 5 vídeos sem parar, com a voz e a pauta escolhidas no topo. Os vídeos caem em Produzidos.
- Abas por combo: **Roteiro** (falas, ação de cada cena, ⚡ drama, meme, cameo), **Cartas** (carta principal, apelido, versão bonita da apresentação + acabamento, menor da Liga), **Fatos & regras** (texto oficial das cartas e fichas), **Publicação** e **Vídeo**.

Dê dois cliques em **`Abrir Painel.cmd`** (ou `npm run painel`). Abre `http://localhost:5178` no navegador, só nesta máquina.

- Etapas da fila em abas: Roteirizar → Revisar → Aprovados → Produzidos (+ Descartados)
- Cartas, preços e os passos originais do Spellbook lado a lado com o roteiro, para conferir
- Editor do roteiro com contagem de palavras, duração estimada e validação ao vivo (mesmas regras da pipeline). `Ctrl+S` salva
- Botões para pesquisar, produzir e acompanhar o log em tempo real
- Vídeos produzidos com player, download e textos de publicação com botão de copiar

Para fechar, feche a janela preta do terminal. O painel e os comandos abaixo mexem nas mesmas pastas, então dá para misturar os dois.

## Como o vídeo é montado

- **Identidade “Black & Gold”** (`src/theme.ts`): preto com poeira dourada, luz quente no canto, Cinzel dourado, faíscas e rasgo de luz nas viradas de ato. O fundo começa cinza e ganha cor conforme o combo “liga”.
- **Roteiro com storytelling** (`pipeline/script.ts`): gancho → cenas → clímax → sugestão de deck → CTA. Cada cena tem uma **ação de mecânica** (apresentar, conjurar, virar 90°, mana, fichas, comprar, dano, atacar, sacrificar, exilar, copiar, marcadores, loop, vitória).
- **Tabuleiro contínuo** (`src/Board.tsx` + `src/boardState.ts`): as cartas apresentadas ficam na mesa e cada ação anima a mudança de estado. Nada de slide.
- **Tom de voz**: sério mas leve, hipérboles absurdas, humor ácido e duplo sentido com moderação. Frases batidas são reprovadas na validação.
- **Revisão de regras**: depois de escrito, cada roteiro passa por um "juiz" que confere com o texto oficial das cartas e fichas: ataque ≠ dano, virado/desvirado, pilha e ordem dos eventos, resultados que dependem de peças fora do combo. Se achar erro, o roteiro volta para correção.
- **Versão bonita da carta principal**: na abertura e na apresentação dela, o vídeo mostra a impressão mais "cara" (Secret Lair mais recente, foil/etched, borderless...) com o acabamento imitado no render; depois volta para a versão normal. Dá para trocar a versão na aba Cartas.
- **Movimento e efeitos**: partículas com núcleo quente e rastro, raios volumétricos, grão de filme, light leak, motion blur nas cartas e movimento "de marionete" (antecipação + inclinação na direção do movimento). Falas marcadas com ⚡ drama (e o clímax) têm transição estilo anime: impact frame P&B, linhas de velocidade e corte diagonal.
- **Cor do vídeo**: a cor de destaque segue a carta principal (vermelho, azul, verde...), e a segunda cor da guilda vira a luz de fundo.
- **Pauta inusitado**: ideias do Claude passam por checagem (Spellbook ou regra a regra com o texto oficial). Mesmo assim, revise: o painel avisa “Checada pelo Claude”.

## Marca do canal

- Nome: `CANAL_NOME=CombaLista` no `.env` (trocadilho de combo + lista, em homenagem à Walking Ballista).
- Logo e ícone em `public/brand/logo.png` e `public/brand/icone.png`: ícone no canto do vídeo, logo no fechamento.
- **Para trocar:** clique no logo no canto do painel → **Trocar PNG** (fundo transparente). **Restaurar padrão** volta ao original (`public/brand/padrao/`).
- O padrão é desenhado em `scripts/logo/logo.html`; `npm run logo` regera os PNGs (com `--ativar`, já coloca em uso).

## Voz, sons e preço

- **Voz:** `TTS_PROVIDER=cartesia` (padrão, voz neural com plano grátis), `windows` (Maria, offline), `elevenlabs` ou `mudo`. Vozes prontas da Cartesia ficam em `data/vozes.json` (ex.: **Garota**: velocidade 1.5, volume 1.2, emoção "content") e aparecem no painel; `TTS_VOZ` escolhe a padrão. `TTS_VELOCIDADE` deixa a voz mais rápida (vídeo viral); os silêncios do começo e do fim de cada fala são cortados.
- **Pronúncia:** `data/pronuncia.json` diz como a voz fala cada termo ("land" → "lendi", "grave" → "greive"). A legenda continua mostrando o termo original. Adicione nomes de cartas que saírem errados.
- **Memes:** 50 sons da coleção Meme SFX Pack da SampleFocus em `public/sfx/memes/` (licença permite usar em vídeo monetizado, sem crédito; não pode redistribuir os arquivos soltos). O roteirista pode pôr até 2 memes como ponto final de piada, e alguns são fixos (bonk no dano de combate, oof, bruh no bloqueio, "now that's a lot of damage" no dano infinito).
- **Efeitos sonoros:** `npm run sfx` gera os sons em `public/sfx/padrao/` (whoosh, impacto, soco, "aiii!", caixa registradora...). Para usar um meme seu, coloque `public/sfx/meus/<mesmo-nome>.mp3`.
- **Preço:** o vídeo sempre fecha com "menor da Liga". No painel, digite o menor preço de cada carta na LigaMagic e salve: o vídeo tira o "aprox." e o valor fica guardado em `data/price-overrides.json`.

## 2. Ordem recomendada para começar

1. **Ajuste o visual:** `npm run studio` abre o Remotion Studio com dados fictícios. Toda a identidade está em `src/theme.ts` (cores, fontes, zonas seguras, molas) e as cenas em `src/scenes.tsx`. É aqui que você coloca a sua mão de motion designer.
2. **Pesquise:** `npm run pesquisar`.
   - Os roteiros são escritos automaticamente e caem em `fila/1-revisar/`: pela API se houver `ANTHROPIC_API_KEY`, senão pelo Claude Code instalado (extensão do VS Code), usando o seu plano do Claude.
   - Se algum falhar, ele fica em `fila/0-roteirizar/` e o painel tem o botão **Gerar roteiro** para tentar de novo.
3. **Revise:** abra cada JSON, ajuste o texto do `script` se quiser e **mova o arquivo** para `fila/2-aprovados/`. O que não prestar vai para `fila/descartados/` (aquele combo não volta).
4. **Produza:** `npm run produzir` → narração + render só dos aprovados; cada um vai para `fila/3-produzidos/` e o vídeo para `output/`.
5. **Agende a pesquisa:** `powershell -ExecutionPolicy Bypass -File scriptsagendar-windows.ps1 -Hora "09:00"` — todo dia aparecem roteiros novos para revisar. Quando confiar no conteúdo, `-Modo pipeline` faz tudo sozinho (`npm run pipeline`).

```
pesquisar ──► [fila/0-roteirizar ──/roteirizar──►] fila/1-revisar ──(você move)──► fila/2-aprovados ──► produzir ──► fila/3-produzidos + output/
                     └──(você move)──► fila/descartados
```

## 3. O que cada execução entrega

```
output/2026-10-22/
  relatorio.md                  ← resumo da execução (o que deu certo / falhou)
  rhystic-study-.../
    video_9x16.mp4              ← o vídeo
    capa.jpg                    ← frame do gancho para thumbnail
    publicacao.md               ← título, descrição e hashtags por plataforma + roteiro
    legendas.srt                ← para subir como legenda fechada
    roteiro.json / props.json   ← dados brutos (dá para re-renderizar)
```

Combos já produzidos (`data/history.json`) ou presentes em qualquer pasta da `fila/` não são pesquisados de novo.

## 4. Controles (`.env`)

| Variável | O que faz |
|---|---|
| `PAUTAS` | mistura de pautas da pesquisa: `novidade`, `inusitado`, `joia`, `barato` (no painel dá para escolher uma) |
| `NOVIDADE_MESES` | o que conta como carta nova |
| `JOIA_RANK_EDHREC` | o que conta como carta pouco jogada |
| `PRECO_TETO_BRL` | teto de preço fora da pauta "barato" |
| `TTS_PROVIDER` | voz: `windows` (grátis, offline), `mudo` (só legenda) ou `elevenlabs` (pago). No painel dá para escolher a cada produção |
| `TTS_WINDOWS_RATE` | velocidade da voz do Windows, de -10 a 10 |
| `VIDEOS_PER_RUN` | vídeos por execução |
| `CSB_QUERY` | busca do Commander Spellbook (mesma sintaxe do site) |
| `MAX_CARDS` | máximo de cartas no combo (2–3 rende os melhores shorts) |
| `MAX_TOTAL_BRL` | teto de custo na pauta "barato" |
| `ONLY_SELF_CONTAINED` | 1 = só combos que não dependem de "peças genéricas" (mais didático) |
| `PRICE_MULTIPLIER` | ajuste fino da estimativa para aproximar do mercado BR |

Preço manual por carta: `data/price-overrides.json` (tem prioridade sobre a estimativa).

## 5. Pontos de atenção

- **Preço é estimativa.** Vem do menor preço em papel no Scryfall (USD, base TCGplayer) convertido pelo câmbio do dia. O mercado BR (LigaMagic etc.) pode divergir bastante. O vídeo mostra isso numa nota. Se quiser preço BR de verdade, o caminho é plugar uma fonte BR em `pipeline/research.ts` ou usar o arquivo de overrides.
- **Fidelidade do combo.** O roteiro é obrigado a usar só os dados do Spellbook e passa por validação automática (cartas citadas, valor, duração), com até 3 tentativas. Mesmo assim, revise os primeiros vídeos antes de confiar no modo 100% automático.
- **Direitos.** Imagens de cartas são da Wizards of the Coast; vídeos de fã costumam se apoiar na Fan Content Policy da Wizards, e o Scryfall pede que não se remova o crédito do artista/copyright das imagens. Vale ler as duas políticas antes de monetizar.
- **Nomes das cartas** saem em inglês (como no banco). Se o seu público usa nomes em português, dá para adicionar uma etapa de tradução via Scryfall (`lang:pt`).

## 6. Estrutura

```
src/               template Remotion (visual)
  theme.ts         ← identidade visual (comece por aqui)
  Short.tsx        ← composição: fundo, cenas, áudio, legenda karaokê, rasgos de luz
  Board.tsx        ← tabuleiro e a animação de cada mecânica
  boardState.ts    ← estado da mesa (o que cada ação muda)
  scenes.tsx       ← abertura, clímax, deck, preço, CTA
  card.tsx / fx.tsx ← carta (verso da marca, virar, queimar…) e efeitos
pipeline/          automação (Node)
  research.ts      pautas: Spellbook + Scryfall (cartas novas, joias) + câmbio
  discover.ts      pauta inusitado: ideias do Claude + checagem
  llm.ts           Claude pela API ou pelo Claude Code
  script.ts        roteiro com Claude + validação
  tts.ts           ElevenLabs com timestamps
  build.ts         monta o job, baixa assets, gera arquivos de publicação
  render.ts        render programático
  queue.ts         fila de revisão (1-revisar → 2-aprovados → 3-produzidos)
  run.ts           orquestrador (pesquisar / produzir / pipeline)
  roteiro.ts       ponte do /roteirizar (briefing + validação sem API)
  server.ts        servidor do painel local
painel/index.html  interface do painel
.claude/skills/roteirizar/   o comando /roteirizar do Claude Code
scripts/agendar-windows.ps1
```

## Próximos passos possíveis

- Publicação automática (YouTube Data API; TikTok e Instagram exigem app aprovado)
- Versão 16:9 do mesmo vídeo
- Variações de gancho para teste A/B
- Música de fundo com ducking sob a narração
