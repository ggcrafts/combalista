// ============================================================
//  IDENTIDADE VISUAL — "Black & Gold arcano"
//  Referências: transição de tarô preto e dourado (poeira, brilho quente no canto,
//  faíscas douradas, rasgo de luz) + VFX de carta de jogo digital (Gwent/Arena).
//  Todo vídeo do canal sai destes tokens. Mude aqui, muda em todos.
// ============================================================
import {loadFont as loadDisplay} from '@remotion/google-fonts/Unbounded';
import {loadFont as loadBody} from '@remotion/google-fonts/Montserrat';

// Unbounded: títulos (geométrica, cara de motion design). Montserrat: legenda e textos (lê bem no celular).
const display = loadDisplay('normal', {weights: ['600', '700', '800', '900'], subsets: ['latin', 'latin-ext']});
const body = loadBody('normal', {weights: ['600', '700', '800', '900'], subsets: ['latin', 'latin-ext']});

export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
  /** segundos de respiro depois da última fala */
  tail: 0.9,
};

export const theme = {
  fonts: {
    display: display.fontFamily,
    body: body.fontFamily,
  },
  colors: {
    bg: '#07060A',
    bgWarm: '#120D07',
    ink: '#F4ECDC',
    muted: '#A79C88',
    // cor de destaque: muda a cada vídeo conforme as cores do combo (ver paletteFor)
    gold: 'var(--accent)',
    goldHot: 'var(--accent-hot)',
    goldDeep: 'var(--accent-deep)',
    goldInk: 'var(--accent-ink)',
    ember: '#FF7A2F', // fogo (sacrifício, dano)
    blood: '#E8433A', // vida perdida
    arcane: '#7FE3FF', // energia (cópias, gatilhos azuis)
    line: 'rgba(var(--accent-rgb),0.35)',
  },
  /** cores por identidade de cor (WUBRG + incolor) */
  mana: {
    W: '#F5E9C8',
    U: '#3C8EDB',
    B: '#8F78A8',
    R: '#E4553F',
    G: '#3FA866',
    C: '#B9B4AA',
  } as Record<string, string>,
  /**
   * Zonas seguras para 9:16. TikTok/Reels/Shorts cobrem a parte de baixo
   * (legenda/descrição) e a lateral direita (botões).
   */
  safe: {top: 170, bottom: 440, left: 72, right: 150},
  /** centro vertical da legenda, em px */
  captionY: 1320,
  /** linha central do tabuleiro (onde as cartas ficam) */
  boardY: 830,
  /**
   * Molas sem "elástico": amortecidas no limite (sem passar do ponto e voltar).
   * Só o impacto da carta na mesa tem um quique mínimo.
   */
  spring: {
    snappy: {damping: 26, stiffness: 220, mass: 0.6},
    soft: {damping: 30, stiffness: 120, mass: 1},
    bouncy: {damping: 22, stiffness: 200, mass: 0.6},
    slam: {damping: 24, stiffness: 320, mass: 0.8},
  },
};

/** Paleta de destaque por cor de mana (o "dourado" da identidade vira a cor do combo) */
const PALETTES: Record<string, {main: string; hot: string; deep: string; ink: string; rgb: string}> = {
  W: {main: '#F1DFA6', hot: '#FFF6D8', deep: '#B39A5A', ink: '#1F1A0C', rgb: '241,223,166'},
  U: {main: '#46A6F5', hot: '#A8DBFF', deep: '#1F5E9E', ink: '#06131F', rgb: '70,166,245'},
  B: {main: '#A983E6', hot: '#DCC8FF', deep: '#5A3F88', ink: '#120A1C', rgb: '169,131,230'},
  R: {main: '#FF6242', hot: '#FFB59E', deep: '#A52C1B', ink: '#1F0805', rgb: '255,98,66'},
  G: {main: '#43D98A', hot: '#A9F3C8', deep: '#1D8048', ink: '#06180D', rgb: '67,217,138'},
  C: {main: '#C9CED6', hot: '#F2F4F7', deep: '#7B828C', ink: '#121417', rgb: '201,206,214'},
};

/**
 * Variáveis de cor do vídeo. A cor principal é a da carta protagonista (a primeira cor dela);
 * a segunda cor do combo (guilda) vira a luz de fundo. Incolor usa prata.
 */
export function paletteFor(heroColors: string[] | undefined, comboIdentity: string): Record<string, string> {
  const order = 'WUBRG';
  const combo = comboIdentity.toUpperCase().split('').filter((c) => order.includes(c));
  const hero = (heroColors ?? []).filter((c) => order.includes(c));
  const main = hero[0] ?? combo[0] ?? 'C';
  const second = [...combo, ...hero].find((c) => c !== main) ?? main;
  const p = PALETTES[main];
  const q = PALETTES[second];
  return {
    '--accent': p.main,
    '--accent-hot': p.hot,
    '--accent-deep': p.deep,
    '--accent-ink': p.ink,
    '--accent-rgb': p.rgb,
    '--accent2-rgb': second === main ? p.rgb : q.rgb,
  };
}

export const identityColors = (identity: string): string[] => {
  const letters = identity.toUpperCase().split('').filter((c) => c in theme.mana);
  if (letters.length === 0) return [theme.mana.C];
  return letters.map((l) => theme.mana[l]);
};

export const formatBRL = (v: number | null): string =>
  v === null ? 'R$ ?' : v.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL', minimumFractionDigits: 2});

/** Brilho dourado em texto */
export const goldGlow = (strength = 1) =>
  `0 0 ${18 * strength}px rgba(var(--accent-rgb),${0.55 * strength}), 0 0 ${48 * strength}px rgba(var(--accent-rgb),${0.25 * strength}), 0 4px 18px rgba(0,0,0,0.7)`;
