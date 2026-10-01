import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../lib/context";
import type { ManualGoals } from "../../lib/domain";
import {
  AUTO_GOALS,
  commitManualGoals,
  goalHint,
  goalSteppers,
  hasManualGoals,
  manualGoalsOf,
} from "../../lib/space";
import { toNumber } from "../anamnese/inputs";
import { Stepper } from "../anamnese/Stepper";
import { Modal } from "../UI";
import "../anamnese/AnamneseInputs.css";

/**
 * "Ajustar metas": passos para as metas manuais do perfil (sem energia com calorias ocultas),
 * "Voltar ao automático" e salvar com Desfazer. Grava o perfil e a meta do dia.
 */
export function GoalsSheet({ onClose }: { onClose: () => void }) {
  const { state, commit, navigate } = useApp();
  const profile = state.profile!;
  const [draft, setDraft] = useState<ManualGoals>(() => manualGoalsOf(profile));
  const [busy, setBusy] = useState(false);
  const steppers = goalSteppers({ ...profile, ...draft });
  const changes: Partial<ManualGoals> = Object.fromEntries(
    steppers.map((s) => [s.field, draft[s.field]]),
  );
  const isChanged = steppers.some((s) => draft[s.field] !== profile[s.field]);
  const save = async (goals: Partial<ManualGoals>, message: string) => {
    setBusy(true);
    const saved = await commitManualGoals(commit, goals, message);
    setBusy(false);
    if (saved) onClose();
  };
  return (
    <Modal title="Ajustar metas" onClose={onClose} className="goals-sheet">
      <p className="hint">
        Em branco, cada meta segue a estimativa da anamnese; os valores que você informar
        prevalecem.
      </p>
      {steppers.map((stepper) => (
        <Stepper
          key={stepper.field}
          id={`goal-${stepper.field}`}
          name={stepper.field}
          label={stepper.label}
          hint={goalHint(stepper)}
          value={draft[stepper.field]}
          config={stepper.config}
          onChange={(value) =>
            setDraft((current) => ({ ...current, [stepper.field]: toNumber(value) }))
          }
        />
      ))}
      <div className="goals-sheet-actions">
        <button
          type="button"
          className="btn"
          disabled={!isChanged || busy}
          onClick={() => void save(changes, "Metas atualizadas.")}
        >
          {busy ? "Salvando…" : "Salvar metas"}
        </button>
        {hasManualGoals(profile) && (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void save(AUTO_GOALS, "Metas de volta ao automático.")}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Voltar ao automático
          </button>
        )}
      </div>
      <button
        type="button"
        className="link-btn goals-sheet-anamnese"
        onClick={() => {
          onClose();
          navigate("anamnese");
        }}
      >
        Revisar todas as respostas na anamnese
      </button>
    </Modal>
  );
}
