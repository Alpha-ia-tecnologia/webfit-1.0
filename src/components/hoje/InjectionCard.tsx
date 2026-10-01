import { useId, useState, type RefObject } from "react";
import { ChevronRight, Smile, Syringe } from "lucide-react";
import { useApp } from "../../lib/context";
import { cycleCard } from "../../lib/cycle-tips";
import { localDate } from "../../lib/domain";
import { daysAgoLabel, injectionTitle, spotLabel } from "../../lib/injection";
import type { InjectionCardModel } from "../../lib/treatment";
import { Card } from "../UI";
import { BodyMapMini } from "../injecao/BodyMapMini";
import { CycleTipBlock } from "../injecao/CycleTips";
import { NextDoseRing } from "../injecao/NextDoseRing";

type Props = {
  model: InjectionCardModel;
  onOpen: () => void;
  onRegister: () => void;
  onMood: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
};

const RING_SIZE = 78;

/**
 * Caneta no Hoje (HOJE-05) como widget: anel da próxima dose estimada, o remédio, "Próxima: terça,
 * 29", a última aplicação e o mapa com o local sugerido (que abre "Calcular dose e registrar").
 * Só informativo: nunca sugere dose. No dia estimado, com receita recente, "Registrar aplicação" sobe.
 */
export function InjectionCard({ model, onOpen, onRegister, onMood, headingRef }: Props) {
  const { state } = useApp();
  const [isCycleOpen, setCycleOpen] = useState(false);
  const cycleId = useId();
  const { summary, next, text, variant } = model;
  // "Seu ciclo da semana" (SERINGA-11): só na estimativa; cycleCard já barra gestação, menores e não semanal.
  const cycle =
    variant === "estimate" && state.profile
      ? cycleCard({ profile: state.profile, injections: state.injections, diary: state.diary, today: localDate() })
      : null;
  const last = summary.last;
  const lastSpot = last ? spotLabel(last.site, last.side ?? null) : "";
  const suggestedSpot = spotLabel(summary.suggestedSite, summary.suggestedSide);
  const lastLine = last ? `Última ${daysAgoLabel(summary.daysSinceLast)} · ${lastSpot.toLowerCase()}` : null;
  const isEstimate = variant === "estimate" && !!next && !!text && !!last;
  const heading = (
    <h2 ref={headingRef} tabIndex={-1} className="inj-card-kicker">
      <Syringe size={16} aria-hidden="true" />
      {last ? (
        <>
          <span className="sr-only">Medicação injetável: </span>
          {injectionTitle(last)}
        </>
      ) : (
        "Medicação injetável"
      )}
    </h2>
  );
  const main = isEstimate ? (
    <>
      <p className="inj-card-next">{text.short}</p>
      <p className="inj-card-last">{lastLine}</p>
      {text.hint && <p className="hint">{text.hint}</p>}
    </>
  ) : variant === "first" ? (
    <>
      <p className="inj-card-next">Nenhuma aplicação ainda</p>
      {model.tracks && <p className="inj-card-last">Registre a primeira para estimar a próxima dose.</p>}
    </>
  ) : (
    <>
      <p className="inj-card-next">Próximo local: {suggestedSpot}</p>
      <p className="inj-card-last">
        {last ? `Última aplicação ${daysAgoLabel(summary.daysSinceLast)} · ${summary.recentCount} em 30 dias` : ""}
      </p>
    </>
  );
  return (
    <Card className={`injection-card stagger-5 is-${variant}`}>
      <div className="inj-card-main">
        {isEstimate && <NextDoseRing next={next} text={text} size={RING_SIZE} />}
        <div className="inj-card-copy">
          {heading}
          {main}
          {last && (
            <button type="button" className="inj-mood-chip" aria-label="Como você está? Registrar bem-estar" onClick={onMood}>
              <Smile size={18} aria-hidden="true" />
              Como você está?
            </button>
          )}
        </div>
        <button
          type="button"
          className="inj-card-site"
          aria-label={`Calcular dose e registrar · local sugerido: ${suggestedSpot}`}
          onClick={onOpen}
        >
          <BodyMapMini site={summary.suggestedSite} side={summary.suggestedSide} />
          <strong aria-hidden="true">{suggestedSpot}</strong>
        </button>
      </div>
      {model.isPromoted && (
        <button type="button" className="btn inj-card-register" onClick={onRegister}>
          Registrar aplicação
        </button>
      )}
      {cycle?.top && (
        <div className="inj-cycle">
          <button
            type="button"
            className="inj-cycle-toggle"
            aria-expanded={isCycleOpen}
            aria-controls={cycleId}
            onClick={() => setCycleOpen(!isCycleOpen)}
          >
            <span>
              Seu ciclo da semana · <strong>{cycle.label}</strong>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <div id={cycleId} className="inj-cycle-body" hidden={!isCycleOpen}>
            <CycleTipBlock model={cycle} />
          </div>
        </div>
      )}
    </Card>
  );
}
