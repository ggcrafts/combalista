// ============================================================
//  PESQUISA — pautas do canal
//    novidade   → cartas de coleções recentes (Scryfall) + combos que as usam (Commander Spellbook)
//    inusitado  → o Claude propõe interações com cartas recentes; cada uma é checada (Spellbook ou regra a regra)
//    joia       → combos de nicho com alguma carta pouco jogada ("dá uma olhada na sua pool")
//    barato     → combos populares que cabem no bolso (a pauta original, agora secundária)
// ============================================================
import fs from 'node:fs/promises';
import {config} from './config';
import {fetchJson} from './http';
import {log} from './log';
import {queuedIds} from './queue';
import {discoverInteractions} from './discover';

const CSB = 'https://backend.commanderspellbook.com';
const SCRYFALL = 'https://api.scryfall.com';

export const ANGLES = ['novidade', 'inusitado', 'joia', 'barato'] as const;
export type Angle = (typeof ANGLES)[number];

export const ANGLE_LABEL: Record<Angle, string> = {
  novidade: 'Novidade',
  inusitado: 'Interação inusitada',
  joia: 'Joia escondida',
  barato: 'Combo barato',
};

export type ScryCard = {
  name: string;
  imageUrl: string;
  artCropUrl?: string;
  artist?: string;
  colorIdentity: string[];
  usd: number | null;
  setName?: string;
  setCode?: string;
  scryfallUri?: string;
  /** texto oficial (todas as faces) — é a base de verdade do roteiro */
  oracle: string;
  typeLine: string;
  manaCost: string;
  /** posição no ranking do EDHREC (maior = menos jogada); null se não ranqueada */
  edhrecRank: number | null;
  /** data da primeira impressão em papel (AAAA-MM-DD) */
  firstPrinted?: string;
  /** força/resistência (criaturas) */
  power?: string;
  toughness?: string;
  /** fichas que a carta cria (Scryfall "all_parts"), com imagem oficial */
  tokens?: TokenInfo[];
  /** impressões notáveis (Secret Lair, tratamentos especiais, mais caras) */
  printings?: Printing[];
  /** versão "bonita" sugerida para a apresentação + finalização a imitar no render */
  fancyId?: string;
  fancyFinish?: Finish;
  /** apelido (ácido) escolhido no painel; o roteirista usa quando cita a carta de novo */
  nickname?: string;
};

export type TokenInfo = {name: string; typeLine: string; power?: string; toughness?: string; oracle: string; imageUrl: string};

export type Finish = 'foil' | 'etched' | 'nonfoil';

/** Uma impressão da carta (para escolher a versão "bonita e cara" da apresentação) */
export type Printing = {
  id: string;
  setName: string;
  released: string;
  imageUrl: string;
  finishes: Finish[];
  /** ex.: "Secret Lair · borderless · foil" */
  label: string;
  /** maior preço em USD entre as finalizações */
  maxUsd: number | null;
  special: boolean;
};

export type ResearchedCard = ScryCard & {
  priceBRL: number | null;
  /** primeira impressão em coleção recente */
  isNew?: boolean;
  /** pouco jogada (EDHREC) */
  isGem?: boolean;
  /** preço conferido no "menor da Liga" pelo painel */
  priceConfirmed?: boolean;
};

export type Combo = {
  id: string;
  cardNames: string[];
  produces: string[];
  description: string;
  easyPrerequisites: string;
  notablePrerequisites: string;
  manaNeeded: string;
  popularity: number;
  identity: string;
  url: string;
};

export type ResearchedCombo = Combo & {
  angle: Angle;
  /** true quando você conferiu os preços no "menor da Liga" pelo painel */
  priceFromLiga?: boolean;
  /** carta principal escolhida no painel (senão: a nova, a joia ou a primeira) */
  hero?: string;
  /** de onde vem a garantia de que funciona */
  source: 'spellbook' | 'claude';
  /** observação da pesquisa (por que é inusitado, ressalvas da checagem) */
  note?: string;
  cards: ResearchedCard[];
  totalBRL: number | null;
  fx: number;
};

// ---------- utilidades ----------
// A API do Spellbook pode responder em camelCase ou snake_case; aceitamos os dois.
const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const shuffle = <T>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** Data AAAA-MM-DD de N meses atrás */
const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toLocaleDateString('sv-SE');
};

// ---------- histórico (evita repetir combo) ----------
export async function loadHistory(): Promise<Set<string>> {
  try {
    const raw = JSON.parse(await fs.readFile(config.paths.history, 'utf8')) as {id: string}[];
    return new Set(raw.map((r) => r.id));
  } catch {
    return new Set();
  }
}

export async function addToHistory(entry: {id: string; title: string; date: string}) {
  await fs.mkdir(config.paths.data, {recursive: true});
  let raw: unknown[] = [];
  try {
    raw = JSON.parse(await fs.readFile(config.paths.history, 'utf8'));
  } catch {
    /* primeiro uso */
  }
  raw.push(entry);
  await fs.writeFile(config.paths.history, JSON.stringify(raw, null, 2));
}

// ---------- câmbio ----------
export async function getUsdBrl(): Promise<number> {
  try {
    const r = await fetchJson<Record<string, {bid: string}>>('https://economia.awesomeapi.com.br/json/last/USD-BRL', {}, 1);
    const v = Number(r.USDBRL?.bid);
    if (v > 0) return v;
  } catch (e) {
    log.warn(`Cotação USD-BRL indisponível, usando fallback ${config.fxFallback}: ${(e as Error).message}`);
  }
  return config.fxFallback;
}

async function loadPriceOverrides(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await fs.readFile(config.paths.priceOverrides, 'utf8'));
  } catch {
    return {};
  }
}

// ---------- Commander Spellbook ----------
type Variant = Combo & {requiresCount: number; cardCount: number};

function normalizeVariant(v: Record<string, unknown>): Variant {
  const uses = (pick(v, 'uses') as Record<string, unknown>[]) ?? [];
  const requires = (pick(v, 'requires') as unknown[]) ?? [];
  const produces = (pick(v, 'produces') as Record<string, unknown>[]) ?? [];
  const cardNames = uses.map((u) => str((pick(u, 'card') as Record<string, unknown>)?.name)).filter(Boolean);
  const id = String(pick(v, 'id') ?? '');
  return {
    id,
    cardNames,
    cardCount: cardNames.length,
    requiresCount: requires.length,
    produces: produces.map((p) => str((pick(p, 'feature') as Record<string, unknown>)?.name)).filter(Boolean),
    description: str(pick(v, 'description')),
    easyPrerequisites: str(pick(v, 'easyPrerequisites', 'easy_prerequisites')),
    notablePrerequisites: str(pick(v, 'notablePrerequisites', 'notable_prerequisites')),
    manaNeeded: str(pick(v, 'manaNeeded', 'mana_needed')),
    popularity: Number(pick(v, 'popularity') ?? 0),
    identity: str(pick(v, 'identity')) || 'C',
    url: `https://commanderspellbook.com/combo/${id}/`,
  };
}

async function searchSpellbook(query: string, limit = 60, ordering = '-popularity'): Promise<Variant[]> {
  const url = `${CSB}/variants/?q=${encodeURIComponent(query)}&ordering=${ordering}&limit=${limit}`;
  const data = await fetchJson<{results: Record<string, unknown>[]}>(url);
  return data.results
    .map(normalizeVariant)
    .filter((c) => c.id && c.description.length > 0)
    .filter((c) => c.cardCount >= 2 && c.cardCount <= config.maxCards)
    .filter((c) => (config.onlySelfContained ? c.requiresCount === 0 : true));
}

/** Combo do Spellbook que use exatamente estas cartas (para validar ideias do Claude) */
export async function spellbookFor(names: string[]): Promise<Combo | null> {
  const q = names.map((n) => `card:"${n.replace(/"/g, '')}"`).join(' ');
  try {
    const found = await searchSpellbook(q, 20);
    const want = new Set(names.map((n) => n.toLowerCase()));
    return found.find((v) => v.cardNames.length === want.size && v.cardNames.every((n) => want.has(n.toLowerCase()))) ?? null;
  } catch {
    return null;
  }
}

// ---------- Scryfall ----------
type ScryFace = {power?: string; toughness?: string; oracle_text?: string; type_line?: string; mana_cost?: string; name?: string; image_uris?: {large?: string; normal?: string; art_crop?: string}};
type ScryRaw = ScryFace & {
  id?: string;
  set_type?: string;
  border_color?: string;
  full_art?: boolean;
  frame_effects?: string[];
  promo_types?: string[];
  finishes?: string[];
  power?: string;
  toughness?: string;
  all_parts?: Array<{component: string; name: string; uri: string}>;
  name: string;
  artist?: string;
  set_name?: string;
  set?: string;
  scryfall_uri?: string;
  color_identity?: string[];
  edhrec_rank?: number;
  released_at?: string;
  prices?: {usd?: string | null; usd_foil?: string | null; usd_etched?: string | null};
  card_faces?: ScryFace[];
};

const images = (c: ScryRaw) => c.image_uris ?? c.card_faces?.[0]?.image_uris ?? {};
const oracleOf = (c: ScryRaw) =>
  c.card_faces?.length ? c.card_faces.map((f) => `[${f.name}] ${f.oracle_text ?? ''}`).join('\n') : c.oracle_text ?? '';

const cache = new Map<string, ScryCard>();

const num = (v?: string | null) => (v ? Number(v) : NaN);

/** Descreve e pontua impressões; escolhe a "bonita e cara" para a apresentação */
function notablePrintings(prints: ScryRaw[]): {list: Printing[]; fancy?: Printing; finish: Finish} {
  const list: Printing[] = prints
    .filter((p) => images(p).large || images(p).normal)
    .map((p) => {
      const finishes = (p.finishes ?? ['nonfoil']).filter((f): f is Finish => f === 'foil' || f === 'etched' || f === 'nonfoil');
      const fx = [...(p.frame_effects ?? []), ...(p.promo_types ?? [])].filter((e) => !['universesbeyond', 'legendary'].includes(e));
      const tags = [
        p.border_color === 'borderless' ? 'borderless' : '',
        p.full_art ? 'full art' : '',
        ...fx.filter((e) => ['showcase', 'extendedart', 'inverted', 'etched', 'surgefoil', 'galaxyfoil', 'textured', 'serialized', 'halofoil', 'rainbowfoil', 'confettifoil'].includes(e)),
      ].filter(Boolean);
      const maxUsd = Math.max(...[num(p.prices?.usd), num(p.prices?.usd_foil), num(p.prices?.usd_etched)].filter(Number.isFinite), -1);
      const set = p.set_name ?? '';
      return {
        id: p.id ?? '',
        setName: set,
        released: p.released_at ?? '',
        imageUrl: images(p).large ?? images(p).normal ?? '',
        finishes,
        label: [...new Set([set.replace('Secret Lair Drop', 'Secret Lair'), ...tags, finishes.includes('etched') ? 'etched' : finishes.includes('foil') ? 'foil' : ''])].filter(Boolean).join(' · '),
        maxUsd: maxUsd >= 0 ? maxUsd : null,
        special: /secret lair/i.test(set) || tags.length > 0,
      };
    });
  const foily = (p: Printing) => p.finishes.includes('foil') || p.finishes.includes('etched');
  const byRecent = (a: Printing, b: Printing) => b.released.localeCompare(a.released);
  const byPrice = (a: Printing, b: Printing) => (b.maxUsd ?? 0) - (a.maxUsd ?? 0);
  const sl = list.filter((p) => /secret lair/i.test(p.setName) && foily(p)).sort(byRecent);
  const special = list.filter((p) => p.special).sort(byPrice);
  const fancy = sl[0] ?? special[0] ?? [...list].sort(byPrice)[0];
  const finish: Finish = fancy?.finishes.includes('etched') ? 'etched' : fancy?.finishes.includes('foil') ? 'foil' : 'nonfoil';
  // para o painel: as especiais (mais recentes primeiro) + as mais caras, sem repetir
  const shown = [...new Map([...special.sort(byRecent), ...[...list].sort(byPrice)].map((p) => [p.id, p])).values()].slice(0, 18);
  return {list: shown, fancy, finish};
}

/** Fichas que a carta cria, com texto e imagem oficial (até 3) */
async function fetchTokens(def: ScryRaw): Promise<TokenInfo[]> {
  const parts = (def.all_parts ?? []).filter((p) => p.component === 'token').slice(0, 3);
  const out: TokenInfo[] = [];
  for (const p of parts) {
    try {
      const t = await fetchJson<ScryRaw>(p.uri);
      const img = images(t);
      if (!img.large && !img.normal) continue;
      out.push({
        name: t.name,
        typeLine: t.type_line ?? '',
        power: t.power,
        toughness: t.toughness,
        oracle: oracleOf(t),
        imageUrl: img.large ?? img.normal ?? '',
      });
    } catch {
      /* ficha sem dados: segue sem ela */
    }
  }
  return out;
}

export async function fetchCard(name: string): Promise<ScryCard> {
  if (cache.has(name)) return cache.get(name)!;

  // impressão "padrão" (imagem mais reconhecível); fuzzy aceita pequenas variações vindas do Claude
  let def: ScryRaw;
  try {
    def = await fetchJson<ScryRaw>(`${SCRYFALL}/cards/named?exact=${encodeURIComponent(name)}`);
  } catch {
    def = await fetchJson<ScryRaw>(`${SCRYFALL}/cards/named?fuzzy=${encodeURIComponent(name)}`);
  }

  // todas as impressões em papel: a mais barata dá o preço, a mais antiga diz se a carta é nova
  let usd: number | null = null;
  let firstPrinted: string | undefined = def.released_at;
  let notable: ReturnType<typeof notablePrintings> = {list: [], finish: 'nonfoil'};
  try {
    const q = `!"${def.name}" game:paper`;
    const prints = await fetchJson<{data: ScryRaw[]}>(
      `${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=usd&dir=asc`,
    );
    for (const p of prints.data) {
      const v = Number(p.prices?.usd ?? p.prices?.usd_foil ?? p.prices?.usd_etched ?? NaN);
      if (Number.isFinite(v) && v > 0) usd = usd === null ? v : Math.min(usd, v);
      if (p.released_at && (!firstPrinted || p.released_at < firstPrinted)) firstPrinted = p.released_at;
    }
    notable = notablePrintings(prints.data);
  } catch (e) {
    log.warn(`Sem preço para ${name}: ${(e as Error).message}`);
  }

  const img = images(def);
  const card: ScryCard = {
    name: def.name,
    imageUrl: img.large ?? img.normal ?? '',
    artCropUrl: img.art_crop,
    artist: def.artist,
    colorIdentity: def.color_identity ?? [],
    usd,
    setName: def.set_name,
    setCode: def.set,
    scryfallUri: def.scryfall_uri,
    oracle: oracleOf(def),
    typeLine: def.type_line ?? def.card_faces?.map((f) => f.type_line).join(' // ') ?? '',
    manaCost: def.mana_cost ?? def.card_faces?.map((f) => f.mana_cost).join(' // ') ?? '',
    edhrecRank: def.edhrec_rank ?? null,
    firstPrinted,
    power: def.power ?? def.card_faces?.[0]?.power,
    toughness: def.toughness ?? def.card_faces?.[0]?.toughness,
    tokens: await fetchTokens(def),
    printings: notable.list,
    fancyId: notable.fancy?.id,
    fancyFinish: notable.finish,
  };
  cache.set(name, card);
  cache.set(def.name, card);
  return card;
}

/** Cartas que estrearam (não são reimpressão) nas coleções dos últimos meses */
type NewCard = {name: string; oracle: string; typeLine: string; manaCost: string; setName: string; edhrecRank: number | null};
let newCardsCache: NewCard[] | null = null;

export async function recentNewCards(): Promise<NewCard[]> {
  if (newCardsCache) return newCardsCache;
  const q = `date>=${monthsAgo(config.newMonths)} not:reprint legal:commander game:paper -t:basic`;
  const out: NewCard[] = [];
  let url: string | null = `${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`;
  // 2 páginas (~350 cartas) bastam: vêm ordenadas pelas mais jogadas
  for (let page = 0; url && page < 2; page++) {
    const res: {data: ScryRaw[]; next_page?: string} = await fetchJson(url);
    for (const c of res.data) {
      out.push({
        name: c.name,
        oracle: oracleOf(c),
        typeLine: c.type_line ?? '',
        manaCost: c.mana_cost ?? '',
        setName: c.set_name ?? '',
        edhrecRank: c.edhrec_rank ?? null,
      });
    }
    url = res.next_page ?? null;
  }
  newCardsCache = out;
  log.info(`${out.length} cartas novas (desde ${monthsAgo(config.newMonths)})`);
  return out;
}

/**
 * Completa um combo pesquisado antes das pautas (sem texto oficial, pauta, fonte).
 * Altera o objeto no lugar, para quem o salvar levar os dados novos junto.
 */
export async function enrichCombo(combo: ResearchedCombo): Promise<ResearchedCombo> {
  combo.angle ??= 'barato';
  combo.source ??= 'spellbook';
  for (const [i, c] of combo.cards.entries()) {
    if (c.oracle !== undefined && c.tokens !== undefined && c.printings !== undefined) continue;
    const full = await fetchCard(c.name);
    combo.cards[i] = {...full, ...c, oracle: full.oracle, typeLine: full.typeLine, manaCost: full.manaCost, edhrecRank: full.edhrecRank, power: full.power, toughness: full.toughness, tokens: full.tokens, printings: full.printings, fancyId: c.fancyId ?? full.fancyId, fancyFinish: c.fancyFinish ?? full.fancyFinish, isGem: full.edhrecRank === null || full.edhrecRank > config.gemRank};
  }
  return combo;
}

// ---------- candidatos por pauta ----------
async function candidates(angle: Angle, skip: Set<string>, want: number): Promise<Array<Combo & {source: 'spellbook' | 'claude'; note?: string}>> {
  const fresh = <T extends Combo>(list: T[]) => list.filter((c) => !skip.has(c.id));

  if (angle === 'barato') {
    return fresh(await searchSpellbook(config.csbQuery, 100)).map((c) => ({...c, source: 'spellbook' as const}));
  }

  if (angle === 'joia') {
    // combos de nicho: usados por algumas centenas de decks, não pelos milhares do topo
    const list = await searchSpellbook(`${config.csbQuery} popularity>40 popularity<1500`, 100);
    return shuffle(fresh(list)).map((c) => ({...c, source: 'spellbook' as const}));
  }

  if (angle === 'novidade') {
    const news = shuffle((await recentNewCards()).slice(0, 80));
    const out: Array<Combo & {source: 'spellbook'}> = [];
    for (const card of news) {
      if (out.length >= want * 3) break;
      const list = fresh(await searchSpellbook(`${config.csbQuery} card:"${card.name.replace(/"/g, '')}"`, 15)).filter(
        (c) => !out.some((o) => o.id === c.id),
      );
      out.push(...list.slice(0, 2).map((c) => ({...c, source: 'spellbook' as const})));
    }
    return out;
  }

  // inusitado: ideias do Claude, cada uma checada antes de virar candidato
  const ideas = await discoverInteractions(shuffle(await recentNewCards()).slice(0, 30), want + 2);
  return ideas.filter((c) => !skip.has(c.id));
}

/** Quais pautas usar nesta execução: a escolhida, ou a mistura do .env (alternando) */
export function anglesFor(count: number, only?: Angle): Angle[] {
  if (only) return Array(count).fill(only);
  const mix = config.angleMix.length ? config.angleMix : (['novidade', 'inusitado', 'joia'] as Angle[]);
  const offset = Math.floor(Math.random() * mix.length);
  return Array.from({length: count}, (_, i) => mix[(i + offset) % mix.length]);
}

// ---------- orquestração da pesquisa ----------
export async function researchCombos(count: number, only?: Angle): Promise<ResearchedCombo[]> {
  const plan = anglesFor(count, only);
  log.info(`Pautas: ${plan.map((a) => ANGLE_LABEL[a]).join(', ')}`);
  const skip = await loadHistory();
  for (const id of await queuedIds()) skip.add(id);
  const fx = await getUsdBrl();
  const overrides = await loadPriceOverrides();
  const newNames = new Set((await recentNewCards().catch(() => [])).map((c) => c.name));
  const pools = new Map<Angle, Awaited<ReturnType<typeof candidates>>>();
  const picked: ResearchedCombo[] = [];

  for (const angle of plan) {
    if (!pools.has(angle)) {
      try {
        log.step(`Buscando: ${ANGLE_LABEL[angle]}`);
        const want = plan.filter((a) => a === angle).length;
        pools.set(angle, await candidates(angle, skip, want));
        log.info(`${pools.get(angle)!.length} candidato(s) para ${ANGLE_LABEL[angle]}`);
      } catch (e) {
        log.warn(`Pauta ${ANGLE_LABEL[angle]} falhou: ${(e as Error).message}`);
        pools.set(angle, []);
      }
    }
    const pool = pools.get(angle)!;
    let ok = false;
    while (pool.length && !ok) {
      const combo = pool.shift()!;
      if (skip.has(combo.id)) continue;
      try {
        const cards: ResearchedCard[] = [];
        for (const n of combo.cardNames) {
          const c = await fetchCard(n);
          const override = overrides[c.name];
          const priceBRL =
            override !== undefined ? override : c.usd === null ? null : Math.round(c.usd * fx * config.priceMultiplier * 100) / 100;
          cards.push({
            ...c,
            priceBRL,
            isNew: newNames.has(c.name) || (!!c.firstPrinted && c.firstPrinted >= monthsAgo(config.newMonths)),
            isGem: c.edhrecRank === null || c.edhrecRank > config.gemRank,
          });
        }
        if (cards.some((c) => !c.imageUrl)) continue;
        if (angle === 'joia' && !cards.some((c) => c.isGem)) continue;
        if (angle === 'novidade' && !cards.some((c) => c.isNew)) continue;
        const known = cards.every((c) => c.priceBRL !== null);
        const totalBRL = known ? Math.round(cards.reduce((a, c) => a + (c.priceBRL ?? 0), 0) * 100) / 100 : null;
        const cap = angle === 'barato' ? config.maxTotalBRL : config.maxTotalAnyBRL;
        if (totalBRL !== null && totalBRL > cap) continue;
        if (angle === 'barato' && totalBRL === null) continue;

        picked.push({...combo, cardNames: cards.map((c) => c.name), angle, cards, totalBRL, fx});
        skip.add(combo.id);
        ok = true;
        log.ok(`[${ANGLE_LABEL[angle]}] ${cards.map((c) => c.name).join(' + ')}${totalBRL !== null ? ` (R$ ${totalBRL.toFixed(2)})` : ''}`);
      } catch (e) {
        log.warn(`Pulando ${combo.cardNames.join(' + ')}: ${(e as Error).message}`);
      }
    }
    if (!ok) log.warn(`Sem candidato aproveitável para ${ANGLE_LABEL[angle]}`);
  }
  return picked;
}
