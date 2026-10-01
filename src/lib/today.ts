import { shiftDate, totalsFor, dailyTargets, localDate } from "./domain";
import type { DiaryEntry, Goals, AppState } from "../types";

export type Totals = ReturnType<typeof totalsFor>;

export const DATE_STRIP_SIZE = 7;

/** "trailing": 7 dias que terminam hoje (Diário); "week": segunda a domingo da semana (Hoje). */
export type StripRange = "trailing" | "week";

export interface StripDay {
  date: string;
  /** Rótulo curto exibido em cima do número: "seg", "ter"… ou "Hoje". */
  weekday: string;
  /** Número do dia ("08") ou "12 set" quando é hoje. */
  day: string;
  /** Nome acessível completo, único e diferente de "Hoje" para não colidir com a navegação. */
  aria: string;
  isToday: boolean;
  /** Dia depois de hoje (só no range "week"): desabilitado, sem cobrança. */
  isFuture: boolean;
}

const noon = (date: string) => new Date(`${date}T12:00:00`);

/** Segunda-feira da semana de `date` (semana de segunda a domingo). */
export function weekStart(date: string): string {
  return shiftDate(date, -((noon(date).getDay() + 6) % 7));
}

/** Os 7 dias (AAAA-MM-DD) de segunda a domingo da semana que contém `date`. */
export function weekDays(date: string): string[] {
  const monday = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
}

/** Dia da semana por extenso sem "-feira": "quinta", "sábado". */
function weekdayName(date: string): string {
  return noon(date).toLocaleDateString("pt-BR", { weekday: "long" }).replace(/-feira$/, "");
}

/** Data longa do cabeçalho do Diário: "Quinta, 24 de setembro" (sempre com o dia da semana, sem "Hoje,"). */
export function longDate(date: string): string {
  const weekday = weekdayName(date);
  const day = noon(date).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${day}`;
}

/**
 * Janela de dias exibida na faixa de datas. "trailing": termina em `today` (nunca no futuro)
 * e sempre inclui o dia selecionado, mesmo que ele esteja longe no passado. "week": a semana de
 * segunda a domingo do dia selecionado; os dias depois de hoje vêm com isFuture.
 */
export function dateStrip(
  selected: string,
  today: string,
  size = DATE_STRIP_SIZE,
  range: StripRange = "trailing",
): StripDay[] {
  const preferredEnd = shiftDate(selected, Math.floor(size / 2));
  const end = preferredEnd < today ? preferredEnd : today;
  const start = range === "week" ? weekStart(selected) : shiftDate(end, -(size - 1));
  const length = range === "week" ? DATE_STRIP_SIZE : size;
  return Array.from({ length }, (_, i) => {
    const date = shiftDate(start, i);
    const value = noon(date);
    const isToday = date === today;
    const isFuture = date > today;
    const weekday = value
      .toLocaleDateString("pt-BR", { weekday: "short" })
      .replace(".", "")
      .slice(0, 3);
    const long = value.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return {
      date,
      weekday: isToday ? "Hoje" : weekday,
      day: isToday
        ? value
            .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
            .replace(" de ", " ")
            .replace(".", "")
        : value.toLocaleDateString("pt-BR", { day: "2-digit" }),
      aria: isToday ? `Hoje, ${long}` : isFuture ? `${long}, ainda não chegou` : long,
      isToday,
      isFuture,
    };
  });
}

/** Percentual de uma meta, limitado a 100; null quando não há meta. */
export function percentOf(value: number, goal: number | null): number | null {
  return goal ? Math.min(100, Math.round((value / goal) * 100)) : null;
}

export const WATER_TAPS = [
  { ml: 100, label: "Gole" },
  { ml: 250, label: "Copo" },
  { ml: 500, label: "Garrafa" },
] as const;

/** Cores fixas por macronutriente em todas as telas: proteína esmeralda, carbos azul, gordura âmbar. */
export const MACROS = [
  { key: "protein", label: "Proteína", tone: "emerald" },
  { key: "carbs", label: "Carbos", tone: "sky" },
  { key: "fat", label: "Gorduras", tone: "amber" },
] as const;

export function macroBars(totals: Totals, goals: Goals) {
  return MACROS.map((macro) => ({
    ...macro,
    value: totals[macro.key],
    goal: goals[macro.key],
    percent: percentOf(totals[macro.key], goals[macro.key]),
  }));
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

const list = (parts: string[]) =>
  parts.length <= 1
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;

/**
 * Resumo factual do dia para o card do agente na tela Hoje.
 * Só usa dados registrados pela própria pessoa: nada é inventado nem estimado.
 */
export function coachSummary({
  firstName,
  totals,
  goals,
  habitsDone,
  habitsTotal,
  hideCalories,
  isToday,
}: {
  firstName: string;
  totals: Totals;
  goals: Goals;
  habitsDone: number;
  habitsTotal: number;
  hideCalories: boolean;
  isToday: boolean;
}): string {
  const parts: string[] = [];
  if (totals.meals)
    parts.push(
      `${totals.meals} ${totals.meals === 1 ? "refeição" : "refeições"}`,
    );
  if (totals.water) {
    const percent = percentOf(totals.water, goals.water);
    parts.push(
      `${fmt(totals.water)} ml de água${percent !== null ? ` (${percent}% da meta)` : ""}`,
    );
  }
  if (habitsTotal)
    parts.push(
      `${habitsDone} de ${habitsTotal} ${habitsTotal === 1 ? "combinado pronto" : "combinados prontos"}`,
    );
  if (!parts.length)
    return isToday
      ? `Seu dia ainda está em branco, ${firstName}. Registre a primeira refeição ou um copo de água para acompanhar seu ritmo.`
      : "Nenhum registro neste dia. Você pode adicionar refeições e água de forma retroativa.";
  let text = `${isToday ? "Até agora" : "Neste dia"}, ${firstName}: ${list(parts)}.`;
  if (!hideCalories && goals.calories !== null && totals.calories > 0) {
    const remaining = goals.calories - totals.calories;
    text +=
      remaining > 0
        ? ` Restam ${fmt(remaining)} kcal da sua meta.`
        : " Você atingiu a meta calórica do dia.";
  }
  return text;
}

export const WEEKDAYS_SHORT = [
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
  "Dom",
] as const;

export interface WeekDay {
  date: string;
  label: (typeof WEEKDAYS_SHORT)[number];
  ml: number;
  isToday: boolean;
  isFuture: boolean;
}

/** Semana de segunda a domingo que contém `today`, com a água registrada em cada dia. */
export function weekWater(entries: DiaryEntry[], today: string): WeekDay[] {
  const days = weekDays(today);
  return WEEKDAYS_SHORT.map((label, i) => {
    const date = days[i]!;
    return {
      date,
      label,
      ml: totalsFor(entries, date).water,
      isToday: date === today,
      isFuture: date > today,
    };
  });
}

/** Mililitros em litros com uma casa decimal, no formato brasileiro ("1,8"). */
export const liters = (ml: number) =>
  (ml / 1000).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

export type Tone = "amber" | "emerald" | "sky" | "teal";

/** Cor do ícone de uma refeição: pela categoria informada ou, sem ela, pelo horário. */
export function mealTone(
  entry: Pick<DiaryEntry, "categoryTag" | "time">,
): Tone {
  const tag = (entry.categoryTag ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (tag.includes("cafe") || tag.includes("manha")) return "amber";
  if (tag.includes("almoco")) return "emerald";
  if (tag.includes("lanche")) return "sky";
  if (tag.includes("jantar") || tag.includes("ceia")) return "teal";
  const hour = Number(entry.time.slice(0, 2));
  return hour < 10
    ? "amber"
    : hour < 15
      ? "emerald"
      : hour < 18
        ? "sky"
        : "teal";
}

export interface BalanceStatus {
  label: string;
  tone: "emerald" | "sky" | "rose" | "neutral";
}

/** Situação do dia em relação à meta calórica, sem julgamento: só posição relativa. */
export function balanceStatus(
  consumed: number,
  goal: number | null,
): BalanceStatus {
  if (goal === null) return { label: "Sem meta", tone: "neutral" };
  // Informativo, sem julgamento: o vermelho fica reservado para erro e exclusão.
  if (consumed > goal) return { label: "Acima do planejado", tone: "neutral" };
  if (consumed >= goal * 0.8) return { label: "No alvo", tone: "emerald" };
  return { label: "Em andamento", tone: "sky" };
}

/** Data legível para o cabeçalho: "Hoje, 12 de setembro", "Ontem, …" ou "Segunda-feira, …". */
export function humanDate(value: string, today: string): string {
  const d = noon(value);
  const text = d.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  if (value === today) return `Hoje, ${text}`;
  if (value === shiftDate(today, -1)) return `Ontem, ${text}`;
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "long" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${text}`;
}

export interface Encouragement {
  kind: "meal" | "water" | "habit";
  title: string;
  text: string;
  /** Progresso em relação à meta do dia (pode passar de 100); null sem meta. */
  percent: number | null;
}
const MEAL_TITLES = ["Refeição registrada!", "Boa, mais um registro!", "Mandou bem!"];
/** Até esta fração da meta a refeição conta como "meta alcançada", não como excesso. */
const TARGET_TOLERANCE = 0.05;

/**
 * Mensagem de incentivo depois de um novo registro (refeição, água ou combinado concluído), com a distância
 * até a meta do dia do registro. Compara o estado anterior com o novo; devolve null quando nada novo entrou.
 */
export function encouragementFor(
  previous: AppState,
  next: AppState,
): Encouragement | null {
  const known = new Set(previous.diary.map((e) => e.id));
  const entry = next.diary.filter((e) => !known.has(e.id) && e.type !== "bem_estar").at(-1);
  if (entry) {
    const totals = totalsFor(next.diary, entry.date);
    const goals = dailyTargets(next, entry.date);
    const day = entry.date === localDate() ? "hoje" : "nesse dia";
    if (entry.type === "agua") {
      const percent = percentOf(totals.water, goals.water);
      const remaining = goals.water === null ? null : goals.water - totals.water;
      const text =
        remaining === null
          ? `${fmt(totals.water)} ml ${day}. Continue se hidratando ao longo do dia.`
          : remaining > 0
            ? `${fmt(totals.water)} ml de ${fmt(goals.water ?? 0)} ml (${percent}%). Faltam ${fmt(remaining)} ml para a meta de água.`
            : `Meta de água atingida: ${fmt(totals.water)} ml de ${fmt(goals.water ?? 0)} ml.`;
      return { kind: "water", title: "Hidratação registrada!", text, percent };
    }
    const title = MEAL_TITLES[(Math.max(1, totals.meals) - 1) % MEAL_TITLES.length] ?? MEAL_TITLES[0]!;
    if (next.profile?.hideCalories)
      return {
        kind: "meal",
        title,
        text: `${totals.meals} ${totals.meals === 1 ? "refeição registrada" : "refeições registradas"} ${day}. Continue no seu ritmo.`,
        percent: null,
      };
    const percent = percentOf(totals.calories, goals.calories);
    const remaining = goals.calories === null ? null : goals.calories - totals.calories;
    const text =
      remaining === null || goals.calories === null
        ? `${fmt(totals.calories)} kcal registradas ${day}.`
        : remaining > goals.calories * TARGET_TOLERANCE
          ? `${fmt(totals.calories)} de ${fmt(goals.calories)} kcal (${percent}%). Faltam ${fmt(remaining)} kcal para a meta de ${day}.`
          : remaining >= 0
            ? `Meta de ${day} alcançada: ${fmt(totals.calories)} de ${fmt(goals.calories)} kcal.`
            : `${fmt(totals.calories)} kcal registradas ${day}, ${fmt(-remaining)} kcal acima do planejado.`;
    return { kind: "meal", title, text, percent };
  }
  for (const habit of next.habits) {
    const before = previous.habits.find((h) => h.id === habit.id);
    const date = habit.completedDates.filter((d) => !before?.completedDates.includes(d)).at(-1);
    if (!date) continue;
    const total = next.habits.filter((h) => h.createdDate <= date).length;
    const done = next.habits.filter((h) => h.completedDates.includes(date)).length;
    const left = total - done;
    const text =
      left <= 0
        ? total === 1
          ? "Seu combinado do dia está pronto."
          : `Todos os ${total} combinados do dia estão prontos.`
        : `${done} de ${total} combinados prontos. ${left === 1 ? "Falta 1" : `Faltam ${left}`} para fechar o dia.`;
    return { kind: "habit", title: "Combinado concluído!", text, percent: percentOf(done, total) };
  }
  return null;
}
