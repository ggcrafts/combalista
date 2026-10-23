// ============================================================
//  ESTADO DO TABULEIRO — cada ação transforma o estado anterior.
//  O vídeo anima a passagem "antes → depois" de cada beat; como o "depois" de um
//  beat é o "antes" do seguinte, a mesa é contínua (nada de slide).
//  Inclui a PILHA (o que espera para resolver) e as ZONAS (mão, grave, exílio...).
// ============================================================
import type {Action, Amount, Segment, ZoneName} from './types';
import {theme} from './theme';

export type Zone = 'hand' | 'field' | 'grave' | 'exile' | 'command' | 'library';

export type CardState = {zone: Zone; tapped: boolean; counters: number; copies: number; /** declarada como atacante (fica à frente até o dano/fim do combate) */ attacking?: boolean};

/** Item na pilha: mágica ou habilidade esperando para resolver */
export type StackItem = {card?: string; text: string; kind: 'spell' | 'ability'};

export type BoardState = {
  cards: Record<string, CardState>;
  stack: StackItem[];
  mana: number;
  manaColor: string;
  manaSeen: boolean;
  tokens: number;
  tokenCard?: string;
  tokenLabel?: string;
  /** fichas que são cópia desta carta (usam a imagem dela) */
  tokenCopyOf?: string;
  tokenTapped?: boolean;
  tokenAttacking?: boolean;
  hand: number;
  handSeen: boolean;
  oppLife: number;
  oppSeen: boolean;
  oppCount: number;
  myLife: number;
  lifeSeen: boolean;
  looping: string[];
  /** zonas que já apareceram no vídeo (ficam visíveis dali em diante) */
  zonesSeen: ZoneName[];
  libraryExiled: boolean;
  won: boolean;
};

export const amt = (a: Amount): number => (a === 'infinito' ? Infinity : a);

const ZONE_OF: Record<ZoneName, Zone> = {mao: 'hand', grave: 'grave', exilio: 'exile', comando: 'command', grimorio: 'library'};

export const initialBoard = (names: string[]): BoardState => ({
  cards: Object.fromEntries(names.map((n) => [n, {zone: 'hand' as Zone, tapped: false, counters: 0, copies: 0}])),
  stack: [],
  mana: 0,
  manaColor: 'C',
  manaSeen: false,
  tokens: 0,
  hand: 0,
  handSeen: false,
  oppLife: 40,
  oppSeen: false,
  oppCount: 3,
  myLife: 40,
  lifeSeen: false,
  looping: [],
  zonesSeen: [],
  libraryExiled: false,
  won: false,
});

const clone = (s: BoardState): BoardState => ({
  ...s,
  cards: Object.fromEntries(Object.entries(s.cards).map(([k, v]) => [k, {...v}])),
  stack: [...s.stack],
  looping: [...s.looping],
  zonesSeen: [...s.zonesSeen],
});

/** Ações que são EFEITO (mudam a mesa). Se há algo esperando na pilha, o efeito é a resolução dele. */
export const EFFECT_ACTIONS: Action['type'][] = ['untap', 'tokens', 'draw', 'damage', 'lifegain', 'counters', 'return', 'move', 'exile', 'sacrifice', 'copy', 'win'];

export function applyAction(prev: BoardState, a: Action): BoardState {
  const s = clone(prev);
  if (EFFECT_ACTIONS.includes(a.type) && s.stack.length) s.stack.pop();
  const card = (name?: string) => (name ? s.cards[name] : undefined);
  const see = (z: ZoneName) => {
    if (!s.zonesSeen.includes(z)) s.zonesSeen.push(z);
  };
  // carta citada que ainda está na mão "já estava na mesa"
  const ensure = (name?: string) => {
    const c = card(name);
    if (c && c.zone === 'hand') c.zone = 'field';
    return c;
  };

  switch (a.type) {
    case 'play': {
      const c = card(a.card);
      if (a.from && a.from !== 'mao') see(a.from);
      if (c) Object.assign(c, {zone: 'field', tapped: false});
      break;
    }
    case 'cast': {
      // instant/feitiço: pilha → resolve → grave (tudo dentro do beat)
      const c = card(a.card);
      if (c) Object.assign(c, {zone: 'grave', tapped: false});
      see('grave');
      break;
    }
    case 'return': {
      const c = card(a.card);
      see('grave');
      if (c) Object.assign(c, {zone: 'field', tapped: false});
      break;
    }
    case 'trigger':
      ensure(a.card);
      // resolve: true → entra e sai da pilha na mesma fala
      if (!a.resolve) s.stack.push({card: a.card, text: a.text, kind: 'ability'});
      break;
    case 'resolve':
      s.stack.pop();
      break;
    case 'tap': {
      const c = ensure(a.card);
      if (c) c.tapped = true;
      break;
    }
    case 'attack': {
      // declaração de atacante: vira (sem vigilância) e vai para a frente; ainda não houve dano
      const c = ensure(a.card);
      if (c) Object.assign(c, {tapped: true, attacking: true});
      break;
    }
    case 'untap':
      for (const [name, c] of Object.entries(s.cards)) {
        if (c.zone === 'field' && (a.cards === 'todas' || a.cards.includes(name))) Object.assign(c, {tapped: false, attacking: false});
      }
      if (a.cards === 'todas') Object.assign(s, {tokenTapped: false, tokenAttacking: false});
      break;
    case 'mana':
      s.manaSeen = true;
      s.mana += amt(a.amount);
      if (a.color) s.manaColor = a.color;
      break;
    case 'tokens':
      s.tokens += amt(a.amount);
      s.tokenCopyOf = a.copyOf;
      s.tokenTapped = !!a.tapped;
      // criadas "viradas e atacando" quando já há atacante declarado
      s.tokenAttacking = !!a.tapped && Object.values(s.cards).some((c) => c.attacking);
      if (a.card) {
        ensure(a.card);
        s.tokenCard = a.card;
      }
      if (a.label) s.tokenLabel = a.label;
      break;
    case 'draw':
      s.handSeen = true;
      see('grimorio');
      see('mao');
      s.hand += amt(a.amount);
      break;
    case 'damage':
      s.oppSeen = true;
      if (a.target === 'oponente') s.oppCount = Math.max(1, s.oppCount);
      s.oppLife -= amt(a.amount);
      // dano de combate causado: fim do ataque desta criatura
      if (a.source && s.cards[a.source]) s.cards[a.source].attacking = false;
      break;
    case 'lifegain':
      s.lifeSeen = true;
      s.myLife += amt(a.amount);
      break;
    case 'sacrifice': {
      see('grave');
      if (a.card === 'fichas') Object.assign(s, {tokens: 0, tokenAttacking: false});
      const c = card(a.card);
      if (c) Object.assign(c, {zone: 'grave', tapped: false});
      break;
    }
    case 'exile': {
      see('exilio');
      if (a.card === 'grimorio') {
        s.libraryExiled = true;
        see('grimorio');
      }
      const c = card(a.card);
      if (c) Object.assign(c, {zone: 'exile', tapped: false});
      break;
    }
    case 'move': {
      if (a.card === 'fichas' && a.to !== 'mesa') s.tokens = 0;
      const c = card(a.card);
      if (a.to !== 'mesa') see(a.to);
      if (c) Object.assign(c, {zone: a.to === 'mesa' ? 'field' : ZONE_OF[a.to], tapped: false});
      break;
    }
    case 'copy': {
      const c = ensure(a.card);
      if (c) c.copies += 1;
      break;
    }
    case 'counters': {
      const c = ensure(a.card);
      if (c) c.counters += amt(a.amount);
      break;
    }
    case 'loop':
      // o ciclo se repete: tudo que vinha crescendo vira infinito; a pilha esvazia no fim
      s.looping = a.cards;
      for (const n of a.cards) ensure(n);
      if (s.manaSeen) s.mana = Infinity;
      if (s.tokens > 0) s.tokens = Infinity;
      if (s.handSeen) s.hand = Infinity;
      if (s.oppSeen) s.oppLife = -Infinity;
      if (s.lifeSeen) s.myLife = Infinity;
      for (const c of Object.values(s.cards)) if (c.counters > 0) c.counters = Infinity;
      s.stack = [];
      break;
    case 'win':
      s.won = true;
      if (s.oppSeen) s.oppLife = Math.min(s.oppLife, 0);
      break;
    case 'focus':
      // carta apresentada fica na mesa: a história vai montando o tabuleiro
      ensure(a.card);
      break;
    case 'none':
      break;
  }
  return s;
}

/** Estado antes e depois de cada segmento (só beats mudam o estado) */
export function boardTimeline(segments: Segment[], names: string[]): Array<{before: BoardState; after: BoardState}> {
  let cur = initialBoard(names);
  return segments.map((seg) => {
    const before = cur;
    const after = seg.kind === 'beat' && seg.action ? applyAction(cur, seg.action) : cur;
    cur = after;
    return {before, after};
  });
}

/**
 * A "volta" que o loop repete: as ações de pilha/mecânica desde a última apresentação de carta.
 * É o que aparece passando cada vez mais rápido na pilha durante o loop.
 */
export function loopSequence(segments: Segment[], loopIndex: number): StackItem[] {
  const out: StackItem[] = [];
  for (let i = loopIndex - 1; i >= 0; i--) {
    const a = segments[i].action;
    if (!a || segments[i].kind !== 'beat' || a.type === 'focus') break;
    if (a.type === 'trigger') out.unshift({card: a.card, text: a.text, kind: 'ability'});
    else if (a.type === 'cast' || a.type === 'play') out.unshift({card: a.card, text: 'text' in a && a.text ? a.text : a.card.split(',')[0], kind: 'spell'});
    else if (a.type === 'tokens') out.unshift({card: a.card, text: `+${a.amount === 'infinito' ? '∞' : a.amount} ${a.label ?? 'fichas'}`, kind: 'ability'});
    else if (a.type === 'draw') out.unshift({text: `Compra ${a.amount === 'infinito' ? '∞' : a.amount}`, kind: 'ability'});
    else if (a.type === 'damage') out.unshift({text: `${a.amount === 'infinito' ? '∞' : a.amount} de dano`, kind: 'ability'});
    else if (a.type === 'counters') out.unshift({card: a.card, text: `+1/+1 em ${a.card.split(',')[0]}`, kind: 'ability'});
    else if (a.type === 'mana') out.unshift({text: `+${a.amount === 'infinito' ? '∞' : a.amount} mana`, kind: 'ability'});
    else if (a.type === 'untap') out.unshift({text: 'Desvira', kind: 'ability'});
    else if (a.type === 'sacrifice') out.unshift({card: a.card, text: `Saca ${a.card.split(',')[0]}`, kind: 'ability'});
    else if (a.type === 'return') out.unshift({card: a.card, text: `${a.card.split(',')[0]} volta do grave`, kind: 'ability'});
  }
  return out.length ? out : [{text: 'Repete', kind: 'ability'}];
}

// ------------------------------------------------------------------
// Layout: onde cada carta fica na mesa (fichas ocupam um lugar como uma pilha de fichas)
// ------------------------------------------------------------------
export type Slot = {x: number; y: number; w: number; visible: boolean};

export const cardWidthFor = (n: number) => (n <= 1 ? 470 : n === 2 ? 390 : n === 3 ? 300 : 240);

export const TOKEN_SLOT = '__tokens__';

export function layout(state: BoardState, names: string[]): Record<string, Slot> {
  const onField = names.filter((n) => state.cards[n]?.zone === 'field');
  if (state.tokens > 0) onField.push(TOKEN_SLOT);
  const w = cardWidthFor(Math.max(onField.length, Math.min(names.length, 3)));
  const gap = w * 1.04;
  const out: Record<string, Slot> = {};
  [...names, TOKEN_SLOT].forEach((n) => {
    const i = onField.indexOf(n);
    if (i >= 0) {
      // centralizado no meio do vídeo
      const attacking = n === TOKEN_SLOT ? state.tokenAttacking : state.cards[n]?.attacking;
      out[n] = {x: 540 + (i - (onField.length - 1) / 2) * gap, y: theme.boardY - (attacking ? 150 : 0), w, visible: true};
    } else {
      const zone = state.cards[n]?.zone;
      out[n] = {x: 540, y: zone === 'hand' ? 2300 : theme.boardY, w, visible: false};
    }
  });
  return out;
}

/** Formata contadores: 1.2K, 3.4M, ∞ */
export const fmtCount = (v: number): string => {
  if (!Number.isFinite(v)) return '∞';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
};

/**
 * Valor mostrado durante a animação de um contador.
 * Finito: conta até o alvo. Infinito: cresce exponencialmente e vira ∞ perto do fim.
 */
export function countUp(from: number, to: number, p: number): number {
  if (!Number.isFinite(from)) return from;
  if (Number.isFinite(to)) return from + (to - from) * p;
  if (p > 0.82) return to > 0 ? Infinity : -Infinity;
  const sign = to > 0 ? 1 : -1;
  return from + sign * (Math.pow(10, p * 7.5) - 1);
}
