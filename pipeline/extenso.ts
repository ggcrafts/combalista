// Número por extenso em português (0 a 999.999) — a narração não pode ter algarismos.
const UNI = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n: number): string {
  if (n < 20) return UNI[n];
  if (n < 100) return DEZ[Math.floor(n / 10)] + (n % 10 ? ` e ${UNI[n % 10]}` : '');
  if (n === 100) return 'cem';
  return CEM[Math.floor(n / 100)] + (n % 100 ? ` e ${ate999(n % 100)}` : '');
}

export function extenso(n: number): string {
  n = Math.round(Math.abs(n));
  if (n < 1000) return ate999(n);
  const mil = Math.floor(n / 1000);
  const resto = n % 1000;
  const milStr = mil === 1 ? 'mil' : `${ate999(mil)} mil`;
  if (!resto) return milStr;
  // "mil e duzentos", mas "mil duzentos e trinta"
  return `${milStr}${resto < 100 || resto % 100 === 0 ? ' e ' : ' '}${ate999(resto)}`;
}

/** Valor "falável": arredonda como gente fala ("uns trinta e cinco", "uns cento e trinta") */
export function roundForSpeech(v: number): number {
  if (v < 20) return Math.max(1, Math.round(v));
  if (v < 100) return Math.round(v / 5) * 5;
  if (v < 1000) return Math.round(v / 10) * 10;
  return Math.round(v / 50) * 50;
}
