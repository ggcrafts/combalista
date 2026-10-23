// ============================================================
//  EFEITOS SONOROS — qual som toca em cada momento (sutil e cômico)
//  Os arquivos vêm de props.sfx (public/sfx/meus tem prioridade sobre public/sfx/padrao).
// ============================================================
import type {Segment} from './types';

export type SfxEvent = {name: string; at: number; volume: number};

/** Multiplicador de volume de todos os efeitos (1 = como definido abaixo) */
const SFX_GAIN = 0.6;

/**
 * Batidas do loop: o intervalo entre itens da pilha começa em 10 frames e encurta
 * a cada volta (acelera), até ~80% do beat. Usado pela animação e pelo som.
 */
export function loopTicks(dur: number): number[] {
  const out: number[] = [];
  let t = 4;
  let gap = 10;
  while (t < dur * 0.8) {
    out.push(Math.round(t));
    t += gap;
    gap = Math.max(1.6, gap * 0.84);
  }
  return out;
}

/** Eventos de som de um segmento, em frames relativos ao início dele */
export function sfxFor(seg: Segment, dur: number, fps = 30): SfxEvent[] {
  const ev: SfxEvent[] = [];
  // volume geral dos efeitos: suave, sempre abaixo da voz
  const add = (name: string, at: number, volume: number) => ev.push({name, at: Math.max(0, Math.round(at)), volume: volume * SFX_GAIN});

  if (seg.kind === 'hook') {
    add('boom', 0, 0.55);
    add('shimmer', 5, 0.25);
  }
  if (seg.kind === 'payoff') {
    add('boom', 0, 0.6);
    add('shimmer', 6, 0.25);
  }
  if (seg.kind === 'price') add('kaching', 8, 0.5);
  if (seg.drama && seg.kind !== 'payoff') add('boom', 0, 0.45);
  if (seg.kind === 'deck' || seg.kind === 'cta') add('whoosh', 0, 0.25);
  if (seg.cameo) {
    add('toasty', dur * 0.2, 0.45);
  }

  // meme da fala: logo depois da última palavra (o build deixa uma pausinha para ele)
  if (seg.meme) {
    const last = seg.words[seg.words.length - 1];
    add(`meme:${seg.meme}`, ((last?.end ?? seg.durationInSeconds - 0.6) + 0.05) * fps, 0.55);
  }

  const a = seg.action;
  if (seg.kind !== 'beat' || !a) return ev;
  switch (a.type) {
    case 'focus':
      add('whoosh', 0, 0.25);
      break;
    case 'play': {
      const resolveAt = Math.max(14, dur * 0.32);
      add('whoosh', 0, 0.3);
      add('stack', 9, 0.35);
      add('slam', resolveAt + 9, 0.5);
      break;
    }
    case 'cast': {
      const resolveAt = Math.max(14, dur * 0.55);
      add('whoosh', 0, 0.3);
      add('stack', 9, 0.35);
      add('resolve', resolveAt, 0.4);
      break;
    }
    case 'trigger':
      add('stack', 3, 0.4);
      break;
    case 'resolve':
      add('resolve', 8, 0.4);
      break;
    case 'tap':
    case 'untap':
      add('tap', 4, 0.45);
      break;
    case 'mana':
    case 'lifegain':
    case 'copy':
      add('shimmer', 3, 0.3);
      break;
    case 'tokens':
      for (let i = 0; i < 4; i++) add('pop', 6 + i * 4, 0.3);
      break;
    case 'draw':
      add('whoosh', 2, 0.25);
      add('tap', 14, 0.3);
      break;
    case 'damage':
      if (a.source) {
        // dano de combate: a criatura chega no oponente e... bonk
        add('whoosh', 0, 0.3);
        add('meme:bonk', 10, 0.5);
        add('meme:oof', 14, 0.45);
      } else {
        add('punch', 12, 0.5);
        add('ai', 15, 0.45);
      }
      if (a.amount === 'infinito') add('meme:muito_dano', dur * 0.55, 0.5);
      break;
    case 'attack':
      // só a declaração: nada de soco ainda
      add('whoosh', 2, 0.3);
      if (a.blocked) add('meme:bruh', 18, 0.45);
      break;
    case 'sacrifice':
      add('burn', 4, 0.4);
      break;
    case 'exile':
      add('shimmer', 6, 0.3);
      break;
    case 'return':
    case 'move':
      add('whoosh', 2, 0.3);
      break;
    case 'counters':
      add('pop', 6, 0.35);
      break;
    case 'loop':
      // os itens passando pela pilha; só os primeiros têm som (depois vira zumbido)
      loopTicks(dur)
        .slice(0, 14)
        .forEach((t, i) => add('stack', t, 0.22 + Math.min(0.1, i * 0.01)));
      add('boom', dur * 0.8, 0.45);
      break;
    case 'win':
      add('boom', 2, 0.6);
      break;
  }
  return ev;
}
