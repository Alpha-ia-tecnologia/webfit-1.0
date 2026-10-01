import { BellRing, Clock, History, MapPin } from "lucide-react";
import type { NextApplicationModel } from "../../lib/treatment";
import { NextDoseRing } from "./NextDoseRing";
import "./Recipe.css";

type Props = { model: NextApplicationModel };

/**
 * "Próxima aplicação" (conceito 10): cartão navy com o anel da contagem, a data estimada, o lembrete
 * e o local sugerido. Informativo: nunca mostra dose nem "atrasada". Na gestação ou sem acompanhar a
 * frequência ("history"), só a última aplicação, sem anel e sem data estimada.
 */
export function NextApplicationCard({ model }: Props) {
  const isEstimate = model.variant === "estimate" && model.next !== null && model.text !== null;
  const hasReminder = model.timeLine.includes("lembrete");
  const LineIcon = isEstimate && hasReminder ? BellRing : Clock;
  return (
    <section className="inj-next" data-testid="next-application" aria-labelledby="inj-next-kicker">
      {isEstimate ? (
        <NextDoseRing next={model.next!} text={model.text!} tone="inverse" size={90} testId="next-application-ring" />
      ) : (
        <span className="inj-next-icon" aria-hidden="true">
          <History size={30} />
        </span>
      )}
      <div className="inj-next-body">
        <h2 id="inj-next-kicker" className="inj-next-kicker">
          {model.kicker}
        </h2>
        <p className="inj-next-title">{model.dateTitle}</p>
        <p className="inj-next-line">
          <LineIcon size={14} aria-hidden="true" />
          {model.timeLine}
        </p>
        {model.hint && <p className="inj-next-hint">{model.hint}</p>}
        <p className="inj-next-chip inj-chip-site">
          <MapPin size={14} aria-hidden="true" />
          <span className="sr-only">Local sugerido: </span>
          {model.suggestedLabel}
        </p>
      </div>
    </section>
  );
}
