import { useState } from "react";
import { CircleCheck, Info } from "lucide-react";
import {
  fmtConcentration,
  fmtMg,
  fmtMl,
  isPenMethod,
  methodInfo,
  recentInjectionText,
  recentInjectionWarning,
  spotLabel,
  suggestedSide,
  volumeMl,
  type DoseRecipe,
} from "../../lib/injection";
import type { InjectionEntry, InjectionMethod, InjectionSide, InjectionSite, SyringeUnits } from "../../types";
import { Modal } from "../UI";
import { SidePicker, SitePicker } from "./SiteCard";
import type { InjectionFields } from "./useInjectionSave";
import { WhenRow, whenLabel } from "./WhenRow";
import "../anamnese/AnamneseInputs.css";
import "./Injecao.css";

/** O que vai ser registrado: sempre a dose que a pessoa escolheu, nunca uma sugestão. */
export interface DosePlan {
  method: InjectionMethod;
  medication: string;
  concentration: number | null;
  syringe: SyringeUnits | null;
  units: number | null;
  doseMg: number;
}
export const planFromRecipe = (r: DoseRecipe): DosePlan => ({
  method: r.method,
  medication: r.medication,
  concentration: r.concentrationMgPerMl,
  syringe: r.syringeUnits,
  units: r.units,
  doseMg: r.doseMg,
});
export interface DoseWhen {
  site: InjectionSite;
  /** Ausente: a folha usa o lado sugerido no local (Hoje não precisa calcular). */
  side?: InjectionSide | null;
  date: string;
  time: string;
}
/** Campos de gravação a partir do plano confirmado: na caneta, só a dose em mg. */
export function fieldsFromPlan(plan: DosePlan, when: DoseWhen, notes = ""): InjectionFields {
  const isPen = isPenMethod(plan.method);
  return {
    ...when,
    method: plan.method,
    medication: plan.medication,
    units: isPen ? null : plan.units,
    concentration: isPen ? null : plan.concentration,
    syringe: isPen ? null : plan.syringe,
    doseMg: isPen ? plan.doseMg : null,
    notes,
  };
}

/** Checklist da bula (SERINGA-05): frasco, seringa e dose; na caneta, caneta e dose. */
function checklist(plan: DosePlan): { label: string; value: string }[] {
  const dose = { label: "Dose", value: fmtMg(plan.doseMg) };
  if (isPenMethod(plan.method) || plan.units === null || plan.concentration === null)
    return [{ label: "Caneta", value: `${plan.medication} · ${methodInfo(plan.method).label}` }, dose];
  return [
    { label: "Frasco", value: `${plan.medication} · ${fmtConcentration(plan.concentration)}` },
    { label: "Seringa", value: `${plan.syringe} UI · aspire até ${plan.units} UI (${fmtMl(volumeMl(plan.units))})` },
    dose,
  ];
}

type Props = {
  plan: DosePlan;
  initial: DoseWhen;
  /** Receita e Hoje: local e horário escolhidos aqui; na calculadora, só leitura. */
  isEditable: boolean;
  suggestedSite: InjectionSite;
  injections: readonly InjectionEntry[];
  perMonth: number | null | undefined;
  today: string;
  isBusy: boolean;
  onConfirm: (when: DoseWhen) => void;
  onClose: () => void;
  onOtherDose?: () => void;
};

/**
 * Confirmação antes de registrar (nunca registra ao abrir). O aviso de aplicação recente é
 * recalculado para a data escolhida e nunca bloqueia; o botão secundário é "Cancelar".
 */
export function ConfirmDoseSheet(props: Props) {
  const { plan, initial, isEditable, suggestedSite, injections, perMonth, today, isBusy } = props;
  const [site, setSite] = useState(initial.site);
  const [side, setSide] = useState<InjectionSide | null>(() =>
    initial.side !== undefined ? initial.side : suggestedSide(injections, initial.site, today),
  );
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const recent = recentInjectionWarning(injections, date, perMonth);
  // Trocar o local volta o lado para o sugerido nesse local (o oposto do último lado conhecido).
  const pickSite = (next: InjectionSite) => {
    if (next === site) return;
    setSite(next);
    setSide(suggestedSide(injections, next, today));
  };
  return (
    <Modal title="Confirmar aplicação" onClose={props.onClose} className="inj-sheet" overlayClassName="inj-sheet-overlay">
      <ul className="inj-checklist" aria-label="Confira antes de aplicar">
        {checklist(plan).map((item) => (
          <li key={item.label}>
            <CircleCheck size={18} aria-hidden="true" />
            <span>
              <strong>{item.label}</strong> {item.value}
            </span>
          </li>
        ))}
      </ul>
      {isEditable ? (
        <div className="inj-sheet-when">
          <SitePicker site={site} suggested={suggestedSite} onPick={pickSite} className="inj-sites inj-site-pills" />
          <SidePicker side={side} suggested={suggestedSide(injections, site, today)} onPick={setSide} className="is-pills" />
          <WhenRow date={date} time={time} today={today} onDate={setDate} onTime={setTime} />
        </div>
      ) : (
        <div className="inj-sheet-lines">
          <p>Local · {spotLabel(site, side)}</p>
          <p>Quando · {whenLabel(date, time, today, ", ")}</p>
        </div>
      )}
      {recent && (
        <p className="inj-alert neutral">
          <Info size={18} aria-hidden="true" />
          <span>{recentInjectionText(recent, today)}</span>
        </p>
      )}
      {props.onOtherDose && (
        <button type="button" className="text-btn inj-sheet-other" onClick={props.onOtherDose}>
          Outra dose ou frasco novo
        </button>
      )}
      <p className="inj-note">Informativo: siga a prescrição de quem acompanha seu tratamento.</p>
      <div className="inj-sheet-actions">
        <button type="button" className="btn" disabled={isBusy} aria-busy={isBusy}
          onClick={() => props.onConfirm({ site, side, date, time })}>
          {isBusy ? "Salvando…" : "Registrar aplicação"}
        </button>
        <button type="button" className="btn-secondary" onClick={props.onClose}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
