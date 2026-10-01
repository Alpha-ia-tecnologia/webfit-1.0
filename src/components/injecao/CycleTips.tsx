import { useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { PHASE_SUFFIX, type CycleCardModel, type CycleTip } from "../../lib/cycle-tips";
import { Modal } from "../UI";
import { useCycleHabit } from "./useCycleHabit";
import "./Ciclo.css";

/** "+ Combinado" em um toque com confirmação; se o combinado já existe, só diz isso. */
export function TipAction({ tip }: { tip: CycleTip }) {
  const habit = useCycleHabit();
  const doneRef = useRef<HTMLParagraphElement>(null);
  if (habit.exists(tip))
    return (
      <p ref={doneRef} className="cycle-tip-done" tabIndex={-1}>
        Já está nos seus combinados.
      </p>
    );
  const create = async () => {
    // O botão some com o combinado criado: o foco passa para a frase que o substitui.
    if (await habit.create(tip)) requestAnimationFrame(() => doneRef.current?.focus());
  };
  return (
    <button
      type="button"
      className="btn-secondary cycle-tip-add"
      aria-label={`Criar combinado: ${tip.combinado.title}`}
      onClick={() => void create()}
    >
      <Plus size={16} aria-hidden="true" />
      Combinado
    </button>
  );
}

const habitLine = (tip: CycleTip) => `Combinado: ${tip.combinado.title} · ${tip.combinado.time}`;

/** "Seu ciclo da semana": as três fases, até três dicas cada, e a nota de que são dicas gerais. */
export function CycleSheet({ model, onClose }: { model: CycleCardModel; onClose: () => void }) {
  const baseId = useId();
  return (
    <Modal title="Seu ciclo da semana" onClose={onClose} className="cycle-sheet">
      <div className="cycle-phases">
        {model.phases.map((view) => (
          <section
            key={view.phase}
            className={`cycle-phase ${view.isCurrent ? "is-current" : ""}`}
            aria-labelledby={`${baseId}-${view.phase}`}
          >
            <div className="cycle-phase-head">
              <h3 id={`${baseId}-${view.phase}`}>{view.label}</h3>
              {view.isCurrent && <span className="status-pill neutral cycle-now">Agora</span>}
            </div>
            <p className="cycle-phase-sub">{PHASE_SUFFIX}</p>
            <ul className="cycle-phase-tips">
              {view.tips.map((tip) => (
                <li key={tip.key}>
                  <p className="cycle-tip-text">{tip.text}</p>
                  <p className="cycle-tip-habit">{habitLine(tip)}</p>
                  <TipAction tip={tip} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="hint cycle-note">{model.note}</p>
    </Modal>
  );
}

/**
 * Dica da fase atual (SERINGA-11) no cartão do Hoje e na folha "Aplicação registrada": o texto
 * curado, o combinado sugerido e "Ver as fases". Sem contagem, sem sequência, sem comemoração.
 */
export function CycleTipBlock({ model, isCompact = false }: { model: CycleCardModel; isCompact?: boolean }) {
  const [isOpen, setOpen] = useState(false);
  const titleId = useId();
  const top = model.top;
  if (!top) return null;
  return (
    <div className={`cycle-tip ${isCompact ? "is-compact" : ""}`} role="group" aria-labelledby={titleId}>
      <p id={titleId} className="cycle-tip-kicker">
        {isCompact ? "Para os próximos dias" : `Seu ciclo da semana · ${model.label}`}
      </p>
      {!isCompact && <p className="cycle-tip-day">{model.dayLabel}</p>}
      <p className="cycle-tip-text">{top.text}</p>
      <p className="cycle-tip-habit">{habitLine(top)}</p>
      <div className="cycle-tip-actions">
        <TipAction tip={top} />
        <button type="button" className="text-btn cycle-tip-phases" onClick={() => setOpen(true)}>
          Ver as fases
        </button>
      </div>
      {isOpen && <CycleSheet model={model} onClose={() => setOpen(false)} />}
    </div>
  );
}
