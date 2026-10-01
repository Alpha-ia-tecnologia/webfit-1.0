import { useState } from "react";
import { STEPPER_FIELDS, TIME_PRESETS } from "../../data/anamneseOptions";
import { useApp } from "../../lib/context";
import { withProfilePatch, type ProfilePatch } from "../../lib/space";
import { Stepper } from "../anamnese/Stepper";
import { TimePicker } from "../anamnese/TimePicker";
import { Modal } from "../UI";
import "../anamnese/AnamneseInputs.css";

/** Grava a mudança da folha e fecha; em falha o aviso de erro do app aparece e a folha fica. */
function useSheetSave(onClose: () => void) {
  const { commit } = useApp();
  const [busy, setBusy] = useState(false);
  const save = async (patch: ProfilePatch, message: string) => {
    setBusy(true);
    if (await commit((s) => withProfilePatch(s, patch), message)) onClose();
    else setBusy(false);
  };
  return { busy, save };
}

/**
 * "Horário de silêncio": início e fim com os horários sugeridos da anamnese. Não mexe nas metas
 * nem no plano (horas de silêncio não entram na assinatura da dieta).
 */
export function QuietHoursSheet({ onClose }: { onClose: () => void }) {
  const { state } = useApp();
  const profile = state.profile!;
  const [start, setStart] = useState(profile.quietStart);
  const [end, setEnd] = useState(profile.quietEnd);
  const { busy, save } = useSheetSave(onClose);
  return (
    <Modal title="Horário de silêncio" onClose={onClose} className="settings-sheet">
      <p className="hint">Nesse intervalo o app não mostra lembretes.</p>
      <TimePicker
        id="settings-quiet-start"
        name="quietStart"
        label="Início do silêncio"
        value={start}
        presets={TIME_PRESETS.quietStart ?? []}
        onChange={setStart}
      />
      <TimePicker
        id="settings-quiet-end"
        name="quietEnd"
        label="Fim do silêncio"
        value={end}
        presets={TIME_PRESETS.quietEnd ?? []}
        onChange={setEnd}
      />
      <button
        type="button"
        className="btn"
        disabled={busy || !start || !end}
        onClick={() =>
          void save({ quietStart: start, quietEnd: end }, "Horário de silêncio salvo.")
        }
      >
        {busy ? "Salvando…" : "Salvar"}
      </button>
    </Modal>
  );
}

/** "Lembretes de água": intervalo entre lembretes, sem meta de quanto beber. */
export function HydrationSheet({ onClose }: { onClose: () => void }) {
  const { state } = useApp();
  const profile = state.profile!;
  const [minutes, setMinutes] = useState(profile.hydrationInterval);
  const { busy, save } = useSheetSave(onClose);
  return (
    <Modal title="Lembretes de água" onClose={onClose} className="settings-sheet">
      <Stepper
        id="settings-hydration-interval"
        name="hydrationInterval"
        label="Intervalo entre lembretes"
        value={minutes}
        config={STEPPER_FIELDS.hydrationInterval!}
        onChange={(value) => {
          const next = Number(value);
          if (value !== "" && Number.isFinite(next)) setMinutes(next);
        }}
      />
      {profile.fluidRestriction !== "nao" && (
        <p className="hint">
          Com restrição de líquidos, siga a orientação do seu médico sobre quanto
          beber.
        </p>
      )}
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() =>
          void save({ hydrationInterval: minutes }, "Lembretes de água salvos.")
        }
      >
        {busy ? "Salvando…" : "Salvar"}
      </button>
    </Modal>
  );
}
