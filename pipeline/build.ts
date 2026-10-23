// ============================================================
//  MONTAGEM DO JOB — baixa assets, gera narração e monta as props do vídeo
// ============================================================
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {config, today} from './config';
import {download} from './http';
import {log} from './log';
import {fetchCard, type ResearchedCombo} from './research';
import {extenso, roundForSpeech} from './extenso';
import type {Script} from './script';
import {synthesize, ttsLabel} from './tts';
import type {Action, CardInfo, Segment, VideoProps} from '../src/types';

/** pausa entre falas, em segundos (vídeo viral: quase nenhuma) */
const GAP = 0.04;

const SFX_NAMES = ['whoosh', 'slam', 'pop', 'punch', 'tap', 'shimmer', 'boom', 'stack', 'resolve', 'burn', 'toasty', 'kaching', 'ai', 'ui', 'uou'];

/** Memes (public/sfx/memes, baixados da SampleFocus — licença livre para vídeo, sem crédito) */
const MEME_FILES: Record<string, string> = {
  bruh: 'bruh.mp3',
  oof: 'oof.mp3',
  bonk: 'bonk.mp3',
  aughhh: 'aughhh_1.mp3',
  muito_dano: 'now_thats_a_lot_of_damage.mp3',
  oh_my_god: 'oh_my_god.mp3',
  stoopid: 'stoopid.mp3',
  reeee: 'reeee.mp3',
  goofy: 'goofy_ahh_sound_1.mp3',
  bong: 'taco_bell_bong.mp3',
  woo_yeah: 'woo_yeah_baby.mp3',
  based: 'based.mp3',
  stop_the_cap: 'stop_the_cap.mp3',
  you_need_to_leave: 'you_need_to_leave.mp3',
  what_the_dog_doin: 'what_the_dog_doin.mp3',
  squirrel_laugh: 'squirrel_laugh.mp3',
  slap_oh: 'slap_oh.mp3',
};

/** Efeitos sonoros: o seu (public/sfx/meus) tem prioridade sobre o gerado (public/sfx/padrao) */
async function sfxMap(): Promise<Record<string, string>> {
  const pub = path.join(config.paths.root, 'public');
  const map: Record<string, string> = {};
  for (const [id, file] of Object.entries(MEME_FILES)) {
    const own = [`sfx/meus/${id}.mp3`, `sfx/meus/${id}.wav`].find((rel) => fsSync.existsSync(path.join(pub, rel)));
    const rel = own ?? `sfx/memes/${file}`;
    if (fsSync.existsSync(path.join(pub, rel))) map[`meme:${id}`] = rel;
  }
  for (const name of SFX_NAMES) {
    for (const rel of [`sfx/meus/${name}.mp3`, `sfx/meus/${name}.wav`, `sfx/meus/${name}.ogg`, `sfx/padrao/${name}.wav`]) {
      if (await fs.stat(path.join(pub, rel)).then(() => true, () => false)) {
        map[name] = rel;
        break;
      }
    }
  }
  if (!map.boom) log.warn('Efeitos sonoros não encontrados: rode `npm run sfx` uma vez.');
  return map;
}

export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

export type Job = {
  id: string;
  publicDir: string; // public/jobs/<id>
  publicRel: string; // jobs/<id>
  outDir: string; // output/<data>/<slug>
};

export async function createJob(combo: ResearchedCombo, script: Script): Promise<Job> {
  const date = today();
  const slug = slugify(combo.cardNames.join(' ')) || combo.id;
  const id = `${date}_${slug}`;
  const job: Job = {
    id,
    publicDir: path.join(config.paths.publicJobs, id),
    publicRel: `jobs/${id}`,
    outDir: path.join(config.paths.output, date, slug),
  };
  await fs.mkdir(path.join(job.publicDir, 'cards'), {recursive: true});
  await fs.mkdir(path.join(job.publicDir, 'audio'), {recursive: true});
  await fs.mkdir(job.outDir, {recursive: true});
  return job;
}

/**
 * Tempo mínimo de tela por ação (s). Curto de propósito: a voz não pode ficar esperando a animação.
 * O loop precisa de mais tempo para a pilha repetir algumas voltas.
 */
const MIN_ACTION_SECONDS: Partial<Record<Action['type'], number>> = {
  loop: 2.4,
  play: 1.3,
  cast: 1.5,
  tokens: 1.2,
  mana: 1.1,
  damage: 1.2,
  attack: 1.2,
  focus: 1.4,
  win: 1.4,
};

export async function buildProps(job: Job, combo: ResearchedCombo, script: Script): Promise<VideoProps> {
  // 1) imagens das cartas
  const cards: CardInfo[] = [];
  for (const [i, c] of combo.cards.entries()) {
    const img = `cards/${i}.jpg`;
    await download(c.imageUrl, path.join(job.publicDir, img));
    let art: string | undefined;
    if (c.artCropUrl) {
      art = `cards/${i}_art.jpg`;
      await download(c.artCropUrl, path.join(job.publicDir, art));
    }
    cards.push({
      name: c.name,
      image: `${job.publicRel}/${img}`,
      artCrop: art ? `${job.publicRel}/${art}` : undefined,
      artist: c.artist,
      priceBRL: c.priceBRL,
      isNew: c.isNew,
      isGem: c.isGem,
      setName: c.setName,
      colors: c.colorIdentity,
    });
  }
  // carta principal: versão "bonita e cara" para a apresentação (Secret Lair, foil, borderless...)
  const heroName =
    combo.hero ?? combo.cards.find((c) => c.isNew)?.name ?? combo.cards.find((c) => c.isGem)?.name ?? combo.cards[0]?.name;
  const heroSrc = combo.cards.find((c) => c.name === heroName);
  const fancy = heroSrc?.printings?.find((p) => p.id === heroSrc.fancyId);
  const heroCard = cards.find((c) => c.name === heroName);
  if (fancy && heroCard) {
    try {
      const img = 'cards/hero_fancy.jpg';
      await download(fancy.imageUrl, path.join(job.publicDir, img));
      heroCard.fancy = {image: `${job.publicRel}/${img}`, finish: heroSrc!.fancyFinish ?? 'nonfoil', label: fancy.label};
    } catch (e) {
      log.warn(`Versão especial de ${heroName} indisponível: ${(e as Error).message}`);
    }
  }
  log.ok(`Imagens baixadas (${cards.length} cartas${heroCard?.fancy ? `, versão especial: ${heroCard.fancy.label}` : ''})`);

  // 2) fichas que as cartas criam (imagem oficial do Scryfall)
  const tokens: Array<{name: string; image: string}> = [];
  for (const t of combo.cards.flatMap((c) => c.tokens ?? []).filter((t) => t.name !== 'Copy')) {
    if (tokens.some((x) => x.name === t.name)) continue;
    try {
      const img = `cards/token_${tokens.length}.jpg`;
      await download(t.imageUrl, path.join(job.publicDir, img));
      tokens.push({name: t.name, image: `${job.publicRel}/${img}`});
    } catch (e) {
      log.warn(`Ficha "${t.name}" sem imagem: ${(e as Error).message}`);
    }
  }

  // 3) cartas dos cameos ("toasty")
  const lines = segmentsOf(script, combo);
  for (const [i, l] of lines.entries()) {
    if (!l.cameo) continue;
    try {
      const c = await fetchCard(l.cameo.card);
      const img = `cards/cameo_${i}.jpg`;
      await download(c.imageUrl, path.join(job.publicDir, img));
      l.cameo = {...l.cameo, card: c.name, image: `${job.publicRel}/${img}`};
    } catch (e) {
      log.warn(`Cameo "${l.cameo.card}" ignorado: ${(e as Error).message}`);
      delete l.cameo;
    }
  }

  // 3) narração fala a fala (mantém sincronia exata com as cenas e ações)
  const segments: Segment[] = [];
  for (const [i, b] of lines.entries()) {
    const base = `audio/${String(i).padStart(2, '0')}_${b.kind}`;
    const {words, duration, file, trimStart} = await synthesize(b.narration, path.join(job.publicDir, base), {
      previous: lines[i - 1]?.narration,
      next: lines[i + 1]?.narration,
    });
    const min = b.action ? MIN_ACTION_SECONDS[b.action.type] ?? 0 : 0;
    segments.push({
      ...b,
      audioSrc: file ? `${job.publicRel}/audio/${path.basename(file)}` : undefined,
      audioStartFrom: trimStart || undefined,
      durationInSeconds: Math.max(duration + GAP + (b.meme ? 0.6 : 0), min),
      words,
    });
  }
  const total = segments.reduce((a, s) => a + s.durationInSeconds, 0);
  log.ok(`Narração gerada com ${ttsLabel()} (${total.toFixed(1)}s)`);

  return {
    title: script.title,
    angle: combo.angle ?? 'barato',
    cards,
    totalBRL: combo.totalBRL,
    priceFromLiga: combo.priceFromLiga,
    colorIdentity: combo.identity,
    handle: config.handle,
    segments,
    sfx: await sfxMap(),
    tokens,
    hero: heroName,
    brand: {
      name: config.channelName,
      // o render empacota a pasta public/ a cada execução: trocou o PNG, o próximo vídeo já usa o novo
      ...(fsSync.existsSync(path.join(config.paths.brand, 'logo.png')) ? {logo: `brand/logo.png`} : {}),
      ...(fsSync.existsSync(path.join(config.paths.brand, 'icone.png')) ? {icon: `brand/icone.png`} : {}),
    },
  };
}

/** Fala de preço gerada pelo pipeline: sempre com o valor certo, mesmo se você corrigir o preço no painel */
export function priceLine(combo: ResearchedCombo): Pick<Segment, 'onScreen' | 'narration'> | null {
  if (combo.totalBRL === null || combo.totalBRL === undefined) return null;
  const v = roundForSpeech(combo.totalBRL);
  return {
    onScreen: 'Menor da Liga',
    narration: `No menor da Liga, o combo inteiro sai por uns ${extenso(v)} ${v === 1 ? 'real' : 'reais'}.`,
  };
}

type Line = Pick<Segment, 'kind' | 'onScreen' | 'narration' | 'action' | 'cameo' | 'meme' | 'drama'>;

/** Falas do vídeo na ordem, já com o tipo de cena (o preço entra entre o deck e o CTA) */
export function segmentsOf(script: Script, combo?: ResearchedCombo): Line[] {
  const price = combo ? priceLine(combo) : null;
  return [
    {kind: 'hook', ...script.hook},
    ...script.beats.map((b) => ({kind: 'beat' as const, ...b})),
    {kind: 'payoff', ...script.payoff},
    {kind: 'deck', ...script.deck},
    ...(price ? [{kind: 'price' as const, ...price}] : []),
    {kind: 'cta', ...script.cta},
  ];
}

// ------------------------------------------------------------------
// Arquivos de publicação
// ------------------------------------------------------------------
const srtTime = (s: number) => {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const rest = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(sec)},${p(rest, 3)}`;
};

export function buildSrt(props: VideoProps): string {
  let t = 0;
  let n = 1;
  const out: string[] = [];
  for (const seg of props.segments) {
    for (let i = 0; i < seg.words.length; i += 5) {
      const chunk = seg.words.slice(i, i + 5);
      out.push(
        `${n++}\n${srtTime(t + chunk[0].start)} --> ${srtTime(t + chunk[chunk.length - 1].end)}\n${chunk
          .map((w) => w.text)
          .join(' ')}\n`,
      );
    }
    t += seg.durationInSeconds;
  }
  return out.join('\n');
}

export async function writePublishingFiles(job: Job, combo: ResearchedCombo, script: Script, props: VideoProps) {
  await fs.writeFile(path.join(job.outDir, 'props.json'), JSON.stringify(props, null, 2));
  await fs.writeFile(path.join(job.outDir, 'roteiro.json'), JSON.stringify(script, null, 2));
  await fs.writeFile(path.join(job.outDir, 'legendas.srt'), buildSrt(props));

  const p = script.post;
  const md = `# ${script.title}

Combo: ${combo.cardNames.join(' + ')}
Pauta: ${combo.angle}
Fonte: ${combo.source === 'claude' ? 'interação checada pelo Claude (não catalogada no Spellbook)' : combo.url}
${combo.note ? `Observação da pesquisa: ${combo.note}\n` : ''}Total estimado: ${combo.totalBRL !== null ? `R$ ${combo.totalBRL.toFixed(2)}` : '?'} (câmbio ${combo.fx.toFixed(2)})

## YouTube Shorts
**Título:** ${p.youtube.title}

${p.youtube.description}

Tags: ${p.youtube.tags.join(', ')}

## TikTok
${p.tiktok.caption}

## Instagram Reels
${p.instagram.caption}

## Roteiro (narração)
${segmentsOf(script, combo)
  .map((b) => `- **${b.onScreen || b.kind}**${b.action ? ` _(${b.action.type})_` : ''} — ${b.narration}`)
  .join('\n')}
`;
  await fs.writeFile(path.join(job.outDir, 'publicacao.md'), md);
}
