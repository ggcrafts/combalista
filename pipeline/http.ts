import fs from 'node:fs/promises';

const UA = 'mtg-shorts/0.1 (pipeline de conteudo pessoal)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fila simples por host para respeitar rate limits (Scryfall: /cards/search e /cards/named ~2 req/s) */
const lastCall = new Map<string, number>();
const MIN_GAP_MS: Record<string, number> = {
  'api.scryfall.com': 550,
  'backend.commanderspellbook.com': 250,
};

const throttle = async (url: string) => {
  const host = new URL(url).host;
  const gap = MIN_GAP_MS[host] ?? 0;
  if (!gap) return;
  const last = lastCall.get(host) ?? 0;
  const wait = last + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall.set(host, Date.now());
};

export async function fetchJson<T>(url: string, init: RequestInit = {}, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(url);
    try {
      const res = await fetch(url, {
        ...init,
        headers: {'User-Agent': UA, Accept: 'application/json', ...(init.headers ?? {})},
      });
      if (res.status === 429) {
        // respeita o Retry-After quando vier; senão espera um pouco mais que o normal
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000);
        throw new Error(`HTTP 429 em ${url}`);
      }
      if (res.status >= 500) {
        throw new Error(`HTTP ${res.status} em ${url}`);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = new Error(`HTTP ${res.status} em ${url}: ${body.slice(0, 300)}`);
        (err as Error & {fatal?: boolean}).fatal = true;
        throw err;
      }
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if ((e as {fatal?: boolean}).fatal) throw e;
      await sleep(800 * 2 ** attempt);
    }
  }
  throw lastErr;
}

export async function download(url: string, dest: string): Promise<void> {
  await throttle(url);
  const res = await fetch(url, {headers: {'User-Agent': UA}});
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
}
