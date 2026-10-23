// Dados de PRÉ-VISUALIZAÇÃO do Remotion Studio (npm run studio): um roteiro real gerado pelo pipeline,
// com tempos de fala estimados e imagens direto do Scryfall (precisa de internet). O pipeline substitui tudo isso.
import type {Segment, VideoProps} from "./types";

const fakeWords = (text: string, wps = 2.9) => {
  const words = text.split(/\s+/).filter(Boolean);
  return words.map((w, i) => ({text: w, start: i / wps, end: (i + 0.85) / wps}));
};

const seg = (s: Omit<Segment, "words" | "durationInSeconds">): Segment => {
  const words = fakeWords(s.narration);
  return {...s, words, durationInSeconds: (words[words.length - 1]?.end ?? 1) + 0.35};
};

export const sampleProps: VideoProps = {
  title: "Squirrel Girl + Enduring Vitality + Shang-Chi: esquilos infinitos",
  angle: "novidade",
  colorIdentity: "G",
  handle: "@seucanal",
  brand: {name: "CombaLista", logo: "brand/logo.png", icon: "brand/icone.png"},
  totalBRL: 131.32,
  hero: "The Unbeatable Squirrel Girl",
  tokens: [{name: "Squirrel", image: "https://cards.scryfall.io/large/front/f/d/fd0474f3-682d-4c6d-b902-84f3250aa269.jpg?1783902800"}],
  cards: [
    {
      "name": "The Unbeatable Squirrel Girl",
      "image": "https://cards.scryfall.io/large/front/d/8/d8b94ebb-0b3a-4e68-8c0c-3a61ac32f3ef.jpg?1783902911",
      "artCrop": "https://cards.scryfall.io/art_crop/front/d/8/d8b94ebb-0b3a-4e68-8c0c-3a61ac32f3ef.jpg?1783902911",
      "priceBRL": 7.43,
      "isNew": true,
      "isGem": true,
      "setName": "Marvel Super Heroes",
      "colors": ["G"],
      "fancy": {"image": "https://cards.scryfall.io/large/front/e/f/ef518e5b-7942-4e66-aee0-a1c2aa1f9754.jpg?1783902847", "finish": "foil", "label": "Marvel Super Heroes · borderless · inverted · foil"}
    },
    {
      "name": "Enduring Vitality",
      "image": "https://cards.scryfall.io/large/front/9/d/9d76a30c-0431-4334-892a-9822dda9671a.jpg?1783909457",
      "artCrop": "https://cards.scryfall.io/art_crop/front/9/d/9d76a30c-0431-4334-892a-9822dda9671a.jpg?1783909457",
      "priceBRL": 72.1,
      "isNew": false,
      "isGem": false,
      "setName": "Duskmourn: House of Horror"
    },
    {
      "name": "Shang-Chi, Master of Kung Fu",
      "image": "https://cards.scryfall.io/large/front/2/e/2edbb62f-ad45-4422-850b-68dcc18b4c73.jpg?1783902911",
      "artCrop": "https://cards.scryfall.io/art_crop/front/2/e/2edbb62f-ad45-4422-850b-68dcc18b4c73.jpg?1783902911",
      "priceBRL": 51.79,
      "isNew": true,
      "isGem": true,
      "setName": "Marvel Super Heroes"
    }
  ],
  segments: [
    seg({"kind":"hook","onScreen":"Esquilos infinitos em mono verde","narration":"Um esquilo da Marvel acabou de aprender a lotar a mesa até o servidor pedir demissão."}),
    seg({"kind":"beat","onScreen":"The Unbeatable Squirrel Girl","narration":"The Unbeatable Squirrel Girl cria esquilos ao entrar e ao atacar. Pagando um mais três verdes, cria tantos quanto você tem.","action":{"type":"focus","card":"The Unbeatable Squirrel Girl","text":"Paga {1}{G}{G}{G}: cria tantos Esquilos quanto você controla"}}),
    seg({"kind":"beat","onScreen":"Toda criatura vira mana","narration":"Enduring Vitality faz todas as suas criaturas virarem fonte de mana.","action":{"type":"focus","card":"Enduring Vitality","text":"Suas criaturas viram: {T}: mana de qualquer cor"}}),
    seg({"kind":"beat","onScreen":"Rapidez para habilidades","narration":"Shang-Chi deixa criaturas usarem habilidades como se tivessem rapidez. Esquilo novo já trabalha.","action":{"type":"focus","card":"Shang-Chi, Master of Kung Fu","text":"Habilidades de criaturas sem enjoo de invocação"}}),
    seg({"kind":"beat","onScreen":"","narration":"Com quatro esquilos na mesa, ativa a Squirrel Girl. A turma dobra.","action":{"type":"tokens","amount":4,"card":"The Unbeatable Squirrel Girl","label":"Squirrel"}}),
    seg({"kind":"beat","onScreen":"Vira quatro, paga tudo","narration":"Vira quatro esquilos: o mana da ativação volta inteirinho.","action":{"type":"mana","amount":4,"color":"G"}}),
    seg({"kind":"beat","drama":true,"onScreen":"Repete","narration":"Repete. E repete.","action":{"type":"loop","cards":["The Unbeatable Squirrel Girl","Enduring Vitality"]}}),
    seg({"kind":"payoff","onScreen":"Esquilos e mana infinitos","narration":"Esquilos infinitos, mana infinito, gatilhos infinitos. Seus oponentes vão precisar de terapia em grupo e dedetizador."}),
    seg({"kind":"deck","onScreen":"Mono verde de fichas","narration":"Mono verde de fichas. Com Chatterfang no comando, dá pra montar um deck inteiro de esquilos.","cameo":{"card":"Chatterfang, Squirrel General","quip":"Chamou?","image":"https://cards.scryfall.io/large/front/1/7/1785cf85-1ac0-4246-9b89-1a8221a8e1b2.jpg?1783926835"}}),
    seg({"kind":"price","onScreen":"Menor da Liga","narration":"No menor da Liga, o combo inteiro sai por uns cento e trinta reais."}),
    seg({"kind":"cta","onScreen":"Quantos esquilos na sua pool?","narration":"Comenta aí quantos esquilos você já tem na pool."}),
  ],
};
