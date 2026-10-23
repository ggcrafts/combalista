// ============================================================
//  ROTEIRO — tom de voz do canal + storytelling + ações de mecânica
//  O roteiro diz O QUE se fala e O QUE acontece no tabuleiro em cada momento.
// ============================================================
import {z} from 'zod';
import {config} from './config';
import {log} from './log';
import {askLLM, extractJson, llmEngine, type Turn} from './llm';
import {ANGLE_LABEL, enrichCombo, fetchCard, type ResearchedCombo} from './research';

const Amount = z.union([z.number().int().positive(), z.literal('infinito')]);
const Color = z.enum(['W', 'U', 'B', 'R', 'G', 'C']);
const Zone = z.enum(['mao', 'grave', 'exilio', 'comando', 'grimorio']);

/** Memes sonoros que o roteirista pode usar como "ponto final" de uma piada (public/sfx/memes) */
export const MEMES: Record<string, string> = {
  bruh: 'decepção, jogada óbvia que alguém não viu',
  oof: 'alguém tomou um prejuízo',
  aughhh: 'desespero exagerado de quem está apanhando',
  muito_dano: '"now that\'s a lot of damage" — dano absurdo',
  oh_my_god: 'espanto com o resultado',
  stoopid: 'alguém fez besteira',
  reeee: 'oponente furioso',
  goofy: 'algo ridículo ou desajeitado acontecendo',
  bong: 'revelação seca, "e é isso"',
  woo_yeah: 'comemoração exagerada',
  based: 'jogada ousada que merece respeito',
  stop_the_cap: '"para de mentir" — quando parece bom demais para ser verdade',
  you_need_to_leave: 'expulsar alguém da mesa',
  what_the_dog_doin: 'situação sem sentido',
  squirrel_laugh: 'risadinha de esquilo (só com esquilos!)',
  slap_oh: 'tapa inesperado',
};

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('play'), card: z.string(), from: Zone.optional()}),
  z.object({type: z.literal('cast'), card: z.string(), text: z.string().max(70).optional()}),
  z.object({type: z.literal('focus'), card: z.string(), text: z.string().max(70)}),
  z.object({type: z.literal('trigger'), card: z.string(), text: z.string().max(70), resolve: z.boolean().optional()}),
  z.object({type: z.literal('resolve'), text: z.string().max(70).optional()}),
  z.object({type: z.literal('tap'), card: z.string()}),
  z.object({type: z.literal('untap'), cards: z.union([z.array(z.string()).min(1), z.literal('todas')])}),
  z.object({type: z.literal('mana'), amount: Amount, color: Color.optional()}),
  z.object({
    type: z.literal('tokens'),
    amount: Amount,
    card: z.string().optional(),
    label: z.string().max(40).optional(),
    copyOf: z.string().optional(),
    tapped: z.boolean().optional(),
  }),
  z.object({type: z.literal('draw'), amount: Amount}),
  z.object({type: z.literal('damage'), amount: Amount, target: z.enum(['oponentes', 'oponente']), source: z.string().optional()}),
  z.object({type: z.literal('lifegain'), amount: Amount}),
  z.object({type: z.literal('attack'), card: z.string(), blocked: z.boolean().optional()}),
  z.object({type: z.literal('sacrifice'), card: z.string()}),
  z.object({type: z.literal('exile'), card: z.string()}),
  z.object({type: z.literal('return'), card: z.string()}),
  z.object({type: z.literal('move'), card: z.string(), to: z.enum(['mao', 'grave', 'exilio', 'comando', 'grimorio', 'mesa'])}),
  z.object({type: z.literal('copy'), card: z.string()}),
  z.object({type: z.literal('counters'), card: z.string(), amount: Amount}),
  z.object({type: z.literal('loop'), cards: z.array(z.string()).min(1)}),
  z.object({type: z.literal('win')}),
  z.object({type: z.literal('none')}),
]);

/** Outra carta citada na fala (comandante sugerido, carta de exemplo): aparece na lateral, estilo "toasty" */
const Cameo = z.object({card: z.string().min(2), quip: z.string().max(24).optional()});

const Line = z.object({
  onScreen: z.string().max(70),
  narration: z.string().min(1),
  cameo: Cameo.optional(),
  /** meme sonoro tocado logo depois da fala (ponto final da piada) */
  meme: z.string().optional(),
  /** momento dramático/punchline: transição estilo anime no começo da fala */
  drama: z.boolean().optional(),
});

export const ScriptSchema = z.object({
  v: z.literal(2),
  title: z.string().min(5).max(100),
  hook: Line,
  beats: z.array(Line.extend({action: ActionSchema})).min(2).max(10),
  payoff: Line,
  deck: Line,
  /** legado: o preço agora é gerado pelo pipeline ("menor da Liga"), não pelo roteirista */
  price: Line.optional(),
  cta: Line,
  post: z.object({
    youtube: z.object({title: z.string().max(100), description: z.string(), tags: z.array(z.string())}),
    tiktok: z.object({caption: z.string()}),
    instagram: z.object({caption: z.string()}),
  }),
});
export type Script = z.infer<typeof ScriptSchema>;

/** Falas escritas pelo roteirista, na ordem do vídeo (o preço é gerado à parte) */
export const scriptLines = (s: Script) => [s.hook, ...s.beats, s.payoff, s.deck, s.cta];

export const SYSTEM = `Você é o roteirista e a voz de um canal brasileiro de Magic: The Gathering (foco em Commander) que posta vídeos verticais curtos (Shorts, TikTok, Reels).

TOM DE VOZ
- Sério na informação; o humor vem da ironia, não de piadinha. Humor ÁCIDO: alfinete o oponente, a mesa, o meta, a própria carta (o custo absurdo, a arte, o quanto ela parece inofensiva), o jogador que deixou passar. Seco, afiado, de quem joga há anos.
- Cada piada precisa ter alvo e carregar informação. Se a frase só está ali para ser engraçada, corte.
- Hipérbole só no clímax ou quando o número realmente for absurdo. Nada de comparação aleatória com o cotidiano (repartição, cartório, almoço de família, fila de banco...): virou muleta.
- Duplo sentido: no máximo um, e só se sair natural.
- Use o universo do Magic como fonte de piada: eventos (LigaFest, Pro Tour, pré-release, Friday Night Magic), cultura de mesa (mulligan, rule zero, a pessoa que demora pra jogar, o "salt", o "não tem resposta?"), o meta, o preço das cartas, o comandante que todo mundo odeia. Seja criativo e específico; não repita os exemplos.
- Pode citar pessoas reais da comunidade só de forma carinhosa ou neutra; nunca faça piada depreciativa com alguém pelo nome.
- Ritmo de vídeo viral: frases curtas e encadeadas, sem enrolação.
- Nada de clichê de youtuber ("fala, galera", "deixa o like", "neste vídeo").

JEITO DE FALAR DO JOGADOR BRASILEIRO (use; é o que dá credibilidade)
- Termos que a mesa fala em inglês: land (ou "terreno"), upkeep, draw, board wipe, deck, commander, token, loop, pool, stack, trigger, ETB, flash, haste, blink, payoff, combo.
- "sacar" = sacrificar ("saca o Skeleton"). "grave" = cemitério ("volta do grave"). "tapar"/"desvirar".
- Expressões respeitadas: "no seu turno", "no turno do oponente", "em instant speed", "se ninguém tiver resposta", "passa a prioridade", "resolve", "combou, mostra o payoff", "com isso na zona de comando...".
- Habilidades que o jogador brasileiro fala em português: "Miríade" (nunca "myriad"). Escreva assim também nos textos de tela das ações.
- Uma cor só: "mono" + a cor em inglês ("mono green", "mono red", "mono blue", "mono black", "mono white"). Nunca "verde puro", "mono verde".
- Gíria de mesa, quando couber: "dork" (criatura que vira para gerar mana), "pedra de mana" (artefato que gera mana), "ramp", "tutor", "removal", "board wipe", "contramágica", "stax", "aristocrats" (sacar por valor), "voltron", "wincon", "staple", "jank", "value".
- APELIDOS: na primeira vez, diga o nome da carta; nas próximas, pode usar um apelido ácido e reconhecível (pela arte, pelo nome, pelo que a carta faz). Se a carta tiver "apelido" nos dados, use esse.
- Quando ajudar a entender, diga o tipo e o tamanho da carta, como o jogador fala: "é um humano cavaleiro quatro quatro", "criatura encantamento lendária", "ficha esquilo um um".
- FORÇA/RESISTÊNCIA: leia só os dois números, "quatro quatro", "cinco cinco", "um um" (sem "por", sem barra). Só se a dupla puder soar como outro número, use "quatro barra quatro".

ESTRUTURA — uma história que escala, não uma lista de slides
- hook: UMA frase de impacto, no máximo 9 palavras (menos de 3 segundos). Provocação ou promessa forte ligada às cartas.
- beats: a jogada em ordem, cada um com UMA ação (action) que o vídeo anima enquanto a fala acontece. Apresente as peças com "focus" (o que cada uma faz, em uma frase), depois a jogada.
- payoff: o clímax — o resultado ("combou, mostra o payoff").
- deck: deckbuilding. Cite pelo nome um comandante ou peça real que combine e mostre como cameo.
- cta: provoque um COMENTÁRIO ligado a este vídeo: pergunte qual comandante a pessoa usaria, que peça trocaria, se já perdeu (ou ganhou) com isso, qual resposta ela teria. Nada de "segue o canal", "se inscreve", "deixa o like", "ativa o sininho".
- NÃO escreva fala de preço: o pipeline acrescenta sozinho o "menor da Liga".

REGRAS DO JOGO NA TELA (respeite as regras oficiais e a ordem dos eventos)
- PILHA: mágicas e habilidades ativadas/desencadeadas (exceto de mana) vão para a pilha e só fazem efeito quando RESOLVEM. "trigger" põe na pilha; "resolve" resolve o topo.
  Se o efeito MUDA A MESA (desvirar, criar fichas, comprar, dano, marcadores, mudar de zona), use "trigger" SEM "resolve" e, no beat seguinte, a ação do efeito ("untap", "tokens", "draw"...): ela é a resolução e a pilha mostra o item resolvendo.
  "resolve": true no trigger só quando o efeito não aparece na mesa (ex.: dar uma habilidade até o fim do turno).
- Habilidades de mana NÃO usam a pilha: use "mana".
- COMBATE: "attack" é só a DECLARAÇÃO de atacantes (a criatura vira, se não tiver vigilância, e aponta para o oponente). Dano de combate é outra etapa: use "damage" com "source" = a criatura, e só quando o dano realmente acontece. Se as criaturas morrem antes do dano, não houve dano.
- ESTADOS: vire/desvire exatamente como o texto oficial manda. Fichas criadas "viradas e atacando" usam "tapped": true. Depois de "desvira tudo", fichas e cartas ficam desviradas.
- FICHAS: use o nome da ficha que está em "fichas" da carta (ex.: "Squirrel"). Cópias de uma carta usam "copyOf": nome da carta copiada.
- RESULTADOS: diga só o que o combo garante com ESTAS cartas. Se o resultado depende de algo fora do combo (ex.: mana infinita só com criatura que gera mana em campo; dano só se ninguém bloquear), diga a condição ou não diga.
- ZONAS: diga e mostre de onde a carta vem e para onde vai (mão, grave, exílio, zona de comando, grimório).
- LOOP: mostre UMA volta completa passo a passo e só então "loop".

CAMEO ("toasty")
- Todo vídeo tem PELO MENOS 1 cameo e no máximo 2: "cameo": {"card": "Nome exato em inglês", "quip": "até 3 palavras"}. O lugar natural é o "deck". Só cartas reais e que NÃO são do combo.

MOMENTOS DRAMÁTICOS (no máximo 3 por vídeo)
- "drama": true na fala do punchline ou da virada (o loop fechando, o payoff, a jogada que ninguém esperava). O vídeo faz uma transição dramática estilo anime no começo dela.

MEMES SONOROS (opcional, no máximo 2 por vídeo)
- "meme": nome de um destes, tocado logo depois da fala, como ponto final de uma piada que já funciona sem ele:
${Object.entries(MEMES).map(([k, v]) => `  ${k}: ${v}`).join('\n')}

PAUTAS
- novidade: destaque a carta nova (diga a coleção) e como ela conversa com cartas antigas.
- inusitado: venda a surpresa ("ninguém tá jogando isso, e devia").
- joia: carta pouco conhecida; "dá uma olhada na sua pool, é bem capaz de você ter essa".
- barato: o preço é o argumento central (o valor entra sozinho no fim).

FIDELIDADE (inegociável)
- Use SOMENTE os fatos do JSON e o texto oficial das cartas e fichas. Não invente efeitos, custos, interações ou preços.
- Os beats seguem a ordem dos passos fornecidos; simplifique sem pular etapa que mude o funcionamento.
- Nomes de cartas em inglês, exatamente como no JSON. Na narração pode encurtar nome com vírgula (ex.: "Niv-Mizzet").

NARRAÇÃO (vai para um sintetizador de voz)
- Números e valores por extenso; nunca "R$" nem algarismos (inclusive força/resistência: "quatro por quatro").
- Total de 80 a 135 palavras somando todas as falas.
- onScreen: até 6 palavras (hook até 8). Nos beats pode ser "" quando a animação já fala por si. Não numere passos.

AÇÕES — escolha a que MOSTRA a mecânica daquele momento:
- {"type":"focus","card":X,"text":"o que ela faz, curto"} → aproxima a carta para explicar
- {"type":"play","card":X,"from":"mao|comando|grave|exilio"} → conjura permanente (pilha → mesa)
- {"type":"cast","card":X,"text":"efeito"} → conjura instant/feitiço (pilha → resolve → grave)
- {"type":"trigger","card":X,"text":"o que a habilidade faz","resolve":true} → habilidade vai para a pilha
- {"type":"resolve","text":"o que acontece"} → topo da pilha resolve
- {"type":"tap","card":X} / {"type":"untap","cards":[X,Y] ou "todas"} → virar/desvirar 90°
- {"type":"mana","amount":N ou "infinito","color":"W|U|B|R|G|C"} → mana (sem pilha)
- {"type":"tokens","amount":N ou "infinito","card":quem cria,"label":"nome da ficha","copyOf":carta copiada,"tapped":true|false} → fichas
- {"type":"draw","amount":N ou "infinito"} → comprar (grimório → mão)
- {"type":"attack","card":X} → DECLARA o ataque (sem dano)
- {"type":"damage","amount":N ou "infinito","target":"oponentes" ou "oponente","source":criatura que causa o dano} → dano de verdade
- {"type":"lifegain","amount":N ou "infinito"} → sua vida subindo
- {"type":"sacrifice","card":X ou "fichas"} → saca/morre (mesa → grave)
- {"type":"exile","card":X ou "grimorio"} → exila
- {"type":"return","card":X} → volta do grave para a mesa
- {"type":"move","card":X ou "fichas","to":"mao|grave|exilio|comando|grimorio|mesa"} → outra mudança de zona
- {"type":"copy","card":X} / {"type":"counters","card":X,"amount":N ou "infinito"} → cópia, marcadores +1/+1
- {"type":"loop","cards":[X,Y]} → a sequência se repete até o infinito
- {"type":"win"} → só se o resultado for vencer o jogo
- {"type":"none"} → momento sem ação no tabuleiro
"card" é o nome exato de uma carta do combo. "amount" é inteiro positivo ou "infinito".
A ação mostra EXATAMENTE o que a narração daquele beat diz.

Responda APENAS com JSON válido, sem markdown.`;

export const SHAPE = `{
  "v": 2,
  "title": "título interno do vídeo",
  "hook": {"onScreen": "...", "narration": "uma frase, até 9 palavras"},
  "beats": [
    {"onScreen": "...", "narration": "...", "action": {"type": "focus", "card": "...", "text": "..."}},
    {"onScreen": "", "narration": "...", "action": {"type": "trigger", "card": "...", "text": "...", "resolve": true}},
    {"onScreen": "", "narration": "...", "action": {"type": "tokens", "amount": 2, "card": "...", "label": "...", "tapped": true}, "meme": "bruh"}
  ],
  "payoff": {"onScreen": "...", "narration": "..."},
  "deck": {"onScreen": "...", "narration": "...", "cameo": {"card": "Comandante Real", "quip": "..."}},
  "cta": {"onScreen": "...", "narration": "..."},
  "post": {
    "youtube": {"title": "até 100 caracteres, com #shorts no fim", "description": "2-4 linhas", "tags": ["..."]},
    "tiktok": {"caption": "legenda curta + hashtags"},
    "instagram": {"caption": "legenda + hashtags"}
  }
}`;

// ------------------------------------------------------------------
// Validação
// ------------------------------------------------------------------
/** Nome curto usado na narração ("Niv-Mizzet, Parun" → "niv-mizzet") */
const shortName = (name: string) => name.split(' // ')[0].split(',')[0].trim().toLowerCase();

type Beat = Script['beats'][number];

/** Ações que citam cartas: devolve os nomes citados */
const actionCards = (a: Beat['action']): string[] => {
  if ('card' in a && a.card) return a.card === 'grimorio' || a.card === 'fichas' ? [] : [a.card];
  if (a.type === 'loop') return a.cards;
  if (a.type === 'untap' && Array.isArray(a.cards)) return a.cards;
  return [];
};

/** Corrige nomes de carta abreviados nas ações para o nome exato do combo */
function normalizeActions(s: Script, combo: ResearchedCombo): Script {
  const resolve = (n: string) =>
    combo.cardNames.find((c) => c.toLowerCase() === n.toLowerCase()) ??
    combo.cardNames.find((c) => shortName(c) === shortName(n)) ??
    n;
  return {
    ...s,
    beats: s.beats.map((b) => {
      const a = {...b.action} as Record<string, unknown>;
      if (typeof a.card === 'string' && a.card !== 'grimorio' && a.card !== 'fichas') a.card = resolve(a.card);
      if (Array.isArray(a.cards)) a.cards = (a.cards as string[]).map(resolve);
      if (typeof a.copyOf === 'string') a.copyOf = resolve(a.copyOf);
      if (typeof a.source === 'string') a.source = resolve(a.source);
      return {...b, action: a as Beat['action']};
    }),
  };
}

/** Checagens que o schema não cobre */
/** Frases que o modelo tende a repetir de exemplos antigos ou clichês: viram reprovação */
const BANNED = [
  'terapia em grupo', 'usina hidrelétrica', 'crise existencial', 'virar a mesa inteira', 'fala, galera', 'neste vídeo',
  // comparações que viraram muleta nos primeiros roteiros
  'cartório', 'repartição', 'almoço de domingo', 'almoço de família', 'fila de banco', 'xerox',
  // CTA de youtuber: o fechamento deve puxar comentário sobre o vídeo
  'segue o canal', 'se inscreve', 'inscreva-se', 'deixa o like', 'deixa seu like', 'ativa o sininho', 'segue pra mais',
];

export function validateScript(s: Script, combo: ResearchedCombo): string[] {
  const problems: string[] = [];
  const lines = scriptLines(s);
  const allNarr = lines.map((b) => b.narration).join(' ');
  const count = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const words = count(allNarr);
  if (words < 65 || words > 150) problems.push(`Narração com ${words} palavras (alvo 80–135).`);
  const hookWords = count(s.hook.narration);
  if (hookWords > 10) problems.push(`Hook com ${hookWords} palavras: precisa caber em menos de 3 segundos (até 9 palavras, uma frase).`);

  for (const name of combo.cardNames) {
    if (!allNarr.toLowerCase().includes(shortName(name))) problems.push(`A carta "${name}" não é citada na narração.`);
  }
  if (/R\$|\d/.test(allNarr)) problems.push('A narração tem algarismos ou "R$"; escreva por extenso.');
  const screenText = [...lines.map((l) => l.onScreen), ...s.beats.map((b) => ('text' in b.action ? b.action.text ?? '' : ''))].join(' ').toLowerCase();
  for (const b of BANNED) {
    if (allNarr.toLowerCase().includes(b) || screenText.includes(b)) problems.push(`Frase batida: "${b}". Troque por algo natural e ligado a este vídeo.`);
  }
  if (/\bmyriad\b/i.test(allNarr) || /\bmyriad\b/i.test(screenText)) problems.push('Escreva "Miríade" (em português), não "myriad", na fala e nos textos de tela.');

  if (count(s.hook.onScreen) > 8) problems.push('onScreen do hook passa de 8 palavras.');
  const cameos = lines.filter((l) => l.cameo);
  if (cameos.length > 2) problems.push(`São ${cameos.length} cameos; o máximo é 2.`);
  if (cameos.length === 0) problems.push('Falta o cameo: no "deck", cite um comandante ou peça real pelo nome e coloque "cameo" com ela.');
  for (const l of cameos) {
    if (combo.cardNames.some((c) => shortName(c) === shortName(l.cameo!.card))) problems.push(`O cameo "${l.cameo!.card}" já é carta do combo; cameo é para OUTRA carta citada.`);
  }
  for (const [i, b] of s.beats.entries()) {
    if (count(b.onScreen) > 6) problems.push(`onScreen do beat ${i + 1} passa de 6 palavras.`);
    if (/^\s*(\d+[.)]|passo\s*\d)/i.test(b.onScreen)) problems.push(`onScreen do beat ${i + 1} está numerado; o vídeo já numera.`);
    for (const c of actionCards(b.action)) {
      if (!combo.cardNames.includes(c)) problems.push(`Beat ${i + 1}: a ação cita "${c}", que não é uma carta do combo.`);
    }
  }
  // fichas só podem morrer/mudar de zona depois de uma ação "tokens" que as crie (é ela que as mostra na mesa)
  let tokensMade = false;
  for (const [i, b] of s.beats.entries()) {
    if (b.action.type === 'tokens') tokensMade = true;
    if ((b.action.type === 'sacrifice' || b.action.type === 'move') && b.action.card === 'fichas' && !tokensMade) {
      problems.push(`Beat ${i + 1}: as fichas morrem, mas nenhum beat anterior as cria. Antes, use um beat com {"type":"tokens"} (pode ser logo depois do trigger que as cria).`);
    }
  }
  const dramas = lines.filter((l) => l.drama).length;
  if (dramas > 3) problems.push(`São ${dramas} momentos "drama"; o máximo é 3.`);
  const NUM = '(?:zero|um|uma|dois|duas|três|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|quinze|vinte)';
  // fronteira de palavra que entende acento ("três")
  if (new RegExp(`(?<!\\p{L})${NUM}\\s+por\\s+${NUM}(?!\\p{L})`, 'iu').test(allNarr)) problems.push('Força/resistência: leia "quatro quatro" (sem "por").');
  if (/\b(mono|puro)\s+(verde|vermelho|azul|preto|branco)\b|\b(verde|vermelho|azul|preto|branco)\s+puro\b/i.test(allNarr)) problems.push('Uma cor só se diz "mono" + cor em inglês: "mono green", "mono red"...');
  const memes = lines.filter((l) => l.meme);
  if (memes.length > 2) problems.push(`São ${memes.length} memes sonoros; o máximo é 2.`);
  for (const l of memes) if (!(l.meme! in MEMES)) problems.push(`Meme "${l.meme}" não existe. Use um destes: ${Object.keys(MEMES).join(', ')}.`);

  const tokenNames = combo.cards.flatMap((c) => (c.tokens ?? []).map((t) => t.name.toLowerCase())).filter((n) => n !== 'copy');
  for (const [i, b] of s.beats.entries()) {
    const a = b.action;
    if (a.type === 'tokens') {
      if (a.copyOf && !combo.cardNames.includes(a.copyOf)) problems.push(`Beat ${i + 1}: "copyOf" precisa ser uma carta do combo.`);
      if (!a.copyOf && tokenNames.length && a.label && !tokenNames.some((n) => a.label!.toLowerCase().includes(n))) {
        problems.push(`Beat ${i + 1}: a ficha "${a.label}" não é nenhuma das fichas das cartas (${tokenNames.join(', ')}). Use o nome oficial ou "copyOf".`);
      }
    }
    if (a.type === 'damage' && a.source && !combo.cardNames.includes(a.source)) problems.push(`Beat ${i + 1}: "source" do dano precisa ser uma carta do combo.`);
  }

  if (!s.beats.some((b) => b.action.type !== 'none' && b.action.type !== 'focus')) {
    problems.push('Nenhum beat mostra a jogada (só focus/none). Use ações de mecânica.');
  }

  const total = Math.round(combo.totalBRL ?? 0);
  for (const b of lines) {
    for (const m of b.onScreen.matchAll(/R\$\s?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*reais/gi)) {
      const v = Number((m[1] ?? m[2]).replace(',', '.'));
      if (combo.totalBRL === null || Math.abs(v - total) > 1) problems.push(`Valor "${m[0]}" no onScreen difere do total R$ ${total}.`);
    }
  }
  return problems;
}

/** Schema + normalização dos nomes + checagens de fidelidade. Usado pelo pipeline e pelo painel. */
export function checkScript(raw: unknown, combo: ResearchedCombo): {script?: Script; problems: string[]} {
  const parsed = ScriptSchema.safeParse(raw);
  if (!parsed.success) {
    return {problems: parsed.error.issues.map((i) => `Formato: ${i.path.join('.') || '(raiz)'} ${i.message}`)};
  }
  const script = normalizeActions(parsed.data, combo);
  const problems = validateScript(script, combo);
  return problems.length ? {problems} : {script, problems};
}

// ------------------------------------------------------------------
// Fatos para o roteirista
// ------------------------------------------------------------------
export function buildFacts(combo: ResearchedCombo) {
  return {
    pauta: `${combo.angle} (${ANGLE_LABEL[combo.angle] ?? combo.angle})`,
    cartas: combo.cards.map((c) => ({
      nome: c.name,
      custo: c.manaCost,
      tipo: c.typeLine,
      ...(c.nickname ? {apelido: c.nickname} : {}),
      ...(c.power !== undefined ? {forcaResistencia: `${c.power}/${c.toughness}`} : {}),
      textoOficial: c.oracle,
      ...(c.tokens?.filter((t) => t.name !== 'Copy').length
        ? {fichas: c.tokens.filter((t) => t.name !== 'Copy').map((t) => ({nome: t.name, tipo: t.typeLine, ...(t.power !== undefined ? {forcaResistencia: `${t.power}/${t.toughness}`} : {}), texto: t.oracle}))}
        : {}),
      colecao: c.setName,
      ...(c.isNew ? {novidade: true} : {}),
      ...(c.isGem ? {poucoJogada: true} : {}),
      precoEstimadoBRL: c.priceBRL,
    })),
    passos: combo.description,
    resultado: combo.produces,
    manaNecessaria: combo.manaNeeded,
    preRequisitos: [combo.easyPrerequisites, combo.notablePrerequisites].filter(Boolean).join(' / '),
    observacaoDaPesquisa: combo.note ?? '',
    fonte: combo.source === 'claude' ? 'interação checada regra a regra (não catalogada no Spellbook)' : 'Commander Spellbook',
    totalEstimadoBRL: combo.totalBRL,
    totalArredondadoBRL: combo.totalBRL === null ? null : Math.round(combo.totalBRL),
    identidadeDeCor: combo.identity,
    ...(combo.hero ? {cartaPrincipal: combo.hero} : {}),
    canal: `${config.channelName} (${config.handle})`,
  };
}

// ------------------------------------------------------------------
// Escrita
// ------------------------------------------------------------------
/** Quem escreve os roteiros: API (com chave), Claude Code (plano do Claude) ou ninguém */
export const scriptEngine = llmEngine;

/** Cameos precisam ser cartas reais (o vídeo mostra a imagem delas); corrige o nome para o oficial */
export async function checkCameos(s: Script): Promise<string[]> {
  const problems: string[] = [];
  for (const l of scriptLines(s)) {
    if (!l.cameo) continue;
    try {
      l.cameo.card = (await fetchCard(l.cameo.card)).name;
    } catch {
      problems.push(`O cameo "${l.cameo.card}" não existe no Scryfall. Use o nome exato de uma carta real ou tire o cameo.`);
    }
  }
  return problems;
}

const RULES_SYSTEM = `Você é juiz de regras de Magic: The Gathering (nível 2+) revisando o roteiro de um vídeo curto.
Recebe o texto oficial das cartas e fichas, os passos do combo (Commander Spellbook / EDHREC) e o roteiro: cada beat tem a fala e a AÇÃO que será animada.
Procure SOMENTE erros de regra ou de fato, por exemplo:
- ataque (declaração de atacantes) mostrado ou falado como se já tivesse causado dano;
- estado errado: criatura/ficha mostrada desvirada quando o texto diz que entra virada (ou o contrário); vigilância; desvirar;
- uso errado da pilha (habilidade de mana na pilha; efeito acontecendo antes de resolver; ordem dos eventos);
- resultado que depende de peça fora do combo dito como garantido (ex.: "mana infinita" sem criatura que gere mana; dano sem dizer que depende de ninguém bloquear);
- tipo, força/resistência ou custo errados; efeito atribuído à carta errada; zona errada;
- fala diz que algo muda na mesa (desvira, cria fichas, compra, causa dano) mas nenhuma ação daquele beat ou do seguinte mostra isso.
Não comente estilo nem humor. Seja objetivo; na dúvida sobre algo que não é erro, não aponte.
Responda APENAS com JSON: {"ok": boolean, "problemas": ["beat N: o que está errado e como corrigir"]}`;

/** Segunda passada: um juiz confere regras e estados do roteiro pronto. Devolve problemas (vazio = ok). */
export async function reviewRules(s: Script, combo: ResearchedCombo): Promise<string[]> {
  const oracle = combo.cards
    .map((c) => {
      const toks = (c.tokens ?? []).filter((t) => t.name !== 'Copy').map((t) => `  Ficha ${t.name} — ${t.typeLine} ${t.power ?? ''}/${t.toughness ?? ''}: ${t.oracle}`);
      return [`### ${c.name} ${c.manaCost} — ${c.typeLine}${c.power !== undefined ? ` ${c.power}/${c.toughness}` : ''}`, c.oracle, ...toks].join('\n');
    })
    .join('\n\n');
  const roteiro = [
    `hook: ${s.hook.narration}`,
    ...s.beats.map((b, i) => `beat ${i + 1}: "${b.narration}" | ação: ${JSON.stringify(b.action)}`),
    `payoff: ${s.payoff.narration}`,
    `deck: ${s.deck.narration}`,
  ].join('\n');
  try {
    const verdict = extractJson(
      await askLLM(
        [{role: 'user', content: `Textos oficiais:\n${oracle}\n\nPassos do combo:\n${combo.description}\nPré-requisitos: ${[combo.easyPrerequisites, combo.notablePrerequisites].filter(Boolean).join(' / ') || '—'}\nResultado segundo o Spellbook: ${combo.produces.join(', ')}\n\nRoteiro:\n${roteiro}`}],
        RULES_SYSTEM,
        1500,
      ),
    ) as {ok?: boolean; problemas?: string[]};
    return verdict.ok ? [] : (verdict.problemas ?? []).map((p) => `Regra: ${p}`);
  } catch (e) {
    log.warn(`Revisão de regras indisponível: ${(e as Error).message.slice(0, 120)}`);
    return [];
  }
}

export async function writeScript(combo: ResearchedCombo): Promise<Script> {
  if (!scriptEngine()) throw new Error('Sem ANTHROPIC_API_KEY e sem Claude Code instalado: não há quem escreva o roteiro.');
  await enrichCombo(combo); // combos antigos da fila ganham texto oficial antes do roteiro
  const turns: Turn[] = [
    {
      role: 'user',
      content: `Dados do combo:\n${JSON.stringify(buildFacts(combo), null, 2)}\n\nGere o roteiro neste formato JSON:\n${SHAPE}`,
    },
  ];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const text = await askLLM(turns, SYSTEM, 4000);
    let problems: string[] = [];
    try {
      const checked = checkScript(extractJson(text), combo);
      problems = checked.problems;
      if (checked.script) {
        problems = await checkCameos(checked.script);
        if (!problems.length) {
          log.info('Revisão de regras...');
          problems = await reviewRules(checked.script, combo);
        }
        if (!problems.length) return checked.script;
      }
    } catch (e) {
      problems = [`JSON inválido: ${(e as Error).message.slice(0, 400)}`];
    }
    log.warn(`Roteiro tentativa ${attempt} com problemas: ${problems.join(' | ')}`);
    turns.push({role: 'assistant', content: text});
    turns.push({role: 'user', content: `Corrija estes problemas e devolva o JSON completo de novo:\n- ${problems.join('\n- ')}`});
  }
  throw new Error('Não consegui um roteiro válido em 3 tentativas');
}
