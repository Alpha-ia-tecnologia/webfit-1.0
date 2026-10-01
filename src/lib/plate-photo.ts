import { z } from "zod";
import { clip } from "./agent-blocks";

/** Rascunho estruturado da foto do prato (DIARIO-04). Módulo folha: sem gramas e sem kcal. */

export const CONFIDENCE = ["high", "medium", "low"] as const;
export const photoItemSchema = z.object({
  name: clip(80),
  searchTerms: z.array(clip(60)).min(1).max(3),
  confidence: z.enum(CONFIDENCE),
  allergyMatch: z.boolean(),
});
export const platePhotoSchema = z.object({
  items: z.array(photoItemSchema).max(12),
  uncertainties: z.array(clip(200)).max(4),
});
export type PhotoItem = z.infer<typeof photoItemSchema>;
export type PlatePhoto = z.infer<typeof platePhotoSchema>;

export const CONFIDENCE_LABEL = {
  high: "Confiança alta",
  medium: "Confiança média",
  low: "Confiança baixa",
} as const;

/**
 * Texto determinístico do rascunho (guarda, revisor e histórico). Não acrescenta números:
 * a regra de foto do revisor (sem porções nem valores) continua valendo sobre ele.
 */
export function renderPhotoText(draft: PlatePhoto): string {
  const items = draft.items.length
    ? [
        "**Itens identificados**",
        ...draft.items.map(
          (item) =>
            `- ${item.name} (${CONFIDENCE_LABEL[item.confidence].toLowerCase()}) · procurar: ${item.searchTerms.join("; ")}${item.allergyMatch ? " · possível alérgeno declarado" : ""}`,
        ),
      ].join("\n")
    : "Nenhum alimento identificado com segurança na foto.";
  const doubts = draft.uncertainties.length
    ? ["**Incertezas**", ...draft.uncertainties.map((u) => `- ${u}`)].join("\n")
    : null;
  return doubts ? `${items}\n\n${doubts}` : items;
}
