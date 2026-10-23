import type {Segment, Word} from './types';
import {VIDEO} from './theme';

export type TimedSegment = Segment & {
  fromFrame: number;
  durationInFrames: number;
  startSec: number;
};

export const buildTimeline = (segments: Segment[], fps = VIDEO.fps): TimedSegment[] => {
  let cursor = 0;
  return segments.map((s) => {
    const fromFrame = Math.round(cursor * fps);
    const durationInFrames = Math.max(1, Math.round(s.durationInSeconds * fps));
    const out = {...s, fromFrame, durationInFrames, startSec: cursor};
    cursor += s.durationInSeconds;
    return out;
  });
};

export const totalDurationInFrames = (segments: Segment[], fps = VIDEO.fps): number => {
  const total = segments.reduce((acc, s) => acc + s.durationInSeconds, 0);
  return Math.max(fps, Math.ceil((total + VIDEO.tail) * fps));
};

export type GlobalWord = Word & {segmentIndex: number};

/** Palavras com tempo absoluto no vídeo */
export const globalWords = (timeline: TimedSegment[]): GlobalWord[] =>
  timeline.flatMap((seg, i) =>
    seg.words.map((w) => ({
      text: w.text,
      start: seg.startSec + w.start,
      end: seg.startSec + w.end,
      segmentIndex: i,
    })),
  );

/** Agrupa palavras em blocos curtos de legenda (até N palavras, quebra em pontuação) */
export const chunkWords = (words: GlobalWord[], maxWords = 4): GlobalWord[][] => {
  const chunks: GlobalWord[][] = [];
  let current: GlobalWord[] = [];
  for (const w of words) {
    const lastSeg = current[current.length - 1]?.segmentIndex;
    if (current.length > 0 && lastSeg !== w.segmentIndex) {
      chunks.push(current);
      current = [];
    }
    current.push(w);
    const endsPhrase = /[.!?,;:]$/.test(w.text);
    if (current.length >= maxWords || endsPhrase) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
};
