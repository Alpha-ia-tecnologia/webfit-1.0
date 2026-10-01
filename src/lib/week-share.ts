/**
 * Conteúdo compartilhável de "Sua semana" (EVOL-05): a imagem opcional do web e o texto do app.
 * Lista fechada de blocos seguros (registros, água, combinados, refeições) e conquistas sem
 * pesagens: nunca peso, calorias, proteína, medicação, humor ou sono. Criado no aparelho.
 */
import { recordsWin, type RecapTileKey, type WeekRecap } from "./week-recap";

/** Blocos que podem sair do aparelho, nesta ordem. */
export const SHARE_TILE_KEYS: readonly RecapTileKey[] = ["registros", "agua", "combinados", "refeicoes"];

const SHARE_TITLE = "Minha semana no WebFit";
const SHARE_FOOTER = "Gerado no meu aparelho pelo WebFit.";

export interface WeekShare {
  /** "webfit-semana-2026-09-21.png". */
  fileName: string;
  title: typeof SHARE_TITLE;
  range: string;
  tiles: { label: string; value: string; detail: string | null }[];
  winsTitle: string;
  wins: string[];
  footer: typeof SHARE_FOOTER;
  /** Texto do compartilhamento (linhas unidas por "\n"). */
  text: string;
  /** Texto alternativo da imagem. */
  alt: string;
}

/** Blocos de recap.candidates na ordem de SHARE_TILE_KEYS; conquistas sem "pesagens". */
export function weekShare(recap: WeekRecap): WeekShare {
  const tiles = SHARE_TILE_KEYS.flatMap((key) => recap.candidates.filter((t) => t.key === key));
  const safeWins = recap.wins.filter((w) => w.key !== "pesagens");
  const wins = (safeWins.length ? safeWins : [recordsWin(recap.recordDays)]).map((w) => w.text);
  const winsTitle = recap.slides.wins.title;
  const range = recap.week.label;
  const arias = tiles.map((t) => t.aria);
  return {
    fileName: `webfit-semana-${recap.week.start}.png`,
    title: SHARE_TITLE,
    range,
    tiles: tiles.map(({ label, value, detail }) => ({ label, value, detail })),
    winsTitle,
    wins,
    footer: SHARE_FOOTER,
    text: [
      `${SHARE_TITLE} (${range})`,
      ...arias.map((aria) => `• ${aria}`),
      `${winsTitle}:`,
      ...wins.map((win) => `• ${win}`),
      SHARE_FOOTER,
    ].join("\n"),
    alt: `${SHARE_TITLE}, ${range}: ${arias.join("; ")}. ${winsTitle}: ${wins.join("; ")}.`,
  };
}
