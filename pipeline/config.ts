import 'dotenv/config';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
  /** modelo quando o roteiro sai do Claude Code (sem API): alias do plano, ex.: sonnet, opus */
  claudeCodeModel: process.env.CLAUDE_CODE_MODEL || 'sonnet',

  /** cartesia | elevenlabs | windows | mudo — sem definir: Cartesia se houver chave, senão Windows */
  ttsProvider: ((): 'cartesia' | 'elevenlabs' | 'windows' | 'mudo' => {
    const v = (process.env.TTS_PROVIDER ?? '').toLowerCase();
    if (v === 'cartesia' || v === 'elevenlabs' || v === 'windows' || v === 'mudo') return v;
    return process.env.CARTESIA_API_KEY ? 'cartesia' : 'windows';
  })(),
  cartesiaKey: process.env.CARTESIA_API_KEY ?? '',
  cartesiaVoice: process.env.CARTESIA_VOICE_ID ?? '',
  cartesiaModel: process.env.CARTESIA_MODEL || 'sonic-3.6',
  /** voz pronta de data/vozes.json (ex.: Garota); vazio = CARTESIA_VOICE_ID + TTS_VELOCIDADE */
  voicePreset: process.env.TTS_VOZ ?? 'Garota',
  windowsVoice: process.env.TTS_WINDOWS_VOICE || 'Microsoft Maria Desktop',
  /** -10 (lento) a 10 (rápido) */
  windowsRate: num(process.env.TTS_WINDOWS_RATE, 3),
  /** velocidade da ElevenLabs (0.7 a 1.2): vídeos virais costumam ter a voz levemente acelerada */
  voiceSpeed: Math.min(1.5, Math.max(0.7, num(process.env.TTS_VELOCIDADE, 1.25))),

  elevenKey: process.env.ELEVENLABS_API_KEY ?? '',
  elevenVoice: process.env.ELEVENLABS_VOICE_ID ?? '',
  elevenModel: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',

  handle: process.env.HANDLE || '@seucanal',
  /** nome do canal (aparece com o logo) */
  channelName: process.env.CANAL_NOME || 'CombaLista',

  videosPerRun: num(process.env.VIDEOS_PER_RUN, 3),
  csbQuery: process.env.CSB_QUERY || 'legal:commander',
  maxCards: num(process.env.MAX_CARDS, 3),
  maxTotalBRL: num(process.env.MAX_TOTAL_BRL, 150),
  /** teto de preço para as pautas que não são "barato" (evita combos de R$ 2.000) */
  maxTotalAnyBRL: num(process.env.PRECO_TETO_BRL, 600),
  /** pautas misturadas em cada pesquisa: novidade, inusitado, joia, barato */
  angleMix: (process.env.PAUTAS ?? 'novidade,inusitado,joia')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is 'novidade' | 'inusitado' | 'joia' | 'barato' => ['novidade', 'inusitado', 'joia', 'barato'].includes(s)),
  /** "novidade" = carta que estreou nos últimos N meses */
  newMonths: num(process.env.NOVIDADE_MESES, 6),
  /** "joia escondida" = carta abaixo desta posição no ranking do EDHREC */
  gemRank: num(process.env.JOIA_RANK_EDHREC, 4000),
  onlySelfContained: (process.env.ONLY_SELF_CONTAINED ?? '1') === '1',

  fxFallback: num(process.env.FX_USD_BRL_FALLBACK, 5.5),
  priceMultiplier: num(process.env.PRICE_MULTIPLIER, 1),

  paths: {
    root: ROOT,
    publicJobs: path.join(ROOT, 'public', 'jobs'),
    output: path.join(ROOT, 'output'),
    data: path.join(ROOT, 'data'),
    history: path.join(ROOT, 'data', 'history.json'),
    priceOverrides: path.join(ROOT, 'data', 'price-overrides.json'),
    logs: path.join(ROOT, 'logs'),
    /** logo e ícone do canal (PNG); padrao/ guarda os originais */
    brand: path.join(ROOT, 'public', 'brand'),
    queue: path.join(ROOT, 'fila'),
  },
};

export const requireKeys = (keys: Array<'anthropic' | 'eleven'>) => {
  const missing: string[] = [];
  if (keys.includes('anthropic') && !config.anthropicKey) missing.push('ANTHROPIC_API_KEY');
  // a chave da ElevenLabs só é exigida quando ela é o provedor de voz escolhido
  if (keys.includes('eleven') && config.ttsProvider === 'cartesia' && (!config.cartesiaKey || !config.cartesiaVoice))
    missing.push('CARTESIA_API_KEY / CARTESIA_VOICE_ID (ou use TTS_PROVIDER=windows)');
  if (keys.includes('eleven') && config.ttsProvider === 'elevenlabs' && (!config.elevenKey || !config.elevenVoice))
    missing.push('ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID (ou use TTS_PROVIDER=windows)');
  if (missing.length) {
    throw new Error(`Faltando no .env: ${missing.join(', ')}`);
  }
};

/** Data local AAAA-MM-DD (toISOString usa UTC: depois das 21h no Brasil já seria o dia seguinte) */
export const today = () => new Date().toLocaleDateString('sv-SE');
