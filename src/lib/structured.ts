import { z } from "zod";
import { chatSectionsSchema } from "./agent-blocks";
import { dietPlanV2Schema } from "./diet-plan";
import { examResultSchema } from "./exam-result";
import { labelReadSchema } from "./label-read";
import { mealTextSchema } from "./meal-text";
import { platePhotoSchema } from "./plate-photo";
import { recipeSetSchema } from "./recipe-schema";
import { visiblePlainText, visibleText } from "./text";

/**
 * Envelope das respostas estruturadas do agente. O texto (renderização determinística) continua
 * sendo a versão legível e o que guarda, revisor e histórico veem; este valor só desenha a tela.
 */
export const structuredReplySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("chat"), sections: chatSectionsSchema }),
  z.object({ kind: z.literal("diet"), plan: dietPlanV2Schema }),
  z.object({ kind: z.literal("photo"), draft: platePhotoSchema }),
  z.object({ kind: z.literal("recipes"), set: recipeSetSchema }),
  z.object({ kind: z.literal("exam"), result: examResultSchema }),
  // Descrição de refeição (DIARIO-07): itens citados pela pessoa, sem porção inventada.
  z.object({ kind: z.literal("meal_text"), draft: mealTextSchema }),
  // Leitura de rótulo (INJECAO-X2): nome e concentrações transcritos da foto; a pessoa confirma no frasco.
  z.object({ kind: z.literal("rotulo"), label: labelReadSchema }),
]);
export type StructuredReply = z.infer<typeof structuredReplySchema>;

function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, mapStrings(item, fn)]),
    );
  return value;
}

/**
 * Oculta calorias em toda folha de texto: visibleText (plain=false, marcador da pílula) ou
 * visiblePlainText (plain=true, para rótulos, aria e avisos). Com `hideBodyNumbers`, também os
 * números do corpo (ESPACO-13). Devolve cópia e nunca muta; sem nada a ocultar devolve o próprio valor.
 */
export function maskStructured<T>(
  value: T,
  hide: boolean,
  options: { plain?: boolean; hideBodyNumbers?: boolean } = {},
): T {
  const hideBody = options.hideBodyNumbers === true;
  if (!hide && !hideBody) return value;
  const mask = options.plain
    ? (s: string) => visiblePlainText(s, hide, hideBody)
    : (s: string) => visibleText(s, hide, hideBody);
  return mapStrings(value, mask) as T;
}

/** Todas as folhas de texto do valor, em ordem de profundidade. */
export function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringLeaves);
  return [];
}
