import { useId } from "react";
import { howWeCalculate, type InsightPrivacy } from "../../lib/progress-insights";
import { DOSE_OVERLAY_NOTE } from "../../lib/treatment";
import { Modal } from "../UI";
import "./Insights.css";

/** Título da seção das doses sobre o gráfico de peso (só com aplicações registradas). */
export const DOSES_SECTION_TITLE = "Doses no gráfico";

/**
 * "Como calculamos" (EVOL-06): uma folha para toda a Evolução com as regras das médias, da
 * porcentagem da meta, dos dias com registro, da tendência e do bem-estar. O texto sai de
 * howWeCalculate, que já tira o que o perfil não vê (peso e proteína no calmo, energia sempre).
 * Com doses sobre o gráfico, a nota informativa das doses fica aqui (saiu do cartão de peso).
 */
export function HowWeCalculate({
  privacy,
  hasDoses = false,
  onClose,
}: {
  privacy: InsightPrivacy;
  hasDoses?: boolean;
  onClose: () => void;
}) {
  const id = useId();
  return (
    <Modal title="Como calculamos" onClose={onClose} className="how-sheet">
      {howWeCalculate(privacy).map((section) => (
        <section key={section.key} aria-labelledby={`${id}-${section.key}`}>
          <h3 id={`${id}-${section.key}`}>{section.title}</h3>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      {hasDoses && (
        <section aria-labelledby={`${id}-doses`}>
          <h3 id={`${id}-doses`}>{DOSES_SECTION_TITLE}</h3>
          <p>{DOSE_OVERLAY_NOTE}</p>
        </section>
      )}
    </Modal>
  );
}
