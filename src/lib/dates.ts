/**
 * Datas locais (AAAA-MM-DD e HH:MM). Módulo folha, sem imports: libs que o domain.ts importa
 * (injeção, tratamento) usam estas funções sem criar ciclo domain → … → domain.
 */
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function localTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

/** Dias da semana na ordem de Date.getDay() (0 = domingo … 6 = sábado). */
export const WEEKDAYS = [
  { value: 0, label: "Domingo", short: "D", plural: "domingos" },
  { value: 1, label: "Segunda-feira", short: "S", plural: "segundas" },
  { value: 2, label: "Terça-feira", short: "T", plural: "terças" },
  { value: 3, label: "Quarta-feira", short: "Q", plural: "quartas" },
  { value: 4, label: "Quinta-feira", short: "Q", plural: "quintas" },
  { value: 5, label: "Sexta-feira", short: "S", plural: "sextas" },
  { value: 6, label: "Sábado", short: "S", plural: "sábados" },
] as const;
/** Dia da semana (0–6) de uma data AAAA-MM-DD, ao meio-dia local para não trocar de dia no fuso. */
export const weekdayOf = (date: string) =>
  new Date(`${date}T12:00:00`).getDay();
