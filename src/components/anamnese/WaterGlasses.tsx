import { useId } from "react";
import { GlassWater, Minus, Plus } from "lucide-react";
import { GLASS_ML, stepWater, waterModel } from "../../lib/goal-editor";
import type { Draft } from "../../types";
import { toNumber } from "./inputs";

/** Copos desenhados; o resto vira "+N". */
const MAX_GLASSES_SHOWN = 12;

/**
 * Meta de água em copos de 250 ml. O consumo habitual só vira um botão "Usar N copos": nada é
 * gravado antes de um toque, e com restrição de líquidos não há sugestão.
 */
export function WaterGlasses({
  answers,
  error,
  onChange,
}: {
  answers: Draft;
  error?: string;
  onChange: (key: string, value: string) => void;
}) {
  const labelId = useId();
  const model = waterModel(answers);
  const manual = toNumber(answers.manualWater);
  const isSuggested = model.glasses === null && model.suggestion !== null;
  const count =
    model.glasses ??
    (model.suggestion ? Math.round(model.suggestion.ml / GLASS_ML) : 0);
  const shown = Math.min(count, MAX_GLASSES_SHOWN);
  const base = manual ?? model.suggestion?.ml ?? null;
  const set = (ml: number) => onChange("manualWater", String(ml));
  return (
    // eslint-disable-next-line jsx-a11y/role-supports-aria-props -- o CSS de erro e o foco no primeiro campo inválido (ScreenAnamnese) leem este aria-invalid
    <div
      className="water-glasses"
      data-testid="water-glasses"
      data-field="manualWater"
      role="group"
      aria-labelledby={labelId}
      aria-invalid={!!error}
      tabIndex={-1}
    >
      <div className="wg-head">
        <span id={labelId} className="q-label">
          Meta de água
        </span>
        <strong className={manual === null ? "is-empty" : ""}>
          {model.value}
        </strong>
      </div>
      <div className="wg-body">
        <button
          type="button"
          className="stepper-btn"
          aria-label="Menos um copo"
          disabled={manual !== null && manual <= GLASS_ML}
          onClick={() => set(stepWater(base, -1))}
        >
          <Minus size={18} aria-hidden="true" />
        </button>
        <div
          className={`wg-row ${isSuggested ? "is-suggested" : ""}`}
          aria-hidden="true"
        >
          {Array.from({ length: shown }, (_, i) => (
            <GlassWater key={i} size={20} className="wg-glass" />
          ))}
          {count > shown && <span className="wg-more">+{count - shown}</span>}
          {count === 0 && <span className="wg-more">—</span>}
        </div>
        <button
          type="button"
          className="stepper-btn"
          aria-label="Mais um copo"
          onClick={() => set(stepWater(base, 1))}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      {model.suggestion && (
        <div className="wg-suggestion">
          <button
            type="button"
            className="quick-chip"
            onClick={() => set(model.suggestion!.ml)}
          >
            {model.suggestion.label}
          </button>
          <p className="hint">{model.suggestion.hint}</p>
        </div>
      )}
      {model.note && <p className="hint">{model.note}</p>}
      {manual !== null && (
        <button
          type="button"
          className="q-none wg-clear"
          onClick={() => onChange("manualWater", "")}
        >
          Não informar
        </button>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <input
        className="q-mirror"
        name="manualWater"
        type="number"
        tabIndex={-1}
        aria-hidden="true"
        value={String(answers.manualWater ?? "")}
        onChange={(e) => onChange("manualWater", e.target.value)}
      />
    </div>
  );
}
