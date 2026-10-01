import { CalendarRange, Info } from "lucide-react";
import { canShowProjection } from "../../lib/anamnese-flow";
import { weightProjection } from "../../lib/body-metrics";
import type { Draft } from "../../types";
import { toNumber } from "./inputs";

/**
 * Faixa de meses até o peso desejado, no ritmo de 0,25 a 0,5 kg por semana. Nunca uma data;
 * meta abaixo da faixa de referência vira só a cautela. Some em qualquer perfil que peça
 * avaliação individual (canShowProjection).
 */
export function WeightProjection({
  answers,
  today,
}: {
  answers: Draft;
  today: string;
}) {
  if (!canShowProjection(answers, today)) return null;
  const current = toNumber(answers.weight);
  const target = toNumber(answers.targetWeight);
  const height = toNumber(answers.height);
  if (current === null || target === null || height === null) return null;
  const projection = weightProjection({
    current,
    target,
    height,
    goal: String(answers.goal ?? ""),
    today,
  });
  if (!projection) return null;
  const isCaution = projection.kind === "underweight";
  const Icon = isCaution ? Info : CalendarRange;
  return (
    <div
      className={`weight-projection ${isCaution ? "is-caution" : ""}`}
      data-testid="weight-projection"
    >
      <Icon size={18} aria-hidden="true" />
      <div>
        {!isCaution && <strong>{projection.title}</strong>}
        <p>{projection.caption}</p>
      </div>
    </div>
  );
}
