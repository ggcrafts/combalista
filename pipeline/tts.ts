// ============================================================
//  NARRAÇÃO — três provedores, escolhidos por TTS_PROVIDER no .env
//    elevenlabs → voz neural, timestamps por caractere (pago)
//    windows    → voz instalada no Windows (ex.: Microsoft Maria), grátis e offline
//    mudo       → sem áudio; legenda com ritmo de fala estimado (para gravar a voz por cima)
// ============================================================
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {config} from './config';
import {fetchJson} from './http';
import type {Word} from '../src/types';

export type TtsResult = {
  words: Word[];
  duration: number;
  /** arquivo gerado, ou null no modo mudo */
  file: string | null;
  /** segundos de silêncio cortados do começo do áudio (o player pula esse trecho) */
  trimStart?: number;
};

export function ttsLabel(): string {
  return {cartesia: voicePresets()[config.voicePreset] ? `Cartesia (${config.voicePreset})` : 'Cartesia', elevenlabs: 'ElevenLabs', windows: `Windows (${config.windowsVoice.replace(/^Microsoft | Desktop$/g, '')})`, mudo: 'sem voz'}[
    config.ttsProvider
  ];
}

// ------------------------------------------------------------------
// Pronúncia: a voz fala "lendi", a legenda mostra "land" (data/pronuncia.json)
// ------------------------------------------------------------------
let pronCache: Array<{re: RegExp; to: string}> | null = null;

function pronunciations() {
  if (pronCache) return pronCache;
  let raw: Record<string, string> = {};
  try {
    raw = JSON.parse(fsSync.readFileSync(path.join(config.paths.data, 'pronuncia.json'), 'utf8'));
  } catch {
    /* sem dicionário */
  }
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  pronCache = Object.entries(raw)
    .filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && words(k) === words(v)) // mesmo nº de palavras: a legenda casa palavra a palavra
    .sort((a, b) => b[0].length - a[0].length) // termos compostos primeiro ("board wipe" antes de "wipe")
    .map(([k, v]) => ({re: new RegExp(`(?<![\\p{L}\\p{N}'])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}'])`, 'giu'), to: v}));
  return pronCache;
}

export const speakable = (text: string) => pronunciations().reduce((t, p) => t.replace(p.re, p.to), text);

/** Troca o texto falado pelo texto original, palavra a palavra (mesma contagem garantida pelo dicionário) */
function restoreDisplay(words: Word[], display: string): Word[] {
  const tokens = display.split(/\s+/).filter(Boolean);
  return tokens.length === words.length ? words.map((w, i) => ({...w, text: tokens[i]})) : words;
}

/**
 * Gera a narração de um trecho.
 * @param outBase caminho sem extensão; cada provedor acrescenta a sua (.mp3 / .wav)
 */
export async function synthesize(text: string, outBase: string, context: {previous?: string; next?: string} = {}): Promise<TtsResult> {
  const spoken = speakable(text);
  let r: TtsResult;
  if (config.ttsProvider === 'cartesia') r = await cartesia(spoken, outBase + '.wav');
  else if (config.ttsProvider === 'elevenlabs') r = await elevenlabs(spoken, outBase + '.mp3', {previous: context.previous && speakable(context.previous), next: context.next && speakable(context.next)});
  else if (config.ttsProvider === 'windows') r = await windows(spoken, outBase + '.wav');
  else r = silent(text);
  return {...r, words: restoreDisplay(r.words, text)};
}

// ------------------------------------------------------------------
// ElevenLabs
// ------------------------------------------------------------------
type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

type TtsResponse = {
  audio_base64: string;
  alignment: Alignment | null;
  normalized_alignment?: Alignment | null;
};

/** Agrupa caracteres em palavras usando os espaços como separador */
export function wordsFromAlignment(a: Alignment): Word[] {
  const words: Word[] = [];
  let text = '';
  let start = 0;
  let end = 0;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (text) words.push({text, start, end});
      text = '';
      return;
    }
    if (!text) start = a.character_start_times_seconds[i];
    text += ch;
    end = a.character_end_times_seconds[i];
  });
  if (text) words.push({text, start, end});
  return words;
}

async function elevenlabs(text: string, outFile: string, context: {previous?: string; next?: string}): Promise<TtsResult> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenVoice}/with-timestamps?output_format=mp3_44100_128`;
  const res = await fetchJson<TtsResponse>(url, {
    method: 'POST',
    headers: {'xi-api-key': config.elevenKey, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      text,
      model_id: config.elevenModel,
      previous_text: context.previous || undefined,
      next_text: context.next || undefined,
      // speed: voz um pouco acelerada, como nos vídeos virais (máx. 1.2)
      voice_settings: {stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: Math.min(1.2, config.voiceSpeed)},
    }),
  });

  await fs.writeFile(outFile, Buffer.from(res.audio_base64, 'base64'));
  const align = res.alignment ?? res.normalized_alignment;
  if (!align) throw new Error('ElevenLabs não retornou alinhamento');
  const words = wordsFromAlignment(align);
  const duration = align.character_end_times_seconds[align.character_end_times_seconds.length - 1] ?? 0;
  return {words, duration, file: outFile};
}

// ------------------------------------------------------------------
// Cartesia — streaming (SSE) com tempo de cada palavra
// ------------------------------------------------------------------
const CARTESIA_RATE = 44100;

export type VoicePreset = {provedor: string; voz: string; velocidade?: number; volume?: number; emocao?: string};

/** Vozes prontas (data/vozes.json) */
export function voicePresets(): Record<string, VoicePreset> {
  try {
    const raw = JSON.parse(fsSync.readFileSync(path.join(config.paths.data, 'vozes.json'), 'utf8')) as Record<string, VoicePreset>;
    return Object.fromEntries(Object.entries(raw).filter(([k, v]) => !k.startsWith('_') && v && v.voz));
  } catch {
    return {};
  }
}

/** Voz, velocidade, volume e emoção da Cartesia nesta execução */
function cartesiaVoice() {
  const p = voicePresets()[config.voicePreset];
  return {
    id: p?.voz ?? config.cartesiaVoice,
    speed: Math.min(1.5, Math.max(0.6, p?.velocidade ?? config.voiceSpeed)),
    volume: p?.volume,
    emotion: p?.emocao,
  };
}

function pcmToWav(pcm: Buffer, rate: number): Buffer {
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

async function cartesia(text: string, outFile: string): Promise<TtsResult> {
  const voice = cartesiaVoice();
  let res: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch('https://api.cartesia.ai/tts/sse', {
      method: 'POST',
      headers: {'Cartesia-Version': '2026-08-14', Authorization: `Bearer ${config.cartesiaKey}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        model_id: config.cartesiaModel,
        transcript: text,
        voice: {id: voice.id},
        output_format: {container: 'raw', encoding: 'pcm_s16le', sample_rate: CARTESIA_RATE},
        language: 'pt',
        add_timestamps: true,
        // voz acelerada como nos vídeos virais (Cartesia aceita 0.6 a 1.5)
        generation_config: {speed: voice.speed, ...(voice.volume ? {volume: voice.volume} : {}), ...(voice.emotion ? {emotion: voice.emotion} : {})},
      }),
    });
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  if (!res || !res.ok) throw new Error(`Cartesia HTTP ${res?.status}: ${(await res?.text().catch(() => ''))?.slice(0, 300)}`);

  // eventos "data: {json}" separados por linha em branco
  const body = await res.text();
  const chunks: Buffer[] = [];
  const words: Word[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const ev = JSON.parse(line.slice(5).trim()) as {
      type: string;
      data?: string;
      message?: string;
      word_timestamps?: {words: string[]; start: number[]; end: number[]};
    };
    if (ev.type === 'chunk' && ev.data) chunks.push(Buffer.from(ev.data, 'base64'));
    if (ev.type === 'timestamps' && ev.word_timestamps) {
      const w = ev.word_timestamps;
      w.words.forEach((t, i) => words.push({text: t, start: w.start[i], end: Math.max(w.end[i], w.start[i] + 0.05)}));
    }
    if (ev.type === 'error') throw new Error(`Cartesia: ${ev.message}`);
  }
  const pcm = Buffer.concat(chunks);
  if (!pcm.length) throw new Error('Cartesia não devolveu áudio');
  await fs.writeFile(outFile, pcmToWav(pcm, CARTESIA_RATE));

  // sem respiro: corta silêncio do começo e do fim
  const samples = new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + (pcm.length & ~1)));
  const start = Math.max(0, speechStart(CARTESIA_RATE, samples) - 0.02);
  const end = Math.min(samples.length / CARTESIA_RATE, speechEnd(CARTESIA_RATE, samples) + 0.05);
  return {
    words: words.map((w) => ({...w, start: Math.max(0, w.start - start), end: Math.max(0.05, w.end - start)})),
    duration: end - start,
    file: outFile,
    trimStart: start,
  };
}

// ------------------------------------------------------------------
// Windows (System.Speech) — scripts/tts-windows.ps1
// ------------------------------------------------------------------
const run = promisify(execFile);

/** Lê um WAV PCM 16 bits: taxa e amostras (procura os chunks, o cabeçalho do SAPI não tem 44 bytes fixos) */
function readWav(buf: Buffer): {rate: number; samples: Int16Array} {
  let o = 12;
  let rate = 0;
  while (o + 8 <= buf.length) {
    const id = buf.toString('ascii', o, o + 4);
    const len = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') rate = buf.readUInt32LE(o + 12);
    if (id === 'data') {
      const data = buf.subarray(o + 8, Math.min(buf.length, o + 8 + len));
      return {rate, samples: new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + (data.length & ~1)))};
    }
    o += 8 + len + (len % 2);
  }
  throw new Error('WAV sem chunk de dados');
}

/** Fim da fala: última janela de 20 ms com som acima do limiar (corta o silêncio que o SAPI deixa no fim) */
/** Começo da fala: primeira janela de 20 ms com som (corta o respiro que o SAPI deixa no início) */
function speechStart(rate: number, samples: Int16Array): number {
  const win = Math.round(rate * 0.02);
  for (let i = 0; i * win < samples.length; i++) {
    let e = 0;
    for (let j = i * win; j < Math.min(samples.length, (i + 1) * win); j++) e += samples[j] * samples[j];
    if (Math.sqrt(e / win) > 300) return (i * win) / rate;
  }
  return 0;
}

function speechEnd(rate: number, samples: Int16Array): number {
  const win = Math.round(rate * 0.02);
  for (let i = Math.floor(samples.length / win) - 1; i >= 0; i--) {
    let e = 0;
    for (let j = i * win; j < (i + 1) * win; j++) e += samples[j] * samples[j];
    if (Math.sqrt(e / win) > 300) return (i + 1) * win / rate;
  }
  return samples.length / rate;
}

/** Casa os eventos do SAPI (posição do caractere → tempo) com as palavras do texto original */
function alignWords(text: string, events: Array<{start: number; pos: number}>, end: number): Word[] {
  const tokens = [...text.matchAll(/\S+/g)].map((m) => ({text: m[0], index: m.index!}));
  const starts: Array<number | undefined> = tokens.map(
    (t) => events.find((e) => e.pos >= t.index && e.pos < t.index + t.text.length)?.start,
  );
  // palavras sem evento (raro: pontuação solta, números) recebem tempo interpolado
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] !== undefined) continue;
    const prev = i > 0 ? starts[i - 1]! : 0;
    let j = i + 1;
    while (j < starts.length && starts[j] === undefined) j++;
    const next = j < starts.length ? starts[j]! : end;
    starts[i] = prev + (next - prev) / (j - i + 1);
  }
  return tokens.map((t, i) => {
    const start = starts[i]!;
    const next = i + 1 < tokens.length ? starts[i + 1]! : end;
    return {text: t.text, start, end: Math.max(start + 0.05, Math.min(next, start + 0.9))};
  });
}

async function windows(text: string, outFile: string): Promise<TtsResult> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mtg-tts-'));
  try {
    const textFile = path.join(tmp, 'texto.txt');
    const jsonFile = path.join(tmp, 'palavras.json');
    await fs.writeFile(textFile, text, 'utf8');
    await run(
      'powershell.exe',
      [
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', path.join(config.paths.root, 'scripts', 'tts-windows.ps1'),
        '-TextFile', textFile, '-Out', outFile, '-JsonOut', jsonFile,
        '-Voice', config.windowsVoice, '-Rate', String(config.windowsRate),
      ],
      {windowsHide: true},
    );
    const {words: events} = JSON.parse((await fs.readFile(jsonFile, 'utf8')).replace(/^﻿/, '')) as {
      words: Array<{start: number; pos: number}>;
    };
    const {rate, samples} = readWav(await fs.readFile(outFile));
    // sem respiro: corta o silêncio do começo e do fim
    const start = Math.max(0, speechStart(rate, samples) - 0.02);
    const end = Math.min(samples.length / rate, speechEnd(rate, samples) + 0.05);
    const words = alignWords(text, events, end).map((w) => ({...w, start: Math.max(0, w.start - start), end: Math.max(0.05, w.end - start)}));
    return {words, duration: end - start, file: outFile, trimStart: start};
  } finally {
    await fs.rm(tmp, {recursive: true, force: true});
  }
}

// ------------------------------------------------------------------
// Mudo — ritmo de fala estimado
// ------------------------------------------------------------------
function silent(text: string): TtsResult {
  const words: Word[] = [];
  let t = 0;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const len = 0.12 + 0.055 * w.length; // ~2,7 palavras/s em média
    words.push({text: w, start: t, end: t + len});
    t += len + (/[.!?]$/.test(w) ? 0.35 : /[,;:]$/.test(w) ? 0.18 : 0.04);
  }
  return {words, duration: t, file: null};
}
