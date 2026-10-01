import { z } from "zod";
import { chatSectionsSchema } from "./lib/agent-blocks";
import { dietPlanV2Schema } from "./lib/diet-plan";
import { examResultSchema } from "./lib/exam-result";
import { kitchenBasicsSchema, recipeSetSchema } from "./lib/recipe-schema";
import { shoppingListSchema } from "./lib/shopping-schema";
import { structuredReplySchema } from "./lib/structured";
export type ScreenType =
  | "hoje"
  | "diario"
  | "agente"
  | "dieta"
  | "despensa"
  | "evolucao"
  | "espaco"
  | "adicionar_refeicao"
  | "notificacoes"
  | "anamnese"
  | "injecao";
const text = z
  .string()
  .trim()
  .min(1, "Preencha ou informe “Não sei / Prefiro não informar”.")
  .max(2000);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.")
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Data inválida.",
  );
/** Aceita "HH:MM" e também "HH:MM:SS" (campos de hora com segundos), guardando sempre "HH:MM". */
const time = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().slice(0, 5) : v),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido."),
);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const optionalNumber = (min: number, max: number, integer = false) =>
  z.preprocess(
    (v) =>
      v === undefined || (typeof v === "string" && !v.trim())
        ? null
        : typeof v === "string"
          ? Number(v)
          : v,
    (integer ? z.number().int() : z.number()).min(min).max(max).nullable(),
  );
// Empty inputs must remain unanswered, including fields where zero is valid.
const requiredNumber = (min: number, max: number, integer = false) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() ? Number(v) : undefined) : v),
    (integer
      ? z.number({ error: "Informe um número válido." }).int()
      : z.number({ error: "Informe um número válido." })
    )
      .min(min)
      .max(max),
  );
export const profileSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome.").max(100),
    birthDate: dateSchema.refine(
      (v) => v <= today() && Number(v.slice(0, 4)) >= 1900,
      "Confira a data de nascimento.",
    ),
    sex: z.enum(["masculino", "feminino", "nao_informado"], {
      error: "Selecione uma opção.",
    }),
    occupation: text,
    routine: text,
    weight: requiredNumber(20, 350),
    height: requiredNumber(100, 250),
    targetWeight: optionalNumber(20, 350),
    waist: optionalNumber(30, 250),
    hip: optionalNumber(30, 250),
    bodyFat: optionalNumber(1, 75),
    measurementDate: dateSchema,
    measurementMethod: text,
    conditions: text,
    medications: text,
    // Canetas emagrecedoras (GLP-1). Perfis salvos antes deste campo carregam "nao_informado".
    weightLossPen: z
      .enum(["nao", "sim", "nao_informado"], { error: "Selecione uma opção." })
      .default("nao_informado"),
    weightLossPenName: z.string().trim().max(200).default(""),
    weightLossPenDose: z.string().trim().max(100).default(""),
    weightLossPenPerMonth: optionalNumber(1, 31, true),
    // Dia da semana da aplicação semanal (0 = domingo … 6 = sábado); opcional. Perfis e backups antigos carregam null.
    penWeekday: optionalNumber(0, 6, true),
    supplements: text,
    surgeries: text,
    familyHistory: text,
    pregnancy: z.enum(["nao", "gestacao", "amamentacao", "nao_informado"]),
    fluidRestriction: z.enum(["nao", "sim", "nao_sei"]),
    eatingDisorder: z.enum(["nao", "sim", "nao_informado"]),
    allergies: z.enum(["nao", "sim", "nao_sei"]),
    allergyDetails: z.string().max(2000),
    diet: text,
    avoidedFoods: text,
    favoriteFoods: text,
    mealRoutine: text,
    mealsPerDay: requiredNumber(1, 12, true),
    usualWater: optionalNumber(0, 10000, true),
    digestiveSymptoms: text,
    bowelHabit: text,
    alcohol: text,
    tobacco: text,
    sleepHours: requiredNumber(0, 24),
    sleepQuality: z.enum(["boa", "regular", "ruim", "nao_informado"]),
    stress: z.enum(["baixo", "moderado", "alto", "nao_informado"]),
    activityLevel: z.enum(["sedentario", "leve", "moderado", "intenso"]),
    exerciseType: text,
    exerciseDays: requiredNumber(0, 7, true),
    exerciseMinutes: requiredNumber(0, 600),
    sedentaryHours: requiredNumber(0, 24),
    wakeTime: time,
    sleepTime: time,
    goal: z.enum(["organizar", "manter", "perder", "ganhar"]),
    motivation: text,
    barriers: text,
    foodBudget: text,
    cookingTime: text,
    professionalPlan: text,
    manualCalories: optionalNumber(500, 7000, true),
    manualWater: optionalNumber(100, 10000, true),
    manualProtein: optionalNumber(1, 500),
    manualCarbs: optionalNumber(1, 1000),
    manualFat: optionalNumber(1, 400),
    consentLocal: z.literal(true, {
      error: "Confirme o armazenamento para continuar.",
    }),
    consentAi: z.boolean(),
    aiConsentVersion: z.number().int().min(0).default(0),
    hideCalories: z.boolean(),
    /** Ocultar números do corpo (ESPACO-13): peso, altura, IMC, medidas e variações somem das telas.
     *  Preferência do Meu espaço, não resposta da anamnese; perfis e backups antigos carregam false. */
    hideBodyNumbers: z.boolean().default(false),
    // Ordem das seções do Hoje ("Editar Hoje"): chaves separadas por vírgula, "-" oculta. Vazio = padrão.
    homeLayout: z.string().trim().max(300).default(""),
    remindersEnabled: z.boolean(),
    quietStart: time,
    quietEnd: time,
    hydrationInterval: requiredNumber(30, 480, true),
    breakfastTime: time,
    lunchTime: time,
    dinnerTime: time,
  })
  .superRefine((p, ctx) => {
    if (p.allergies === "sim" && !p.allergyDetails.trim())
      ctx.addIssue({
        code: "custom",
        path: ["allergyDetails"],
        message: "Descreva as alergias ou indique que prefere não detalhar.",
      });
    if (p.weightLossPen === "sim") {
      if (!p.weightLossPenName)
        ctx.addIssue({
          code: "custom",
          path: ["weightLossPenName"],
          message: "Informe qual caneta ou escolha “Não sei o nome”.",
        });
      if (!p.weightLossPenDose)
        ctx.addIssue({
          code: "custom",
          path: ["weightLossPenDose"],
          message:
            "Informe a quantidade por aplicação ou escolha “Não sei a dose”.",
        });
      if (p.weightLossPenPerMonth === null)
        ctx.addIssue({
          code: "custom",
          path: ["weightLossPenPerMonth"],
          message: "Informe quantas aplicações faz por mês.",
        });
    }
    if (p.measurementDate > today())
      ctx.addIssue({
        code: "custom",
        path: ["measurementDate"],
        message: "A medição não pode estar no futuro.",
      });
    if (p.measurementDate < p.birthDate)
      ctx.addIssue({
        code: "custom",
        path: ["measurementDate"],
        message: "A medição deve ser posterior ao nascimento.",
      });
  });
export type Profile = z.infer<typeof profileSchema>;
export type Draft = Record<string, string | number | boolean | null>;
export const macrosSchema = z.object({
  protein: z.number().min(0).max(5000),
  carbs: z.number().min(0).max(10000),
  fat: z.number().min(0).max(5000),
});
export type Macros = z.infer<typeof macrosSchema>;
export const foodSchema = z.object({
  id: z.string().max(100),
  name: z.string().min(1).max(200),
  category: z.string().max(100),
  caloriesPer100g: z.number().min(0).max(1000),
  proteinPer100g: z.number().min(0).max(100),
  carbsPer100g: z.number().min(0).max(100),
  fatPer100g: z.number().min(0).max(100),
  source: z.string().min(1).max(500),
  sourceUrl: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
});
export type FoodItem = z.infer<typeof foodSchema>;
export const mealItemSchema = z.object({
  food: foodSchema,
  grams: z.number().positive().max(5000),
});
export type MealItem = z.infer<typeof mealItemSchema>;
export const savedMealSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  categoryTag: z.string().trim().min(1).max(50),
  items: z.array(mealItemSchema).min(1).max(100),
});
export type SavedMeal = z.infer<typeof savedMealSchema>;
/** Efeitos percebidos no bem-estar (SERINGA-07): chaves fixas, sem texto livre; rótulos em src/lib/symptoms.ts. */
export const SYMPTOM_KEYS = [
  "nausea",
  "vomito",
  "azia",
  "intestino_preso",
  "diarreia",
  "dor_barriga",
  "cansaco",
  "dor_cabeca",
  "tontura",
  "reacao_local",
] as const;
export type SymptomKey = (typeof SYMPTOM_KEYS)[number];
export const SYMPTOMS_MAX = 6;
/** Intensidade: 1 leve, 2 moderada, 3 forte. */
export const symptomSchema = z.object({
  key: z.enum(SYMPTOM_KEYS),
  intensity: z.number().int().min(1).max(3),
});
export type Symptom = z.infer<typeof symptomSchema>;
const symptomList = z
  .array(symptomSchema)
  .min(1)
  .max(SYMPTOMS_MAX)
  .refine((list) => new Set(list.map((s) => s.key)).size === list.length);
/** "Como ficou?" depois da refeição (SERINGA-07); rótulos e opções por perfil em src/lib/symptoms.ts. */
export const SATIETY_KEYS = ["ainda_fome", "na_medida", "rapida", "pouca_fome", "desconforto"] as const;
export type SatietyKey = (typeof SATIETY_KEYS)[number];
const imageData = z
  .string()
  .max(3_000_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);
export const diarySchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    date: dateSchema,
    time,
    createdAt: z.string(),
    updatedAt: z.string(),
    type: z.enum(["refeicao", "agua", "bem_estar"]),
    title: z.string().min(1).max(200),
    description: z.string().max(4000),
    categoryTag: z.string().max(50).optional(),
    calories: z.number().int().min(0).max(50000).optional(),
    macros: macrosSchema.optional(),
    items: z.array(mealItemSchema).max(100).optional(),
    imageUrl: imageData.optional(),
    amountMl: z.number().int().positive().max(5000).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    sleepHours: z.number().min(0).max(24).optional(),
    /** Marcadores do bem-estar ("Náusea", "Disposição"…); opcionais, inclusive no backup. */
    tags: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
    /** Efeitos percebidos (SERINGA-07), só no bem-estar. Lista vazia, repetida ou inválida vira undefined (backup tolerante). */
    symptoms: symptomList.optional().catch(undefined),
    /** "Como ficou?" (SERINGA-07), só em refeição; valor desconhecido vira undefined. */
    satiety: z.enum(SATIETY_KEYS).optional().catch(undefined),
  })
  .superRefine((e, ctx) => {
    if (e.type === "refeicao" && !e.items?.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Adicione ao menos um alimento.",
      });
    if (e.type === "agua" && !e.amountMl)
      ctx.addIssue({
        code: "custom",
        path: ["amountMl"],
        message: "Informe o volume.",
      });
    if (e.type === "bem_estar" && !e.rating)
      ctx.addIssue({
        code: "custom",
        path: ["rating"],
        message: "Informe como se sente.",
      });
    if (e.symptoms && e.type !== "bem_estar")
      ctx.addIssue({
        code: "custom",
        path: ["symptoms"],
        message: "Efeitos só entram no registro de bem-estar.",
      });
    if (e.satiety && e.type !== "refeicao")
      ctx.addIssue({
        code: "custom",
        path: ["satiety"],
        message: "“Como ficou?” só entra em refeição.",
      });
  });
export type DiaryEntry = z.infer<typeof diarySchema>;
export const measurementSchema = z.object({
  id: z.string(),
  date: dateSchema,
  weight: z.number().min(20).max(350),
  height: z.number().min(100).max(250),
  waist: optionalNumber(30, 250),
  hip: optionalNumber(30, 250),
  bodyFat: optionalNumber(1, 75),
  method: z.string().min(1).max(2000),
});
export type Measurement = z.infer<typeof measurementSchema>;
export const habitSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(2).max(150),
  timeOfDay: time,
  createdDate: dateSchema,
  completedDates: z.array(dateSchema),
});
export type HabitItem = z.infer<typeof habitSchema>;
export const agentMetaSchema = z.object({
  specialists: z
    .array(z.enum(["nutricionista", "rotina", "analista_exames"]))
    .max(3),
  reviewed: z.boolean(),
  revisions: z.number().int().min(0).max(5),
  urgency: z.enum(["nenhuma", "atencao", "imediata"]),
  notes: z.array(z.string().max(400)).max(8),
  llmCalls: z.number().int().min(0),
});
export type AgentMeta = z.infer<typeof agentMetaSchema>;
export const pantryLocationSchema = z.enum(["despensa", "geladeira"]);
export const pantryUnitSchema = z.enum(["un", "g", "kg", "ml", "l", "pacote"]);
export const pantryDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().max(100000).nullable(),
  unit: pantryUnitSchema,
  location: pantryLocationSchema,
  expiresOn: dateSchema.nullable(),
  notes: z.string().trim().max(500),
});
export const pantryItemSchema = pantryDraftSchema.extend({
  id: z.string().min(1),
  // "shopping_list": guardado da lista de compras (AGENTE-08), sempre depois da revisão.
  source: z.enum(["manual", "pantry_photo", "shopping_photo", "shopping_list"]),
  updatedAt: z.string().datetime(),
});
export type PantryDraft = z.infer<typeof pantryDraftSchema>;
export type PantryItem = z.infer<typeof pantryItemSchema>;
export type AgentMode =
  | "chat"
  | "photo"
  | "exam"
  | "diet"
  | "pantry_photo"
  | "shopping_photo"
  | "recipe"
  | "rotulo"
  | "meal_text";
export const pantryScanSchema = z.object({
  items: z.array(pantryDraftSchema).max(60),
  notes: z.string().max(1500),
});
export {
  KITCHEN_BASIC_KEYS,
  kitchenBasicSchema,
  kitchenBasicsSchema,
  RECIPE_LIMITS,
  RECIPE_MEALS,
  recipeCardSchema,
  recipeSetSchema,
  type KitchenBasicKey,
  type RecipeCard,
  type RecipeSet,
} from "./lib/recipe-schema";
export {
  SHOPPING_LIMITS,
  SHOPPING_ORIGINS,
  SHOPPING_SECTIONS,
  shoppingItemSchema,
  shoppingListSchema,
  type ShoppingItem,
  type ShoppingOrigin,
  type ShoppingSection,
} from "./lib/shopping-schema";
export { structuredReplySchema, type StructuredReply } from "./lib/structured";
export const agentReplySchema = z.object({
  text: z.string().min(1).max(20000),
  meta: agentMetaSchema,
  inventoryDraft: pantryScanSchema.optional(),
  /** Dados estruturados (blocos do chat, dieta, foto, receitas); inválido ou desconhecido vira texto. */
  structured: structuredReplySchema.optional().catch(undefined),
});
export type AgentReply = z.infer<typeof agentReplySchema>;
export const dietPlanSchema = z.object({
  id: z.string().min(1),
  text: agentReplySchema.shape.text,
  meta: agentMetaSchema,
  createdAt: z.string().datetime(),
  profileSignature: z.string().min(1).max(100),
  /** Plano estruturado (AGENTE-02); planos antigos só têm o texto. */
  structured: dietPlanV2Schema.optional().catch(undefined),
});
export type DietPlan = z.infer<typeof dietPlanSchema>;
export const recipeSchema = z.object({
  id: z.string().min(1),
  text: agentReplySchema.shape.text,
  meta: agentMetaSchema,
  createdAt: z.string().datetime(),
  dietPlanId: z.string().min(1),
  profileSignature: z.string().min(1).max(100),
  pantrySignature: z.string().min(1).max(100),
  /** Receitas estruturadas (AGENTE-04); ausente em receitas antigas ou vindas do texto livre.
   *  Inválida (versão futura, dado corrompido) vira undefined: o texto continua valendo. */
  recipeSet: recipeSetSchema.optional().catch(undefined),
});
export type SavedRecipe = z.infer<typeof recipeSchema>;
export const chatSchema = z.object({
  id: z.string(),
  sender: z.enum(["ai", "user"]),
  text: z.string().max(20000),
  timestamp: z.string(),
  status: z.enum(["sent", "error"]).optional(),
  meta: agentMetaSchema.optional(),
  /** Blocos visuais da resposta (SIS-02); o texto segue sendo a versão legível e o histórico. */
  blocks: chatSectionsSchema.optional().catch(undefined),
});
export type ChatMessage = z.infer<typeof chatSchema>;
export const examSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  date: dateSchema,
  fileName: z.string().max(200),
  mimeType: z.enum([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]),
  data: z
    .string()
    .max(7_000_000)
    .regex(
      /^data:(application\/pdf|image\/(jpeg|png|webp));base64,[A-Za-z0-9+/=]+$/,
    ),
  notes: z.string().max(2000),
  analysis: z.string().max(20000).optional(),
  /** Resultados estruturados da última análise (ESPACO-05); análises antigas só têm o texto. */
  analysisStructured: examResultSchema.optional().catch(undefined),
  /** Perguntas da análise já levadas à consulta (índices em analysisStructured.perguntas). */
  questionsDone: z.array(z.number().int().min(0).max(5)).max(6).optional().catch(undefined),
});
export type Exam = z.infer<typeof examSchema>;
export const appointmentSchema = z.object({
  id: z.string(),
  professional: z.string().trim().min(2).max(200),
  registration: z.string().max(100),
  date: dateSchema,
  time,
  url: z
    .string()
    .url()
    .max(2000)
    .refine((v) => v.startsWith("https://"), "Use um link HTTPS."),
  notes: z.string().max(2000),
});
export type Appointment = z.infer<typeof appointmentSchema>;
/** Seringas de insulina usadas para injetáveis: a escala em UI segue 100 UI = 1 ml. */
export const SYRINGE_UNITS = [30, 50, 100] as const;
export type SyringeUnits = (typeof SYRINGE_UNITS)[number];
export const INJECTION_SITES = ["abdomen", "coxa", "braco"] as const;
export type InjectionSite = (typeof INJECTION_SITES)[number];
/** Lado do corpo da aplicação: sempre o da pessoa, nunca o de quem olha a figura. */
export const INJECTION_SIDES = ["esquerdo", "direito"] as const;
export type InjectionSide = (typeof INJECTION_SIDES)[number];
/** Como a pessoa aplica: frasco + seringa de insulina, caneta com seletor ou caneta de dose única. */
export const INJECTION_METHODS = ["frasco", "caneta", "dose_unica"] as const;
export type InjectionMethod = (typeof INJECTION_METHODS)[number];
/** Aplicação registrada na calculadora de seringa e dose; valores informados pela pessoa. */
export const injectionSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    date: dateSchema,
    time,
    createdAt: z.string(),
    updatedAt: z.string(),
    // Registros salvos antes do modo caneta são todos de frasco e seringa.
    method: z.enum(INJECTION_METHODS).default("frasco"),
    medication: z.string().trim().min(1).max(120),
    // Na caneta, só a dose em mg é registrada: concentração, seringa, unidades e volume ficam nulos.
    concentrationMgPerMl: z.number().positive().max(100).nullable().default(null),
    syringeUnits: z.union([z.literal(30), z.literal(50), z.literal(100)]).nullable().default(null),
    units: z.number().int().min(1).max(100).nullable().default(null),
    volumeMl: z.number().positive().max(1).nullable().default(null),
    doseMg: z.number().positive().max(100),
    site: z.enum(INJECTION_SITES),
    // Mapa de rodízio (SERINGA-04): registros anteriores não têm lado e ficam nulos ("lado não informado").
    side: z.enum(INJECTION_SIDES).nullable().default(null),
    notes: z.string().max(2000).default(""),
  })
  .superRefine((e, ctx) => {
    if (e.method !== "frasco") {
      if (
        e.concentrationMgPerMl !== null ||
        e.syringeUnits !== null ||
        e.units !== null ||
        e.volumeMl !== null
      )
        ctx.addIssue({
          code: "custom",
          path: ["units"],
          message: "Na caneta, a dose é registrada em mg, sem unidades da seringa.",
        });
      return;
    }
    const { concentrationMgPerMl: concentration, syringeUnits, units, volumeMl } = e;
    const vialFields = { concentrationMgPerMl: concentration, syringeUnits, units, volumeMl };
    let isMissing = false;
    for (const [path, value] of Object.entries(vialFields))
      if (value === null) {
        isMissing = true;
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: "Informe a concentração, a seringa e as unidades do frasco.",
        });
      }
    if (isMissing || concentration === null || syringeUnits === null || units === null || volumeMl === null)
      return;
    if (units > syringeUnits)
      ctx.addIssue({
        code: "custom",
        path: ["units"],
        message: "A quantidade não cabe na seringa escolhida.",
      });
    if (Math.abs(volumeMl - units / 100) > 0.001)
      ctx.addIssue({
        code: "custom",
        path: ["volumeMl"],
        message: "O volume não corresponde às unidades.",
      });
    if (Math.abs(e.doseMg - (units / 100) * concentration) > 0.01)
      ctx.addIssue({
        code: "custom",
        path: ["doseMg"],
        message: "A dose não corresponde ao volume e à concentração.",
      });
  });
export type InjectionEntry = z.infer<typeof injectionSchema>;
/** Estoque do frasco ou da caneta em uso (SERINGA-12): quantidade, abertura e "usar até" informados pela pessoa. */
export const treatmentStockSchema = z
  .object({
    method: z.enum(INJECTION_METHODS),
    // Frasco: volume total em ml (até 10 ml, 2 casas). Canetas: null.
    volumeMl: z.number().positive().max(10).nullable().default(null),
    // Caneta com seletor: doses que a caneta rende; dose única: canetas na caixa. Frasco: null.
    doses: z.number().int().min(1).max(60).nullable().default(null),
    // Aplicações com data a partir deste dia contam no consumo.
    openedOn: dateSchema,
    // "Usar até", digitado pela pessoa; opcional.
    useBy: dateSchema.nullable().default(null),
  })
  .superRefine((s, ctx) => {
    const isVial = s.method === "frasco";
    if (isVial ? s.volumeMl === null || s.doses !== null : s.doses === null || s.volumeMl !== null)
      ctx.addIssue({
        code: "custom",
        path: [isVial ? "volumeMl" : "doses"],
        message: "Informe a quantidade do frasco ou da caneta.",
      });
    if (s.useBy !== null && s.useBy < s.openedOn)
      ctx.addIssue({
        code: "custom",
        path: ["useBy"],
        message: "A data de uso deve ser igual ou posterior à abertura.",
      });
  });
export type TreatmentStock = z.infer<typeof treatmentStockSchema>;
/** Como a meta calórica foi obtida; null quando não há meta. */
export type GoalStrategy =
  "manual" | "manutencao" | "deficit" | "deficit_caneta" | "superavit" | null;
export interface Goals {
  basal: number | null;
  expenditure: number | null;
  calories: number | null;
  water: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  source: string;
  reason: string | null;
  strategy: GoalStrategy;
  /** Explicação curta do déficit, superávit ou piso aplicado. */
  note: string | null;
}
export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  type: "agua" | "refeicao" | "medicao" | "habito" | "injecao" | "despensa";
  read: boolean;
  time: string;
}
/** Ação única de um aviso, como "Desfazer". */
/** Pergunta da folha de confirmação (web ConfirmSheet e app nativo). */
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" para apagar dados sem volta. */
  tone?: "danger" | "default";
}
export interface ToastAction {
  label: string;
  onAction: () => void;
}
/** Mini anel do aviso (toast v2): progresso do dia depois de um registro de água ou combinado. */
export interface ToastProgress {
  percent: number;
  tone: "water" | "habit";
}
/** Texto do aviso com o progresso opcional. */
export interface ToastNote {
  text: string;
  progress?: ToastProgress;
}
export interface ToastMessage {
  id: string;
  message: string;
  /** "warning" pede atenção (âmbar); "error" é só para falha real, como não conseguir salvar. */
  type: "success" | "info" | "warning" | "error";
  action?: ToastAction;
  progress?: ToastProgress;
}
export const stateSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().min(0),
  userId: z.string().min(1),
  profile: profileSchema.nullable(),
  draft: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .nullable(),
  draftStep: z.number().int().min(0).max(7),
  diary: z.array(diarySchema).max(30000),
  savedMeals: z.array(savedMealSchema).max(100).default([]),
  // Aplicações de injetáveis; estados salvos antes deste campo carregam lista vazia.
  injections: z.array(injectionSchema).max(5000).default([]),
  // Estoque do frasco ou caneta (SERINGA-12); estados e backups anteriores carregam null; valor inválido vira null.
  treatmentStock: treatmentStockSchema.nullable().default(null).catch(null),
  measurements: z.array(measurementSchema).max(10000),
  habits: z.array(habitSchema).max(100),
  messages: z.array(chatSchema).max(2000),
  // Compatível com dados salvos antes da criação de dietas.
  dietPlan: dietPlanSchema.nullable().default(null),
  pantry: z.array(pantryItemSchema).max(500).default([]),
  recipes: z.array(recipeSchema).max(30).default([]),
  // Básicos de cozinha (IA-X4); estados e backups anteriores carregam lista vazia.
  kitchenBasics: kitchenBasicsSchema.default([]),
  // Lista de compras (AGENTE-08), só no aparelho; estados e backups anteriores carregam lista vazia.
  shoppingList: shoppingListSchema.default([]),
  foods: z.array(foodSchema).max(3000),
  exams: z.array(examSchema).max(30),
  appointments: z.array(appointmentSchema).max(500),
  readNotifications: z.array(z.string()).max(10000),
  goalHistory: z
    .array(z.object({ date: dateSchema, profile: profileSchema }))
    .max(3000),
  updatedAt: z.string(),
});
export type AppState = z.infer<typeof stateSchema>;
