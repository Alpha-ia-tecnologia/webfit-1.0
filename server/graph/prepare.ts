import { z } from "zod";
import { Send } from "@langchain/langgraph";
import { visibleText } from "../../src/lib/text";
import { pantryRefRows, recipeBasics } from "../recipe-refs";
import {
  flagsSchema,
  type Flags,
  type GraphState,
  type GraphUpdate,
  type Urgency,
} from "./state";

/** Leitura tolerante do contexto enviado pelo cliente: nada aqui lança erro. */
export const contextSchema = z
  .object({
    age: z.number().nullable().optional(),
    anamnese: z.record(z.string(), z.unknown()).optional(),
    goals: z
      .object({
        calories: z.number().nullable().optional(),
        water: z.number().nullable().optional(),
        protein: z.number().nullable().optional(),
        carbs: z.number().nullable().optional(),
        fat: z.number().nullable().optional(),
        source: z.string().optional(),
        reason: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
      })
      .loose()
      .optional(),
    totals: z
      .object({
        calories: z.number().optional(),
        water: z.number().optional(),
        meals: z.number().optional(),
      })
      .loose()
      .optional(),
    diary: z.array(z.record(z.string(), z.unknown())).optional(),
    measurements: z.array(z.record(z.string(), z.unknown())).optional(),
    habits: z.array(z.record(z.string(), z.unknown())).optional(),
    exams: z.array(z.record(z.string(), z.unknown())).optional(),
    injections: z.array(z.record(z.string(), z.unknown())).optional(),
    missingInformation: z.array(z.string()).optional(),
  })
  .loose();

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function extractFlags(context: Record<string, unknown>): Flags {
  const parsed = contextSchema.safeParse(context);
  const c = parsed.success ? parsed.data : {};
  const a = c.anamnese ?? {};
  return flagsSchema.parse({
    hideCalories: a.hideCalories === true,
    hideBodyNumbers: a.hideBodyNumbers === true,
    allergies: str(a.allergies) || "nao_sei",
    allergyDetails: str(a.allergyDetails),
    avoidedFoods: str(a.avoidedFoods),
    conditions: str(a.conditions),
    medications: str(a.medications),
    pregnancy: str(a.pregnancy) || "nao_informado",
    eatingDisorder: str(a.eatingDisorder) || "nao_informado",
    fluidRestriction: str(a.fluidRestriction) || "nao_sei",
    isMinor: typeof c.age === "number" ? c.age < 18 : false,
    goalsReason: c.goals?.reason ?? null,
    missingInformation: c.missingInformation ?? [],
  });
}

export function deriveFacts(
  context: Record<string, unknown>,
  flags: Flags,
): string[] {
  const parsed = contextSchema.safeParse(context);
  if (!parsed.success)
    return ["Contexto do cliente não pôde ser interpretado."];
  const c = parsed.data;
  const facts: string[] = [];
  if (typeof c.age === "number") facts.push(`Idade: ${c.age} anos.`);
  if (c.goals?.calories && !flags.hideCalories)
    facts.push(
      `Meta calórica: ${c.goals.calories} kcal/dia (${c.goals.source ?? "origem não informada"}).`,
    );
  if (c.goals?.note && !flags.hideCalories) facts.push(c.goals.note);
  if (
    typeof c.goals?.protein === "number" &&
    typeof c.goals?.carbs === "number" &&
    typeof c.goals?.fat === "number"
  )
    facts.push(
      `Metas de macronutrientes: ${c.goals.protein} g de proteína, ${c.goals.carbs} g de carboidratos e ${c.goals.fat} g de gorduras por dia.`,
    );
  if (c.goals?.water)
    facts.push(`Meta de água informada: ${c.goals.water} ml/dia.`);
  if (c.totals) {
    const items = [
      !flags.hideCalories && typeof c.totals.calories === "number"
        ? `${c.totals.calories} kcal`
        : null,
      typeof c.totals.water === "number"
        ? `${c.totals.water} ml de água`
        : null,
      typeof c.totals.meals === "number" ? `${c.totals.meals} refeições` : null,
    ].filter(Boolean);
    if (items.length) facts.push(`Registrado hoje: ${items.join(", ")}.`);
  }
  const days = new Set((c.diary ?? []).map((e) => str(e.date)).filter(Boolean));
  facts.push(`Dias com registros nos últimos 7 dias: ${days.size}.`);
  const last = c.measurements?.at(-1);
  if (last)
    facts.push(
      flags.hideBodyNumbers
        ? `Última medição: ${str(last.date)} (números do corpo ocultos pela pessoa).`
        : `Última medição: ${str(last.date)} (${last.weight ?? "?"} kg).`,
    );
  if (c.habits?.length) facts.push(`Hábitos cadastrados: ${c.habits.length}.`);
  if (c.exams?.length) facts.push(`Exames registrados: ${c.exams.length}.`);
  const injection = c.injections?.at(-1);
  if (injection)
    facts.push(
      `Aplicações de medicamento injetável registradas nos últimos 30 dias: ${c.injections?.length ?? 0}; última em ${str(injection.date) || "data não informada"} (${str(injection.medication) || "medicamento não informado"}, ${injection.doseMg ?? "?"} mg, local: ${str(injection.site) || "não informado"}). Registro feito pela pessoa: não valide nem ajuste doses.`,
    );
  return facts;
}

type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] | undefined =>
  Array.isArray(v) ? (v as Row[]) : undefined;
const CALORIE_KEYS = ["calories", "basal", "expenditure"];
const withoutCalories = (row: Row | undefined): Row | undefined =>
  row
    ? Object.fromEntries(
        Object.entries(row).filter(([k]) => !CALORIE_KEYS.includes(k)),
      )
    : row;
const maskText = (value: unknown) =>
  typeof value === "string" ? visibleText(value, true) : value;
/** Nome e notas da despensa são texto da pessoa ("Barra 200 kcal"): com calorias ocultas, mascarados. */
const withoutPantryCalories = (row: Row): Row => ({
  ...row,
  name: maskText(row.name),
  notes: maskText(row.notes),
});

/** Remove campos desnecessários ao modelo (fontes de alimentos, ids, timestamps) e, se pedido, calorias. */
export function compactContext(
  context: Record<string, unknown>,
  hideCalories = false,
): Row {
  const strip = hideCalories ? withoutCalories : (row: Row | undefined) => row;
  const diary = rows(context.diary)?.map(
    ({ id, createdAt, updatedAt, userId, items, ...entry }) => ({
      ...strip(entry),
      items: rows(items)?.map((i) => ({
        name: (i.food as Row | undefined)?.name,
        grams: i.grams,
      })),
    }),
  );
  const measurements = rows(context.measurements)?.map(({ id, ...m }) => m);
  const habits = rows(context.habits)?.map(({ id, completedDates, ...h }) => ({
    ...h,
    completedCount: Array.isArray(completedDates) ? completedDates.length : 0,
  }));
  const injections = rows(context.injections)?.map(
    ({ id, createdAt, updatedAt, userId, ...entry }) => entry,
  );
  const goals = strip(context.goals as Row | undefined);
  const totals = strip(context.totals as Row | undefined);
  return {
    ...context,
    goals,
    totals,
    diary,
    measurements,
    habits,
    injections,
    // Receitas: despensa com refs (p1…) no lugar dos ids e básicos ligados normalizados ([] em apps antigos).
    ...(Array.isArray(context.pantry)
      ? {
          pantry: hideCalories
            ? pantryRefRows(context.pantry)?.map(withoutPantryCalories)
            : pantryRefRows(context.pantry),
          kitchenBasics: recipeBasics(context),
        }
      : {}),
  };
}

/** Risco à vida: recebe a mensagem de segurança com o CVV. */
const LIFE_RISK_PATTERNS = [
  /suic/i,
  /me matar|me machucar|me ferir|me cortar/i,
  /tirar (a )?(minha )?(pr[óo]pria )?vida/i,
  /n[ãa]o quero (mais )?viver(?! (de|com|assim|desse|dessa|nessa|neste|nesse))/i,
  /acabar com tudo[.!?\s]*$/i,
  /n[ãa]o vejo (mais )?sentido/i,
];
const CRITICAL_PATTERNS = [
  /dor (forte )?no peito|aperto no peito|peito apertado|dor no bra[çc]o esquerdo/i,
  /falta de ar|n[ãa]o consigo respirar|engasg/i,
  /desmai/i,
  /convuls/i,
  /sangramento (intenso|forte|que n[ãa]o para)|v[ôo]mito com sangue|vomit\w* sangue|sangue no v[ôo]mito|gr[áa]vida[^.]{0,40}sangr/i,
  /anafila|garganta fechando|l[áa]bios? inchad|l[íi]ngua inchad/i,
  /overdose|envenen|intoxica[çc][ãa]o grave|cartela inteira|tomei (todos|v[áa]rios) (os )?(comprimidos|rem[ée]dios)/i,
  ...LIFE_RISK_PATTERNS,
];

/** Detecção determinística de urgência apenas no texto da pessoa (não no contexto). */
export function detectUrgency(text: string): Urgency {
  return CRITICAL_PATTERNS.some((p) => p.test(text)) ? "imediata" : "nenhuma";
}

export function urgencyKind(text: string): "vida" | "geral" {
  return LIFE_RISK_PATTERNS.some((p) => p.test(text)) ? "vida" : "geral";
}

export function wrapData(nonce: string, label: string, value: unknown): string {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  return `<<DADOS ${label} ${nonce}>>\n${body}\n<</DADOS ${label} ${nonce}>>`;
}

/** Nó determinístico de entrada: sinais, fatos, bloco de dados, urgência e rota inicial. */
export function prepareNode(state: GraphState): GraphUpdate {
  const flags = extractFlags(state.context);
  const facts = deriveFacts(state.context, flags);
  const urgency =
    state.mode === "chat" ||
    state.mode === "diet" ||
    state.mode === "recipe" ||
    state.mode === "meal_text"
      ? detectUrgency(state.text)
      : "nenhuma";
  const route =
    state.mode === "photo" ||
    state.mode === "diet" ||
    state.mode === "recipe" ||
    state.mode === "meal_text"
      ? ["nutricionista" as const]
      : state.mode === "exam" || state.mode === "rotulo"
        ? ["analista_exames" as const]
        : [];
  return {
    flags,
    facts,
    urgency,
    route,
    dataBlock: wrapData(
      state.nonce,
      "CONTEXTO",
      compactContext(state.context, flags.hideCalories),
    ),
    trace: ["preparar"],
  };
}

export function routeByMode(state: GraphState) {
  if (state.urgency === "imediata") return "urgencia";
  if (state.mode === "chat") return "triagem";
  return state.route.map((role) => new Send(role, state));
}
