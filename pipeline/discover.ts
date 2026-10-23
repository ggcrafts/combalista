// ============================================================
//  DESCOBERTA — interações inusitadas propostas pelo Claude
//
//  1. O Claude recebe cartas recentes (com texto oficial) e propõe interações curiosas,
//     podendo combinar com cartas antigas.
//  2. Cada ideia é checada:
//       - se o Commander Spellbook já conhece o combo, vale a descrição de lá;
//       - senão, uma segunda passada do Claude confere regra a regra com o texto oficial
//         de TODAS as cartas e descarta o que não funcionar.
//  A revisão humana no painel continua sendo a última barreira.
// ============================================================
import {z} from 'zod';
import {askLLM, extractJson, llmEngine} from './llm';
import {log} from './log';
import {fetchCard, spellbookFor, type Combo} from './research';

const Idea = z.object({
  cartas: z.array(z.string()).min(2).max(3),
  ideia: z.string(),
  passos: z.array(z.string()).min(1).max(6),
  resultado: z.string(),
  porqueInusitado: z.string(),
});

const Verdict = z.object({
  funciona: z.boolean(),
  motivo: z.string(),
  passosCorrigidos: z.array(z.string()).optional(),
  resultado: z.string().optional(),
});

const IDEAS_SYSTEM = `Você é um jogador veterano de Magic: The Gathering (Commander) e caçador de interações improváveis.
Seu trabalho: achar interações DIVERTIDAS e POUCO CONHECIDAS, de preferência envolvendo cartas novas da lista fornecida,
combinadas entre si ou com cartas antigas que você conheça bem.

Prioridades: surpresa > potência. Vale loop infinito, vale jogada absurda que ganha a mesa, vale sinergia que muda a cara do deck.
Evite o óbvio (Thassa's Oracle + Demonic Consultation, Dramatic Reversal + Isochron Scepter e afins).

Regras:
- 2 ou 3 cartas por interação, todas legais em Commander, com o NOME EXATO em inglês.
- Explique em passos curtos e corretos pelas regras atuais. Na dúvida, não proponha.
- Responda APENAS com um array JSON.`;

const CHECK_SYSTEM = `Você é juiz de regras de Magic: The Gathering (nível 2+). Recebe o texto oficial de cada carta
e uma interação proposta. Verifique cada passo SOMENTE com base nos textos oficiais e nas regras atuais.
Desconfie: custos esquecidos, "uma vez por turno", alvos ilegais, gatilhos que não disparam, tokens vs. cartas, limites de mana.
Se funcionar com pequenas correções, corrija os passos. Se depender de algo que não está nas cartas, diga que não funciona.
Responda APENAS com JSON: {"funciona": boolean, "motivo": "...", "passosCorrigidos": ["..."], "resultado": "..."}`;

type Found = Combo & {source: 'spellbook' | 'claude'; note?: string};

const slug = (names: string[]) =>
  'x-' +
  names
    .map((n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
    .sort()
    .join('--');

export async function discoverInteractions(
  pool: Array<{name: string; oracle: string; typeLine: string; manaCost: string; setName: string}>,
  want: number,
): Promise<Found[]> {
  if (!llmEngine()) {
    log.warn('Pauta "inusitado" precisa do Claude (API ou Claude Code). Pulando.');
    return [];
  }
  const list = pool.map((c) => `- ${c.name} (${c.setName}) ${c.manaCost} — ${c.typeLine}\n  ${c.oracle.replace(/\n/g, ' / ')}`).join('\n');
  const prompt = `Cartas recentes:\n${list}\n\nProponha ${want + 2} interações neste formato:
[{"cartas": ["Nome A", "Nome B"], "ideia": "resumo em uma frase", "passos": ["...", "..."], "resultado": "o que acontece no fim", "porqueInusitado": "o que surpreende"}]`;

  log.info('Pedindo ideias de interações ao Claude...');
  let ideas: z.infer<typeof Idea>[] = [];
  try {
    ideas = z.array(Idea).parse(extractJson(await askLLM([{role: 'user', content: prompt}], IDEAS_SYSTEM, 4000)));
  } catch (e) {
    log.warn(`Ideias inválidas: ${(e as Error).message.slice(0, 200)}`);
    return [];
  }

  const out: Found[] = [];
  for (const idea of ideas) {
    if (out.length >= want) break;
    const label = idea.cartas.join(' + ');
    try {
      // nomes reais (o Claude às vezes erra uma vírgula ou um acento)
      const cards = [];
      for (const n of idea.cartas) cards.push(await fetchCard(n));
      const names = cards.map((c) => c.name);
      const identity = [...new Set(cards.flatMap((c) => c.colorIdentity))].sort((a, b) => 'WUBRG'.indexOf(a) - 'WUBRG'.indexOf(b)).join('') || 'C';

      // 1) o Spellbook já conhece? então a descrição de lá é a verdade
      const known = await spellbookFor(names);
      if (known) {
        out.push({...known, source: 'spellbook', note: idea.porqueInusitado});
        log.ok(`Ideia confirmada pelo Spellbook: ${label}`);
        continue;
      }

      // 2) checagem regra a regra com o texto oficial
      const oracle = cards.map((c) => `### ${c.name} ${c.manaCost} — ${c.typeLine}\n${c.oracle}`).join('\n\n');
      const check = Verdict.parse(
        extractJson(
          await askLLM(
            [{role: 'user', content: `Textos oficiais:\n${oracle}\n\nInteração proposta:\n${idea.passos.map((p, i) => `${i + 1}. ${p}`).join('\n')}\nResultado alegado: ${idea.resultado}`}],
            CHECK_SYSTEM,
            1500,
          ),
        ),
      );
      if (!check.funciona) {
        log.warn(`Ideia reprovada na checagem (${label}): ${check.motivo.slice(0, 160)}`);
        continue;
      }
      const steps = check.passosCorrigidos?.length ? check.passosCorrigidos : idea.passos;
      out.push({
        id: slug(names),
        cardNames: names,
        produces: [check.resultado || idea.resultado],
        description: steps.join('\n'),
        easyPrerequisites: '',
        notablePrerequisites: '',
        manaNeeded: '',
        popularity: 0,
        identity,
        url: cards[0].scryfallUri ?? '',
        source: 'claude',
        note: `${idea.porqueInusitado} | Checagem: ${check.motivo}`,
      });
      log.ok(`Ideia aprovada na checagem: ${label}`);
    } catch (e) {
      log.warn(`Ideia descartada (${label}): ${(e as Error).message.slice(0, 160)}`);
    }
  }
  return out;
}
