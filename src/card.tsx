// ============================================================
//  CARTA — frente original (Scryfall) + verso da marca, com estados animáveis:
//  virar (flip), tapar (90°), brilho, queimar, desfazer em luz, fantasma (cópia)
// ============================================================
import React from 'react';
import {Img, random, useCurrentFrame} from 'remotion';
import {resolveSrc} from './fx';
import {theme} from './theme';

/** Proporção das imagens de carta do Scryfall (488 x 680) */
export const CARD_RATIO = 680 / 488;

/**
 * Verso da marca (não usamos o verso oficial): placa de aço escovado com rebites, como o logo
 * Constructo do CombaLista, e o ícone do canal no centro (public/brand/icone.png, trocável no painel).
 */
export const CardBack: React.FC<{width: number; icon?: string}> = ({width, icon = 'brand/icone.png'}) => {
  const h = width * CARD_RATIO;
  const steel = (
    <>
      <stop offset="0" stopColor="#F7F9FC" />
      <stop offset="0.3" stopColor="#C9CFD8" />
      <stop offset="0.55" stopColor="#7A818C" />
      <stop offset="0.75" stopColor="#B9C0CA" />
      <stop offset="1" stopColor="#E6EAF0" />
    </>
  );
  const rivets = [
    [40, 40], [448, 40], [40, 640], [448, 640],
    [244, 40], [244, 640], [40, 340], [448, 340],
  ];
  return (
    <div style={{position: 'relative', width, height: h}}>
      <svg width={width} height={h} viewBox="0 0 488 680" style={{display: 'block'}}>
        <defs>
          <linearGradient id="cbplate" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2E333B" />
            <stop offset="1" stopColor="#101216" />
          </linearGradient>
          <linearGradient id="cbsteel" x1="0" y1="0" x2="0" y2="1">
            {steel}
          </linearGradient>
          <pattern id="cbbrushed" width="6" height="6" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="6" y2="0" stroke="#ffffff" strokeOpacity="0.035" strokeWidth="2" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="488" height="680" rx="24" fill="url(#cbplate)" />
        <rect x="0" y="0" width="488" height="680" rx="24" fill="url(#cbbrushed)" />
        {/* moldura de aço em duas camadas */}
        <rect x="14" y="14" width="460" height="652" rx="16" fill="none" stroke="url(#cbsteel)" strokeWidth="8" />
        <rect x="30" y="30" width="428" height="620" rx="9" fill="none" stroke="#8A919C" strokeOpacity="0.5" strokeWidth="2" />
        {rivets.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="7" fill="url(#cbsteel)" stroke="#2B2F36" strokeWidth="1.5" />
            <circle cx={x - 2} cy={y - 2} r="2" fill="#fff" opacity="0.7" />
          </g>
        ))}
        {/* anel de mana (WUBRG) em volta do emblema */}
        <circle cx="244" cy="340" r="176" fill="none" stroke="url(#cbsteel)" strokeWidth="3" opacity="0.8" />
        {Array.from({length: 5}).map((_, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          return (
            <circle
              key={i}
              cx={244 + Math.cos(a) * 176}
              cy={340 + Math.sin(a) * 176}
              r="14"
              fill={['#F5E9C8', '#3C8EDB', '#8F78A8', '#E4553F', '#3FA866'][i]}
              stroke="url(#cbsteel)"
              strokeWidth="3"
            />
          );
        })}
        {/* placa de nome embaixo */}
        <rect x="134" y="584" width="220" height="34" rx="8" fill="#14171C" stroke="url(#cbsteel)" strokeWidth="2" />
        <text x="244" y="607" textAnchor="middle" fontFamily={theme.fonts.display} fontWeight={900} fontSize="18" fill="#C9CFD8" letterSpacing="3">
          COMBALISTA
        </text>
      </svg>
      {/* ícone do canal no centro (Img: o render espera ele carregar) */}
      <Img
        src={resolveSrc(icon)}
        style={{
          position: 'absolute',
          left: width * 0.5 - width * 0.31,
          top: h * 0.5 - width * 0.31,
          width: width * 0.62,
          height: width * 0.62,
          objectFit: 'contain',
          filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.6))',
        }}
      />
    </div>
  );
};

export type CardFx = {
  /** 0 = verso, 1 = frente */
  flip?: number;
  /** 0 = desvirada, 1 = virada 90° */
  tapped?: number;
  /** brilho dourado na borda (0..1) */
  glow?: number;
  glowColor?: string;
  /** queimando de baixo para cima (0..1) */
  burn?: number;
  /** desfazendo em luz (0..1) */
  dissolve?: number;
  /** cópia translúcida */
  ghost?: boolean;
  /** escurecida (fora de foco) */
  dim?: number;
  /** acabamento a imitar: foil (arco-íris holográfico) ou etched (metálico com linhas finas) */
  finish?: 'foil' | 'etched' | 'nonfoil';
  /** inclinação "de luz" (graus): move o reflexo do foil como se a carta girasse sob a luz */
  lightAngle?: number;
};

/** Reflexo de foil/etched por cima da arte (recortado no formato da carta) */
const FoilLayer: React.FC<{finish: 'foil' | 'etched'; light: number; seed: string}> = ({finish, light, seed}) => {
  const frame = useCurrentFrame();
  const shift = (frame * 1.6 + light * 6) % 300; // o arco-íris "anda" com o tempo e com a inclinação
  const sweep = ((frame * 2.2 + light * 10) % 260) - 80; // faixa especular atravessando
  if (finish === 'etched') {
    return (
      <>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.10) 0 1px, transparent 1px 4px)',
            mixBlendMode: 'overlay',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(115deg, transparent ${sweep - 25}%, rgba(235,240,255,0.55) ${sweep}%, transparent ${sweep + 25}%)`,
            mixBlendMode: 'soft-light',
          }}
        />
        <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(200,210,230,0.25), rgba(120,110,140,0.15))', mixBlendMode: 'color'}} />
      </>
    );
  }
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(115deg, #ff3d6e, #ffb13d, #f7ff3d, #3dff8f, #3dd8ff, #6f3dff, #ff3dd2, #ff3d6e, #ffb13d, #f7ff3d)',
          backgroundSize: '300% 300%',
          backgroundPosition: `${shift}% 50%`,
          mixBlendMode: 'color-dodge',
          opacity: 0.32,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(115deg, transparent ${sweep - 18}%, rgba(255,255,255,0.65) ${sweep}%, transparent ${sweep + 18}%)`,
          mixBlendMode: 'screen',
        }}
      />
      {/* glitter: pontinhos que acendem e apagam */}
      {Array.from({length: 26}).map((_, i) => {
        const on = Math.max(0, Math.sin(frame / (5 + (i % 4)) + i * 2.1));
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${random(`${seed}gx${i}`) * 100}%`,
              top: `${random(`${seed}gy${i}`) * 100}%`,
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 0 8px #fff',
              opacity: on * on * 0.9,
              mixBlendMode: 'screen',
            }}
          />
        );
      })}
    </>
  );
};

export const GameCard: React.FC<{src: string; width: number; fx?: CardFx; seed?: string}> = ({src, width, fx = {}, seed = 'c'}) => {
  const frame = useCurrentFrame();
  const {flip = 1, tapped = 0, glow = 0, glowColor = theme.colors.gold, burn = 0, dissolve = 0, ghost = false, dim = 0, finish = 'nonfoil', lightAngle = 0} = fx;
  const h = width * CARD_RATIO;
  const angle = (1 - flip) * 180; // 180 = verso
  const showFront = angle < 90;
  const radius = width * 0.047;
  const burnLine = (1 - burn) * 100; // % da altura que ainda existe

  return (
    <div
      style={{
        position: 'relative',
        width,
        height: h,
        transform: `rotate(${tapped * 90}deg) scale(${1 - tapped * 0.18})`,
        opacity: 1 - dissolve,
        filter: dissolve > 0 ? `blur(${dissolve * 10}px) brightness(${1 + dissolve * 2})` : undefined,
      }}
    >
      <div style={{position: 'absolute', inset: 0, perspective: 1400}}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `rotateY(${angle}deg)`,
            transformStyle: 'preserve-3d',
          }}
        >
          {showFront ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: radius,
                overflow: 'hidden',
                boxShadow: glow
                  ? `0 0 0 ${3 + glow * 3}px ${glowColor}, 0 0 ${30 + glow * 60}px ${glowColor}, 0 30px 70px rgba(0,0,0,0.75)`
                  : '0 30px 70px rgba(0,0,0,0.75)',
                opacity: ghost ? 0.55 : 1,
                filter: `${ghost ? 'sepia(1) hue-rotate(150deg) saturate(2.5) brightness(1.2)' : ''} brightness(${1 - dim * 0.6}) grayscale(${dim * 0.6})`,
                clipPath: burn > 0 ? `inset(0 0 ${100 - burnLine}% 0)` : undefined,
              }}
            >
              <Img src={resolveSrc(src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
              {finish !== 'nonfoil' && !ghost ? <FoilLayer finish={finish} light={lightAngle} seed={seed} /> : null}
            </div>
          ) : (
            <div style={{position: 'absolute', inset: 0, transform: 'rotateY(180deg)', borderRadius: radius, overflow: 'hidden', boxShadow: '0 30px 70px rgba(0,0,0,0.75)'}}>
              <CardBack width={width} />
            </div>
          )}
        </div>
      </div>
      {/* borda de brasa da queima + fagulhas subindo */}
      {burn > 0 && burn < 1 ? (
        <>
          <div
            style={{
              position: 'absolute',
              left: -6,
              right: -6,
              top: `${burnLine}%`,
              height: 16,
              transform: 'translateY(-50%)',
              background: `linear-gradient(180deg, transparent, ${theme.colors.ember}, #FFD27A, ${theme.colors.ember}, transparent)`,
              filter: 'blur(3px)',
              boxShadow: `0 0 40px ${theme.colors.ember}`,
            }}
          />
          {Array.from({length: 14}).map((_, i) => {
            const t = (frame * (1.4 + random(`${seed}e${i}`)) + i * 9) % 60;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${random(`${seed}ex${i}`) * 100}%`,
                  top: `calc(${burnLine}% - ${t * 4}px)`,
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: '#FFC56B',
                  opacity: 1 - t / 60,
                  boxShadow: `0 0 10px ${theme.colors.ember}`,
                }}
              />
            );
          })}
        </>
      ) : null}
    </div>
  );
};
