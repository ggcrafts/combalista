// ============================================================
//  EFEITOS SONOROS — gerados por código (sem licença de terceiros)
//    npm run sfx   → grava public/sfx/padrao/*.wav
//
//  Para usar seus próprios memes (vine boom, oof...), coloque o arquivo em
//  public/sfx/meus/<nome>.mp3 (ou .wav) com o MESMO nome: ele tem prioridade.
// ============================================================
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'sfx', 'padrao');
const RATE = 44100;

// ---------- utilidades de síntese ----------
const len = (s: number) => Math.round(s * RATE);
const buf = (s: number) => new Float32Array(len(s));
let seed = 1;
const noise = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed / 2147483647) * 2 - 1;
};
/** envelope ataque/decaimento exponencial */
const env = (t: number, attack: number, decay: number) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));
/** seno com frequência variando (fase acumulada) */
function sweep(out: Float32Array, f0: number, f1: number, amp: number, attack: number, decay: number, offset = 0, curve = 1) {
  let phase = 0;
  const n = out.length - len(offset);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const p = Math.pow(i / n, curve);
    phase += (2 * Math.PI * (f0 + (f1 - f0) * p)) / RATE;
    out[i + len(offset)] += Math.sin(phase) * amp * env(t, attack, decay);
  }
}
/** ruído filtrado (passa-baixa de um polo) com corte variando */
function noiseBurst(out: Float32Array, cut0: number, cut1: number, amp: number, attack: number, decay: number, offset = 0) {
  let y = 0;
  const n = out.length - len(offset);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const cut = cut0 + (cut1 - cut0) * (i / n);
    const a = 1 - Math.exp((-2 * Math.PI * cut) / RATE);
    y += a * (noise() - y);
    out[i + len(offset)] += y * amp * env(t, attack, decay);
  }
}
const normalize = (out: Float32Array, peak = 0.9) => {
  let m = 0;
  for (const v of out) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / m) * peak;
  return out;
};
const soft = (out: Float32Array, drive = 2) => {
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * drive);
  return out;
};

function writeWav(file: string, data: Float32Array) {
  const b = Buffer.alloc(44 + data.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + data.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(data.length * 2, 40);
  data.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  fs.writeFileSync(file, b);
}

// ---------- os sons ----------
const SOUNDS: Record<string, () => Float32Array> = {
  /** carta voando */
  whoosh: () => {
    const o = buf(0.45);
    noiseBurst(o, 300, 3500, 1, 0.22, 0.09);
    return normalize(o, 0.7);
  },
  /** carta batendo na mesa */
  slam: () => {
    const o = buf(0.6);
    sweep(o, 95, 38, 1, 0.003, 0.16, 0, 0.5);
    noiseBurst(o, 2500, 400, 0.6, 0.001, 0.03);
    return normalize(soft(o, 1.8), 0.95);
  },
  /** ficha surgindo */
  pop: () => {
    const o = buf(0.12);
    sweep(o, 500, 1300, 1, 0.002, 0.035);
    return normalize(o, 0.6);
  },
  /** soco de desenho animado */
  punch: () => {
    const o = buf(0.35);
    sweep(o, 140, 45, 1, 0.002, 0.08, 0, 0.4);
    noiseBurst(o, 1800, 300, 0.9, 0.001, 0.025);
    return normalize(soft(o, 3), 0.95);
  },
  /** virar carta (estalo seco) */
  tap: () => {
    const o = buf(0.08);
    sweep(o, 950, 700, 0.8, 0.001, 0.012);
    noiseBurst(o, 5000, 3000, 0.5, 0.001, 0.008);
    return normalize(o, 0.5);
  },
  /** brilho (mana, revelação) */
  shimmer: () => {
    const o = buf(1.0);
    [2093, 2637, 3136, 4186, 5274].forEach((f, i) => sweep(o, f, f, 0.5, 0.005, 0.25, i * 0.05));
    return normalize(o, 0.45);
  },
  /** "boom" grave de impacto (estilo vine boom, feito do zero) */
  boom: () => {
    const o = buf(1.3);
    sweep(o, 72, 42, 1, 0.004, 0.42, 0, 0.6);
    sweep(o, 144, 84, 0.35, 0.004, 0.2, 0, 0.6);
    noiseBurst(o, 900, 120, 0.4, 0.002, 0.06);
    return normalize(soft(o, 2.4), 0.95);
  },
  /** algo entra na pilha (ficha de cassino) */
  stack: () => {
    const o = buf(0.18);
    sweep(o, 2400, 2300, 0.7, 0.001, 0.02);
    sweep(o, 3100, 3000, 0.5, 0.001, 0.02, 0.045);
    noiseBurst(o, 6000, 4000, 0.3, 0.001, 0.01);
    return normalize(o, 0.5);
  },
  /** algo resolve (sininho) */
  resolve: () => {
    const o = buf(0.7);
    sweep(o, 1318, 1318, 0.7, 0.002, 0.18);
    sweep(o, 2637, 2637, 0.3, 0.002, 0.1);
    return normalize(o, 0.5);
  },
  /** carta queimando */
  burn: () => {
    const o = buf(0.9);
    noiseBurst(o, 900, 400, 0.5, 0.05, 0.35);
    for (let k = 0; k < 22; k++) noiseBurst(o, 4000, 2000, 0.9, 0.001, 0.004, Math.abs(noise()) * 0.8);
    return normalize(o, 0.55);
  },
  /** apito de desenho subindo (entrada da carta "toasty") */
  toasty: () => {
    const o = buf(0.5);
    sweep(o, 420, 1650, 1, 0.02, 0.35, 0, 1.6);
    return normalize(o, 0.55);
  },
  /** caixa registradora: tecla + gaveta + "ching" */
  kaching: () => {
    const o = buf(1.2);
    noiseBurst(o, 3000, 1500, 0.6, 0.001, 0.015);
    sweep(o, 1800, 1700, 0.4, 0.001, 0.02, 0.02);
    sweep(o, 110, 70, 0.6, 0.002, 0.06, 0.12);
    [2960, 3950, 5930, 7900].forEach((f, i) => sweep(o, f, f, 0.6 / (i + 1), 0.002, 0.35, 0.16));
    return normalize(o, 0.75);
  },
};

/** Vozes cômicas com a voz do Windows (SSML: agudo e rápido) */
const VOICES: Record<string, string> = {
  ai: '<prosody pitch="+90%" rate="+30%">Aiii!</prosody>',
  ui: '<prosody pitch="+70%" rate="+20%">Uííí!</prosody>',
  uou: '<prosody pitch="-20%" rate="-20%">Uóóóu.</prosody>',
};

function speakSsml(name: string, inner: string) {
  const file = path.join(OUT, `${name}.wav`);
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR">${inner}</speak>`;
  const ps = path.join(os.tmpdir(), `sfx-${name}.ps1`);
  fs.writeFileSync(
    ps,
    `Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice("${process.env.TTS_WINDOWS_VOICE || 'Microsoft Maria Desktop'}")
$s.SetOutputToWaveFile("${file}")
$s.SpeakSsml('${ssml.replace(/'/g, "''")}')
$s.Dispose()`,
    'utf8',
  );
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps], {stdio: 'ignore', windowsHide: true});
    console.log(`✓ ${name}.wav (voz)`);
  } catch {
    console.log(`! ${name}.wav não gerado (voz do Windows indisponível)`);
  } finally {
    fs.rmSync(ps, {force: true});
  }
}

fs.mkdirSync(OUT, {recursive: true});
fs.mkdirSync(path.join(ROOT, 'public', 'sfx', 'meus'), {recursive: true});
for (const [name, make] of Object.entries(SOUNDS)) {
  writeWav(path.join(OUT, `${name}.wav`), make());
  console.log(`✓ ${name}.wav`);
}
if (process.platform === 'win32') for (const [name, ssml] of Object.entries(VOICES)) speakSsml(name, ssml);
console.log(`\nPronto: ${OUT}\nPara trocar algum por um meme seu, ponha public/sfx/meus/<nome>.mp3`);
