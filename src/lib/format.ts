/** Formatação única de números e unidades em pt-BR, compartilhada entre web e app nativo. */

const MINUS = "−";

/** Arredonda sem produzir "-0", que o Intl exibe como "-0". */
function roundTo(n: number, digits: number): number {
  const factor = 10 ** digits;
  const value = Math.round(n * factor) / factor;
  return Object.is(value, -0) ? 0 : value;
}

/** "1.645", "72,4": até `digits` casas decimais, sem zeros à direita. */
export function fmtNumber(n: number, digits = 0): string {
  return roundTo(n, digits).toLocaleString("pt-BR", {
    maximumFractionDigits: digits,
  });
}

export const fmtKg = (kg: number) => `${fmtNumber(kg, 1)} kg`;
export const fmtKcal = (kcal: number) => `${fmtNumber(kcal)} kcal`;
export const fmtMl = (ml: number) => `${fmtNumber(ml)} ml`;
/** Volume em litros a partir de ml: "1,75 L". */
export const fmtLiters = (ml: number) => `${fmtNumber(ml / 1000, 2)} L`;
export const fmtPct = (pct: number) => `${fmtNumber(pct)}%`;
/** Água na unidade que se lê melhor: "750 ml" abaixo de 1 L, "1,75 L" a partir dele. */
export const fmtWater = (ml: number) => (Math.abs(ml) < 1000 ? fmtMl(ml) : fmtLiters(ml));

/** Faixa com travessão e a unidade uma vez só: "1,6–2,2 g/kg"; limites iguais viram um número. */
export function fmtRange(min: number, max: number, unit: string, digits = 1): string {
  const low = fmtNumber(Math.min(min, max), digits);
  const high = fmtNumber(Math.max(min, max), digits);
  return `${low === high ? low : `${low}–${high}`} ${unit}`;
}

/** IMC com uma casa decimal; "—" quando a altura não permite o cálculo. */
export function fmtBmi(weightKg: number, heightCm: number): string {
  if (!(heightCm > 0) || !(weightKg > 0)) return "—";
  return fmtNumber(weightKg / (heightCm / 100) ** 2, 1);
}

/** Variação com sinal: "−4 kg", "+0,5 kg"; o zero fica sem sinal. */
export function fmtDelta(n: number, unit: string, digits = 1): string {
  const value = roundTo(n, digits);
  const sign = value > 0 ? "+" : value < 0 ? MINUS : "";
  return `${sign}${fmtNumber(Math.abs(value), digits)} ${unit}`;
}

/** "1 medição", "3 medições". */
export function plural(n: number, singular: string, pluralForm: string): string {
  return `${fmtNumber(n)} ${n === 1 ? singular : pluralForm}`;
}

const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Distância entre datas (YYYY-MM-DD) em linguagem de app: "hoje", "ontem", "em 5 dias". */
export function fmtRelDate(date: string, today: string): string {
  const diff = Math.round(dayNumber(date) - dayNumber(today));
  if (diff === 0) return "hoje";
  if (diff === -1) return "ontem";
  if (diff === 1) return "amanhã";
  return diff < 0 ? `há ${-diff} dias` : `em ${diff} dias`;
}

/** Validade em linguagem de app: "vence hoje", "vence em 3 dias", "venceu ontem", "venceu há 4 dias". */
export function fmtExpiry(date: string, today: string): string {
  const diff = Math.round(dayNumber(date) - dayNumber(today));
  if (diff === 0) return "vence hoje";
  if (diff === 1) return "vence amanhã";
  if (diff > 1) return `vence em ${diff} dias`;
  return diff === -1 ? "venceu ontem" : `venceu há ${-diff} dias`;
}

/** "Qui, 24 set": data curta para cabeçalhos, sem pontos de abreviação. */
export function fmtShortDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  const part = (options: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("pt-BR", options).replace(".", "");
  const weekday = part({ weekday: "short" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${d.getDate()} ${part({ month: "short" })}`;
}

/** "15/06/1992" a partir de AAAA-MM-DD, sem Intl (igual no Hermes); outro formato volta como veio. */
export function fmtDateBr(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

/** "8 set": dia e mês curtos, sem ponto (mesma regra de fmtShortDate). */
export function fmtDayMonth(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${d.getDate()} ${d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}`;
}

/** Tempo até algo: "agora", "em 25 min", "em 2 h", "em 1 h 20 min". */
export function fmtUntil(minutes: number): string {
  const total = Math.round(minutes);
  if (total <= 0) return "agora";
  if (total < 60) return `em ${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `em ${hours} h` : `em ${hours} h ${rest} min`;
}
