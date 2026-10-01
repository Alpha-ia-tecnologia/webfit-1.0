/**
 * Efeitos percebidos e "Como ficou?" (SERINGA-07): rótulos, edição da lista de efeitos, conjunto de
 * respostas por perfil e a grade "Seu ciclo" (efeitos por dia desde a aplicação). Tudo descreve o que
 * a pessoa registrou: nenhuma interpretação, nenhuma comparação entre doses, nenhum conselho de dose.
 * Compartilhado pelo web e pelo app (sem DOM). ./domain não importa este módulo.
 */
import {
  SATIETY_KEYS,
  SYMPTOM_KEYS,
  SYMPTOMS_MAX,
  type AppState,
  type DiaryEntry,
  type InjectionEntry,
  type Profile,
  type SatietyKey,
  type Symptom,
  type SymptomKey,
} from "../types";
import { shiftDate } from "./dates";
import { plural } from "./format";
import { daysBetween, fmtMg, penIntervalDays, sortInjections } from "./injection";
import { doseStepKey, isMinorOn, tracksDoseSchedule } from "./treatment";
import { WELLBEING_TAGS } from "./wellbeing";

export const SYMPTOM_LABELS: Record<SymptomKey, string> = {
  nausea: "Náusea",
  vomito: "Vômito",
  azia: "Azia ou refluxo",
  intestino_preso: "Intestino preso",
  diarreia: "Diarreia",
  dor_barriga: "Dor na barriga",
  cansaco: "Cansaço",
  dor_cabeca: "Dor de cabeça",
  tontura: "Tontura",
  reacao_local: "Reação no local",
};
/** Índice = intensidade − 1. */
export const INTENSITY_LABELS = ["Leve", "Moderada", "Forte"] as const;
/** Nota neutra quando algum efeito é marcado como forte: sem dose, sem medicamento, sem "pare". */
export const STRONG_NOTICE = {
  title: "Efeito forte",
  text: "Se estiver difícil comer ou beber, ou se não melhorar, converse com quem acompanha seu tratamento. Dor forte na barriga que não passa ou vômitos repetidos pedem atendimento presencial.",
} as const;
/** Marcadores do bem-estar que repetem um efeito: somem quando os efeitos aparecem (um só botão "Náusea"). */
export const SYMPTOM_TAG_OVERLAP = ["Náusea", "Cansaço", "Dor de cabeça", "Intestino preso"] as const;

const MAX_INTENSITY = 3;
const intensityLabel = (intensity: number) =>
  INTENSITY_LABELS[Math.min(MAX_INTENSITY, Math.max(1, Math.round(intensity))) - 1];

/** Liga (intensidade 1) ou desliga; com 6 ligados devolve uma cópia igual. Sempre um array novo. */
export function toggleSymptom(list: readonly Symptom[], key: SymptomKey): Symptom[] {
  if (list.some((s) => s.key === key)) return list.filter((s) => s.key !== key);
  return list.length >= SYMPTOMS_MAX ? [...list] : [...list, { key, intensity: 1 }];
}

/** Troca a intensidade de um efeito já ligado; os demais ficam (mesmas referências). */
export function setIntensity(
  list: readonly Symptom[],
  key: SymptomKey,
  intensity: 1 | 2 | 3,
): Symptom[] {
  return list.map((s) => (s.key === key ? { ...s, intensity } : s));
}

export const hasStrong = (list: readonly Symptom[]): boolean =>
  list.some((s) => s.intensity === MAX_INTENSITY);

/** "Náusea, intensidade forte". */
export function symptomText(s: Symptom): string {
  return `${SYMPTOM_LABELS[s.key]}, intensidade ${intensityLabel(s.intensity).toLowerCase()}`;
}

/** Marcadores visíveis: sem os sobrepostos quando os efeitos aparecem, exceto os já marcados; ordem de WELLBEING_TAGS. */
export function visibleTags(showsSymptoms: boolean, selected: readonly string[]): string[] {
  const overlap: readonly string[] = SYMPTOM_TAG_OVERLAP;
  return WELLBEING_TAGS.filter(
    (tag) => !showsSymptoms || !overlap.includes(tag) || selected.includes(tag),
  );
}

export const SATIETY_LABELS: Record<SatietyKey, string> = {
  ainda_fome: "Ainda com fome",
  na_medida: "Na medida",
  rapida: "Saciou rápido",
  pouca_fome: "Pouca fome",
  desconforto: "Desconforto",
};
/** Textos de "Como ficou?" iguais no web e no app (linha do Diário, folha e avisos). */
export const SATIETY_COPY = {
  title: "Como ficou?",
  clear: "Limpar resposta",
  /** Chip da resposta dada (o nome acessível começa por ele). */
  chip: (key: SatietyKey): string => `Como ficou: ${SATIETY_LABELS[key]}`,
  /** "Como ficou? Almoço das 12:00". */
  askLabel: (meal: string): string => `Como ficou? ${meal}`,
  chipLabel: (key: SatietyKey, meal: string): string =>
    `Como ficou: ${SATIETY_LABELS[key]}. Alterar, ${meal}`,
  saved: (key: SatietyKey): string => `Anotado: ${SATIETY_LABELS[key]}.`,
  removed: "Resposta removida.",
  undone: "Resposta desfeita.",
} as const;

/** Sem "Pouca fome" e "Saciou rápido": nada que elogie restrição. */
const REDUCED_SATIETY: readonly SatietyKey[] = ["ainda_fome", "na_medida", "desconforto"];

/** Conjunto reduzido para transtorno alimentar ≠ "nao" (inclui "nao_informado") ou menor de 18. */
export function satietyOptions(
  p: Pick<Profile, "eatingDisorder" | "birthDate">,
  today: string,
): SatietyKey[] {
  const isReduced = p.eatingDisorder !== "nao" || isMinorOn(p.birthDate, today);
  return [...(isReduced ? REDUCED_SATIETY : SATIETY_KEYS)];
}

/** Só refeição e data em [today−1, today], sem resposta. */
export function asksSatiety(e: DiaryEntry, today: string): boolean {
  return (
    e.type === "refeicao" &&
    !e.satiety &&
    e.date <= today &&
    e.date >= shiftDate(today, -1)
  );
}

/** Novo estado com a resposta (null remove a chave) e updatedAt = nowIso; id que não é refeição → o mesmo objeto de estado. */
export function setMealSatiety(
  state: AppState,
  id: string,
  satiety: SatietyKey | null,
  nowIso: string,
): AppState {
  const target = state.diary.find((e) => e.id === id);
  if (!target || target.type !== "refeicao") return state;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- tira a resposta antiga do objeto; só o resto importa
  const { satiety: _previous, ...rest } = target;
  const updated: DiaryEntry =
    satiety === null ? { ...rest, updatedAt: nowIso } : { ...rest, satiety, updatedAt: nowIso };
  return { ...state, diary: state.diary.map((e) => (e === target ? updated : e)) };
}

/* "Seu ciclo" (Evolução): efeitos registrados por dia desde a aplicação que governa o registro. */
export const CYCLE_GRID_DAYS = 7;
export const CYCLE_GRID_WINDOW = 56;
const WEEKLY_DAYS = 7;

type Governing = { day: number; app: InjectionEntry };
/** A última aplicação de `past` (já ordenada, data ≤ today) com data ≤ `date`. */
function governing(past: readonly InjectionEntry[], date: string): Governing | null {
  const app = past.filter((e) => e.date <= date).at(-1);
  return app ? { day: daysBetween(app.date, date), app } : null;
}

/** Aplicação que governa um dia: a última com data ≤ `date` (entre as de data ≤ today); D = daysBetween(app.date, date). null sem aplicação.
 *  Usado pela grade e pelo ranking das dicas (cycle-tips.ts). */
export function cycleDayOf(
  injections: readonly InjectionEntry[],
  date: string,
  today: string,
): Governing | null {
  return governing(sortInjections(injections.filter((e) => e.date <= today)), date);
}

/** "no dia da aplicação", "1 dia depois", "3 dias depois" (cabeçalho acessível da grade). */
export function cycleDayPhrase(day: number): string {
  if (day === 0) return "no dia da aplicação";
  return day === 1 ? "1 dia depois" : `${day} dias depois`;
}

export interface CycleGridCell {
  day: number;
  count: number;
  maxIntensity: 0 | 1 | 2 | 3;
  level: 0 | 1 | 2 | 3;
  aria: string;
}
export interface CycleGridRow {
  key: SymptomKey;
  label: string;
  total: number;
  cells: CycleGridCell[];
}
export interface CycleGridModel {
  rows: CycleGridRow[];
  steps: { key: string; label: string }[];
  records: number;
  outside: number;
  caption: string;
  /** Nenhuma linha para desenhar (sem registros ou todos fora dos dias 0 a 6): mostra o texto vazio. */
  isEmpty: boolean;
}

/** Dias distintos e maior intensidade de um efeito em um dia do ciclo; chave `${efeito}|${D}`. */
interface CellTally {
  dates: ReadonlySet<string>;
  maxIntensity: number;
}
const tallyKey = (key: SymptomKey, day: number) => `${key}|${day}`;
const toLevel = (n: number) => Math.min(MAX_INTENSITY, Math.max(0, n)) as 0 | 1 | 2 | 3;

function gridRow(key: SymptomKey, tallies: ReadonlyMap<string, CellTally>): CycleGridRow {
  const label = SYMPTOM_LABELS[key];
  const cells = Array.from({ length: CYCLE_GRID_DAYS }, (_, day): CycleGridCell => {
    const tally = tallies.get(tallyKey(key, day));
    const count = tally?.dates.size ?? 0;
    const maxIntensity = toLevel(tally?.maxIntensity ?? 0);
    const days = count ? plural(count, "dia", "dias") : "nenhum registro";
    return {
      day,
      count,
      maxIntensity,
      level: toLevel(count),
      aria: `${label}, ${cycleDayPhrase(day)}: ${days}${maxIntensity === MAX_INTENSITY ? ", com registro forte" : ""}`,
    };
  });
  return { key, label, total: cells.reduce((sum, c) => sum + c.count, 0), cells };
}

/** Degraus das aplicações que governam registros, do mais recente ao mais antigo (label da aplicação mais recente). */
function gridSteps(apps: readonly InjectionEntry[]): { key: string; label: string }[] {
  const seen = new Set<string>();
  return sortInjections(apps)
    .reverse()
    .flatMap((app) => {
      const key = doseStepKey(app);
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ key, label: fmtMg(app.doseMg) }];
    });
}

/** Entradas de bem-estar com efeitos em [shiftDate(today,−55), today]; aplicação que governa = última com data ≤ a do registro
 *  (sortInjections, data ≤ today); D = daysBetween; D fora de 0–6 ou sem aplicação → outside. count = dias distintos por (efeito, D).
 *  level = min(3, count). Linhas com total ≥ 1, por total desc e depois ordem de SYMPTOM_KEYS. steps = degraus (doseStepKey,
 *  label fmtMg) das aplicações que governam registros, do mais recente ao mais antigo. Com `step`, só registros desse degrau
 *  (os sem aplicação saem de records e outside); um `step` que não está em steps vale como todas as doses. */
export function cycleGrid(
  diary: readonly DiaryEntry[],
  injections: readonly InjectionEntry[],
  today: string,
  step?: string | null,
): CycleGridModel {
  const from = shiftDate(today, -(CYCLE_GRID_WINDOW - 1));
  const past = sortInjections(injections.filter((e) => e.date <= today));
  const logged = diary
    .filter((e) => e.type === "bem_estar" && e.symptoms?.length && e.date >= from && e.date <= today)
    .map((entry) => ({ entry, gov: governing(past, entry.date) }));
  const steps = gridSteps(logged.flatMap(({ gov }) => (gov ? [gov.app] : [])));
  const chosen = steps.find((s) => s.key === step) ?? null;
  const tallies = new Map<string, CellTally>();
  let records = 0;
  let outside = 0;
  for (const { entry, gov } of logged) {
    if (chosen && (!gov || doseStepKey(gov.app) !== chosen.key)) continue;
    records += 1;
    if (!gov || gov.day >= CYCLE_GRID_DAYS) {
      outside += 1;
      continue;
    }
    for (const s of entry.symptoms ?? []) {
      const id = tallyKey(s.key, gov.day);
      const tally = tallies.get(id);
      tallies.set(id, {
        dates: new Set([...(tally?.dates ?? []), entry.date]),
        maxIntensity: Math.max(tally?.maxIntensity ?? 0, s.intensity),
      });
    }
  }
  // sort é estável: empates ficam na ordem de SYMPTOM_KEYS.
  const rows = SYMPTOM_KEYS.map((key) => gridRow(key, tallies))
    .filter((row) => row.total >= 1)
    .sort((a, b) => b.total - a.total);
  const counted = plural(records, "registro com efeitos", "registros com efeitos");
  const caption = chosen
    ? `Últimas 8 semanas, dose ${chosen.label}: ${counted}.`
    : `Últimas 8 semanas: ${counted}${outside ? `, ${outside} fora dos dias 0 a 6` : ""}.`;
  return { rows, steps, records, outside, caption, isEmpty: rows.length === 0 };
}

/** A grade só aparece com acompanhamento de dose (caneta "sim", gestação "nao"), aplicação semanal e
 *  alguma aplicação nas últimas 8 semanas; nunca em gestação, amamentação ou sem resposta. */
export function showsCycleGrid(
  p: Pick<Profile, "weightLossPen" | "pregnancy" | "weightLossPenPerMonth">,
  injections: readonly InjectionEntry[],
  today: string,
): boolean {
  if (!tracksDoseSchedule(p) || p.weightLossPenPerMonth == null) return false;
  if (penIntervalDays(p.weightLossPenPerMonth) !== WEEKLY_DAYS) return false;
  const from = shiftDate(today, -(CYCLE_GRID_WINDOW - 1));
  return injections.some((e) => e.date >= from && e.date <= today);
}
