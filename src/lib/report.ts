/**
 * "Relatório para consulta" (ESPACO-08): modelo montado neste aparelho, sem IA, com textos e
 * números já formatados; report-html.ts só desenha. Nunca classifica exame, nunca sugere dose e
 * não usa palavras de excesso ou falta. Perfil calmo: só o valor do peso. Com "Ocultar calorias"
 * não há seção de calorias e todo texto passa pela máscara.
 */
import type { AppState, DiaryEntry, Profile } from "../types";
import { normalizeText } from "./allergens";
import { splitAppointments } from "./appointments";
import { MOOD_LABELS } from "./day";
import { ageAt, goalsFor, shiftDate, totalsFor } from "./domain";
import {
  essentialSummary,
  ESSENTIAL_COPY,
  type EssentialGroup,
} from "./essential";
import { weightTrend, type TrendPoint } from "./evolution";
import { EXAM_COPY, examGroups } from "./exam-result";
import {
  dayVariety,
  FOOD_GROUP_TOTAL,
  FOOD_GROUPS,
  groupDays,
} from "./food-groups";
import {
  fmtBmi,
  fmtDateBr,
  fmtDelta,
  fmtKg,
  fmtNumber,
  plural,
} from "./format";
import { fmtMg, methodInfo, sortInjections, spotLabel } from "./injection";
import { bodyNumbers, goalOrigin, isCalmProfile } from "./space";
import { REPORT_COPY } from "./report-copy";
import { maskStructured } from "./structured";
import { tracksDoseSchedule } from "./treatment";

export const REPORT_PERIODS = [
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
  { days: 180, label: "6 meses" },
] as const;
export const REPORT_SECTION_KEYS = [
  "essencial",
  "medidas",
  "calorias",
  "alimentacao",
  "tratamento",
  "exames",
  "bem_estar",
  "perguntas",
] as const;
export type ReportSectionKey = (typeof REPORT_SECTION_KEYS)[number];

// Os textos moram em report-copy.ts (leve); daqui continuam exportados para quem já importa o modelo.
export { REPORT_COPY };

const SECTION_META: Record<ReportSectionKey, { label: string; hint: string }> =
  {
    essencial: {
      label: "Essencial",
      hint: "Alergias, condições e medicamentos",
    },
    medidas: { label: "Medidas", hint: "Pesagens, tendência e IMC" },
    calorias: { label: "Calorias", hint: "Média do que foi registrado" },
    alimentacao: {
      label: "Alimentação e água",
      hint: "Dias com registro, refeições, água e grupos de alimentos",
    },
    tratamento: { label: "Tratamento", hint: "Aplicações registradas" },
    exames: { label: "Exames", hint: "Laudos e resultados transcritos" },
    bem_estar: {
      label: "Bem-estar e sono",
      hint: "Como se sente, sono e marcadores",
    },
    perguntas: {
      label: "Perguntas para a consulta",
      hint: "Suas perguntas, uma por linha",
    },
  };
const CALM_MEASURES_HINT = "Pesagens do período";
const QUESTIONS_MAX = 8;
const QUESTION_MAX_CHARS = 200;
const INJECTION_ROWS_MAX = 60;
const EXAMS_MAX = 10;
const TAGS_MAX = 3;
const APPOINTMENT_WINDOW_DAYS = 60;

export interface ReportSectionOption {
  key: ReportSectionKey;
  label: string;
  hint: string;
  available: boolean;
  defaultOn: boolean;
  note: string | null;
}
export interface ReportOptions {
  periodDays: number;
  sections: readonly ReportSectionKey[];
  questions: string;
  today: string;
}
export interface ReportTable {
  columns: string[];
  rows: string[][];
}
export interface ReportChart {
  points: TrendPoint[];
  start: string;
  end: string;
  target: number | null;
}
export interface ReportExam {
  heading: string;
  notes: string | null;
  columns: string[];
  groups: { title: string | null; rows: string[][] }[];
}
export type ReportSection =
  | {
      key: "essencial";
      title: string;
      lines: string[];
      groups: EssentialGroup[];
    }
  | ({
      key: "medidas";
      title: string;
      level: "full" | "value";
      lines: string[];
      chart: ReportChart | null;
    } & ReportTable)
  | { key: "calorias"; title: string; lines: string[] }
  | { key: "alimentacao"; title: string; lines: string[] }
  | { key: "bem_estar"; title: string; lines: string[] }
  | ({ key: "tratamento"; title: string; note: string } & ReportTable)
  | { key: "exames"; title: string; note: string; exams: ReportExam[] }
  | { key: "perguntas"; title: string; items: string[] };
export interface ReportModel {
  title: string;
  person: { name: string; age: number };
  period: { from: string; to: string; label: string };
  generatedOn: string;
  nextAppointment: string | null;
  sections: ReportSection[];
  footer: string;
}

export const reportFileName = (today: string) =>
  `relatorio-webfit-${today}.html`;

interface Period {
  from: string;
  to: string;
}
const periodOf = (days: number, today: string): Period => ({
  from: shiftDate(today, -(Math.max(1, days) - 1)),
  to: today,
});
const within = (date: string, p: Period) => date >= p.from && date <= p.to;
const average = (values: readonly number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

const weighInsIn = (state: AppState, p: Period) =>
  [...state.measurements]
    .filter((m) => within(m.date, p))
    .sort((a, b) => a.date.localeCompare(b.date));
const mealDaysIn = (diary: readonly DiaryEntry[], p: Period) =>
  [
    ...new Set(
      diary
        .filter((e) => e.type === "refeicao" && within(e.date, p))
        .map((e) => e.date),
    ),
  ].sort();
const waterByDay = (diary: readonly DiaryEntry[], p: Period) => {
  const days = new Map<string, number>();
  for (const e of diary)
    if (e.type === "agua" && within(e.date, p) && e.amountMl)
      days.set(e.date, (days.get(e.date) ?? 0) + e.amountMl);
  return [...days.values()];
};
const wellbeingIn = (diary: readonly DiaryEntry[], p: Period) =>
  diary.filter((e) => e.type === "bem_estar" && within(e.date, p));
const examsIn = (state: AppState, p: Period) =>
  state.exams
    .filter((e) => within(e.date, p))
    .sort((a, b) => b.date.localeCompare(a.date));
const injectionsIn = (state: AppState, p: Period) =>
  sortInjections(state.injections.filter((e) => within(e.date, p))).reverse();

/** Seções do formulário, na ordem fixa: disponíveis quando há registro no período. */
export function reportSections(
  state: AppState,
  periodDays: number,
  today: string,
): ReportSectionOption[] {
  const p = state.profile;
  if (!p) return [];
  const period = periodOf(periodDays, today);
  const level = bodyNumbers(p, today);
  const calm = isCalmProfile(p, today);
  const exists: Record<ReportSectionKey, boolean> = {
    essencial: true,
    medidas: true,
    calorias: !p.hideCalories,
    alimentacao: true,
    tratamento: state.injections.length > 0 || tracksDoseSchedule(p),
    exames: true,
    bem_estar: true,
    perguntas: true,
  };
  const mealDays = mealDaysIn(state.diary, period).length;
  const available: Record<ReportSectionKey, boolean> = {
    essencial: true,
    medidas: weighInsIn(state, period).length > 0,
    calorias: mealDays > 0,
    alimentacao: mealDays > 0 || waterByDay(state.diary, period).length > 0,
    tratamento: injectionsIn(state, period).length > 0,
    exames: examsIn(state, period).length > 0,
    bem_estar: wellbeingIn(state.diary, period).length > 0,
    perguntas: true,
  };
  const off: Partial<Record<ReportSectionKey, boolean>> = {
    medidas: level !== "full",
    calorias: calm,
  };
  return REPORT_SECTION_KEYS.filter((key) => exists[key]).map((key) => {
    const meta = SECTION_META[key];
    const hint = key === "medidas" && calm ? CALM_MEASURES_HINT : meta.hint;
    return {
      key,
      label: meta.label,
      hint: available[key] ? hint : REPORT_COPY.unavailable,
      available: available[key],
      defaultOn: available[key] && !off[key],
      note:
        key === "medidas" && level === "hidden" ? REPORT_COPY.hiddenNote : null,
    };
  });
}

/** Perguntas das análises de exame ainda não levadas à consulta, exames mais recentes primeiro. */
export function pendingExamQuestions(state: AppState): string[] {
  const seen = new Set<string>();
  return [...state.exams]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((exam) =>
      (exam.analysisStructured?.perguntas ?? []).filter(
        (_, i) => !exam.questionsDone?.includes(i),
      ),
    )
    .filter((q) => {
      const key = normalizeText(q.trim());
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, QUESTIONS_MAX);
}

const clipChars = (s: string, max: number) =>
  Array.from(s).slice(0, max).join("");

interface Ctx {
  state: AppState;
  profile: Profile;
  period: Period;
  today: string;
  questions: string;
}

function essentialSection({ state }: Ctx): ReportSection {
  const summary = essentialSummary(state);
  return {
    key: "essencial",
    title: SECTION_META.essencial.label,
    lines: summary.isEmpty ? [ESSENTIAL_COPY.empty] : [],
    groups: summary.groups,
  };
}

function measuresSection({
  state,
  profile: p,
  period,
  today,
}: Ctx): ReportSection {
  const list = weighInsIn(state, period);
  const title = SECTION_META.medidas.label;
  const count = `${plural(list.length, "pesagem", "pesagens")} no período`;
  // Perfil calmo (inclusive menor de idade): só o valor, mesmo com os números ocultos escolhidos.
  if (isCalmProfile(p, today))
    return {
      key: "medidas",
      title,
      level: "value",
      lines: [count],
      chart: null,
      columns: ["Data", "Peso"],
      rows: list.map((m) => [fmtDateBr(m.date), fmtKg(m.weight)]),
    };
  const first = list[0];
  const last = list.at(-1);
  const bmi = fmtBmi(p.weight, p.height);
  const cm = (v: number | null | undefined) =>
    v == null ? "—" : `${fmtNumber(v, 1)} cm`;
  const lines = [
    count,
    ...(first && last && list.length > 1
      ? [
          `Primeira: ${fmtKg(first.weight)} em ${fmtDateBr(first.date)} · Última: ${fmtKg(last.weight)} em ${fmtDateBr(last.date)}`,
          `Variação no período: ${fmtDelta(last.weight - first.weight, "kg")}`,
        ]
      : last
        ? [`Pesagem: ${fmtKg(last.weight)} em ${fmtDateBr(last.date)}`]
        : []),
    ...(bmi === "—" ? [] : [`IMC atual: ${bmi} (referência 18,5 a 24,9)`]),
    ...(p.targetWeight == null
      ? []
      : [`Peso desejado informado: ${fmtKg(p.targetWeight)}`]),
  ];
  return {
    key: "medidas",
    title,
    level: "full",
    lines,
    chart:
      list.length > 1
        ? {
            points: weightTrend(state.measurements),
            start: period.from,
            end: period.to,
            target: p.targetWeight ?? null,
          }
        : null,
    columns: ["Data", "Peso", "Cintura", "Quadril", "Gordura"],
    rows: list.map((m) => [
      fmtDateBr(m.date),
      fmtKg(m.weight),
      cm(m.waist),
      cm(m.hip),
      m.bodyFat == null ? "—" : `${fmtNumber(m.bodyFat, 1)}%`,
    ]),
  };
}

function caloriesSection({
  state,
  profile: p,
  period,
  today,
}: Ctx): ReportSection {
  const days = mealDaysIn(state.diary, period);
  const avg = average(days.map((d) => totalsFor(state.diary, d).calories));
  const goals = goalsFor(p, today);
  return {
    key: "calorias",
    title: SECTION_META.calorias.label,
    lines: [
      `Média registrada: ${fmtNumber(avg)} kcal por dia, em ${plural(days.length, "dia com refeições", "dias com refeições")}.`,
      ...(goals.calories === null
        ? []
        : [
            `Meta vigente: ${fmtNumber(goals.calories)} kcal por dia (${goalOrigin(p, goals).label}).`,
          ]),
    ],
  };
}

function foodSection(
  { state, profile: p, period, today }: Ctx,
  periodDays: number,
): ReportSection {
  const days = mealDaysIn(state.diary, period);
  const water = waterByDay(state.diary, period);
  const meals = days.map((d) => totalsFor(state.diary, d));
  const avgMeals = average(meals.map((t) => t.meals));
  const lines = [
    `Dias com refeições registradas: ${fmtNumber(days.length)} de ${fmtNumber(periodDays)}.`,
  ];
  if (days.length)
    lines.push(
      `Média de ${fmtNumber(avgMeals, 1)} ${avgMeals === 1 ? "refeição" : "refeições"} nesses dias.`,
    );
  lines.push(
    water.length
      ? `Água: média de ${fmtNumber(average(water) / 1000, 1)} L por dia, em ${plural(water.length, "dia com registro", "dias com registro")}.`
      : "Água: sem registro no período.",
  );
  if (days.length) {
    const variety = average(days.map((d) => dayVariety(state.diary, d).count));
    lines.push(
      `Grupos de alimentos: média de ${fmtNumber(variety, 1)} de ${FOOD_GROUP_TOTAL} por dia com refeições.`,
      ...groupDays(state.diary, period.from, period.to)
        .filter((g) => g.days > 0)
        .map(
          (g) =>
            `${FOOD_GROUPS.find((f) => f.key === g.key)?.label}: ${plural(g.days, "dia", "dias")}`,
        ),
    );
    if (!isCalmProfile(p, today)) {
      const macro = (k: "protein" | "carbs" | "fat") =>
        fmtNumber(average(meals.map((t) => t[k])));
      lines.push(
        `Média diária de proteínas ${macro("protein")} g, carboidratos ${macro("carbs")} g e gorduras ${macro("fat")} g, nos dias com refeições.`,
      );
    }
  }
  return { key: "alimentacao", title: SECTION_META.alimentacao.label, lines };
}

function treatmentSection({ state, period }: Ctx): ReportSection {
  return {
    key: "tratamento",
    title: SECTION_META.tratamento.label,
    note: "Aplicações registradas pela pessoa. A dose é decidida com quem prescreveu.",
    columns: ["Data", "Medicamento", "Dose", "Forma", "Local"],
    rows: injectionsIn(state, period)
      .slice(0, INJECTION_ROWS_MAX)
      .map((e) => [
        fmtDateBr(e.date),
        e.medication,
        fmtMg(e.doseMg),
        methodInfo(e.method).short,
        spotLabel(e.site, e.side),
      ]),
  };
}

function examsSection({ state, period }: Ctx): ReportSection {
  return {
    key: "exames",
    title: SECTION_META.exames.label,
    note: "Transcrição automática dos laudos: confira cada valor no documento original.",
    exams: examsIn(state, period)
      .slice(0, EXAMS_MAX)
      .map((exam) => ({
        heading: `${fmtDateBr(exam.date)} · ${exam.name.trim() || "Exame"}`,
        notes: exam.notes.trim() || null,
        columns: [
          "Resultado",
          "Valor",
          EXAM_COPY.refLabel,
          "Marcação do laudo",
        ],
        groups: exam.analysisStructured
          ? examGroups(exam.analysisStructured).map((g) => ({
              title: g.title,
              rows: g.rows.map((r) => [
                r.nome,
                r.unidade ? `${r.valor} ${r.unidade}` : r.valor,
                r.referencia ?? EXAM_COPY.noRef,
                r.marcacao ?? "",
              ]),
            }))
          : [],
      })),
  };
}

function wellbeingSection({ state, period }: Ctx): ReportSection {
  const entries = wellbeingIn(state.diary, period);
  const ratings = entries.flatMap((e) => (e.rating ? [e.rating] : []));
  const sleep = entries.flatMap((e) =>
    e.sleepHours == null ? [] : [e.sleepHours],
  );
  const tagCount = new Map<string, number>();
  for (const tag of entries.flatMap((e) => e.tags ?? []))
    tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
  const tags = [...tagCount].sort((a, b) => b[1] - a[1]).slice(0, TAGS_MAX);
  const mood = average(ratings);
  return {
    key: "bem_estar",
    title: SECTION_META.bem_estar.label,
    lines: [
      `${plural(entries.length, "registro de bem-estar", "registros de bem-estar")} no período.`,
      ...(ratings.length
        ? [
            `Como se sente, em média: ${fmtNumber(mood, 1)} de 5 (${MOOD_LABELS[Math.round(mood) - 1]}).`,
          ]
        : []),
      ...(sleep.length
        ? [
            `Sono informado, em média: ${fmtNumber(average(sleep), 1)} h (${plural(sleep.length, "registro", "registros")}).`,
          ]
        : []),
      ...(tags.length
        ? [
            `Marcadores mais frequentes: ${tags.map(([tag, n]) => `${tag} (${n})`).join(", ")}.`,
          ]
        : []),
    ],
  };
}

function questionsSection({ questions }: Ctx): ReportSection {
  return {
    key: "perguntas",
    title: SECTION_META.perguntas.label,
    items: questions
      .split("\n")
      .map((q) => q.trim())
      .filter(Boolean)
      .slice(0, QUESTIONS_MAX)
      .map((q) => clipChars(q, QUESTION_MAX_CHARS)),
  };
}

/** "02/10/2026 às 10:00 com Dra. Ana Lima", só quando a próxima consulta cai em até 60 dias. */
function nextAppointmentText(state: AppState, today: string): string | null {
  const next = splitAppointments(state.appointments, today, "00:00").next;
  if (!next || next.date > shiftDate(today, APPOINTMENT_WINDOW_DAYS))
    return null;
  return `${fmtDateBr(next.date)} às ${next.time} com ${next.professional.trim()}`;
}

/** Monta o relatório com as seções escolhidas e disponíveis, na ordem fixa. */
export function buildReport(
  state: AppState,
  options: ReportOptions,
): ReportModel {
  const p = state.profile;
  if (!p) throw new Error("Conclua a anamnese antes de montar o relatório.");
  const { today, periodDays } = options;
  const period = periodOf(periodDays, today);
  const ctx: Ctx = {
    state,
    profile: p,
    period,
    today,
    questions: options.questions,
  };
  const available = new Set(
    reportSections(state, periodDays, today)
      .filter((s) => s.available)
      .map((s) => s.key),
  );
  const build: Record<ReportSectionKey, () => ReportSection> = {
    essencial: () => essentialSection(ctx),
    medidas: () => measuresSection(ctx),
    calorias: () => caloriesSection(ctx),
    alimentacao: () => foodSection(ctx, periodDays),
    tratamento: () => treatmentSection(ctx),
    exames: () => examsSection(ctx),
    bem_estar: () => wellbeingSection(ctx),
    perguntas: () => questionsSection(ctx),
  };
  const generatedOn = fmtDateBr(today);
  const model: ReportModel = {
    title: REPORT_COPY.title,
    person: { name: p.name, age: ageAt(p.birthDate, today) },
    period: {
      ...period,
      label: `${fmtDateBr(period.from)} a ${fmtDateBr(period.to)}`,
    },
    generatedOn,
    nextAppointment: nextAppointmentText(state, today),
    sections: REPORT_SECTION_KEYS.filter(
      (k) => options.sections.includes(k) && available.has(k),
    ).map((k) => build[k]()),
    footer: `Gerado em ${generatedOn} pelo WebFit, com dados registrados pela própria pessoa. Não é laudo nem diagnóstico. Valores de alimentos estimados pela Tabela TACO (NEPA/UNICAMP).`,
  };
  return maskStructured(model, p.hideCalories, { plain: true });
}
