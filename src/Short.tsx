// ============================================================
//  COMPOSIÇÃO — abertura → tabuleiro contínuo (beats) → clímax → deck → preço → CTA
//  Fundo, legenda, efeitos sonoros e assinatura são contínuos; o fundo ganha cor quando o combo "liga".
// ============================================================
import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {BoardScene} from './Board';
import {boardTimeline} from './boardState';
import {GameCard} from './card';
import {AnimeImpact, Backdrop, LightStreak, PostFX} from './fx';
import {heroCard, SCENES} from './scenes';
import {sfxFor} from './sfx';
import {goldGlow, paletteFor, theme} from './theme';
import {buildTimeline, chunkWords, globalWords} from './timeline';
import type {Segment, VideoProps} from './types';

/** Sons padrão (gerados por `npm run sfx`) para o preview do Studio */
const DEFAULT_SFX = Object.fromEntries(
  ['whoosh', 'slam', 'pop', 'punch', 'tap', 'shimmer', 'boom', 'stack', 'resolve', 'burn', 'toasty', 'kaching', 'ai', 'ui', 'uou'].map((n) => [n, `sfx/padrao/${n}.wav`]),
);

export const Short: React.FC<VideoProps> = (props) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const timeline = useMemo(() => buildTimeline(props.segments, fps), [props.segments, fps]);
  const names = props.cards.map((c) => c.name);
  const states = useMemo(() => boardTimeline(props.segments, names), [props.segments, names.join('|')]);
  const beats = timeline.map((s, i) => ({s, i})).filter(({s}) => s.kind === 'beat');
  const hero = heroCard(props);
  const sfx = props.sfx ?? DEFAULT_SFX;

  // cor do fundo: quase cinza na abertura, ganha cor ao longo da jogada, satura no clímax
  const firstBeat = beats[0]?.s.fromFrame ?? 0;
  const payoff = timeline.find((s) => s.kind === 'payoff');
  const payoffFrame = payoff?.fromFrame ?? firstBeat + 1;
  const saturation = interpolate(frame, [0, firstBeat, payoffFrame, payoffFrame + 10], [0.15, 0.35, 1, 1.35], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // momentos dramáticos (estilo anime): falas marcadas com "drama" + o clímax
  const dramaStarts = timeline.filter((s) => s.drama || s.kind === 'payoff').map((s) => s.fromFrame);
  const dramaT = dramaStarts.map((s) => frame - s).find((t) => t >= 0 && t <= 18) ?? -1;
  // soco de zoom na imagem inteira no começo do momento dramático (sem quique: entra e assenta)
  const punch = dramaT >= 0 ? 1 + 0.06 * Math.exp(-dramaT / 4) : 1;

  // rasgo de luz na virada abertura → mesa (no clímax entra a transição de anime)
  const cuts = [firstBeat].filter((f) => f > 0);
  const streak = cuts.map((c) => (frame - (c - 6)) / 12).find((t) => t > 0 && t < 1) ?? 0;

  const palette = useMemo(() => paletteFor(hero.colors, props.colorIdentity), [hero.colors, props.colorIdentity]);

  return (
    <AbsoluteFill style={{backgroundColor: theme.colors.bg, ...(palette as React.CSSProperties)}}>
      <Backdrop art={hero.artCrop ?? hero.image} saturation={saturation} />
      {/* tudo que é imagem passa pela correção de cor (pós-processamento) */}
      <AbsoluteFill
        style={{
          transform: `scale(${punch})`,
          // impact frame (2 frames): preto e branco invertido, bem contrastado, como no anime
          filter: dramaT >= 0 && dramaT < 2.5 ? 'grayscale(1) invert(1) contrast(2.2) brightness(1.1)' : 'contrast(1.06) saturate(1.08)',
        }}
      >
        {timeline.map((seg, i) => {
          const isLast = i === timeline.length - 1;
          const content =
            seg.kind === 'beat' ? (
              <BoardScene
                segment={seg}
                segments={props.segments}
                segmentIndex={i}
                before={states[i].before}
                after={states[i].after}
                video={props}
                beatIndex={beats.findIndex((b) => b.i === i)}
                beatCount={beats.length}
              />
            ) : (
              React.createElement(SCENES[seg.kind as keyof typeof SCENES], {segment: seg, video: props})
            );
          return (
            <Sequence key={i} from={seg.fromFrame} durationInFrames={isLast ? Infinity : seg.durationInFrames}>
              {content}
              {seg.audioSrc ? <Audio src={staticFile(seg.audioSrc)} startFrom={Math.round((seg.audioStartFrom ?? 0) * fps)} /> : null}
              {seg.cameo?.image ? <Toasty cameo={seg.cameo as Required<NonNullable<Segment['cameo']>>} /> : null}
            </Sequence>
          );
        })}

      </AbsoluteFill>

      {/* efeitos sonoros: cada um numa sequência própria, a partir do vídeo inteiro,
          para tocar até o fim mesmo quando a fala/cena já acabou */}
      {timeline.flatMap((seg, i) =>
        sfxFor(seg, seg.durationInFrames, fps).map((e, k) =>
          sfx[e.name] ? (
            <Sequence key={`sfx-${i}-${k}`} from={seg.fromFrame + e.at} layout="none">
              <Audio src={staticFile(sfx[e.name])} volume={e.volume} />
            </Sequence>
          ) : null,
        ),
      )}

      {/* whoosh nas viradas de ato */}
      {sfx.whoosh
        ? cuts.map((c, k) => (
            <Sequence key={`cut-${k}`} from={Math.max(0, c - 6)} layout="none">
              <Audio src={staticFile(sfx.whoosh)} volume={0.18} />
            </Sequence>
          ))
        : null}

      <LightStreak progress={streak} />
      {dramaT >= 0 ? <AnimeImpact t={dramaT} seed={`d${dramaStarts.indexOf(frame - dramaT)}`} /> : null}
      <Captions props={props} />
      <TopBar handle={props.handle} icon={props.brand?.icon ?? 'brand/icone.png'} />
      <PostFX />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------
// "Toasty": a carta citada aparece de surpresa na lateral, comenta e some
// ------------------------------------------------------------------
const Toasty: React.FC<{cameo: {card: string; quip?: string; image: string}}> = ({cameo}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: dur} = useVideoConfig();
  const enter = Math.round(dur * 0.2);
  const hold = Math.max(24, Math.min(40, dur * 0.55));
  const inT = interpolate(frame, [enter, enter + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const outT = interpolate(frame, [enter + hold, enter + hold + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const show = inT * (1 - outT);
  if (show <= 0) return null;
  const w = 330;
  // entra pela esquerda (a direita tem os botões da plataforma), inclinada, mostrando ~60%
  return (
    <AbsoluteFill style={{zIndex: 30, pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: -w * 0.42 - (1 - show) * w, top: 760, transform: `rotate(${18 - show * 4}deg)`}}>
        <GameCard src={cameo.image} width={w} fx={{glow: 0.6}} />
      </div>
      {cameo.quip ? (
        <div
          style={{
            position: 'absolute',
            left: w * 0.62,
            top: 720,
            transform: `scale(${show})`,
            transformOrigin: '0% 100%',
            padding: '14px 24px',
            borderRadius: 18,
            background: '#fff',
            color: '#111',
            fontFamily: theme.fonts.display,
            fontWeight: 900,
            fontSize: 40,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
          }}
        >
          {cameo.quip}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------
// Legenda karaokê: blocos curtos, palavra ativa em dourado
// ------------------------------------------------------------------
const Captions: React.FC<{props: VideoProps}> = ({props}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const timeline = useMemo(() => buildTimeline(props.segments, fps), [props.segments, fps]);
  const chunks = useMemo(() => chunkWords(globalWords(timeline), 3), [timeline]);

  const active = chunks.find((c, i) => {
    const start = c[0].start;
    const nextStart = chunks[i + 1]?.[0].start ?? c[c.length - 1].end + 0.4;
    return t >= start && t < nextStart;
  });
  if (!active) return null;

  const pop = spring({frame: frame - Math.round(active[0].start * fps), fps, config: theme.spring.snappy});

  return (
    <AbsoluteFill style={{pointerEvents: 'none', zIndex: 20}}>
      <div
        style={{
          position: 'absolute',
          top: theme.captionY,
          left: 60,
          right: 60,
          transform: `translateY(-50%) scale(${0.94 + pop * 0.06})`,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '2px 20px',
          fontFamily: theme.fonts.body,
          fontWeight: 900,
          fontSize: 74,
          lineHeight: 1.1,
          textAlign: 'center',
          textTransform: 'uppercase',
        }}
      >
        {active.map((w, i) => {
          const on = t >= w.start;
          const current = t >= w.start && t < w.end;
          return (
            <span
              key={i}
              style={{
                color: current ? theme.colors.goldHot : on ? theme.colors.ink : 'rgba(244,236,220,0.5)',
                textShadow: current ? goldGlow(1) : 'none',
                WebkitTextStroke: '10px rgba(0,0,0,0.92)',
                paintOrder: 'stroke fill',
                transform: current ? 'scale(1.06)' : 'none',
                display: 'inline-block',
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------
// Linha de progresso dourada + assinatura do canal
// ------------------------------------------------------------------
const TopBar: React.FC<{handle: string; icon?: string}> = ({handle, icon}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const p = frame / durationInFrames;
  return (
    <AbsoluteFill style={{pointerEvents: 'none', zIndex: 21}}>
      <div style={{position: 'absolute', top: 0, left: 0, height: 8, width: `${p * 100}%`, background: `linear-gradient(90deg, ${theme.colors.goldDeep}, ${theme.colors.goldHot})`, boxShadow: `0 0 16px ${theme.colors.gold}`}} />
      <div style={{position: 'absolute', top: 74, left: theme.safe.left, display: 'flex', alignItems: 'center', gap: 14}}>
        {icon ? <Img src={staticFile(icon)} style={{width: 64, height: 64, objectFit: 'contain', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.6))'}} /> : null}
        <div style={{fontFamily: theme.fonts.display, fontWeight: 800, fontSize: 28, color: 'rgba(var(--accent-rgb),0.9)'}}>{handle}</div>
      </div>
    </AbsoluteFill>
  );
};
