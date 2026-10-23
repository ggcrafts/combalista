// ============================================================
//  ROTEIROS DA FILA 0-roteirizar
//
//    npm run roteiro -- gerar [arquivo]           → escreve (API ou Claude Code) e valida; usado pelo painel
//    npm run roteiro -- briefing                  → regras + dados de cada combo em fila/0-roteirizar
//    npm run roteiro -- salvar <brief> <roteiro>  → valida o roteiro (mesmas regras da API);
//                                                   se passar, vai para fila/1-revisar
// ============================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import {config} from './config';
import {SHAPE, SYSTEM, buildFacts, checkScript, scriptEngine, writeScript} from './script';
import {log} from './log';
import {list} from './queue';

const [cmd, ...rest] = process.argv.slice(2);
const rel = (f: string) => path.relative(config.paths.root, f);

async function briefing() {
  const briefs = await list('brief');
  if (briefs.length === 0) {
    console.log('Nada em fila/0-roteirizar/. Rode `npm run pesquisar` primeiro.');
    return;
  }
  console.log(`# Regras do roteirista\n\n${SYSTEM}\n\n# Formato\n\n${SHAPE}\n`);
  for (const b of briefs) {
    console.log(`# Combo: ${b.combo.cardNames.join(' + ')}\nArquivo: ${rel(b.file)}\n\n${JSON.stringify(buildFacts(b.combo), null, 2)}\n`);
  }
  console.log(`${briefs.length} combo(s) para roteirizar.`);
}

/** Escreve o roteiro de um combo da fila (ou de todos) e manda para 1-revisar */
async function generateAll(only?: string) {
  const engine = scriptEngine();
  if (!engine) throw new Error('Sem ANTHROPIC_API_KEY e sem Claude Code instalado: não há quem escreva o roteiro.');
  const briefs = (await list('brief')).filter((b) => !only || path.basename(b.file) === path.basename(only));
  if (briefs.length === 0) {
    log.warn('Nada para roteirizar.');
    return;
  }
  log.step(`Escrevendo ${briefs.length} roteiro(s) com ${engine === 'api' ? 'a API da Anthropic' : 'Claude Code (seu plano)'}`);
  let failed = 0;
  for (const b of briefs) {
    const label = b.combo.cardNames.join(' + ');
    try {
      log.step(`Roteiro: ${label}`);
      const script = await writeScript(b.combo);
      await fs.writeFile(path.join(config.paths.queue, '1-revisar', path.basename(b.file)), JSON.stringify({combo: b.combo, script}, null, 2));
      await fs.rm(b.file);
      log.ok(`Pronto para revisar: ${script.hook.onScreen}`);
    } catch (e) {
      failed++;
      log.error(`${label}: ${(e as Error).message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

async function save(briefPath?: string, scriptPath?: string) {
  if (!briefPath || !scriptPath) throw new Error('Uso: npm run roteiro -- salvar <arquivo-da-fila> <roteiro.json>');
  const briefFile = path.resolve(config.paths.root, briefPath);
  const brief = (await list('brief')).find((b) => path.resolve(b.file) === briefFile);
  if (!brief) throw new Error(`${briefPath} não está em fila/0-roteirizar/`);

  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.resolve(scriptPath), 'utf8'));
  } catch (e) {
    throw new Error(`JSON inválido em ${scriptPath}: ${(e as Error).message}`);
  }

  const {script, problems} = checkScript(raw, brief.combo);
  if (!script) {
    console.log(`REPROVADO — corrija e salve de novo:\n- ${problems.join('\n- ')}`);
    process.exitCode = 1;
    return;
  }
  const dest = path.join(config.paths.queue, '1-revisar', path.basename(brief.file));
  await fs.writeFile(dest, JSON.stringify({combo: brief.combo, script}, null, 2));
  await fs.rm(brief.file);
  console.log(`OK — ${rel(dest)}`);
}

(cmd === 'gerar' ? generateAll(rest[0]) : cmd === 'briefing' ? briefing() : cmd === 'salvar' ? save(rest[0], rest[1]) : Promise.reject(new Error('Comandos: gerar [arquivo] | briefing | salvar <brief> <roteiro.json>'))).catch(
  (e) => {
    console.error((e as Error).message);
    process.exit(1);
  },
);
