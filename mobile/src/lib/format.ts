/** Números no formato brasileiro (1.234). */
export const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Sempre com uma casa, como no web: "72,4", "4,0". */
export const fmtOneDecimal = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("") || "?";

export const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** "Sábado, 12 de setembro" para o cabeçalho de Hoje. */
export function todayLabel(date: string) {
  return capitalize(
    new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
  );
}
