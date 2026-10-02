import type { ModelPart } from "./model";
import { POLICY } from "./graph/prompts";
import { contextSchema } from "./graph/prepare";
import {
  profileSchema,
  pantryItemSchema,
  dietPlanSchema,
  kitchenBasicsSchema,
} from "../src/types";
import { localDate } from "../src/lib/domain";
import { MEAL_TEXT_MAX_CHARS } from "../src/lib/meal-text";
import { z } from "zod";

/** Dados mínimos para personalizar refeições sem tratar uma anamnese vazia como concluída. */
export const dietContextSchema = z.object({
  age: z.number().int().min(0).max(130),
  anamnese: z
    .object({
      routine: profileSchema.shape.routine,
      conditions: profileSchema.shape.conditions,
      // Lista fechada de condições (perfis antigos chegam sem ela: vale o texto livre).
      conditionTags: profileSchema.shape.conditionTags,
      medications: profileSchema.shape.medications,
      pregnancy: profileSchema.shape.pregnancy,
      fluidRestriction: profileSchema.shape.fluidRestriction,
      eatingDisorder: profileSchema.shape.eatingDisorder,
      allergies: profileSchema.shape.allergies,
      allergyDetails: profileSchema.shape.allergyDetails,
      diet: profileSchema.shape.diet,
      avoidedFoods: profileSchema.shape.avoidedFoods,
      favoriteFoods: profileSchema.shape.favoriteFoods,
      mealRoutine: profileSchema.shape.mealRoutine,
      mealsPerDay: profileSchema.shape.mealsPerDay,
      goal: profileSchema.shape.goal,
      foodBudget: profileSchema.shape.foodBudget,
      cookingTime: profileSchema.shape.cookingTime,
      professionalPlan: profileSchema.shape.professionalPlan,
      hideCalories: profileSchema.shape.hideCalories,
    })
    .refine((a) => a.allergies !== "sim" || !!a.allergyDetails.trim(), {
      path: ["allergyDetails"],
      message: "Descreva as alergias antes de solicitar uma dieta.",
    })
    // Condições respondidas: alguma da lista ou, nos perfis antigos, o texto livre.
    .refine((a) => a.conditionTags.length > 0 || !!a.conditions, {
      path: ["conditionTags"],
      message: "Responda as condições de saúde antes de solicitar uma dieta.",
    }),
});

export const requestSchema = z
  .object({
    mode: z.enum([
      "chat",
      "photo",
      "exam",
      "diet",
      "pantry_photo",
      "shopping_photo",
      "recipe",
      "rotulo",
      "meal_text",
    ]),
    text: z.string().trim().min(1).max(6000),
    consent: z.literal(true),
    context: z
      .record(z.string(), z.unknown())
      .refine(
        (v) => JSON.stringify(v).length <= 160000,
        "Contexto muito grande.",
      ),
    history: z
      .array(
        z.object({
          sender: z.enum(["user", "ai"]),
          text: z.string().max(20000),
        }),
      )
      .max(16),
    file: z.string().max(7_000_000).optional(),
  })
  .strict()
  .superRefine((request, ctx) => {
    if (request.mode === "rotulo" && !request.file)
      ctx.addIssue({ code: "custom", path: ["file"], message: "Selecione a foto do rótulo." });
    if (request.mode === "meal_text") {
      if (request.file !== undefined)
        ctx.addIssue({ code: "custom", path: ["file"], message: "A descrição da refeição não aceita anexos." });
      if (request.text.length > MEAL_TEXT_MAX_CHARS)
        ctx.addIssue({ code: "custom", path: ["text"], message: "Descreva a refeição em até 600 caracteres." });
      return;
    }
    if (request.mode === "pantry_photo" || request.mode === "shopping_photo") {
      if (!request.file)
        ctx.addIssue({
          code: "custom",
          path: ["file"],
          message: "Selecione uma foto para reconhecer os itens.",
        });
      return;
    }
    if (request.mode === "recipe") {
      const data = z
        .object({
          dietPlan: dietPlanSchema,
          currentProfileSignature: z.string(),
          pantry: z.array(pantryItemSchema).min(1).max(500),
          // Tolerante: ausente (apps antigos) passa e chave desconhecida é descartada, nunca 400.
          kitchenBasics: kitchenBasicsSchema.optional(),
        })
        .safeParse(request.context);
      if (
        !data.success ||
        (data.success &&
          (data.data.dietPlan.profileSignature !==
            data.data.currentProfileSignature ||
            !data.data.dietPlan.meta.reviewed ||
            data.data.pantry.some(
              (i) => i.expiresOn !== null && i.expiresOn < localDate(),
            )))
      )
        ctx.addIssue({
          code: "custom",
          path: ["context"],
          message:
            "Use uma dieta atual e alimentos disponíveis para gerar receitas.",
        });
    }
    if (request.mode !== "diet" && request.mode !== "recipe") return;
    if (request.file !== undefined)
      ctx.addIssue({
        code: "custom",
        path: ["file"],
        message: "A criação de dieta usa a anamnese e não aceita anexos.",
      });
    if (
      !contextSchema.safeParse(request.context).success ||
      !dietContextSchema.safeParse(request.context).success
    )
      ctx.addIssue({
        code: "custom",
        path: ["context"],
        message: "Conclua e confira a anamnese antes de solicitar sua dieta.",
      });
  });
/** Mantido por compatibilidade: a política vive em server/graph/prompts.ts. */
export const systemInstruction = POLICY;
export function mediaPart(data: string, mode: "photo" | "exam"): ModelPart {
  const match =
    /^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
      data,
    );
  if (!match) throw new Error("Arquivo inválido.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > (mode === "photo" ? 2 : 5) * 1024 * 1024)
    throw new Error("Arquivo acima do limite permitido.");
  const mime = match[1];
  const valid =
    mime === "application/pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-"
      : mime === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mime === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP";
  if (!valid || (mode === "photo" && mime === "application/pdf"))
    throw new Error(
      "O conteúdo do arquivo não corresponde ao formato informado.",
    );
  return mime === "application/pdf"
    ? { type: "file", dataUrl: data, filename: "laudo.pdf" }
    : { type: "image", dataUrl: data };
}
