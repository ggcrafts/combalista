// ============================================================
//  ORQUESTRADOR
//
//  Modo semi-autônomo (recomendado):
//    npm run pesquisar               → pesquisa + roteiro → fila/1-revisar/
//    (você revisa, edita e move para fila/2-aprovados/)
//    npm run produzir                → narração + render dos aprovados → fila/3-produzidos/
//
//  Modo 100% automático:
//    npm run pipeline                → pesquisa, roteiro, narração e render de uma vez
//
//  Opções:
//    --count 5                       → quantidade nesta execução (pesquisar / pipeline)
//    --keep-assets                   → não apaga public/jobs depois do render
//    --rampage --count 5             → "estou com sorte": pesquisa, escreve, aprova e renderiza sem parar
//    --pauta novidade                → só uma pauta (novidade, inusitado, joia, barato); sem ela, mistura PAUTAS do .env
// ============================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import {config, requireKeys, today} from './config';
import {log} from './log';
import {addToHistory, ANGLES, researchCombos, type Angle, type ResearchedCombo} from './research';
import {ScriptSchema, scriptEngine, validateScript, writeScript, type Script} from './script';
import {buildProps, createJob, writePublishingFiles, slugify, type Job} from './build';
import {makeBundle, renderVideo} from './render';
import {enqueue, list, move, type QueueEntry} from './queue';
import type {VideoProps} from '../src/types';

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const count = Number(opt('--count') ?? config.videosPerRun);
const mode: 'auto' | 'research' | 'produce' = flag('--dry-run')
  ? 'research'
  : flag('--aprovados')
    ? 'produce'
    : 'auto';
const keepAssets = flag('--keep-assets');
// --rampage: modo "estou com sorte" — pesquisa, roteiro, aprova e renderiza tudo sem parar (passa pela fila: os vídeos aparecem em Produzidos)
const rampage = flag('--rampage');
// --pauta novidade|inusitado|joia|barato (sem a opção: mistura do .env)
const pautaArg = opt('--pauta');
const pauta = pautaArg && (ANGLES as readonly string[]).includes(pautaArg) ? (pautaArg as Angle) : undefined;

type Result = {
  combo: ResearchedCombo;
  script?: Script;
  entry?: QueueEntry;
  job?: Job;
  props?: VideoProps;
  status: string;
  error?: string;
};

const label = (r: Result) => r.combo.cardNames.join(' + ');

/** Itens aprovados: valida o JSON (você pode ter editado à mão) e avisa sobre desvios */
async function loadApproved(): Promise<Result[]> {
  const entries = await list('approved');
  const results: Result[] = [];
  for (const entry of entries) {
    const r: Result = {combo: entry.combo, entry, status: 'aprovado'};
    const parsed = ScriptSchema.safeParse(entry.script);
    if (!parsed.success) {
      r.status = 'roteiro inválido';
      r.error = `${path.basename(entry.file)}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`;
      log.error(r.error);
    } else {
      r.script = parsed.data;
      for (const p of validateScript(parsed.data, entry.combo)) log.warn(`${label(r)}: ${p} (seguindo mesmo assim, foi aprovado)`);
    }
    results.push(r);
  }
  return results;
}

async function main() {
  const started = Date.now();
  const date = today();
  const modeName = rampage ? 'RAMPAGE (pesquisa, roteiro, aprova e renderiza)' : {auto: 'automático', research: 'pesquisa → fila de revisão', produce: 'produzir aprovados'}[mode];
  log.step(`Pipeline iniciado — modo ${modeName}`);
  // Roteiro: API se houver chave, senão Claude Code (plano do Claude). Sem nenhum dos dois, a pesquisa só enfileira.
  const engine = scriptEngine();
  if (mode === 'auto' && !engine) {
    throw new Error('O modo automático precisa de ANTHROPIC_API_KEY ou do Claude Code instalado.');
  }
  if (mode !== 'produce') log.info(`Roteiros: ${{api: 'API da Anthropic', 'claude-code': 'Claude Code (seu plano)'}[engine!] ?? 'nenhum motor disponível, combos vão para fila/0-roteirizar'}`);
  requireKeys(mode === 'research' ? [] : ['eleven']);

  let results: Result[];

  if (mode === 'produce') {
    results = await loadApproved();
    if (results.length === 0) {
      log.warn('Nada em fila/2-aprovados/. Rode `npm run pesquisar` e mova os roteiros que gostar para lá.');
      return;
    }
    log.info(`${results.length} roteiro(s) aprovado(s)`);
  } else {
    // 1) PESQUISA
    log.step(`1/4 Pesquisa (${count})`);
    const combos = await researchCombos(count, pauta);
    if (combos.length === 0) {
      log.warn('Nenhum combo passou nos filtros. Ajuste CSB_QUERY / MAX_TOTAL_BRL / MAX_CARDS no .env.');
      return;
    }
    results = combos.map((combo) => ({combo, status: 'pesquisado'}));

    // 2) ROTEIRO
    for (const r of results) {
      if (mode === 'research' && !engine) {
        const file = await enqueue({combo: r.combo}, `${date}_${slugify(label(r))}`, 'brief');
        r.status = 'aguardando roteiro';
        log.ok(`Para roteirizar: ${path.relative(config.paths.root, file)}`);
        continue;
      }
      try {
        log.step(`2/4 Roteiro: ${label(r)}`);
        r.script = await writeScript(r.combo);
        r.status = 'roteiro ok';
        if (mode === 'research') {
          const file = await enqueue({combo: r.combo, script: r.script}, `${date}_${slugify(label(r))}`);
          r.status = 'aguardando revisão';
          log.ok(`Para revisar: ${path.relative(config.paths.root, file)}`);
        } else if (rampage) {
          // aprovado na hora; depois do render vai para Produzidos como qualquer outro
          const name = `${date}_${slugify(label(r))}.json`;
          await enqueue({combo: r.combo, script: r.script}, name.replace(/\.json$/, ''), 'approved');
          r.entry = (await list('approved')).find((e) => path.basename(e.file) === name);
          log.ok(`Aprovado (rampage): ${r.script.hook.onScreen}`);
        }
      } catch (e) {
        r.status = 'falhou';
        r.error = (e as Error).message;
        log.error(`${label(r)}: ${r.error}`);
        // não perde o combo pesquisado: fica em 0-roteirizar para tentar de novo pelo painel
        if (mode === 'research') {
          await enqueue({combo: r.combo}, `${date}_${slugify(label(r))}`, 'brief');
          r.status = 'roteiro falhou (em 0-roteirizar)';
        }
      }
    }
  }

  if (mode !== 'research') {
    // 3) NARRAÇÃO + ASSETS
    for (const r of results.filter((x) => x.script)) {
      try {
        log.step(`3/4 Assets e narração: ${label(r)}`);
        r.job = await createJob(r.combo, r.script!);
        r.props = await buildProps(r.job, r.combo, r.script!);
        await writePublishingFiles(r.job, r.combo, r.script!, r.props);
        r.status = 'pronto p/ render';
      } catch (e) {
        r.status = 'falhou';
        r.error = (e as Error).message;
        log.error(`${label(r)}: ${r.error}`);
      }
    }

    // 4) RENDER
    const toRender = results.filter((r) => r.props && r.job);
    if (toRender.length) {
      const serveUrl = await makeBundle();
      for (const r of toRender) {
        try {
          log.step(`4/4 Render: ${label(r)}`);
          const {durationSec} = await renderVideo(serveUrl, r.props!, r.job!.outDir);
          r.status = `renderizado (${durationSec.toFixed(1)}s)`;
          await addToHistory({id: r.combo.id, title: r.script!.title, date});
          if (r.entry) {
            await fs.writeFile(r.entry.file, JSON.stringify({combo: r.combo, script: r.script, outDir: r.job!.outDir}, null, 2));
            await move(r.entry, 'done');
          }
          if (!keepAssets) await fs.rm(r.job!.publicDir, {recursive: true, force: true});
          log.ok(`Vídeo em ${r.job!.outDir}`);
        } catch (e) {
          r.status = 'falhou no render';
          r.error = (e as Error).message;
          log.error(`${label(r)}: ${r.error}`);
        }
      }
    }
  }

  // RELATÓRIO
  const reportDir = path.join(config.paths.output, date);
  await fs.mkdir(reportDir, {recursive: true});
  const lines = results.map(
    (r) =>
      `| ${label(r)} | ${r.combo.totalBRL !== null ? 'R$ ' + r.combo.totalBRL.toFixed(2) : '?'} | ${r.status} | ${r.job ? path.relative(config.paths.root, r.job.outDir) : '-'} | ${r.error ?? ''} |`,
  );
  const report = `# Execução ${new Date().toLocaleString('pt-BR')} — ${modeName}

Duração: ${((Date.now() - started) / 60000).toFixed(1)} min

| Combo | Custo | Status | Pasta | Erro |
|---|---|---|---|---|
${lines.join('\n')}
`;
  await fs.appendFile(path.join(reportDir, 'relatorio.md'), report + '\n');
  log.step(`Fim. Relatório em ${path.relative(config.paths.root, path.join(reportDir, 'relatorio.md'))}`);
}

main().catch((e) => {
  log.error((e as Error).stack ?? String(e));
  process.exit(1);
});
