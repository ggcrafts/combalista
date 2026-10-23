// ============================================================
//  EFEITOS — luz, partículas, impacto e pós-processamento
//  Visual "filmado", não vetorial: partículas com núcleo quente + halo (blend aditivo),
//  rastro de movimento, bokeh com profundidade, raios volumétricos, grão e light leak.
//  Tudo determinístico (random com semente), para o render ser igual ao preview.
// ============================================================
import React from 'react';
import {AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from './theme';

export const resolveSrc = (src: string) => (/^https?:\/\//.test(src) ? src : staticFile(src));

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ------------------------------------------------------------------
// Fundo: arte desfocada + luz quente no canto + bokeh + vinheta
// ------------------------------------------------------------------
export const Backdrop: React.FC<{art?: string; saturation: number; brightness?: number}> = ({art, saturation, brightness = 0.32}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const zoom = interpolate(frame, [0, durationInFrames], [1.18, 1.32]);
  const glowShift = Math.sin(frame / 70) * 40;
  return (
    <AbsoluteFill style={{backgroundColor: theme.colors.bg}}>
      {art ? (
        <Img
          src={resolveSrc(art)}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${zoom}) translateY(${Math.sin(frame / 90) * 12}px)`,
            filter: `blur(34px) saturate(${saturation}) brightness(${brightness})`,
          }}
        />
      ) : null}
      {/* luz vindo de baixo, na cor do combo (a segunda cor da guilda dá o tom) */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(70% 45% at ${8 + glowShift / 20}% 92%, rgba(var(--accent-rgb),0.34) 0%, rgba(var(--accent2-rgb),0.16) 38%, transparent 70%)`,
          mixBlendMode: 'screen',
        }}
      />
      <AbsoluteFill style={{background: 'radial-gradient(120% 80% at 50% 45%, transparent 35%, rgba(4,3,6,0.88) 100%)'}} />
      <Dust />
    </AbsoluteFill>
  );
};

/** Poeira em três profundidades: grãos nítidos perto do foco, bokeh desfocado longe */
export const Dust: React.FC<{count?: number}> = ({count = 60}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'screen'}}>
      {Array.from({length: count}).map((_, i) => {
        const depth = i % 3; // 0 = perto (bokeh grande), 1 = meio, 2 = longe (grão)
        const x0 = random(`dx${i}`) * 1080;
        const y0 = random(`dy${i}`) * 1920;
        const speed = [0.55, 0.3, 0.14][depth] * (0.6 + random(`ds${i}`) * 0.8);
        const y = (y0 - frame * speed + 1920 * 6) % 1920;
        const x = x0 + Math.sin((frame + i * 37) / (50 + depth * 20)) * (18 - depth * 5);
        const size = [26, 7, 2.5][depth] * (0.6 + random(`dz${i}`) * 0.8);
        const blur = [10, 2, 0.4][depth];
        const twinkle = 0.35 + 0.65 * Math.abs(Math.sin((frame + i * 13) / (20 + (i % 7) * 5)));
        const alpha = [0.16, 0.45, 0.7][depth] * twinkle;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(255,255,255,${alpha}) 0%, rgba(var(--accent-rgb),${alpha * 0.8}) 45%, transparent 72%)`,
              filter: `blur(${blur}px)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Reflexo de luz (lens glint): núcleo + cruz fina desfocada. Substitui a estrela vetorial. */
export const Sparkle: React.FC<{x: number; y: number; size: number; opacity?: number; rotate?: number; color?: string}> = ({
  x,
  y,
  size,
  opacity = 1,
  rotate = 0,
}) => (
  <div style={{position: 'absolute', left: x - size, top: y - size, width: size * 2, height: size * 2, opacity, transform: `rotate(${rotate}deg)`, mixBlendMode: 'screen', pointerEvents: 'none'}}>
    <div style={{position: 'absolute', inset: size * 0.6, borderRadius: '50%', background: 'radial-gradient(circle, #fff 0%, rgba(var(--accent-rgb),0.7) 35%, transparent 70%)', filter: 'blur(1px)'}} />
    <div style={{position: 'absolute', left: 0, right: 0, top: size - 1, height: 2, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)', filter: 'blur(1px)'}} />
    <div style={{position: 'absolute', top: 0, bottom: 0, left: size - 1, width: 2, background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.9), transparent)', filter: 'blur(1px)'}} />
  </div>
);

/**
 * Explosão de partículas com física (gravidade + arrasto), núcleo quente e rastro na direção
 * do movimento (motion blur). Clarão inicial + fumaça leve subindo.
 */
export const SparkBurst: React.FC<{x: number; y: number; at?: number; count?: number; radius?: number; seed?: string; color?: string}> = ({
  x,
  y,
  at = 0,
  count = 26,
  radius = 340,
  seed = 'b',
  color,
}) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 46) return null;
  const tint = color ?? 'rgba(var(--accent-rgb),1)';
  // posição com arrasto: x(t) = v * (1 - e^(-k t)) / k
  const K = 0.12;
  const travel = (tt: number) => (1 - Math.exp(-K * tt)) / K;
  const flash = interpolate(t, [0, 2, 10], [0, 1, 0], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {/* clarão */}
      <div
        style={{
          position: 'absolute',
          left: x - radius,
          top: y - radius,
          width: radius * 2,
          height: radius * 2,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(255,255,255,${0.9 * flash}) 0%, rgba(var(--accent-rgb),${0.5 * flash}) 22%, transparent 60%)`,
          mixBlendMode: 'screen',
          filter: 'blur(6px)',
        }}
      />
      {/* fumaça subindo (dá peso real ao impacto) */}
      {Array.from({length: 5}).map((_, i) => {
        const st = clamp01(t / 46);
        const sx = x + (random(`${seed}sx${i}`) - 0.5) * radius * 0.8;
        const sy = y - st * (60 + random(`${seed}sy${i}`) * 120);
        const ss = 80 + st * 220;
        return (
          <div
            key={`s${i}`}
            style={{
              position: 'absolute',
              left: sx - ss / 2,
              top: sy - ss / 2,
              width: ss,
              height: ss,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(200,195,190,0.18), transparent 70%)',
              filter: 'blur(14px)',
              opacity: (1 - st) * 0.8,
            }}
          />
        );
      })}
      {/* partículas */}
      <AbsoluteFill style={{mixBlendMode: 'screen'}}>
        {Array.from({length: count}).map((_, i) => {
          const ang = random(`${seed}a${i}`) * Math.PI * 2;
          const v = (radius * (0.35 + random(`${seed}r${i}`) * 0.65)) * K * 1.05;
          const d = v * travel(t);
          const g = 0.35 * t * t * 0.5 * (0.5 + random(`${seed}g${i}`)); // gravidade
          const px = x + Math.cos(ang) * d;
          const py = y + Math.sin(ang) * d + g;
          // velocidade instantânea → comprimento do rastro
          const vx = Math.cos(ang) * v * Math.exp(-K * t);
          const vy = Math.sin(ang) * v * Math.exp(-K * t) + 0.35 * t * (0.5 + random(`${seed}g${i}`));
          const speed = Math.hypot(vx, vy);
          const life = 26 + random(`${seed}l${i}`) * 20;
          const fade = clamp01(1 - t / life) * clamp01(t / 2);
          const flicker = 0.7 + 0.3 * Math.sin(t * 1.7 + i);
          const core = 3 + random(`${seed}c${i}`) * 4;
          const len = core * 2 + speed * 2.2; // motion blur
          const rot = (Math.atan2(vy, vx) * 180) / Math.PI;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: px - len / 2,
                top: py - core,
                width: len,
                height: core * 2,
                borderRadius: core,
                transform: `rotate(${rot}deg)`,
                background: `linear-gradient(90deg, transparent 0%, ${tint} 45%, #fff 85%, #fff 100%)`,
                boxShadow: `0 0 ${core * 4}px ${tint}`,
                opacity: fade * flicker,
                filter: 'blur(0.6px)',
              }}
            />
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Impacto na mesa: anel de luz difuso + poeira levantando */
export const Shockwave: React.FC<{x: number; y: number; at?: number; size?: number; color?: string}> = ({x, y, at = 0, size = 620}) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 28) return null;
  const s = 1 - Math.pow(1 - clamp01(t / 22), 3);
  const o = interpolate(t, [0, 3, 28], [0, 0.85, 0], {extrapolateRight: 'clamp'});
  const w = size * (0.25 + s * 0.85);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x - w / 2,
          top: y - (w * 0.4) / 2,
          width: w,
          height: w * 0.4,
          borderRadius: '50%',
          background: `radial-gradient(closest-side, transparent 62%, rgba(255,255,255,${o}) 80%, rgba(var(--accent-rgb),${o * 0.7}) 88%, transparent 100%)`,
          filter: 'blur(4px)',
          mixBlendMode: 'screen',
        }}
      />
      {Array.from({length: 7}).map((_, i) => {
        const a = (i / 7) * Math.PI * 2 + 0.3;
        const dx = Math.cos(a) * w * 0.48;
        const dy = Math.sin(a) * w * 0.17 - s * 30;
        const ps = 70 + s * 120;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x + dx - ps / 2,
              top: y + dy - ps / 2,
              width: ps,
              height: ps,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(210,200,190,0.22), transparent 70%)',
              filter: 'blur(10px)',
              opacity: o,
            }}
          />
        );
      })}
    </>
  );
};

/** Rasgo de luz vertical (transição entre atos). progress 0→1 abre e fecha. */
export const LightStreak: React.FC<{progress: number}> = ({progress}) => {
  if (progress <= 0 || progress >= 1) return null;
  const w = Math.sin(progress * Math.PI);
  return (
    <AbsoluteFill style={{pointerEvents: 'none', alignItems: 'center', mixBlendMode: 'screen'}}>
      <div
        style={{
          width: 8 + w * 180,
          height: '100%',
          background: `linear-gradient(90deg, transparent, rgba(var(--accent-rgb),${0.55 * w}) 30%, #fff 50%, rgba(var(--accent-rgb),${0.55 * w}) 70%, transparent)`,
          filter: 'blur(10px)',
        }}
      />
      <AbsoluteFill style={{background: '#fff', opacity: Math.max(0, w - 0.75) * 2}} />
    </AbsoluteFill>
  );
};

/** Raios de luz volumétricos (god rays), girando devagar atrás de algo importante */
export const Rays: React.FC<{x: number; y: number; size?: number; opacity?: number; color?: string}> = ({x, y, size = 1600, opacity = 0.25}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        opacity,
        transform: `rotate(${frame * 0.25}deg)`,
        background: 'repeating-conic-gradient(from 0deg, rgba(var(--accent-rgb),0.9) 0deg 3deg, transparent 6deg 19deg, rgba(255,255,255,0.35) 20deg 21deg, transparent 23deg 30deg)',
        WebkitMaskImage: 'radial-gradient(circle, #000 0%, rgba(0,0,0,0.6) 30%, transparent 68%)',
        maskImage: 'radial-gradient(circle, #000 0%, rgba(0,0,0,0.6) 30%, transparent 68%)',
        filter: 'blur(14px)',
        mixBlendMode: 'screen',
        pointerEvents: 'none',
      }}
    />
  );
};

// ------------------------------------------------------------------
// Pós-processamento (por cima de tudo): grão de filme, light leak, vinheta
// ------------------------------------------------------------------
export const PostFX: React.FC = () => {
  const frame = useCurrentFrame();
  const seed = frame % 8; // grão "fervendo"
  const lx = 30 + Math.sin(frame / 80) * 25;
  const ly = 20 + Math.cos(frame / 110) * 15;
  return (
    <AbsoluteFill style={{pointerEvents: 'none', zIndex: 40}}>
      {/* light leak na cor do combo */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(45% 30% at ${lx}% ${ly}%, rgba(var(--accent-rgb),0.16), transparent 70%), radial-gradient(35% 25% at ${100 - lx}% ${100 - ly}%, rgba(var(--accent2-rgb),0.12), transparent 70%)`,
          mixBlendMode: 'screen',
        }}
      />
      {/* vinheta suave */}
      <AbsoluteFill style={{background: 'radial-gradient(130% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.45) 100%)'}} />
      {/* grão de filme */}
      <AbsoluteFill style={{opacity: 0.07, mixBlendMode: 'overlay'}}>
        <svg width="100%" height="100%">
          <filter id={`grain-${seed}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------
// Anime: linhas de velocidade, impact frame (cores invertidas) e corte diagonal
// ------------------------------------------------------------------
/** Linhas de velocidade convergindo para o centro (redesenhadas a cada 2 frames, como animação à mão) */
export const SpeedLines: React.FC<{opacity: number; cx?: number; cy?: number; seed?: string; dark?: boolean}> = ({opacity, cx = 540, cy = 860, seed = 'sl', dark = false}) => {
  const frame = useCurrentFrame();
  if (opacity <= 0) return null;
  const step = Math.floor(frame / 2); // "on twos"
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', inset: 0, opacity, pointerEvents: 'none'}}>
      <defs>
        <mask id={`slm-${seed}`}>
          <rect width={1080} height={1920} fill="#fff" />
          <circle cx={cx} cy={cy} r={260} fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#slm-${seed})`}>
        {Array.from({length: 90}).map((_, i) => {
          const a = (i / 90) * Math.PI * 2 + (random(`${seed}${step}a${i}`) - 0.5) * 0.05;
          const inner = 300 + random(`${seed}${step}i${i}`) * 420;
          const w = 1.5 + random(`${seed}${step}w${i}`) * 7;
          const x1 = cx + Math.cos(a) * inner;
          const y1 = cy + Math.sin(a) * inner;
          const x2 = cx + Math.cos(a) * 2400;
          const y2 = cy + Math.sin(a) * 2400;
          const nx = -Math.sin(a) * w;
          const ny = Math.cos(a) * w;
          return <polygon key={i} points={`${x1},${y1} ${x2 + nx},${y2 + ny} ${x2 - nx},${y2 - ny}`} style={{fill: dark ? '#000' : '#fff'}} opacity={0.55 + random(`${seed}${step}o${i}`) * 0.45} />;
        })}
      </g>
    </svg>
  );
};

/**
 * Transição dramática estilo anime, t = frames desde o início do momento.
 *  0–2  impact frame: a imagem fica P&B invertida e contrastada (feito na composição) e as linhas são pretas
 *  2–4  clarão
 *  0–16 linhas de velocidade
 *  3–13 corte diagonal (barra preta com borda de luz atravessando)
 */
export const AnimeImpact: React.FC<{t: number; seed?: string}> = ({t, seed = 'ai'}) => {
  if (t < 0 || t > 18) return null;
  const invert = t < 2.5;
  const flash = interpolate(t, [2, 3, 5], [0, 0.7, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const lines = interpolate(t, [0, 1, 10, 16], [0, 1, 0.8, 0], {extrapolateRight: 'clamp'});
  const slash = clamp01((t - 3) / 10);
  const sx = -400 + slash * 1900; // posição da barra diagonal
  return (
    <AbsoluteFill style={{pointerEvents: 'none', zIndex: 35}}>
      <SpeedLines opacity={lines} seed={seed} dark={invert} />
      {slash > 0 && slash < 1 ? (
        <div
          style={{
            position: 'absolute',
            left: sx - 260,
            top: -400,
            width: 220,
            height: 2800,
            transform: 'rotate(24deg)',
            background: 'linear-gradient(90deg, rgba(255,255,255,0.95) 0%, #000 6%, #000 90%, rgba(var(--accent-rgb),1) 100%)',
            boxShadow: '0 0 60px rgba(var(--accent-rgb),0.9)',
          }}
        />
      ) : null}
      <AbsoluteFill style={{background: '#fff', opacity: flash}} />
    </AbsoluteFill>
  );
};
