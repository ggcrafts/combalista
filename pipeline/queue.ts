// ============================================================
//  FILA DE REVISÃO — o ponto "semi" do semi-autônomo
//
//    fila/0-roteirizar/   ← `npm run pesquisar` sem ANTHROPIC_API_KEY: combos esperando o /roteirizar
//    fila/1-revisar/      ← roteiros prontos (API ou /roteirizar) esperando você
//    fila/2-aprovados/    ← você move (e edita, se quiser) os que gostou
//    fila/3-produzidos/   ← `npm run produzir` renderiza e move pra cá
//    fila/descartados/    ← mova pra cá o que não presta (o combo não volta)
// ============================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import {config} from './config';
import type {ResearchedCombo} from './research';
import type {Script} from './script';

export const STAGES = {
  brief: '0-roteirizar',
  review: '1-revisar',
  approved: '2-aprovados',
  done: '3-produzidos',
  discarded: 'descartados',
} as const;
export type Stage = keyof typeof STAGES;

/** Em 0-roteirizar ainda não há script */
export type QueueItem = {combo: ResearchedCombo; script?: Script; /** pasta do vídeo, gravada ao produzir */ outDir?: string};
export type QueueEntry = QueueItem & {file: string};

const dir = (stage: Stage) => path.join(config.paths.queue, STAGES[stage]);

export async function ensureQueue() {
  for (const s of Object.keys(STAGES) as Stage[]) await fs.mkdir(dir(s), {recursive: true});
}

export async function enqueue(item: QueueItem, slug: string, stage: Stage = 'review'): Promise<string> {
  await ensureQueue();
  const file = path.join(dir(stage), `${slug}.json`);
  await fs.writeFile(file, JSON.stringify(item, null, 2));
  return file;
}

/** Lê os itens de uma etapa. Arquivos com JSON quebrado viram erro com o nome do arquivo. */
export async function list(stage: Stage): Promise<QueueEntry[]> {
  await ensureQueue();
  const files = (await fs.readdir(dir(stage))).filter((f) => f.endsWith('.json')).sort();
  const out: QueueEntry[] = [];
  for (const f of files) {
    const file = path.join(dir(stage), f);
    try {
      out.push({...(JSON.parse(await fs.readFile(file, 'utf8')) as QueueItem), file});
    } catch (e) {
      throw new Error(`JSON inválido em ${path.relative(config.paths.root, file)}: ${(e as Error).message}`);
    }
  }
  return out;
}

export async function move(entry: QueueEntry, to: Stage): Promise<string> {
  const dest = path.join(dir(to), path.basename(entry.file));
  await fs.rename(entry.file, dest);
  return dest;
}

/** IDs de combos que já estão em qualquer etapa da fila (para a pesquisa não repetir) */
export async function queuedIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const s of Object.keys(STAGES) as Stage[]) {
    for (const e of await list(s).catch(() => [])) ids.add(e.combo.id);
  }
  return ids;
}
