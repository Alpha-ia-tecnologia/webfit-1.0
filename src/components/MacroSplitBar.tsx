import type { MacroEstimate } from "../lib/taco-match";
import "./Plate.css";

type Share = NonNullable<MacroEstimate["share"]>;

const SEGMENTS: { key: keyof Share; className: string }[] = [
  { key: "protein", className: "is-protein" },
  { key: "carbs", className: "is-carbs" },
  { key: "fat", className: "is-fat" },
];

/**
 * Proporção estimada de proteínas, carboidratos e gorduras de uma sugestão, calculada pela TACO
 * (nunca pelo modelo). Só proporções: nenhuma caloria aparece, nem com calorias visíveis.
 */
export function MacroSplitBar({ share }: { share: Share }) {
  const { protein, carbs, fat } = share;
  return (
    <div className="macro-estimate" data-testid="macro-estimate">
      <div className="macro-estimate-bar" aria-hidden="true">
        {SEGMENTS.filter(({ key }) => share[key] > 0).map(({ key, className }) => (
          <span key={key} className={className} style={{ flexGrow: share[key] }} />
        ))}
      </div>
      <p className="macro-estimate-caption" aria-hidden="true">
        Estimativa TACO · P {protein}% · C {carbs}% · G {fat}%
      </p>
      <p className="sr-only">
        Estimativa TACO: proteínas {protein}%, carboidratos {carbs}%, gorduras {fat}%
      </p>
    </div>
  );
}
