// ============================================================
//  TABULEIRO — uma cena contínua onde as cartas vivem e reagem às mecânicas.
//  Cada beat anima a passagem do estado "antes" para o "depois" (src/boardState.ts).
//  Mostra as ZONAS (mão, grave, exílio, comando, grimório) e a PILHA, na ordem das regras.
// ============================================================
import React from 'react';
import {AbsoluteFill, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CARD_RATIO, CardBack, GameCard, type CardFx} from './card';
import {countUp, EFFECT_ACTIONS, fmtCount, layout, loopSequence, TOKEN_SLOT, type BoardState, type Slot, type StackItem} from './boardState';
import {Rays, resolveSrc, Shockwave, SparkBurst} from './fx';
import {heroCard} from './scenes';
import {loopTicks} from './sfx';
import {goldGlow, theme} from './theme';
import type {Action, CardInfo, Segment, VideoProps, ZoneName} from './types';

type Props = {
  segment: Segment;
  segments: Segment[];
  segmentIndex: number;
  before: BoardState;
  after: BoardState;
  video: VideoProps;
  beatIndex: number;
  beatCount: number;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** suavização sem elástico */
const ease = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
/**
 * Movimento "de marionete": um recuo curto antes de ir (antecipação) e chegada suave,
 * como interpolação feita à mão. Sem quique no final.
 */
const anticipate = (t: number) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const A = 0.18;
  return t < A ? -0.07 * Math.sin((Math.PI * t) / A) : ease((t - A) / (1 - A));
};
const targetOf = (a?: Action): string | undefined => (a && 'card' in a ? a.card : undefined);

/** Carta grande no meio, para explicar */
const FOCUS = {x: 540, y: 880, w: 540};
/** Onde a mágica "espera" na pilha antes de resolver */
const STACK_POINT = {x: 540, y: 400};

// ------------------------------------------------------------------
// Zonas: bolsos na lateral esquerda + mão embaixo
// ------------------------------------------------------------------
const POCKET_W = 96;
const POCKETS: Record<Exclude<ZoneName, 'mao'>, {y: number; label: string}> = {
  comando: {y: 470, label: 'COMANDO'},
  grimorio: {y: 660, label: 'GRIMÓRIO'},
  grave: {y: 850, label: 'GRAVE'},
  exilio: {y: 1040, label: 'EXÍLIO'},
};
const POCKET_X = 62;
const HAND = {x: 540, y: 1185};

/** Ponto de onde a carta sai / para onde vai, por zona */
const zonePoint = (z: ZoneName | 'mesa' | undefined): {x: number; y: number} =>
  !z || z === 'mao' ? {x: HAND.x, y: 1800} : z === 'mesa' ? {x: 540, y: theme.boardY} : {x: POCKET_X, y: POCKETS[z].y};

export const BoardScene: React.FC<Props> = ({segment, segments, segmentIndex, before, after, video, beatIndex, beatCount}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: dur} = useVideoConfig();
  const action = segment.action ?? {type: 'none'};
  const names = video.cards.map((c) => c.name);
  const info = Object.fromEntries(video.cards.map((c) => [c.name, c])) as Record<string, CardInfo>;
  const Lb = layout(before, names);
  const La = layout(after, names);
  const target = targetOf(action);
  const isFocus = action.type === 'focus';
  const hero = heroCard(video);
  // tempos que dependem do frame (recalculados por frame para medir velocidade)
  const timing = (f: number) => {
    const focusIn = isFocus ? anticipate(f / 16) : 0;
    const focusOut = isFocus ? clamp01((f - (dur - 12)) / 12) : 0;
    return {p: anticipate((f - 2) / 16), focusIn, focusOut, focusAmt: focusIn * (1 - ease(focusOut))};
  };
  const {p, focusAmt, focusOut} = timing(frame);
  // contadores animam ao longo de ~75% do beat
  const q = ease((frame - 4) / Math.max(10, dur * 0.75));

  // câmera: empurrãozinho contínuo na direção da ação (nada fica parado)
  const tSlot = target && target !== 'grimorio' ? La[target] ?? Lb[target] : undefined;
  const camT = frame / Math.max(1, dur);
  const camScale = 1 + 0.045 * camT;
  const camX = tSlot && !isFocus ? (540 - tSlot.x) * 0.06 * camT : 0;

  const usesStack = ['play', 'cast', 'trigger', 'resolve', 'loop'].includes(action.type) || before.stack.length > 0 || after.stack.length > 0;

  /** Pose de uma carta num frame qualquer (posição, tamanho, efeitos) */
  const pose = (name: string, f: number) => {
    const {p, focusIn, focusOut, focusAmt} = timing(f);
    const sB = Lb[name];
    const sA = La[name];
    const cs = after.cards[name];
    const tb = before.cards[name];
    const isTarget = name === target;
    const fx: CardFx = {tapped: lerp(tb.tapped ? 1 : 0, cs.tapped ? 1 : 0, p)};
    let x = lerp(sB.x, sA.x, p);
    let y = lerp(sB.y, sA.y, p);
    let w = lerp(sB.w, sA.w, p);
    let opacity = sB.visible && sA.visible ? 1 : sA.visible ? clamp01(p) : sB.visible ? 1 - clamp01(p) : 0;
    let rot = 0;
    let scale = 1;
    let z = 1;

    if (isTarget && (action.type === 'play' || action.type === 'cast')) {
      // origem → pilha (espera) → resolve → mesa (permanente) ou grave (instant/feitiço)
      const from = zonePoint(action.type === 'play' ? action.from : 'mao');
      const toStack = anticipate((f - 1) / 11);
      const hold = action.type === 'cast' ? 0.55 : 0.32;
      const resolveAt = Math.max(14, dur * hold);
      const out = anticipate((f - resolveAt) / 11);
      const dest = action.type === 'cast' ? zonePoint('grave') : sA;
      const stackW = 260;
      x = lerp(lerp(sB.visible ? sB.x : from.x, STACK_POINT.x, toStack), dest.x, out);
      y = lerp(lerp(sB.visible ? sB.y : from.y, STACK_POINT.y, toStack), dest.y, out);
      w = lerp(lerp(sB.w, stackW, toStack), action.type === 'cast' ? POCKET_W : sA.w, out);
      fx.flip = sB.visible ? 1 : clamp01((f - 1) / 8);
      fx.glow = interpolate(f, [resolveAt, resolveAt + 6, resolveAt + 30], [0.6, 1, 0.2], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
      scale = action.type === 'play' ? lerp(1, 1.1, Math.sin(clamp01((f - resolveAt) / 10) * Math.PI)) : 1;
      opacity = action.type === 'cast' && out >= 1 ? 0 : 1;
      z = 7;
    }
    if (isTarget && action.type === 'return') {
      const from = zonePoint('grave');
      const t = anticipate((f - 2) / 15);
      x = lerp(from.x, sA.x, t);
      y = lerp(from.y, sA.y, t);
      w = lerp(POCKET_W, sA.w, t);
      opacity = 1;
      fx.glow = 1 - clamp01(t) * 0.6;
      fx.glowColor = theme.colors.arcane;
      z = 6;
    }
    if (isTarget && action.type === 'move') {
      const to = zonePoint(action.to);
      const t = anticipate((f - 4) / 15);
      const fromSlot = sB.visible ? sB : {x: zonePoint('mao').x, y: zonePoint('mao').y, w: sB.w};
      x = lerp(fromSlot.x, action.to === 'mesa' ? sA.x : to.x, t);
      y = lerp(fromSlot.y, action.to === 'mesa' ? sA.y : to.y, t);
      w = lerp(fromSlot.w, action.to === 'mesa' ? sA.w : POCKET_W, t);
      opacity = 1;
      z = 6;
    }
    if (isTarget && action.type === 'sacrifice') {
      // queima um instante e cai no grave
      const burnT = clamp01((f - 4) / 14);
      const fly = anticipate((f - 16) / 13);
      x = lerp(sB.x, POCKET_X, fly);
      y = lerp(sB.y, POCKETS.grave.y, fly);
      w = lerp(sB.w, POCKET_W, fly);
      fx.burn = burnT * 0.55;
      fx.tapped = (tb.tapped ? 1 : 0) * (1 - clamp01(fly));
      opacity = fly >= 1 ? 0 : 1;
      z = 6;
    }
    if (isTarget && action.type === 'exile') {
      const fly = anticipate((f - 6) / 15);
      x = lerp(sB.x, POCKET_X, fly);
      y = lerp(sB.y, POCKETS.exilio.y, fly);
      w = lerp(sB.w, POCKET_W, fly);
      fx.dissolve = clamp01((f - 10) / 16) * 0.85;
      fx.glow = 1;
      fx.glowColor = '#ffffff';
      opacity = fly >= 1 ? 0 : 1;
      z = 6;
    }
    if (isTarget && action.type === 'trigger') {
      fx.glow = 0.5 + 0.5 * Math.abs(Math.sin(f / 5));
    }
    if (isTarget && action.type === 'attack') {
      // declara o ataque: vira e avança (o deslocamento vem do layout); sem dano
      fx.glow = 0.4 + 0.3 * Math.abs(Math.sin(f / 6));
      fx.glowColor = theme.colors.ember;
      z = 6;
    }
    // dano de combate: a criatura vai até o oponente e volta
    if (action.type === 'damage' && action.source === name) {
      const t = clamp01((f - 2) / 18);
      const tgt = HUD_OPP[action.target === 'oponente' ? 0 : 1];
      const go = Math.sin(t * Math.PI);
      x = lerp(x, tgt.x, go * 0.8);
      y = lerp(y, tgt.y + 200, go * 0.85);
      scale = 1 - go * 0.25;
      z = 7;
    }
    if (isFocus) {
      if (isTarget) {
        // entra (da mesa ou da mão) → fica grande no centro → pousa no lugar dela
        const fromX = sB.visible ? sB.x : 540;
        const fromY = sB.visible ? sB.y : 1800;
        x = lerp(lerp(fromX, FOCUS.x, focusIn), sA.x, ease(focusOut));
        y = lerp(lerp(fromY, FOCUS.y, focusIn), sA.y, ease(focusOut));
        w = lerp(lerp(sB.w, FOCUS.w, focusIn), sA.w, ease(focusOut));
        fx.tapped = (tb.tapped ? 1 : 0) * (1 - focusAmt);
        fx.glow = focusAmt * 0.8;
        opacity = sB.visible ? 1 : Math.min(1, clamp01(focusIn) * 2);
        // girinho lento enquanto está em foco (o olho não estaciona)
        rot = Math.sin(f / 22) * 1.6 * focusAmt;
        z = 8;
      } else {
        fx.dim = focusAmt;
      }
    }
    if (action.type === 'loop' && after.looping.includes(name)) {
      fx.glow = 0.5 + 0.5 * Math.abs(Math.sin(f / 3));
    }
    return {x, y, w, opacity, rot, scale, z, fx};
  };

  return (
    <AbsoluteFill>
      {/* camada da mesa (com câmera) */}
      <AbsoluteFill style={{transform: `translateX(${camX}px) scale(${camScale})`, transformOrigin: `540px ${theme.boardY}px`}}>
        {names.map((name, idx) => {
          const now = pose(name, frame);
          if (now.opacity <= 0.001) return null;
          const prev = pose(name, frame - 1);
          const cs = after.cards[name];
          const tb = before.cards[name];
          const isTarget = name === target;
          const {x, y, w, opacity, scale, z, fx} = now;

          // marionete: a carta se inclina para onde está indo (como se puxada por fios)
          const vx = x - prev.x;
          const vy = y - prev.y;
          const speed = Math.hypot(vx, vy);
          const lean = Math.max(-10, Math.min(10, vx * 0.35));
          // respiração: cada carta flutua de leve, em tempos diferentes
          const idleY = Math.sin((frame + idx * 23) / 30) * 6;
          const idleR = Math.sin((frame + idx * 41) / 47) * 0.7;
          const rot = now.rot + idleR + lean;

          const card = info[name];
          // versão "bonita e cara" da carta principal só durante a apresentação dela
          const showFancy = isFocus && isTarget && name === hero.name && !!card.fancy && focusOut < 0.5;
          const src = showFancy ? card.fancy!.image : card.image;
          const cardFx: CardFx = showFancy ? {...fx, finish: card.fancy!.finish, lightAngle: rot * 4 + frame * 0.5} : fx;
          const counters = cs.counters !== 0 ? countUp(tb.counters, cs.counters, isTarget && action.type === 'counters' ? q : 1) : 0;

          return (
            <React.Fragment key={name}>
              {cs.copies > 0 && cs.zone === 'field' ? (
                <Positioned x={x + 80 * (action.type === 'copy' && isTarget ? p : 1)} y={y - 56 * (action.type === 'copy' && isTarget ? p : 1) + idleY} w={w} z={0} opacity={0.8}>
                  <GameCard src={card.image} width={w} fx={{ghost: true, tapped: fx.tapped}} />
                </Positioned>
              ) : null}
              {/* motion blur: rastros da carta quando ela se move rápido */}
              {speed > 7
                ? [0.5, 1].map((k, gi) => (
                    <Positioned key={`mb${gi}`} x={x - vx * k * 1.4} y={y - vy * k * 1.4 + idleY} w={w} z={z - 0.5} opacity={opacity * (gi === 0 ? 0.28 : 0.12)} rot={rot} scale={scale}>
                      <div style={{filter: `blur(${Math.min(8, speed * 0.25)}px)`}}>
                        <GameCard src={src} width={w} fx={{...cardFx, glow: 0}} seed={`${name}mb`} />
                      </div>
                    </Positioned>
                  ))
                : null}
              <Positioned x={x} y={y + idleY} w={w} z={z} opacity={opacity} rot={rot} scale={scale}>
                <GameCard src={src} width={w} fx={cardFx} seed={name} />
                {counters !== 0 ? <CounterBadge value={counters} /> : null}
                {card.isNew && !isFocus && w > 200 && !cs.attacking ? <Ribbon text="NOVA" /> : null}
                {cs.attacking && w > 150 ? <Ribbon text="ATACANDO" danger dy={(fx.tapped ?? 0) * ((w * CARD_RATIO - w * 0.82) / 2)} /> : null}
              </Positioned>
            </React.Fragment>
          );
        })}

        <TokenPile before={before} after={after} q={q} info={info} Lb={Lb} La={La} action={action} tokenArts={video.tokens ?? []} />
        <ActionFx action={action} after={after} Lb={Lb} La={La} />
      </AbsoluteFill>

      {/* interface fixa (sem câmera) */}
      <Pockets before={before} after={after} action={action} info={info} />
      <Hand before={before} after={after} q={q} action={action} />
      {usesStack ? <StackPanel before={before} after={after} action={action} segments={segments} segmentIndex={segmentIndex} dur={dur} /> : null}
      <Hud before={before} after={after} q={q} action={action} />
      {!usesStack || isFocus ? (
        <BeatTitle
          segment={segment}
          action={action}
          focusAmt={focusAmt}
          fancyLabel={isFocus && target === hero.name && hero.fancy && focusOut < 0.5 ? hero.fancy.label : undefined}
        />
      ) : null}
      <StepDots index={beatIndex} count={beatCount} />
    </AbsoluteFill>
  );
};

/** Posiciona pelo centro */
const Positioned: React.FC<{x: number; y: number; w: number; z?: number; opacity?: number; rot?: number; scale?: number; children: React.ReactNode}> = ({
  x,
  y,
  w,
  z = 1,
  opacity = 1,
  rot = 0,
  scale = 1,
  children,
}) => (
  <div
    style={{
      position: 'absolute',
      left: x - w / 2,
      top: y - (w * CARD_RATIO) / 2,
      width: w,
      height: w * CARD_RATIO,
      zIndex: z,
      opacity,
      transform: `rotate(${rot}deg) scale(${scale})`,
    }}
  >
    {children}
  </div>
);

const CounterBadge: React.FC<{value: number}> = ({value}) => (
  <div
    style={{
      position: 'absolute',
      right: -20,
      bottom: -20,
      padding: '10px 18px',
      borderRadius: 999,
      background: `linear-gradient(180deg, ${theme.colors.goldHot}, ${theme.colors.gold})`,
      color: theme.colors.goldInk,
      fontFamily: theme.fonts.display,
      fontWeight: 900,
      fontSize: 34,
      boxShadow: `0 0 24px ${theme.colors.gold}`,
    }}
  >
    +{fmtCount(value)}/+{fmtCount(value)}
  </div>
);

/** dy: desce o selo quando a carta está virada (deitada, ela fica mais baixa que a caixa) */
const Ribbon: React.FC<{text: string; danger?: boolean; dy?: number}> = ({text, danger, dy = 0}) => (
  <div
    style={{
      position: 'absolute',
      top: -18 + dy,
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '5px 18px',
      borderRadius: 8,
      background: danger ? theme.colors.blood : theme.colors.gold,
      color: danger ? '#fff' : theme.colors.goldInk,
      fontFamily: theme.fonts.display,
      fontWeight: 900,
      fontSize: 20,
      letterSpacing: 2,
      whiteSpace: 'nowrap',
      boxShadow: `0 0 18px ${danger ? theme.colors.blood : theme.colors.gold}`,
    }}
  >
    {text}
  </div>
);

// ------------------------------------------------------------------
// Efeitos ligados à ação (impacto, mana voando, dano, ataque, vitória)
// ------------------------------------------------------------------
const ActionFx: React.FC<{action: Action; after: BoardState; Lb: Record<string, Slot>; La: Record<string, Slot>}> = ({action, after, Lb, La}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: dur} = useVideoConfig();
  const target = targetOf(action);
  const slot = target ? La[target] ?? Lb[target] : undefined;

  switch (action.type) {
    case 'play': {
      if (!slot) return null;
      const hit = Math.max(14, dur * 0.32) + 10;
      return (
        <AbsoluteFill style={{zIndex: 7, pointerEvents: 'none'}}>
          <Shockwave x={slot.x} y={slot.y + (slot.w * CARD_RATIO) / 2 - 20} at={hit} size={700} />
          <SparkBurst x={slot.x} y={slot.y} at={hit} seed={`p${target}`} radius={420} />
        </AbsoluteFill>
      );
    }
    case 'return':
      return slot ? <SparkBurst x={slot.x} y={slot.y} at={14} seed={`r${target}`} color={theme.colors.arcane} radius={380} /> : null;
    case 'mana': {
      // orbes saindo das cartas na mesa para a reserva de mana (habilidade de mana: sem pilha)
      const sources = Object.entries(La).filter(([n, s]) => s.visible && n !== TOKEN_SLOT && after.cards[n]?.zone === 'field').map(([, s]) => s);
      const from = sources.length ? sources : [{x: 540, y: theme.boardY, w: 300, visible: true}];
      const color = theme.mana[action.color ?? after.manaColor] ?? theme.colors.gold;
      return (
        <AbsoluteFill style={{zIndex: 7, pointerEvents: 'none'}}>
          {Array.from({length: 22}).map((_, i) => {
            const s = from[i % from.length];
            const t = clamp01((frame - 2 - i * 1.6) / 14);
            if (t <= 0 || t >= 1) return null;
            const e = t * t;
            const x = lerp(s.x + (random(`mx${i}`) - 0.5) * s.w, HUD_MANA.x, e);
            const y = lerp(s.y, HUD_MANA.y, e) - Math.sin(t * Math.PI) * 140;
            return <div key={i} style={{position: 'absolute', left: x - 14, top: y - 14, width: 28, height: 28, borderRadius: '50%', background: color, boxShadow: `0 0 24px ${color}, 0 0 8px #fff`}} />;
          })}
        </AbsoluteFill>
      );
    }
    case 'damage': {
      const targets = HUD_OPP.slice(0, action.target === 'oponente' ? 1 : 3);
      if (action.source) {
        // dano de combate: impacto quando a criatura chega no oponente
        const tgt = HUD_OPP[action.target === 'oponente' ? 0 : 1];
        return (
          <AbsoluteFill style={{zIndex: 8, pointerEvents: 'none'}}>
            <Shockwave x={tgt.x} y={tgt.y + 120} at={10} size={520} color={theme.colors.ember} />
            <SparkBurst x={tgt.x} y={tgt.y + 120} at={10} seed="hit" color={theme.colors.ember} radius={380} />
            <ImpactWord x={tgt.x - 120} y={tgt.y + 260} at={10} text="POW!" />
          </AbsoluteFill>
        );
      }
      return (
        <AbsoluteFill style={{zIndex: 7, pointerEvents: 'none'}}>
          {targets.flatMap((tg, k) =>
            Array.from({length: 5}).map((_, i) => {
              const t = clamp01((frame - 2 - i * 3 - k * 2) / 13);
              if (t <= 0 || t >= 1) return null;
              const x = lerp(540, tg.x, t);
              const y = lerp(theme.boardY, tg.y, t) - Math.sin(t * Math.PI) * 180;
              return (
                <div
                  key={`${k}-${i}`}
                  style={{
                    position: 'absolute',
                    left: x - 20,
                    top: y - 20,
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, #FFE7A8, ${theme.colors.ember} 55%, transparent 70%)`,
                    boxShadow: `0 0 34px ${theme.colors.ember}`,
                  }}
                />
              );
            }),
          )}
        </AbsoluteFill>
      );
    }
    case 'attack': {
      // declaração: mira no(s) oponente(s); nenhum dano ainda
      if (!slot) return null;
      const t = ease((frame - 6) / 12);
      return (
        <AbsoluteFill style={{zIndex: 7, pointerEvents: 'none'}}>
          <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
            {HUD_OPP.map((o, i) => (
              <line
                key={i}
                x1={slot.x}
                y1={slot.y - (slot.w * CARD_RATIO) / 2}
                x2={lerp(slot.x, o.x, t)}
                y2={lerp(slot.y - (slot.w * CARD_RATIO) / 2, o.y + 60, t)}
                style={{stroke: theme.colors.blood}}
                strokeWidth={6}
                strokeDasharray="18 12"
                strokeDashoffset={-frame * 3}
                opacity={0.8}
              />
            ))}
          </svg>
          {action.blocked ? <Blocker x={slot.x} at={16} /> : null}
        </AbsoluteFill>
      );
    }
    case 'win':
      return (
        <AbsoluteFill style={{zIndex: 7, pointerEvents: 'none'}}>
          <Rays x={540} y={theme.boardY} opacity={interpolate(frame, [0, 12], [0, 0.45], {extrapolateRight: 'clamp'})} />
          <SparkBurst x={540} y={theme.boardY} at={2} count={44} radius={600} seed="win" />
        </AbsoluteFill>
      );
    default:
      return null;
  }
};

/** Onomatopeia de quadrinho no impacto */
const ImpactWord: React.FC<{x: number; y: number; at: number; text: string}> = ({x, y, at, text}) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 22) return null;
  const s = ease(t / 5);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(-8deg) scale(${0.6 + s * 0.5})`,
        opacity: t > 16 ? (22 - t) / 6 : 1,
        fontFamily: theme.fonts.display,
        fontWeight: 900,
        fontSize: 96,
        color: theme.colors.goldHot,
        WebkitTextStroke: '8px #1B1205',
        paintOrder: 'stroke fill',
        textShadow: `0 0 30px ${theme.colors.ember}`,
      }}
    >
      {text}
    </div>
  );
};

/** Criatura do oponente (verso) descendo para bloquear */
const Blocker: React.FC<{x: number; at: number}> = ({x, at}) => {
  const frame = useCurrentFrame();
  const t = ease((frame - (at - 9)) / 9);
  const w = 240;
  return (
    <div style={{position: 'absolute', left: x - w / 2, top: lerp(-400, theme.boardY - 780, t), opacity: t, transform: 'rotate(180deg)'}}>
      <CardBack width={w} />
    </div>
  );
};

// ------------------------------------------------------------------
// Fichas: uma pilha de fichas na mesa, com contador (e enxame quando vira ∞)
// ------------------------------------------------------------------
const TokenPile: React.FC<{
  before: BoardState;
  after: BoardState;
  q: number;
  info: Record<string, CardInfo>;
  Lb: Record<string, Slot>;
  La: Record<string, Slot>;
  action: Action;
  tokenArts: Array<{name: string; image: string}>;
}> = ({before, after, q, info, Lb, La, action, tokenArts}) => {
  const frame = useCurrentFrame();
  if (after.tokens <= 0 && before.tokens <= 0) return null;
  const slot = La[TOKEN_SLOT].visible ? La[TOKEN_SLOT] : Lb[TOKEN_SLOT];
  // fichas morrendo (legend rule, sacar): a pilha voa para o grave e some
  const dying = before.tokens > 0 && after.tokens === 0 ? ease((frame - 6) / 14) : 0;
  const appear = (Lb[TOKEN_SLOT].visible ? 1 : ease(frame / 12)) * (1 - dying);
  const value = countUp(before.tokens, after.tokens, action.type === 'tokens' || action.type === 'loop' ? q : 1);
  const src = (after.tokenCard && (info[after.tokenCard]?.artCrop ?? info[after.tokenCard]?.image)) || Object.values(info)[0]?.artCrop || '';
  // imagem da ficha: cópia → a própria carta; senão a ficha oficial do Scryfall (pelo nome)
  const label0 = (after.tokenLabel ?? '').toLowerCase();
  const official = tokenArts.find((t) => label0 && (label0.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(label0)));
  const fullImage = after.tokenCopyOf ? info[after.tokenCopyOf]?.image : official?.image ?? (tokenArts.length === 1 ? tokenArts[0].image : undefined);
  const tapped = lerp(before.tokenTapped ? 1 : 0, after.tokenTapped ? 1 : 0, action.type === 'tokens' || action.type === 'untap' ? ease((frame - 4) / 12) : 1);
  const w = slot.w * 0.86;
  const h = w * CARD_RATIO;
  const label = after.tokenLabel ?? 'Ficha';
  const pulse = action.type === 'tokens' ? 1 + Math.abs(Math.sin(frame / 4)) * 0.04 : 1;
  const source = after.tokenCard ? La[after.tokenCard] : undefined;
  const infinite = !Number.isFinite(value);

  return (
    <>
      {/* fichas novas voando da carta de origem para a pilha */}
      {action.type === 'tokens' && source?.visible
        ? Array.from({length: 6}).map((_, i) => {
            const t = clamp01((frame - 2 - i * 4) / 12);
            if (t <= 0 || t >= 1) return null;
            return (
              <div
                key={`f${i}`}
                style={{
                  position: 'absolute',
                  left: lerp(source.x, slot.x, ease(t)) - 50,
                  top: lerp(source.y, slot.y, ease(t)) - Math.sin(t * Math.PI) * 160 - 36,
                  width: 100,
                  height: 72,
                  borderRadius: 10,
                  overflow: 'hidden',
                  border: `3px solid ${theme.colors.gold}`,
                  zIndex: 6,
                  boxShadow: `0 0 20px ${theme.colors.gold}`,
                }}
              >
                {src ? <Img src={resolveSrc(src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : null}
              </div>
            );
          })
        : null}
      {/* enxame quando vira infinito */}
      {infinite || (action.type === 'loop' && q > 0.4)
        ? Array.from({length: 46}).map((_, i) => {
            const ang = i * 2.39996 + 0.6;
            const rad = 260 + Math.sqrt(i) * 64;
            const pop = clamp01((q - 0.35) * 3 - i / 60);
            if (pop <= 0) return null;
            return (
              <div
                key={`s${i}`}
                style={{
                  position: 'absolute',
                  left: 540 + Math.cos(ang) * rad * 1.05 - 46,
                  top: theme.boardY + Math.sin(ang) * rad * 0.95 - 34,
                  width: 92,
                  height: 68,
                  borderRadius: 10,
                  overflow: 'hidden',
                  border: `3px solid ${theme.colors.gold}`,
                  opacity: pop * 0.9,
                  transform: `scale(${0.5 + pop * 0.5}) rotate(${(random(`tr${i}`) - 0.5) * 18 + Math.sin((frame + i * 9) / 12) * 4}deg)`,
                  zIndex: 0,
                }}
              >
                {src ? <Img src={resolveSrc(src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : null}
              </div>
            );
          })
        : null}
      {/* a pilha de fichas no lugar dela na mesa */}
      <div style={{position: 'absolute', left: lerp(slot.x, POCKET_X, dying) - w / 2, top: lerp(slot.y, POCKETS.grave.y, dying) - h / 2 + Math.sin(frame / 28) * 5, width: w, height: h, opacity: dying ? 1 - dying * 0.8 : appear, transform: `scale(${pulse * (1 - dying * 0.7) * (1 - tapped * 0.18)}) rotate(${tapped * 90}deg)`, zIndex: 2}}>
        {[2, 1, 0].map((k) => (
          <div
            key={k}
            style={{
              position: 'absolute',
              inset: 0,
              transform: `translate(${k * 10}px, ${-k * 10}px)`,
              borderRadius: w * 0.06,
              overflow: 'hidden',
              border: `4px solid ${theme.colors.gold}`,
              background: '#120D07',
              boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
              opacity: k === 0 ? 1 : 0.75,
            }}
          >
            {fullImage ? (
              <Img src={resolveSrc(fullImage)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
            ) : (
              <>
                {src ? <Img src={resolveSrc(src)} style={{width: '100%', height: '62%', objectFit: 'cover'}} /> : null}
                <div style={{padding: '8px 12px', fontFamily: theme.fonts.display, fontWeight: 800, fontSize: w * 0.08, color: theme.colors.ink, textTransform: 'uppercase'}}>{label}</div>
                <div style={{padding: '0 12px', fontFamily: theme.fonts.body, fontWeight: 800, fontSize: w * 0.06, color: theme.colors.muted, letterSpacing: 2}}>FICHA</div>
              </>
            )}
            {after.tokenCopyOf && k === 0 ? (
              <div style={{position: 'absolute', left: 0, right: 0, bottom: '38%', textAlign: 'center', fontFamily: theme.fonts.display, fontWeight: 900, fontSize: w * 0.11, color: '#fff', background: 'rgba(0,0,0,0.65)', padding: '6px 0', letterSpacing: 3}}>CÓPIA</div>
            ) : null}
          </div>
        ))}
        <div
          style={{
            position: 'absolute',
            right: -24,
            top: -28,
            padding: '8px 22px',
            borderRadius: 999,
            background: `linear-gradient(180deg, ${theme.colors.goldHot}, ${theme.colors.gold})`,
            color: theme.colors.goldInk,
            fontFamily: theme.fonts.display,
            fontWeight: 900,
            fontSize: infinite ? 64 : 48,
            boxShadow: `0 0 30px ${theme.colors.gold}`,
          }}
        >
          ×{fmtCount(value)}
        </div>
      </div>
    </>
  );
};

// ------------------------------------------------------------------
// Zonas: bolsos (comando, grimório, grave, exílio) e mão
// ------------------------------------------------------------------
const Pockets: React.FC<{before: BoardState; after: BoardState; action: Action; info: Record<string, CardInfo>}> = ({before, after, action, info}) => {
  const frame = useCurrentFrame();
  const zones = (Object.keys(POCKETS) as Array<Exclude<ZoneName, 'mao'>>).filter((z) => after.zonesSeen.includes(z) || before.zonesSeen.includes(z));
  const ZONE_KEY: Record<string, string> = {comando: 'command', grimorio: 'library', grave: 'grave', exilio: 'exile'};
  const highlight = (z: string) =>
    (action.type === 'sacrifice' && z === 'grave') ||
    (action.type === 'cast' && z === 'grave') ||
    (action.type === 'return' && z === 'grave') ||
    (action.type === 'exile' && (z === 'exilio' || (action.card === 'grimorio' && z === 'grimorio'))) ||
    (action.type === 'draw' && z === 'grimorio') ||
    (action.type === 'move' && z === action.to) ||
    (action.type === 'play' && z === action.from);

  return (
    <AbsoluteFill style={{zIndex: 8, pointerEvents: 'none'}}>
      {zones.map((z) => {
        const pk = POCKETS[z];
        const isNew = !before.zonesSeen.includes(z);
        const s = isNew ? ease(frame / 10) : 1;
        // carta do combo que está nessa zona (mostra a de cima)
        const top = Object.entries(after.cards).find(([, c]) => c.zone === ZONE_KEY[z])?.[0];
        const lit = highlight(z) ? 0.6 + 0.4 * Math.abs(Math.sin(frame / 5)) : 0;
        const h = POCKET_W * CARD_RATIO;
        const empty = z === 'grimorio' && after.libraryExiled;
        return (
          <div key={z} style={{position: 'absolute', left: POCKET_X - POCKET_W / 2 - 8, top: pk.y - h / 2 - 8, width: POCKET_W + 16, opacity: s, transform: `translateX(${(1 - s) * -80}px)`}}>
            <div
              style={{
                width: POCKET_W + 16,
                height: h + 16,
                borderRadius: 14,
                border: `3px ${top || z === 'grimorio' ? 'solid' : 'dashed'} ${lit ? theme.colors.goldHot : 'rgba(var(--accent-rgb),0.45)'}`,
                background: 'rgba(7,6,10,0.75)',
                boxShadow: lit ? `0 0 ${30 * lit}px ${theme.colors.gold}` : 'none',
                padding: 6,
                boxSizing: 'border-box',
              }}
            >
              {top ? (
                <GameCard src={info[top].image} width={POCKET_W} />
              ) : z === 'grimorio' && !empty ? (
                <CardBack width={POCKET_W} />
              ) : null}
            </div>
            <div style={{marginTop: 6, textAlign: 'center', fontFamily: theme.fonts.display, fontWeight: 800, fontSize: 15, letterSpacing: 1, color: theme.colors.gold}}>{pk.label}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Mão: leque de versos embaixo; cartas compradas voam do grimório até ela */
const Hand: React.FC<{before: BoardState; after: BoardState; q: number; action: Action}> = ({before, after, q, action}) => {
  const frame = useCurrentFrame();
  if (!after.handSeen) return null;
  const value = countUp(before.hand, after.hand, action.type === 'draw' || action.type === 'loop' ? q : 1);
  const shown = Number.isFinite(value) ? Math.min(7, Math.max(1, Math.round(value))) : 7;
  const w = 120;
  const from = {x: POCKET_X, y: POCKETS.grimorio.y};
  return (
    <AbsoluteFill style={{zIndex: 9, pointerEvents: 'none'}}>
      {action.type === 'draw'
        ? Array.from({length: action.amount === 'infinito' ? 9 : Math.min(7, action.amount)}).map((_, i) => {
            const t = clamp01((frame - 2 - i * 3.5) / 12);
            if (t <= 0 || t >= 1) return null;
            return (
              <div
                key={`d${i}`}
                style={{
                  position: 'absolute',
                  left: lerp(from.x, HAND.x, ease(t)) - w / 2,
                  top: lerp(from.y, HAND.y, ease(t)) - Math.sin(t * Math.PI) * 220 - (w * CARD_RATIO) / 2,
                  transform: `rotate(${lerp(-20, 0, t)}deg)`,
                }}
              >
                <CardBack width={w} />
              </div>
            );
          })
        : null}
      {Array.from({length: shown}).map((_, i) => {
        const off = i - (shown - 1) / 2;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: HAND.x + off * 54 - w / 2,
              top: HAND.y - (w * CARD_RATIO) / 2 + Math.abs(off) * 8 + Math.sin((frame + i * 10) / 26) * 3,
              transform: `rotate(${off * 6}deg)`,
            }}
          >
            <CardBack width={w} />
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: HAND.x + (shown / 2) * 54 + 40,
          top: HAND.y - 30,
          padding: '6px 18px',
          borderRadius: 999,
          background: 'rgba(7,6,10,0.85)',
          border: `2px solid ${theme.colors.gold}`,
          fontFamily: theme.fonts.display,
          fontWeight: 900,
          fontSize: 30,
          color: theme.colors.goldHot,
        }}
      >
        MÃO {fmtCount(value)}
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------
// PILHA: o que espera para resolver (topo em cima), na ordem das regras
// ------------------------------------------------------------------
const StackPanel: React.FC<{
  before: BoardState;
  after: BoardState;
  action: Action;
  segments: Segment[];
  segmentIndex: number;
  dur: number;
}> = ({before, after, action, segments, segmentIndex, dur}) => {
  const frame = useCurrentFrame();

  // itens visíveis e animação de entrada/saída do topo
  let items: Array<StackItem & {enter?: number; leave?: number}> = [];
  let lap: string | null = null;

  if (action.type === 'trigger' && action.resolve) {
    // entra na pilha e resolve na mesma fala
    const resolveAt = Math.max(16, dur * 0.55);
    items = [...before.stack, {card: action.card, text: action.text, kind: 'ability' as const, enter: ease(frame / 10), leave: ease((frame - resolveAt) / 10)}];
  } else if (action.type === 'trigger') {
    items = after.stack.map((it, i) => ({...it, enter: i === after.stack.length - 1 ? ease(frame / 10) : 1}));
  } else if (action.type === 'resolve' || (EFFECT_ACTIONS.includes(action.type) && before.stack.length > after.stack.length)) {
    const leave = ease((frame - 8) / 12);
    items = before.stack.map((it, i) => ({...it, leave: i === before.stack.length - 1 ? leave : 0}));
  } else if (action.type === 'play' || action.type === 'cast') {
    // a mágica fica na pilha até resolver (a carta em si voa por cima; aqui só o "rótulo")
    const resolveAt = Math.max(14, dur * (action.type === 'cast' ? 0.55 : 0.32));
    const item: StackItem = {card: action.card, text: action.type === 'cast' && action.text ? action.text : `${action.card.split(',')[0]}`, kind: 'spell'};
    items = [...before.stack, {...item, enter: ease(frame / 8), leave: ease((frame - resolveAt) / 8)}];
  } else if (action.type === 'loop') {
    // a volta inteira passando pela pilha, cada vez mais rápido
    const seq = loopSequence(segments, segmentIndex);
    const ticks = loopTicks(dur);
    const k = ticks.filter((t) => t <= frame).length - 1;
    if (k >= 0) {
      const local = clamp01((frame - ticks[k]) / Math.max(2, (ticks[k + 1] ?? ticks[k] + 6) - ticks[k]));
      const cur = seq[k % seq.length];
      const prev = k > 0 ? seq[(k - 1) % seq.length] : undefined;
      items = [...(prev ? [{...prev, leave: ease(local * 1.5)}] : []), {...cur, enter: ease(local * 2)}];
      const done = frame > dur * 0.8;
      lap = done ? '∞' : `×${Math.floor(k / seq.length) + 1}`;
    }
  } else {
    items = after.stack.map((it) => ({...it}));
  }

  const panelIn = before.stack.length > 0 ? 1 : ease(frame / 8);
  const shown = items.slice(-3);
  const hidden = items.length - shown.length;
  const TILE_H = 96;

  return (
    <AbsoluteFill style={{zIndex: 9, pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: 130, right: 130, top: 300, opacity: panelIn}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10}}>
          <div style={{fontFamily: theme.fonts.display, fontWeight: 900, fontSize: 26, letterSpacing: 3, color: theme.colors.gold}}>PILHA</div>
          <div style={{flex: 1, height: 2, background: 'linear-gradient(90deg, rgba(var(--accent-rgb),0.6), transparent)'}} />
          {lap ? (
            <div style={{fontFamily: theme.fonts.display, fontWeight: 900, fontSize: lap === '∞' ? 64 : 44, color: theme.colors.goldHot, textShadow: goldGlow(1.2)}}>
              {lap === '∞' ? '∞' : `VOLTA ${lap}`}
            </div>
          ) : null}
        </div>
        <div style={{position: 'relative', height: TILE_H * 2 + 20}}>
          {[...shown].reverse().map((it, i) => {
            // i = 0 é o topo
            const enter = it.enter ?? 1;
            const leave = it.leave ?? 0;
            const y = i * (TILE_H + 10) - (1 - enter) * 60 - leave * 40;
            const isTop = i === 0;
            return (
              <div
                key={`${it.text}-${i}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: y,
                  height: TILE_H,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  padding: '0 22px',
                  borderRadius: 16,
                  background: isTop ? 'rgba(30,22,8,0.95)' : 'rgba(14,11,6,0.85)',
                  border: `3px solid ${isTop ? theme.colors.goldHot : 'rgba(var(--accent-rgb),0.35)'}`,
                  boxShadow: isTop ? `0 0 ${20 + leave * 60}px rgba(var(--accent-rgb),${0.4 + leave * 0.6})` : 'none',
                  opacity: enter * (1 - leave),
                  transform: `scale(${isTop ? 1 + leave * 0.06 : 0.96})`,
                }}
              >
                <div style={{fontFamily: theme.fonts.body, fontWeight: 900, fontSize: 20, letterSpacing: 2, color: theme.colors.goldInk, background: theme.colors.gold, borderRadius: 8, padding: '4px 10px', flexShrink: 0}}>
                  {it.kind === 'spell' ? 'MÁGICA' : 'HABILIDADE'}
                </div>
                <div style={{fontFamily: theme.fonts.body, fontWeight: 800, fontSize: 34, color: theme.colors.ink, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                  {it.text}
                </div>
                {isTop && leave > 0.05 ? (
                  <div style={{marginLeft: 'auto', fontFamily: theme.fonts.display, fontWeight: 900, fontSize: 24, color: theme.colors.goldHot, flexShrink: 0}}>RESOLVE ✓</div>
                ) : null}
              </div>
            );
          })}
          {hidden > 0 ? (
            <div style={{position: 'absolute', right: 10, top: TILE_H * 2 + 24, fontFamily: theme.fonts.body, fontWeight: 800, fontSize: 22, color: theme.colors.muted}}>+{hidden} embaixo</div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------
// HUD: reserva de mana, vida dos oponentes e sua
// ------------------------------------------------------------------
const HUD_MANA = {x: 150, y: 245};
const HUD_OPP = [
  {x: 670, y: 245},
  {x: 800, y: 245},
  {x: 930, y: 245},
];

const Hud: React.FC<{before: BoardState; after: BoardState; q: number; action: Action}> = ({before, after, q, action}) => {
  const frame = useCurrentFrame();
  const anim = (k: Action['type']) => (action.type === k || action.type === 'loop' ? q : 1);
  const mana = countUp(before.mana, after.mana, anim('mana'));
  const opp = countUp(before.oppLife, after.oppLife, anim('damage'));
  const me = countUp(before.myLife, after.myLife, anim('lifegain'));
  const color = theme.mana[after.manaColor] ?? theme.colors.gold;
  const hit = action.type === 'damage' ? interpolate(frame, [10, 14, 28], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;

  return (
    <AbsoluteFill style={{zIndex: 10, pointerEvents: 'none'}}>
      {after.manaSeen ? (
        <div style={{position: 'absolute', left: HUD_MANA.x - 66, top: HUD_MANA.y - 66, display: 'flex', alignItems: 'center', gap: 20}}>
          <div
            style={{
              width: 132,
              height: 132,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 30%, #fff 0%, ${color} 35%, #000 120%)`,
              border: `5px solid ${theme.colors.gold}`,
              boxShadow: `0 0 ${30 + (action.type === 'mana' ? Math.abs(Math.sin(frame / 4)) * 40 : 0)}px ${color}`,
              display: 'grid',
              placeItems: 'center',
              fontFamily: theme.fonts.display,
              fontWeight: 900,
              fontSize: 56,
              color: theme.colors.goldInk,
            }}
          >
            {after.manaColor}
          </div>
          <div style={{fontFamily: theme.fonts.display, fontWeight: 900, fontSize: Number.isFinite(mana) ? 84 : 120, color: theme.colors.goldHot, textShadow: goldGlow(1.2), lineHeight: 1}}>
            {fmtCount(mana)}
          </div>
        </div>
      ) : null}

      {after.lifeSeen ? (
        <div style={{position: 'absolute', left: HUD_MANA.x - 66, top: HUD_MANA.y + (after.manaSeen ? 90 : -40), fontFamily: theme.fonts.display, fontWeight: 900, fontSize: 40, color: '#9BEFC4'}}>
          VOCÊ {fmtCount(me)} ♥
        </div>
      ) : null}

      {after.oppSeen || action.type === 'attack'
        ? HUD_OPP.slice(0, after.oppCount).map((o, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: o.x - 58,
                top: o.y - 58,
                width: 116,
                height: 116,
                borderRadius: '50%',
                background: `radial-gradient(circle, rgba(232,67,58,${0.25 + hit * 0.6}), rgba(10,6,6,0.9) 70%)`,
                border: `4px solid ${hit ? theme.colors.blood : theme.colors.line}`,
                display: 'grid',
                placeItems: 'center',
                transform: `translateX(${hit ? Math.sin(frame * 3 + i) * 10 : 0}px)`,
                boxShadow: hit ? `0 0 40px ${theme.colors.blood}` : 'none',
              }}
            >
              <div style={{fontFamily: theme.fonts.display, fontWeight: 900, fontSize: Number.isFinite(opp) ? 42 : 52, color: opp <= 0 ? theme.colors.blood : theme.colors.ink}}>
                {Number.isFinite(opp) ? Math.max(0, Math.round(opp)) : '−∞'}
              </div>
              <div style={{position: 'absolute', bottom: -30, fontFamily: theme.fonts.body, fontWeight: 900, fontSize: 17, letterSpacing: 2, color: theme.colors.muted}}>OPONENTE</div>
            </div>
          ))
        : null}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------
// Título do beat / placa de foco + progresso
// ------------------------------------------------------------------
const BeatTitle: React.FC<{segment: Segment; action: Action; focusAmt: number; fancyLabel?: string}> = ({segment, action, focusAmt, fancyLabel}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - 1, fps, config: theme.spring.snappy});
  if (action.type === 'focus') {
    return (
      <div style={{position: 'absolute', left: 80, right: 80, top: 300, zIndex: 11, opacity: focusAmt, transform: `translateY(${(1 - focusAmt) * -30}px)`, textAlign: 'center'}}>
        <div style={{fontFamily: theme.fonts.display, fontWeight: 800, fontSize: 30, letterSpacing: 1, color: theme.colors.gold, textTransform: 'uppercase', marginBottom: 14}}>
          {action.card.split(' // ')[0]}
        </div>
        <div
          style={{
            display: 'inline-block',
            padding: '20px 34px',
            borderRadius: 18,
            background: 'rgba(12,9,5,0.92)',
            border: `3px solid ${theme.colors.gold}`,
            fontFamily: theme.fonts.body,
            fontWeight: 800,
            fontSize: 44,
            lineHeight: 1.18,
            color: theme.colors.ink,
            boxShadow: '0 0 40px rgba(var(--accent-rgb),0.3)',
          }}
        >
          {action.text}
        </div>
        {fancyLabel ? (
          <div
            style={{
              marginTop: 14,
              display: 'inline-block',
              marginLeft: 12,
              padding: '8px 18px',
              borderRadius: 999,
              background: 'linear-gradient(90deg, #ff3d6e, #ffb13d, #3dff8f, #3dd8ff, #b13dff)',
              color: '#0b0b0b',
              fontFamily: theme.fonts.display,
              fontWeight: 900,
              fontSize: 19,
              letterSpacing: 1,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              boxShadow: '0 0 24px rgba(255,255,255,0.35)',
            }}
          >
            ✦ {fancyLabel}
          </div>
        ) : null}
      </div>
    );
  }
  if (!segment.onScreen) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 80,
        right: 80,
        top: 360,
        zIndex: 11,
        textAlign: 'center',
        fontFamily: theme.fonts.display,
        fontWeight: 900,
        fontSize: 64,
        lineHeight: 1.05,
        textTransform: 'uppercase',
        color: theme.colors.goldHot,
        textShadow: goldGlow(1),
        opacity: s,
        transform: `translateY(${(1 - s) * 30}px)`,
      }}
    >
      {segment.onScreen}
    </div>
  );
};

const StepDots: React.FC<{index: number; count: number}> = ({index, count}) => (
  <div style={{position: 'absolute', top: 150, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 12, zIndex: 10}}>
    {Array.from({length: count}).map((_, i) => (
      <div
        key={i}
        style={{
          width: i === index ? 40 : 14,
          height: 14,
          borderRadius: 7,
          background: i <= index ? theme.colors.gold : 'rgba(var(--accent-rgb),0.25)',
          boxShadow: i === index ? `0 0 14px ${theme.colors.gold}` : 'none',
        }}
      />
    ))}
  </div>
);
