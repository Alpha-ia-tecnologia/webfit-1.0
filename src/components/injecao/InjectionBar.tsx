import { CircleCheck } from "lucide-react";
import { fmtMg, fmtMl, volumeMl } from "../../lib/injection";

type Props = {
  doseValue: number | null;
  /** Unidades na seringa (frasco); null na caneta, sem dose ou quando a dose não cabe. */
  units: number | null;
  isPen: boolean;
  isOverflow: boolean;
  isEditing: boolean;
  isBusy: boolean;
  onPress: () => void;
};

function barLabel({ doseValue, units, isPen, isOverflow, isEditing }: Omit<Props, "isBusy" | "onPress">) {
  if (isOverflow) return "Confira a concentração do frasco para registrar";
  const ready = isPen ? doseValue !== null : units !== null;
  if (!ready || doseValue === null) return "Informe a dose para registrar";
  const mg = fmtMg(doseValue);
  if (isPen) return isEditing ? `Salvar alterações (${mg})` : `Confirmar e registrar ${mg}`;
  return isEditing ? `Salvar alterações (${units} UI, ${mg})` : `Confirmar e registrar ${units} UI (${mg})`;
}

/**
 * Barra fixa (SERINGA-06): a dose em mg e o botão que abre a confirmação. Sem dose ou com a dose
 * fora da seringa, o botão fica aria-disabled e o toque explica o que falta.
 */
export function InjectionBar(props: Props) {
  const { doseValue, units, isPen, isOverflow, isEditing, isBusy, onPress } = props;
  const isReady = !isOverflow && (isPen ? doseValue !== null : units !== null);
  return (
    <div className="inj-bar" data-testid="injection-bar">
      <div className="inj-bar-dose">
        <strong>{doseValue !== null ? fmtMg(doseValue) : "—"}</strong>
        {!isPen && units !== null && <small>{`${units} UI · ${fmtMl(volumeMl(units))}`}</small>}
      </div>
      <button
        type="button"
        className="btn inj-bar-btn"
        aria-label={isBusy ? undefined : barLabel(props)}
        aria-disabled={!isReady || isBusy}
        aria-busy={isBusy}
        onClick={() => !isBusy && onPress()}
      >
        <CircleCheck size={18} aria-hidden="true" />
        {isBusy ? "Salvando…" : isEditing ? "Salvar" : "Registrar"}
      </button>
    </div>
  );
}
