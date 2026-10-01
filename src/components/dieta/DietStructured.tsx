import type { ReactNode } from "react";
import { ChevronDown, MessageCircle, ShieldCheck } from "lucide-react";
import { useApp } from "../../lib/context";
import { renderDietText, sanitizeDietPlan, type DietPlanV2 } from "../../lib/diet-plan";
import type { SwapMark } from "../../lib/diet-week";
import { visiblePlainText } from "../../lib/text";
import type { DietPlan } from "../../types";
import { RichText } from "../RichText";
import { useBodyNumbersHidden } from "../useBodyNumbersHidden";
import { DietTimeline, type TimelineToday } from "./DietTimeline";
import { PlanShortcuts } from "./PlanShortcuts";

/**
 * Plano estruturado (AGENTE-02, fidelidade "Minha dieta"): o dia em linha do tempo com cartões por
 * refeição, a semana do plano, "Para facilitar" em atalhos, perguntas e, no fim, o texto integral
 * (o salvo e enviado ao chat; no perfil sensível, refeito sem gramas). O resumo e a nota dos
 * horários ficam no (i) do cabeçalho do dia. `view` já chega sem gramas no perfil sensível e com
 * as calorias mascaradas.
 */
export function DietStructured({
  plan,
  view,
  stale,
  sensitive,
  calm,
  hideCalories,
  dayNote,
  swaps,
  today,
  week,
  textId,
  isTextOpen,
  onToggleText,
}: {
  plan: DietPlan;
  view: DietPlanV2;
  stale: boolean;
  sensitive: boolean;
  calm: boolean;
  hideCalories: boolean;
  /** Acima da linha do tempo: o aviso da prévia de outro dia. */
  dayNote?: ReactNode;
  /** Trocas do dia mostrado (IA-X5), por refeição. */
  swaps?: readonly (readonly SwapMark[])[];
  /** Estados e ações das refeições, só no dia de hoje. */
  today?: TimelineToday;
  /** "Outros dias do plano", logo depois da linha do tempo. */
  week?: ReactNode;
  /** Painel "Ver plano em texto" (o ⋯ do cabeçalho também o abre). */
  textId: string;
  isTextOpen: boolean;
  onToggleText: () => void;
}) {
  const { navigate } = useApp();
  const hideBody = useBodyNumbersHidden();
  // O texto salvo traz "(≈ 100 g)": no perfil sensível, o texto sai do plano estruturado sem gramas.
  const fullText =
    sensitive && plan.structured
      ? renderDietText(sanitizeDietPlan(plan.structured, { sensitive: true }))
      : plan.text;
  return (
    <div className={`diet-v2${stale ? " is-stale" : ""}`}>
      {stale && <span className="diet-plan-tag">Versão anterior</span>}
      {dayNote}
      <DietTimeline
        meals={view.refeicoes}
        sensitive={sensitive}
        calm={calm}
        hideCalories={hideCalories}
        swaps={swaps}
        today={today}
      />
      {week}
      <PlanShortcuts tips={view.dicas} />
      <section className="diet-more" aria-label="Mais sobre o plano">
        {view.perguntas.length > 0 && (
          <>
            <h2>Para ajustar seu plano</h2>
            <ul className="diet-questions">
              {view.perguntas.map((question, index) => (
                <li key={`${index}-${question}`}>{question}</li>
              ))}
            </ul>
            <button
              type="button"
              className="text-btn diet-answer"
              onClick={() => navigate("agente")}
            >
              <MessageCircle size={15} aria-hidden="true" />
              Responder no chat
            </button>
          </>
        )}
        <button
          type="button"
          className="text-btn diet-text-toggle"
          aria-expanded={isTextOpen}
          aria-controls={textId}
          onClick={onToggleText}
        >
          Ver plano em texto
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        <div id={textId} className="diet-text-panel" hidden={!isTextOpen}>
          {isTextOpen && (
            <RichText
              text={fullText}
              hideCalories={hideCalories}
              className="diet-text"
              testId="diet-plan-text"
            />
          )}
        </div>
        {plan.meta.notes.length > 0 && (
          <div className="notice">
            {plan.meta.notes.map((note, index) => (
              <p key={index}>{visiblePlainText(note, hideCalories, hideBody)}</p>
            ))}
          </div>
        )}
        <p className="diet-plan-foot">
          <ShieldCheck size={14} aria-hidden="true" />
          Apoio educativo · revisão automática, sem revisão humana
        </p>
      </section>
    </div>
  );
}
