import { useState } from "react";
import { TIME_PRESETS, STEPPER_FIELDS } from "@shared/data/anamneseOptions";
import { withProfilePatch } from "@shared/lib/space";
import { Stepper } from "@/components/anamnese/stepper";
import { TimePicker } from "@/components/anamnese/time-picker";
import { AppText, Button, Sheet } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

const HYDRATION = STEPPER_FIELDS.hydrationInterval!;

/** "Horário de silêncio": início e fim com os mesmos horários sugeridos da anamnese. */
export function QuietHoursSheet({ onClose }: { onClose: () => void }) {
  const colors = useThemeColors();
  const { state, commit } = useApp();
  const p = state.profile!;
  const [start, setStart] = useState(p.quietStart);
  const [end, setEnd] = useState(p.quietEnd);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    if (await commit((s) => withProfilePatch(s, { quietStart: start, quietEnd: end }), "Horário de silêncio salvo."))
      onClose();
    setBusy(false);
  };
  return (
    <Sheet
      visible
      title="Horário de silêncio"
      onClose={onClose}
      footer={<Button label={busy ? "Salvando…" : "Salvar"} busy={busy} wide onPress={() => void save()} />}
    >
      <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
        Nesse intervalo o app não mostra lembretes.
      </AppText>
      <TimePicker label="Início do silêncio" value={start} presets={TIME_PRESETS.quietStart ?? []} onChange={setStart} />
      <TimePicker label="Fim do silêncio" value={end} presets={TIME_PRESETS.quietEnd ?? []} onChange={setEnd} />
    </Sheet>
  );
}

/** "Lembretes de água": intervalo em passos de 15 min; com restrição de líquidos, a orientação médica vale. */
export function HydrationSheet({ onClose }: { onClose: () => void }) {
  const colors = useThemeColors();
  const { state, commit } = useApp();
  const p = state.profile!;
  const [minutes, setMinutes] = useState(String(p.hydrationInterval));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    if (
      await commit(
        (s) => withProfilePatch(s, { hydrationInterval: Number(minutes) }),
        "Lembretes de água salvos.",
      )
    )
      onClose();
    setBusy(false);
  };
  return (
    <Sheet
      visible
      title="Lembretes de água"
      onClose={onClose}
      footer={<Button label={busy ? "Salvando…" : "Salvar"} busy={busy} wide onPress={() => void save()} />}
    >
      <Stepper label="Intervalo entre lembretes" value={minutes} config={HYDRATION} onChange={setMinutes} />
      {p.fluidRestriction !== "nao" ? (
        <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
          Com restrição de líquidos, siga a orientação do seu médico sobre quanto beber.
        </AppText>
      ) : null}
    </Sheet>
  );
}
