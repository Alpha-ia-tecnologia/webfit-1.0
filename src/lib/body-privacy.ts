/**
 * "Ocultar números do corpo" (ESPACO-13): textos das telas em modo oculto, iguais no web e no app.
 * Quem vê o quê é decidido só por bodyNumbers() (space.ts); aqui fica apenas a cópia.
 */
import { plural } from "./format";

export const BODY_PRIVACY_COPY = {
  /** Interruptor em "Suas escolhas" (nome acessível exato). */
  switchLabel: "Ocultar números do corpo",
  hiddenTitle: "Números do corpo ocultos",
  adjust: "Ajustar em Preferências",
  /** Aviso da anamnese: é a tela de revisão, então os valores aparecem ali. */
  anamneseNotice:
    "Você ocultou os números do corpo nas telas. Aqui eles aparecem para você revisar ou corrigir.",
  /** Aviso do registro rápido de peso: sem o valor salvo. */
  weightSaved: "Peso salvo.",
  weightPlaceholder: "Ex.: 70,5",
  /** Linha de uma pesagem na lista, sem o valor. */
  weighIn: "Pesagem registrada",
  weighIns: "Pesagens",
} as const;

/** "Números do corpo ocultos · 8 pesagens registradas". */
export const hiddenJourneyText = (count: number): string =>
  `${BODY_PRIVACY_COPY.hiddenTitle} · ${plural(count, "pesagem registrada", "pesagens registradas")}`;
