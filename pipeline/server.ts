// ============================================================
//  PAINEL LOCAL — interface visual da pipeline
//    npm run painel   → http://localhost:5178 (só nesta máquina)
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {spawn, type ChildProcess} from 'node:child_process';
import {config} from './config';
import {list, STAGES, type Stage, type QueueEntry} from './queue';
import {checkScript, validateScript, buildFacts, ScriptSchema, scriptEngine} from './script';
import {slugify} from './build';
import {ttsLabel, voicePresets} from './tts';
import {ANGLES, ANGLE_LABEL} from './research';

const VOICES = ['cartesia', 'windows', 'mudo', 'elevenlabs'] as const;
const elevenReady = () => !!(config.elevenKey && config.elevenVoice && config.elevenKey !== '...');

const PORT = Number(process.env.PAINEL_PORT) || 5178;
const UI = path.join(config.paths.root, 'painel', 'index.html');

// ---------------- execução de comandos da pipeline ----------------
type RunState = {cmd: string; running: boolean; code: number | null; log: string[]; startedAt: number};
let run: RunState | null = null;
let child: ChildProcess | null = null;

const COMMANDS: Record<string, (count: number, item?: string, pauta?: string) => string[]> = {
  pesquisar: (n, _i, pauta) => ['pipeline/run.ts', '--dry-run', '--count', String(n), ...(pauta ? ['--pauta', pauta] : [])],
  produzir: () => ['pipeline/run.ts', '--aprovados'],
  pipeline: (n) => ['pipeline/run.ts', '--count', String(n)],
  // modo rampage: pesquisa + roteiro + aprova + renderiza N vídeos com a voz e a pauta escolhidas
  rampage: (n, _i, pauta) => ['pipeline/run.ts', '--rampage', '--count', String(n), ...(pauta ? ['--pauta', pauta] : [])],
  // um combo da fila 0-roteirizar (item) ou todos
  roteirizar: (_n, item) => ['pipeline/roteiro.ts', 'gerar', ...(item ? [path.basename(item)] : [])],
};

function startRun(cmd: string, count: number, voice?: string, item?: string, pauta?: string) {
  if (pauta && !(ANGLES as readonly string[]).includes(pauta)) throw new Error(`Pauta desconhecida: ${pauta}`);
  if (run?.running) throw new Error(`Já existe uma execução em andamento (${run.cmd}).`);
  if ((cmd === 'pipeline' || cmd === 'roteirizar' || cmd === 'rampage') && !scriptEngine()) {
    throw new Error('Nenhum motor de roteiro: instale o Claude Code (extensão do VS Code) ou defina ANTHROPIC_API_KEY.');
  }
  // "cartesia:Garota" → provedor + voz pronta
  const [provider, preset] = (voice ?? '').split(':');
  if (voice && !(VOICES as readonly string[]).includes(provider)) throw new Error(`Voz desconhecida: ${voice}`);
  if (preset && !voicePresets()[preset]) throw new Error(`Voz pronta desconhecida: ${preset}`);
  if (provider === 'cartesia' && !(config.cartesiaKey && config.cartesiaVoice)) throw new Error('Falta CARTESIA_API_KEY / CARTESIA_VOICE_ID no .env.');
  if (provider === 'elevenlabs' && !elevenReady()) throw new Error('Falta ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID no .env.');
  const tsx = path.join(config.paths.root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  run = {cmd, running: true, code: null, log: [], startedAt: Date.now()};
  const state = run;
  child = spawn(process.execPath, [tsx, ...COMMANDS[cmd](count, item, pauta)], {
    cwd: config.paths.root,
    // a voz escolhida no painel vale só para esta execução
    env: {...process.env, FORCE_COLOR: '0', ...(provider ? {TTS_PROVIDER: provider} : {}), ...(preset ? {TTS_VOZ: preset} : {})},
  });
  const push = (buf: Buffer) => {
    for (const line of buf.toString('utf8').split(/\r?\n/)) if (line.trim()) state.log.push(line);
    if (state.log.length > 2000) state.log.splice(0, state.log.length - 2000);
  };
  child.stdout?.on('data', push);
  child.stderr?.on('data', push);
  child.on('close', (code) => {
    state.running = false;
    state.code = code;
    child = null;
  });
}

// ---------------- fila ----------------
const isStage = (s: string): s is Stage => s in STAGES;
const stageDir = (s: Stage) => path.join(config.paths.queue, STAGES[s]);

async function getEntry(stage: string, name: string): Promise<QueueEntry & {stage: Stage}> {
  if (!isStage(stage)) throw new Error(`Etapa desconhecida: ${stage}`);
  const file = path.join(stageDir(stage), path.basename(name));
  const entry = (await list(stage)).find((e) => path.resolve(e.file) === path.resolve(file));
  if (!entry) throw new Error('Item não encontrado (talvez tenha sido movido).');
  return {...entry, stage};
}

/** Pasta de saída do vídeo: gravada no item ao produzir, ou procurada pelo slug */
async function findOutDir(e: QueueEntry): Promise<string | null> {
  const candidates: string[] = [];
  if (e.outDir) candidates.push(e.outDir);
  const slug = slugify(e.combo.cardNames.join(' '));
  const days = await fsp.readdir(config.paths.output).catch(() => [] as string[]);
  for (const d of days.sort().reverse()) candidates.push(path.join(config.paths.output, d, slug));
  for (const c of candidates) if (fs.existsSync(path.join(c, 'video_9x16.mp4'))) return c;
  return null;
}

async function summarize(e: QueueEntry, stage: Stage) {
  const outDir = stage === 'done' ? await findOutDir(e) : null;
  const rel = (p: string) => path.relative(config.paths.root, p).split(path.sep).join('/');
  return {
    name: path.basename(e.file),
    stage,
    combo: e.combo,
    facts: buildFacts(e.combo),
    script: e.script ?? null,
    problems: e.script && (e.script as {v?: number}).v === 2 ? validateScript(e.script, e.combo) : [],
    video: outDir ? `/media/${rel(path.join(outDir, 'video_9x16.mp4'))}` : null,
    cover: outDir && fs.existsSync(path.join(outDir, 'capa.jpg')) ? `/media/${rel(path.join(outDir, 'capa.jpg'))}` : null,
    outDir: outDir ? rel(outDir) : null,
  };
}

async function queueSnapshot() {
  const out: Record<string, unknown[]> = {};
  for (const s of Object.keys(STAGES) as Stage[]) {
    out[s] = await Promise.all((await list(s)).map((e) => summarize(e, s)));
  }
  return out;
}

async function moveItem(stage: string, name: string, to: string) {
  const e = await getEntry(stage, name);
  if (!isStage(to)) throw new Error(`Etapa desconhecida: ${to}`);
  if (to !== 'brief' && to !== 'discarded' && !e.script) throw new Error('Este combo ainda não tem roteiro.');
  if (run?.running && run.cmd === 'produzir' && (stage === 'approved' || to === 'approved')) {
    throw new Error('Aguarde o "produzir" terminar antes de mexer nos aprovados.');
  }
  const dest = path.join(stageDir(to), path.basename(e.file));
  await fsp.rename(e.file, dest);
}

/**
 * Preços conferidos no "menor da Liga": atualiza o combo e guarda em data/price-overrides.json
 * (as próximas pesquisas já usam o valor). Com todas as cartas conferidas, o vídeo diz "Menor da Liga" sem o "aprox.".
 */
async function savePrices(stage: string, name: string, prices: Record<string, number>) {
  const e = await getEntry(stage, name);
  const overridesFile = config.paths.priceOverrides;
  const overrides = JSON.parse(await fsp.readFile(overridesFile, 'utf8').catch(() => '{}')) as Record<string, unknown>;
  for (const c of e.combo.cards) {
    const v = Number(prices[c.name]);
    if (!Number.isFinite(v) || v <= 0) continue;
    c.priceBRL = Math.round(v * 100) / 100;
    c.priceConfirmed = true;
    overrides[c.name] = c.priceBRL;
  }
  const known = e.combo.cards.every((c) => typeof c.priceBRL === 'number');
  e.combo.totalBRL = known ? Math.round(e.combo.cards.reduce((a, c) => a + (c.priceBRL ?? 0), 0) * 100) / 100 : null;
  // "menor da Liga" só quando TODAS as cartas foram conferidas (agora ou antes)
  e.combo.priceFromLiga = e.combo.cards.every((c) => c.priceConfirmed);
  await fsp.writeFile(overridesFile, JSON.stringify(overrides, null, 2));
  await fsp.writeFile(e.file, JSON.stringify({combo: e.combo, script: e.script, ...(e.outDir ? {outDir: e.outDir} : {})}, null, 2));
  return {totalBRL: e.combo.totalBRL, priceFromLiga: e.combo.priceFromLiga};
}

/** Escolhas das cartas no painel: carta principal, apelido, versão da apresentação e acabamento */
async function saveCards(
  stage: string,
  name: string,
  body: {hero?: string; cards?: Record<string, {nickname?: string; fancyId?: string; fancyFinish?: 'foil' | 'etched' | 'nonfoil'}>},
) {
  const e = await getEntry(stage, name);
  if (body.hero !== undefined) {
    if (body.hero && !e.combo.cardNames.includes(body.hero)) throw new Error('A carta principal precisa ser do combo.');
    e.combo.hero = body.hero || undefined;
  }
  for (const c of e.combo.cards) {
    const ch = body.cards?.[c.name];
    if (!ch) continue;
    if (ch.nickname !== undefined) c.nickname = ch.nickname.trim().slice(0, 40) || undefined;
    if (ch.fancyId !== undefined) {
      if (ch.fancyId && !c.printings?.some((p) => p.id === ch.fancyId)) throw new Error(`Versão desconhecida para ${c.name}.`);
      c.fancyId = ch.fancyId || undefined;
    }
    if (ch.fancyFinish) c.fancyFinish = ch.fancyFinish;
  }
  await fsp.writeFile(e.file, JSON.stringify({combo: e.combo, script: e.script, ...(e.outDir ? {outDir: e.outDir} : {})}, null, 2));
  return {ok: true};
}

async function saveScript(stage: string, name: string, raw: unknown) {
  const e = await getEntry(stage, name);
  const parsed = ScriptSchema.safeParse(raw);
  if (!parsed.success) {
    return {saved: false, problems: parsed.error.issues.map((i) => `Formato: ${i.path.join('.') || '(raiz)'} ${i.message}`)};
  }
  // Em 0-roteirizar o roteiro só sai da etapa se passar em todas as regras
  if (e.stage === 'brief') {
    const {script, problems} = checkScript(raw, e.combo);
    if (!script) return {saved: false, problems};
    await fsp.writeFile(path.join(stageDir('review'), path.basename(e.file)), JSON.stringify({combo: e.combo, script}, null, 2));
    await fsp.rm(e.file);
    return {saved: true, movedTo: 'review', problems: []};
  }
  await fsp.writeFile(e.file, JSON.stringify({combo: e.combo, script: parsed.data, ...(e.outDir ? {outDir: e.outDir} : {})}, null, 2));
  return {saved: true, problems: validateScript(parsed.data, e.combo)};
}

// ---------------- HTTP ----------------
const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(body));
};

const readBody = (req: http.IncomingMessage): Promise<any> =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });

const MIME: Record<string, string> = {'.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.srt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'};

/** Arquivos de output/ com suporte a Range (para o player de vídeo poder avançar) */
function serveMedia(req: http.IncomingMessage, res: http.ServerResponse, relPath: string) {
  const file = path.resolve(config.paths.root, decodeURIComponent(relPath));
  if (!file.startsWith(path.resolve(config.paths.output) + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  const size = fs.statSync(file).size;
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, {'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1});
    fs.createReadStream(file, {start, end}).pipe(res);
  } else {
    res.writeHead(200, {'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes'});
    fs.createReadStream(file).pipe(res);
  }
}

// ---------------- marca do canal (logo/ícone em PNG) ----------------
const BRAND_FILES: Record<string, string> = {logo: 'logo.png', icone: 'icone.png'};

const readRaw = (req: http.IncomingMessage, max = 8 * 1024 * 1024): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) {
        reject(new Error('Arquivo grande demais (máx. 8 MB).'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const isPng = (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const p = url.pathname;
  const m = (re: RegExp) => re.exec(p);
  let r0: RegExpExecArray | null;
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
      return res.end(await fsp.readFile(UI));
    }
    if (req.method === 'GET' && p.startsWith('/media/')) return serveMedia(req, res, p.slice('/media/'.length));
    if (req.method === 'GET' && (r0 = /^\/brand\/(padrao\/)?(logo|icone)\.png$/.exec(p))) {
      const file = path.join(config.paths.brand, r0[1] ? 'padrao' : '', BRAND_FILES[r0[2]]);
      if (!fs.existsSync(file)) return json(res, 404, {error: 'Sem arquivo'});
      res.writeHead(200, {'Content-Type': 'image/png', 'Cache-Control': 'no-store'});
      return fs.createReadStream(file).pipe(res);
    }
    if (req.method === 'POST' && (r0 = /^\/api\/brand\/(logo|icone)$/.exec(p))) {
      const buf = await readRaw(req);
      if (!isPng(buf)) return json(res, 400, {error: 'Envie um arquivo PNG.'});
      await fsp.writeFile(path.join(config.paths.brand, BRAND_FILES[r0[1]]), buf);
      return json(res, 200, {ok: true});
    }
    if (req.method === 'POST' && (r0 = /^\/api\/brand\/(logo|icone)\/restaurar$/.exec(p))) {
      await fsp.copyFile(path.join(config.paths.brand, 'padrao', BRAND_FILES[r0[1]]), path.join(config.paths.brand, BRAND_FILES[r0[1]]));
      return json(res, 200, {ok: true});
    }

    if (req.method === 'GET' && p === '/api/status') {
      return json(res, 200, {
        scriptEngine: scriptEngine(),
        angles: ANGLES.map((a) => ({id: a, label: ANGLE_LABEL[a]})),
        angleMix: config.angleMix,
        voice: config.ttsProvider,
        voiceLabel: ttsLabel(),
        windowsVoice: config.windowsVoice.replace(/^Microsoft | Desktop$/g, ''),
        elevenReady: elevenReady(),
        cartesiaReady: !!config.cartesiaKey,
        voicePresets: Object.keys(voicePresets()),
        voicePreset: config.voicePreset,
        handle: config.handle,
        channelName: config.channelName,
        videosPerRun: config.videosPerRun,
        maxTotalBRL: config.maxTotalBRL,
        csbQuery: config.csbQuery,
      });
    }
    if (req.method === 'GET' && p === '/api/queue') return json(res, 200, await queueSnapshot());

    if (req.method === 'GET' && p === '/api/run') {
      const since = Number(url.searchParams.get('since') ?? 0);
      return json(res, 200, run ? {...run, log: run.log.slice(since), total: run.log.length} : null);
    }
    if (req.method === 'POST' && p === '/api/run') {
      const {cmd, count, voice, item, pauta} = await readBody(req);
      if (!(cmd in COMMANDS)) return json(res, 400, {error: 'Comando inválido'});
      startRun(cmd, Math.max(1, Math.min(10, Number(count) || config.videosPerRun)), voice, item, pauta || undefined);
      return json(res, 200, {ok: true});
    }
    if (req.method === 'POST' && p === '/api/run/stop') {
      child?.kill();
      return json(res, 200, {ok: true});
    }

    let r;
    if ((r = m(/^\/api\/item\/(\w+)\/([^/]+)\/move$/)) && req.method === 'POST') {
      await moveItem(r[1], decodeURIComponent(r[2]), (await readBody(req)).to);
      return json(res, 200, {ok: true});
    }
    if ((r = m(/^\/api\/item\/(\w+)\/([^/]+)\/cards$/)) && req.method === 'PUT') {
      return json(res, 200, await saveCards(r[1], decodeURIComponent(r[2]), await readBody(req)));
    }
    if ((r = m(/^\/api\/item\/(\w+)\/([^/]+)\/prices$/)) && req.method === 'PUT') {
      return json(res, 200, await savePrices(r[1], decodeURIComponent(r[2]), (await readBody(req)).prices ?? {}));
    }
    if ((r = m(/^\/api\/item\/(\w+)\/([^/]+)\/script$/)) && req.method === 'PUT') {
      return json(res, 200, await saveScript(r[1], decodeURIComponent(r[2]), (await readBody(req)).script));
    }
    if ((r = m(/^\/api\/item\/(\w+)\/([^/]+)\/validate$/)) && req.method === 'POST') {
      const e = await getEntry(r[1], decodeURIComponent(r[2]));
      return json(res, 200, checkScript((await readBody(req)).script, e.combo));
    }
    json(res, 404, {error: 'Não encontrado'});
  } catch (e) {
    json(res, 400, {error: (e as Error).message});
  }
});

const ADDR = `http://localhost:${PORT}`;
const openBrowser = () => {
  if (process.argv.includes('--open')) spawn('cmd', ['/c', 'start', '', ADDR], {detached: true, stdio: 'ignore'}).unref();
};

// Porta ocupada: se for um painel nosso já aberto, só abre o navegador nele; senão, explica.
server.on('error', async (e: NodeJS.ErrnoException) => {
  if (e.code !== 'EADDRINUSE') throw e;
  const ours = await fetch(`${ADDR}/api/status`)
    .then((r) => r.ok)
    .catch(() => false);
  if (ours) {
    console.log(`O painel já está aberto em ${ADDR}. Abrindo o navegador nele.`);
    openBrowser();
    process.exit(0);
  }
  console.error(`A porta ${PORT} está sendo usada por outro programa. Feche-o ou defina PAINEL_PORT no .env (ex.: PAINEL_PORT=5179).`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Painel MTG Shorts em ${ADDR}  (Ctrl+C ou feche esta janela para encerrar)`);
  openBrowser();
});
