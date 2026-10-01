/**
 * "Sua semana" (EVOL-05 + SIS-13): resumo da última semana completa (segunda a domingo) para o
 * cartão do Hoje (só às segundas), a entrada permanente na Evolução e os stories de 5 partes.
 * Mostra só registros e conquistas gentis: nunca calorias, proteína ou medicação; peso só fora do
 * perfil calmo e sem hideBodyNumbers. Sem dias seguidos, sem comparação com outras semanas e sem
 * cartão com menos de 2 dias com registro. Compartilhado pelo web e pelo app.
 */
import type { AppState, HabitItem, Measurement, Profile } from "../types";
import { MONTHS_PT } from "../components/anamnese/inputs";
import { dayLabels } from "../components/evolucao/chart-geometry";
import { consistencyModel, type ConsistencyDay, type ConsistencyModel } from "./consistency";
import { shiftDate, weekdayOf } from "./dates";
import { MOOD_LABELS } from "./day";
import { dailyTargets, totalsFor } from "./domain";
import { dayBars, weightTrend, type DayPoint } from "./evolution";
import { fmtDayMonth, fmtDelta, fmtMl, fmtNumber, plural } from "./format";
import { isCalmProfile } from "./space";
import { wellbeingTrend, type MoodLevel, type WellbeingTrend } from "./wellbeing-trend";

export const RECAP_MIN_DAYS = 2;
export const RECAP_MAX_TILES = 4;
export const RECAP_MAX_WINS = 4;
export const RECAP_MAX_HABITS = 5;
/** Duração de cada parte dos stories com avanço automático. */
export const STORY_SLIDE_MS = 6000;
/** Chave local do aparelho (fora do AppState): início da semana cujo cartão foi dispensado. */
export const RECAP_DISMISS_KEY = "webfit-week-recap-dismissed";

const WEEK_DAYS = 7;
const MONDAY = 1;
/** Refeições ou água em pelo menos 3 dias viram conquista. */
const WIN_MIN_DAYS = 3;
/** Humor registrado em pelo menos 2 dias vira conquista. */
const WIN_MIN_MOOD_DAYS = 2;

export interface RecapWeek {
  start: string;
  end: string;
  dates: string[];
  /** "21 a 27 set" | "28 set a 4 out". */
  label: string;
  /** "21 a 27 de setembro" | "28 de setembro a 4 de outubro". */
  aria: string;
}

const dayOf = (date: string) => String(Number(date.slice(8, 10)));
const monthOf = (date: string) => MONTHS_PT[Number(date.slice(5, 7)) - 1] ?? "";

/** Semana completa anterior à atual: segunda = hoje − ((dia + 6) % 7); início = segunda − 7. */
export function lastCompleteWeek(today: string): RecapWeek {
  const monday = shiftDate(today, -((weekdayOf(today) + WEEK_DAYS - 1) % WEEK_DAYS));
  const start = shiftDate(monday, -WEEK_DAYS);
  const dates = Array.from({ length: WEEK_DAYS }, (_, i) => shiftDate(start, i));
  const end = dates[dates.length - 1]!;
  const oneMonth = start.slice(0, 7) === end.slice(0, 7);
  return {
    start,
    end,
    dates,
    label: `${oneMonth ? dayOf(start) : fmtDayMonth(start)} a ${fmtDayMonth(end)}`,
    aria: oneMonth
      ? `${dayOf(start)} a ${dayOf(end)} de ${monthOf(end)}`
      : `${dayOf(start)} de ${monthOf(start)} a ${dayOf(end)} de ${monthOf(end)}`,
  };
}

/** O cartão do Hoje só aparece às segundas. */
export const isRecapDay = (today: string): boolean => weekdayOf(today) === MONDAY;

export interface RecapPrivacy {
  calm: boolean;
  hideBodyNumbers: boolean;
  fluidRestriction: boolean;
}

/**
 * hideBodyNumbers lido sem depender do campo (O4-L4 ESPACO-13):
 * "hideBodyNumbers" in p && (p as { hideBodyNumbers?: unknown }).hideBodyNumbers === true
 */
export function recapPrivacy(profile: Profile, today: string): RecapPrivacy {
  return {
    calm: isCalmProfile(profile, today),
    hideBodyNumbers:
      "hideBodyNumbers" in profile &&
      (profile as { hideBodyNumbers?: unknown }).hideBodyNumbers === true,
    fluidRestriction: profile.fluidRestriction === "sim",
  };
}

export type RecapTileKey = "registros" | "peso" | "agua" | "bem_estar" | "combinados" | "refeicoes";
export interface RecapTile {
  key: RecapTileKey;
  label: string;
  value: string;
  detail: string | null;
  aria: string;
  tone: "habit" | "body" | "water" | "mind" | "food";
  /** Rosto do humor médio (só no bloco de bem-estar). */
  face: MoodLevel | null;
}
export type RecapWinKey =
  | "refeicoes"
  | "agua"
  | "meta_agua"
  | "combinados"
  | "bem_estar"
  | "pesagens"
  | "registros";
export interface RecapWin {
  key: RecapWinKey;
  text: string;
}
export interface RecapWeight {
  /** "73,0 kg" (sempre uma casa). */
  value: string;
  /** "−0,7 kg na semana"; null sem pesagem antes da semana. */
  delta: string | null;
  aria: string;
}
export interface RecapSlides {
  cover: { range: string; lead: string; days: ConsistencyDay[]; weekdays: string[] };
  routine: {
    water: { average: string; caption: string; points: DayPoint[]; aria: string } | null;
    meals: string | null;
    empty: string | null;
  };
  wellbeing: { trend: WellbeingTrend; empty: string | null };
  habits: {
    title: "Combinados" | "Combinados e peso";
    summary: string | null;
    items: { id: string; title: string; text: string }[];
    more: number;
    weight: RecapWeight | null;
    empty: string | null;
  };
  wins: { title: "Conquistas gentis" | "Sua semana em registros"; items: RecapWin[] };
}
export interface WeekRecap {
  week: RecapWeek;
  privacy: RecapPrivacy;
  recordDays: number;
  /** Todos os blocos disponíveis, na ordem de prioridade. */
  candidates: RecapTile[];
  /** Os primeiros RECAP_MAX_TILES candidatos (2 a 4). */
  tiles: RecapTile[];
  wins: RecapWin[];
  slides: RecapSlides;
}

/** Fatos da semana já filtrados pela privacidade (peso nem é calculado para perfil calmo). */
interface WeekFacts {
  consistency: ConsistencyModel;
  water: { points: DayPoint[]; days: number; average: number | null; goalDays: number };
  meals: { count: number; days: number };
  weight: RecapWeight | null;
  weighIns: number;
  wellbeing: WellbeingTrend;
}

/** Sempre com uma casa: "73,0 kg" (como o cartão da jornada). */
const kg1 = (n: number) =>
  `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
/** Mililitros em litros com uma casa: "1,8 L". */
const liters = (ml: number) => `${fmtNumber(ml / 1000, 1)} L`;
const days = (n: number) => plural(n, "dia", "dias");
/** "6 de 11 combinados cumpridos". */
const habitsText = (c: ConsistencyModel) =>
  `${c.habitsDone} de ${plural(c.habitsPossible, "combinado cumprido", "combinados cumpridos")}`;
/** "6 refeições registradas em 5 dias". */
const mealsText = (m: WeekFacts["meals"]) =>
  `${plural(m.count, "refeição registrada", "refeições registradas")} em ${days(m.days)}`;

function waterFacts(state: AppState, week: RecapWeek, privacy: RecapPrivacy, today: string) {
  const labels = dayLabels(week.dates);
  // Com restrição hídrica não há meta de água (a quantidade é do profissional).
  const points = week.dates.map(
    (date, i): DayPoint => ({
      date,
      label: labels[i] ?? "",
      value: totalsFor(state.diary, date).water,
      goal: privacy.fluidRestriction ? null : dailyTargets(state, date).water,
    }),
  );
  return {
    points,
    days: points.filter((p) => p.value > 0).length,
    average: dayBars(points, today).average,
    goalDays: points.filter((p) => p.goal !== null && p.goal > 0 && p.value >= p.goal).length,
  };
}

/** Tendência na última pesagem da semana e variação desde a última pesagem anterior a ela. */
function weightFacts(measurements: readonly Measurement[], week: RecapWeek) {
  const trend = weightTrend(measurements);
  const inWeek = trend.filter((p) => p.date >= week.start && p.date <= week.end);
  const last = inWeek.at(-1);
  if (!last) return { weight: null, weighIns: 0 };
  const before = trend.filter((p) => p.date < week.start).at(-1);
  const value = kg1(last.trend);
  const delta = before ? `${fmtDelta(last.trend - before.trend, "kg")} na semana` : null;
  return {
    weight: { value, delta, aria: `Peso de tendência ${value}${delta ? `, ${delta}` : ""}` },
    weighIns: inWeek.length,
  };
}

function weekFacts(state: AppState, week: RecapWeek, privacy: RecapPrivacy, today: string): WeekFacts {
  const meals = state.diary.filter(
    (e) => e.type === "refeicao" && e.date >= week.start && e.date <= week.end,
  );
  const body = !privacy.calm && !privacy.hideBodyNumbers;
  return {
    consistency: consistencyModel(state, week.dates, today),
    water: waterFacts(state, week, privacy, today),
    meals: { count: meals.length, days: new Set(meals.map((e) => e.date)).size },
    ...(body ? weightFacts(state.measurements, week) : { weight: null, weighIns: 0 }),
    // A semana resumida já passou: o nome da lista diz o período, não "últimos 7 dias".
    wellbeing: {
      ...wellbeingTrend(state.diary, week.dates, today),
      aria: `Bem-estar e sono de ${week.aria}`,
    },
  };
}

const tile = (
  key: RecapTileKey,
  tone: RecapTile["tone"],
  label: string,
  value: string,
  detail: string | null,
  aria: string,
  face: MoodLevel | null = null,
): RecapTile => ({ key, label, value, detail, aria, tone, face });

function moodTile(trend: WellbeingTrend): RecapTile | null {
  const moods = trend.days.flatMap((d) => (d.mood === null ? [] : [d.mood]));
  if (!moods.length) return null;
  const average = moods.reduce((a, b) => a + b, 0) / moods.length;
  const face = Math.min(5, Math.max(1, Math.round(average))) as MoodLevel;
  const mood = MOOD_LABELS[face - 1]!;
  const sleep = trend.sleepAverage === null ? null : `${fmtNumber(trend.sleepAverage, 1)} h`;
  const aria = `Bem-estar: humor médio ${mood} em ${days(moods.length)}`;
  return sleep
    ? tile("bem_estar", "mind", "Bem-estar", mood, `Sono ${sleep}`, `${aria}; sono médio ${sleep}`, face)
    : tile("bem_estar", "mind", "Bem-estar", mood, `em ${days(moods.length)}`, aria, face);
}

/** Blocos com registro na ordem registros, peso, agua, bem_estar, combinados, refeicoes. */
function candidateTiles(f: WeekFacts): RecapTile[] {
  const c = f.consistency;
  const weight = f.weight;
  const water = f.water.average === null ? null : liters(f.water.average);
  const waterDays = days(f.water.days);
  const tiles: (RecapTile | null | false)[] = [
    tile("registros", "habit", "Dias com registro", `${c.recordDays} de ${c.totalDays}`, null, c.recordText),
    weight && tile("peso", "body", "Peso de tendência", weight.value, weight.delta, weight.aria),
    water !== null &&
      tile("agua", "water", "Água", `${water}/dia`, `média em ${waterDays}`, `Água: média de ${water} por dia em ${waterDays}`),
    moodTile(f.wellbeing),
    c.habitsDone > 0 &&
      tile("combinados", "habit", "Combinados", `${c.habitsDone} de ${c.habitsPossible}`, null, habitsText(c)),
    f.meals.count > 0 &&
      tile("refeicoes", "food", "Refeições", fmtNumber(f.meals.count), `em ${days(f.meals.days)}`, mealsText(f.meals)),
  ];
  return tiles.filter((t): t is RecapTile => Boolean(t));
}

/** Conquista de reserva, só quando nenhuma outra se aplica. */
export const recordsWin = (recordDays: number): RecapWin => ({
  key: "registros",
  text: `Registros em ${days(recordDays)} da semana`,
});

/** Até 4 conquistas de comportamento; nenhuma usa valor de peso, calorias, proteína, medicação ou comparação. */
function recapWins(f: WeekFacts, privacy: RecapPrivacy): RecapWin[] {
  const { habitsDone } = f.consistency;
  const moodDays = f.wellbeing.moodDays;
  const waterGoal = !privacy.calm && !privacy.fluidRestriction && f.water.goalDays > 0;
  const win = (key: RecapWinKey, text: string): RecapWin => ({ key, text });
  const all: (RecapWin | false)[] = [
    f.meals.days >= WIN_MIN_DAYS && win("refeicoes", `Refeições registradas em ${days(f.meals.days)}`),
    f.water.days >= WIN_MIN_DAYS && win("agua", `Água registrada em ${days(f.water.days)}`),
    waterGoal && win("meta_agua", `Meta de água alcançada em ${days(f.water.goalDays)}`),
    habitsDone > 0 && win("combinados", plural(habitsDone, "combinado cumprido", "combinados cumpridos")),
    moodDays >= WIN_MIN_MOOD_DAYS && win("bem_estar", `Você registrou como se sentiu em ${days(moodDays)}`),
    f.weighIns > 0 && win("pesagens", plural(f.weighIns, "pesagem registrada", "pesagens registradas")),
  ];
  const wins = all.filter((w): w is RecapWin => Boolean(w)).slice(0, RECAP_MAX_WINS);
  return wins.length ? wins : [recordsWin(f.consistency.recordDays)];
}

/** Combinados ativos na semana, por horário e título; conclusões antes da criação não contam. */
function habitItems(habits: readonly HabitItem[], dates: readonly string[]) {
  const active = habits
    .map((habit) => {
      const activeDates = dates.filter((d) => d >= habit.createdDate);
      const done = activeDates.filter((d) => habit.completedDates.includes(d)).length;
      return { habit, total: activeDates.length, done };
    })
    .filter((h) => h.total > 0)
    .sort(
      (a, b) =>
        a.habit.timeOfDay.localeCompare(b.habit.timeOfDay) ||
        a.habit.title.localeCompare(b.habit.title, "pt-BR"),
    );
  return {
    items: active.slice(0, RECAP_MAX_HABITS).map(({ habit, total, done }) => ({
      id: habit.id,
      title: habit.title,
      text: `${done} de ${days(total)}`,
    })),
    more: Math.max(0, active.length - RECAP_MAX_HABITS),
  };
}

/** Parte 2: média de água (sem linha de meta) e descrição dos dias com registro. */
function waterSlide(water: WeekFacts["water"], week: RecapWeek): RecapSlides["routine"]["water"] {
  if (water.average === null) return null;
  const recorded = water.points.filter((p) => p.value > 0);
  return {
    average: liters(water.average),
    caption: `média por dia em ${days(water.days)}`,
    points: water.points,
    aria: `Água por dia de ${week.aria}: ${recorded.map((p) => `${p.label} ${fmtMl(p.value)}`).join(", ")}`,
  };
}

function recapSlides(
  habits: readonly HabitItem[],
  week: RecapWeek,
  f: WeekFacts,
  wins: RecapWin[],
  calm: boolean,
): RecapSlides {
  const c = f.consistency;
  const water = waterSlide(f.water, week);
  const meals = f.meals.count ? mealsText(f.meals) : null;
  return {
    cover: {
      range: week.label,
      lead: `${c.recordDays} de ${c.totalDays}`,
      days: c.rows.flat(),
      weekdays: c.weekdays,
    },
    routine: {
      water,
      meals,
      empty: water || meals ? null : "Sem água nem refeições registradas nesta semana.",
    },
    wellbeing: {
      trend: f.wellbeing,
      empty: f.wellbeing.isEmpty ? "Sem registros de bem-estar nesta semana." : null,
    },
    habits: {
      title: f.weight ? "Combinados e peso" : "Combinados",
      summary: c.habitsPossible ? habitsText(c) : null,
      ...habitItems(habits, week.dates),
      weight: f.weight,
      empty: c.habitsPossible ? null : "Nenhum combinado ativo nesta semana.",
    },
    wins: { title: calm ? "Sua semana em registros" : "Conquistas gentis", items: wins },
  };
}

/** null sem perfil ou com menos de RECAP_MIN_DAYS dias com registro na semana. */
export function weekRecap(state: AppState, today: string): WeekRecap | null {
  if (!state.profile) return null;
  const week = lastCompleteWeek(today);
  const privacy = recapPrivacy(state.profile, today);
  const facts = weekFacts(state, week, privacy, today);
  if (facts.consistency.recordDays < RECAP_MIN_DAYS) return null;
  const candidates = candidateTiles(facts);
  const wins = recapWins(facts, privacy);
  return {
    week,
    privacy,
    recordDays: facts.consistency.recordDays,
    candidates,
    tiles: candidates.slice(0, RECAP_MAX_TILES),
    wins,
    slides: recapSlides(state.habits, week, facts, wins, privacy.calm),
  };
}

/** Títulos das 5 partes dos stories (rótulos "2 de 5: Água e refeições"). */
export function slideTitles(recap: WeekRecap): readonly [string, string, string, string, string] {
  const { habits, wins } = recap.slides;
  return ["Sua semana", "Água e refeições", "Bem-estar e sono", habits.title, wins.title];
}

/** Cartão do Hoje: há resumo, é segunda e a semana dele não foi dispensada neste aparelho. */
export function shouldShowRecapCard(
  recap: WeekRecap | null,
  today: string,
  dismissedWeek: string | null,
): boolean {
  return recap !== null && isRecapDay(today) && dismissedWeek !== recap.week.start;
}
