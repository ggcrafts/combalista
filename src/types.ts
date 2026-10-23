// Tipos compartilhados entre o pipeline (Node) e o template (Remotion).
// Tudo aqui precisa ser serializável em JSON, porque vira inputProps do render.

export type Word = {
  text: string;
  /** segundos, relativos ao início do segmento */
  start: number;
  end: number;
};

/** "infinito" vira contador acelerando até ∞ */
export type Amount = number | 'infinito';

/**
 * Ações de mecânica: o que acontece NO TABULEIRO enquanto a narração fala.
 * `card` é sempre o nome exato de uma carta do combo.
 */
/** Zonas do jogo, do jeito que o jogador fala */
export type ZoneName = 'mao' | 'grave' | 'exilio' | 'comando' | 'grimorio';

export type Action =
  | {type: 'play'; card: string; from?: ZoneName} // conjura uma permanente: passa pela pilha, resolve, bate na mesa
  | {type: 'cast'; card: string; text?: string} // conjura instant/feitiço: pilha → resolve → grave
  | {type: 'focus'; card: string; text: string} // aproxima a carta e destaca o que ela faz (didático)
  | {type: 'trigger'; card: string; text: string; resolve?: boolean} // habilidade (não de mana) vai para a PILHA (resolve: true = já resolve na mesma fala)
  | {type: 'resolve'; text?: string} // o topo da pilha resolve ("se ninguém tiver resposta")
  | {type: 'tap'; card: string} // vira 90°
  | {type: 'untap'; cards: string[] | 'todas'} // desvira
  | {type: 'mana'; amount: Amount; color?: 'W' | 'U' | 'B' | 'R' | 'G' | 'C'} // reserva de mana subindo
  | {type: 'tokens'; amount: Amount; card?: string; label?: string; copyOf?: string; tapped?: boolean} // fichas (imagem oficial; cópias usam a carta copiada)
  | {type: 'draw'; amount: Amount} // cartas voando do grimório para a mão
  | {type: 'damage'; amount: Amount; target: 'oponentes' | 'oponente'; source?: string} // dano de verdade (source = criatura que bate)
  | {type: 'lifegain'; amount: Amount} // sua vida subindo
  | {type: 'attack'; card: string; blocked?: boolean} // DECLARA o ataque: vira e aponta para o oponente (sem dano)
  | {type: 'sacrifice'; card: string} // carta queima e vai pro grave ("fichas" = as fichas morrem)
  | {type: 'exile'; card: string} // carta se desfaz em luz ("grimorio" = o grimório inteiro)
  | {type: 'return'; card: string} // volta do grave para a mesa
  | {type: 'move'; card: string; to: ZoneName | 'mesa'} // qualquer outra mudança de zona (bounce, tutor, blink...)
  | {type: 'copy'; card: string} // cópia fantasma da carta
  | {type: 'counters'; card: string; amount: Amount} // marcadores +1/+1
  | {type: 'loop'; cards: string[]} // a sequência da pilha se repete, cada vez mais rápido, até ∞
  | {type: 'win'} // vitória
  | {type: 'none'};

export type ActionType = Action['type'];

export type SegmentKind = 'hook' | 'beat' | 'payoff' | 'deck' | 'price' | 'cta';

export type Segment = {
  kind: SegmentKind;
  /** Texto falado (vira narração e legenda) */
  narration: string;
  /** Texto curto de tela (título da cena); pode ser vazio nas cenas de tabuleiro */
  onScreen: string;
  /** Só em kind === 'beat' */
  action?: Action;
  /** Outra carta citada na fala: aparece de surpresa na lateral (estilo "toasty") */
  cameo?: {card: string; quip?: string; image?: string};
  /** meme sonoro depois da fala (ponto final da piada) */
  meme?: string;
  /** momento dramático: transição estilo anime no começo da fala */
  drama?: boolean;
  /** Caminho relativo à pasta public/ (usado com staticFile). Opcional no preview/modo mudo. */
  audioSrc?: string;
  /** segundos a pular no começo do áudio (silêncio cortado) */
  audioStartFrom?: number;
  durationInSeconds: number;
  words: Word[];
};

export type CardInfo = {
  name: string;
  /** imagem da carta inteira, relativa a public/ */
  image: string;
  /** recorte da arte (fundo), relativo a public/ */
  artCrop?: string;
  artist?: string;
  priceBRL: number | null;
  /** estreou numa coleção recente */
  isNew?: boolean;
  /** pouco jogada */
  isGem?: boolean;
  setName?: string;
  /** identidade de cor da carta (define a paleta do vídeo) */
  colors?: string[];
  /** versão "bonita e cara" (só da carta principal), mostrada na apresentação */
  fancy?: {image: string; finish: 'foil' | 'etched' | 'nonfoil'; label: string};
};

/** Ficha com imagem oficial (Scryfall) */
export type TokenArt = {name: string; image: string};

export type Angle = 'novidade' | 'inusitado' | 'joia' | 'barato';

export type VideoProps = {
  title: string;
  angle: Angle;
  cards: CardInfo[];
  totalBRL: number | null;
  /** true quando o preço foi conferido no "menor da Liga" (senão é estimativa) */
  priceFromLiga?: boolean;
  /** efeitos sonoros: nome → arquivo relativo a public/ */
  sfx?: Record<string, string>;
  /** fichas que as cartas do combo criam, com imagem */
  tokens?: TokenArt[];
  /** carta principal (nome); sem isso: a nova, a joia ou a primeira */
  hero?: string;
  /** marca do canal: PNGs relativos a public/ */
  brand?: {name: string; logo?: string; icon?: string};
  colorIdentity: string; // ex.: "UB", "C"
  handle: string;
  segments: Segment[];
};
