// ============================================================
//  CENAS CINEMATOGRÁFICAS — abertura, clímax, deckbuilding, preço, chamada final
//  (os beats do meio são o tabuleiro contínuo, em Board.tsx)
//  Movimento sem elástico e sempre "vivo": nada fica parado esperando a fala.
// ============================================================
import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {CARD_RATIO, GameCard} from './card';
import {Rays, Shockwave, SparkBurst} from './fx';
import {formatBRL, goldGlow, identityColors, theme} from './theme';
import type {CardInfo, Segment, VideoProps} from './types';

type SceneProps = {segment: Segment; video: VideoProps};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

/** A carta protagonista: a nova, senão a joia, senão a primeira */
export const heroCard = (v: VideoProps): CardInfo =>
  (v.hero && v.cards.find((c) => c.name === v.hero)) || v.cards.find((c) => c.isNew) || v.cards.find((c) => c.isGem) || v.cards[0];

const ANGLE_BADGE: Record<VideoProps['angle'], string> = {
  novidade: 'Carta nova',
  inusitado: 'Interação inusitada',
  joia: 'Joia escondida',
  barato: 'Combo barato',
};

/** Fade de saída nos últimos frames */
const useExit = (frames = 6) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return interpolate(frame, [durationInFrames - frames, durationInFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
};

/** Título palavra por palavra: entra rápido, sem quique */
export const Title: React.FC<{text: string; size?: number; delay?: number; color?: string}> = ({text, size = 76, delay = 0, color = theme.colors.goldHot}) => {
  const frame = useCurrentFrame();
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: `0 ${size * 0.26}px`,
        fontFamily: theme.fonts.display,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1.08,
        textTransform: 'uppercase',
        color,
        textShadow: goldGlow(1),
        textAlign: 'center',
      }}
    >
      {words.map((w, i) => {
        const s = ease((frame - delay - i * 2) / 7);
        return (
          <span key={i} style={{display: 'inline-block', opacity: s, transform: `translateY(${(1 - s) * 34}px) scale(${0.9 + s * 0.1})`}}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

const Badge: React.FC<{text: string; delay?: number}> = ({text, delay = 0}) => {
  const frame = useCurrentFrame();
  const s = ease((frame - delay) / 8);
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 28px',
        border: `3px solid ${theme.colors.gold}`,
        borderRadius: 999,
        background: 'rgba(12,9,5,0.8)',
        fontFamily: theme.fonts.display,
        fontWeight: 800,
        fontSize: 26,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: theme.colors.gold,
        opacity: s,
        transform: `translateY(${(1 - s) * -20}px)`,
        boxShadow: '0 0 30px rgba(var(--accent-rgb),0.25)',
      }}
    >
      {text}
    </div>
  );
};

const ManaDots: React.FC<{identity: string; size?: number}> = ({identity, size = 30}) => (
  <span style={{display: 'inline-flex', gap: 10}}>
    {identityColors(identity).map((c, i) => (
      <span key={i} style={{width: size, height: size, borderRadius: '50%', background: c, border: `3px solid ${theme.colors.gold}`, boxShadow: `0 0 12px ${c}`}} />
    ))}
  </span>
);

/** Leque com as cartas do combo (flutua de leve o tempo todo) */
const Fan: React.FC<{cards: CardInfo[]; width: number; y: number; delay?: number; glow?: number}> = ({cards, width, y, delay = 0, glow = 0}) => {
  const frame = useCurrentFrame();
  const n = cards.length;
  return (
    <>
      {cards.map((c, i) => {
        const s = ease((frame - delay - i * 3) / 10);
        const off = i - (n - 1) / 2;
        return (
          <div
            key={c.name}
            style={{
              position: 'absolute',
              left: 540 - width / 2 + off * width * 0.66,
              top: y - (width * CARD_RATIO) / 2 + Math.abs(off) * 30 + (1 - s) * 260 + Math.sin((frame + i * 17) / 26) * 6,
              transform: `rotate(${off * 9 * s + Math.sin((frame + i * 31) / 40) * 1}deg)`,
              opacity: s,
              zIndex: 10 - Math.abs(off),
            }}
          >
            <GameCard src={c.image} width={width} fx={{glow}} />
          </div>
        );
      })}
    </>
  );
};

// ------------------------------------------------------------------
// ABERTURA (< 3 s): impacto no frame zero, carta revelada em 0,2 s
// ------------------------------------------------------------------
export const HookScene: React.FC<SceneProps> = ({segment, video}) => {
  const frame = useCurrentFrame();
  const exit = useExit();
  const hero = heroCard(video);
  const REVEAL = 4;
  const grow = ease((frame - 1) / 9);
  const w = interpolate(grow, [0, 1], [580, 430]); // vem de perto da câmera e assenta
  const flip = clamp01((frame - 0) / REVEAL + 0.15);
  const push = 1 + frame * 0.0025; // aproximação contínua
  const cy = 975;
  const badge = video.angle === 'novidade' && hero.setName ? `${ANGLE_BADGE.novidade} · ${hero.setName}` : ANGLE_BADGE[video.angle];
  const flash = interpolate(frame, [0, 5], [0.85, 0], {extrapolateRight: 'clamp'});
  const shake = frame < 8 ? Math.sin(frame * 3.1) * (8 - frame) * 2.2 : 0;

  return (
    <AbsoluteFill style={{opacity: exit, transform: `translateX(${shake}px)`}}>
      <Rays x={540} y={cy} opacity={0.35} size={2100} />
      <div style={{position: 'absolute', top: 210, left: 80, right: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, zIndex: 3}}>
        <Badge text={badge} delay={1} />
        <Title text={segment.onScreen} size={segment.onScreen.length > 30 ? 52 : segment.onScreen.length > 20 ? 60 : 76} delay={2} />
      </div>
      <div style={{position: 'absolute', left: 540 - w / 2, top: cy - (w * CARD_RATIO) / 2, transform: `scale(${push}) rotate(${Math.sin(frame / 18) * 1.5}deg)`, zIndex: 2}}>
        {/* apresentação: a versão "bonita e cara" (Secret Lair, foil...) com o acabamento imitado */}
        <GameCard
          src={hero.fancy?.image ?? hero.image}
          width={w}
          fx={{flip, glow: 0.9, finish: hero.fancy?.finish, lightAngle: Math.sin(frame / 18) * 6 + frame * 0.8}}
          seed="hero"
        />
      </div>
      {hero.fancy ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: cy - (w * CARD_RATIO) / 2 - 56,
            display: 'flex',
            justifyContent: 'center',
            zIndex: 3,
            opacity: ease((frame - 8) / 8),
          }}
        >
          <div
            style={{
              padding: '8px 20px',
              borderRadius: 999,
              background: 'linear-gradient(90deg, #ff3d6e, #ffb13d, #3dff8f, #3dd8ff, #b13dff)',
              color: '#0b0b0b',
              fontFamily: theme.fonts.display,
              fontWeight: 900,
              fontSize: 20,
              letterSpacing: 1,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              boxShadow: '0 0 24px rgba(255,255,255,0.35)',
            }}
          >
            ✦ {hero.fancy.label}
          </div>
        </div>
      ) : null}
      <Shockwave x={540} y={cy} at={REVEAL} size={900} />
      <SparkBurst x={540} y={cy} at={REVEAL} count={40} radius={560} seed="hook" />
      <AbsoluteFill style={{background: '#fff', opacity: flash}} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------
// CLÍMAX ("combou, mostra o payoff")
// ------------------------------------------------------------------
export const PayoffScene: React.FC<SceneProps> = ({segment, video}) => {
  const frame = useCurrentFrame();
  const exit = useExit();
  const impact = ease(frame / 8);
  const shake = frame < 12 ? Math.sin(frame * 2.7) * (12 - frame) * 1.8 : 0;
  const infinite = /infinit|∞/i.test(`${segment.onScreen} ${segment.narration}`);
  return (
    <AbsoluteFill style={{opacity: exit, transform: `translateX(${shake}px) scale(${1 + frame * 0.0015})`}}>
      <Rays x={540} y={760} opacity={0.42} size={2200} />
      {infinite ? (
        <div
          style={{
            position: 'absolute',
            top: 330,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: theme.fonts.display,
            fontWeight: 900,
            fontSize: 560,
            lineHeight: 1,
            color: 'transparent',
            WebkitTextStroke: `6px ${theme.colors.gold}`,
            opacity: 0.3 * impact,
            transform: `rotate(${frame * 0.25}deg)`,
          }}
        >
          ∞
        </div>
      ) : null}
      <div style={{position: 'absolute', top: 260, left: 80, right: 80, transform: `scale(${interpolate(impact, [0, 1], [1.5, 1])})`}}>
        <Title text={segment.onScreen} size={segment.onScreen.length > 24 ? 74 : 92} />
      </div>
      <Fan cards={video.cards} width={250} y={960} delay={4} glow={0.8} />
      <SparkBurst x={540} y={700} at={0} count={46} radius={620} seed="pay" />
      <AbsoluteFill style={{background: '#fff', opacity: interpolate(frame, [0, 5], [0.7, 0], {extrapolateRight: 'clamp'})}} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------
// DECKBUILDING
// ------------------------------------------------------------------
export const DeckScene: React.FC<SceneProps> = ({segment, video}) => {
  const frame = useCurrentFrame();
  const exit = useExit();
  return (
    <AbsoluteFill style={{opacity: exit, transform: `scale(${1 + frame * 0.0012})`}}>
      <div style={{position: 'absolute', top: 220, left: 80, right: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24}}>
        <Badge text="Deckbuilding" />
        <Title text={segment.onScreen} size={68} delay={2} />
        <ManaDots identity={video.colorIdentity} />
      </div>
      <Fan cards={video.cards} width={290} y={900} delay={4} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------
// PREÇO — "menor da Liga" (com caixa registradora no som)
// ------------------------------------------------------------------
export const PriceScene: React.FC<SceneProps> = ({video}) => {
  const frame = useCurrentFrame();
  const exit = useExit();
  const countT = ease((frame - 6) / 18);
  const shown = video.totalBRL === null ? null : video.totalBRL * countT;
  const stamp = ease((frame - 8) / 6);
  return (
    <AbsoluteFill style={{opacity: exit, transform: `scale(${1 + frame * 0.0015})`}}>
      <div style={{position: 'absolute', top: 300, left: 80, right: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34}}>
        <Badge text={video.priceFromLiga ? 'Menor da Liga' : 'Menor da Liga (aprox.)'} />
        <div style={{display: 'flex', gap: 18, alignItems: 'flex-end'}}>
          {video.cards.map((c, i) => {
            const s = ease((frame - i * 3) / 9);
            return (
              <div key={c.name} style={{opacity: s, transform: `translateY(${(1 - s) * 60}px) rotate(${(i - (video.cards.length - 1) / 2) * 4}deg)`}}>
                <GameCard src={c.image} width={200} />
                <div style={{marginTop: 10, textAlign: 'center', fontFamily: theme.fonts.body, fontWeight: 900, fontSize: 30, color: theme.colors.ink}}>{formatBRL(c.priceBRL)}</div>
              </div>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 10,
            padding: '18px 44px',
            borderRadius: 22,
            background: `linear-gradient(180deg, ${theme.colors.goldHot}, ${theme.colors.gold})`,
            color: theme.colors.goldInk,
            fontFamily: theme.fonts.display,
            fontWeight: 900,
            fontSize: 96,
            transform: `scale(${0.7 + stamp * 0.3}) rotate(${-3 + Math.sin(frame / 20)}deg)`,
            opacity: stamp,
            boxShadow: `0 0 60px rgba(var(--accent-rgb),0.6)`,
          }}
        >
          {formatBRL(shown)}
        </div>
        {!video.priceFromLiga ? (
          <div style={{fontFamily: theme.fonts.body, fontWeight: 700, fontSize: 24, color: theme.colors.muted}}>valor aproximado · confere na Liga</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------
// CHAMADA FINAL — a carta principal do combo fica na tela até o fim
// ------------------------------------------------------------------
export const CtaScene: React.FC<SceneProps> = ({segment, video}) => {
  const frame = useCurrentFrame();
  const hero = heroCard(video);
  const s = ease(frame / 10);
  const w = 480;
  return (
    <AbsoluteFill>
      <Rays x={540} y={980} opacity={0.25} size={1800} />
      <div style={{position: 'absolute', top: 200, left: 80, right: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22}}>
        {/* logo do canal (public/brand/logo.png, trocável pelo painel) */}
        <Img
          src={staticFile(video.brand?.logo ?? 'brand/logo.png')}
          style={{width: 760, height: 168, objectFit: 'contain', opacity: s, transform: `scale(${0.92 + s * 0.08})`, filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.6))'}}
        />
        <Title text={segment.onScreen} size={56} />
        <div style={{fontFamily: theme.fonts.display, fontWeight: 900, fontSize: 52, color: theme.colors.goldHot, textShadow: goldGlow(1.3)}}>{video.handle}</div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 540 - w / 2,
          top: 1000 - (w * CARD_RATIO) / 2 + (1 - s) * 200,
          opacity: s,
          transform: `perspective(1400px) rotateY(${Math.sin(frame / 24) * 10}deg) rotate(${Math.sin(frame / 31) * 1.5}deg) scale(${1 + frame * 0.0015})`,
        }}
      >
        <GameCard src={hero.image} width={w} fx={{glow: 0.9}} />
      </div>
    </AbsoluteFill>
  );
};

export const SCENES = {
  hook: HookScene,
  payoff: PayoffScene,
  deck: DeckScene,
  price: PriceScene,
  cta: CtaScene,
} as const;
