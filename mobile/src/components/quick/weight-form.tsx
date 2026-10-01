import { Minus, Plus, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { BODY_PRIVACY_COPY } from "@shared/lib/body-privacy";
import { latestWeight, quickWeight, stepWeight, WEIGHT_MAX, WEIGHT_MIN } from "@shared/lib/diary-day";
import { localDate, uid } from "@shared/lib/domain";
import { fmtKg, fmtNumber } from "@shared/lib/format";
import { bodyNumbers } from "@shared/lib/space";
import { humanDate } from "@shared/lib/today";
import type { AppState } from "@shared/types";
import { useSafeCommit } from "@/components/despensa/safe-commit";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button } from "@/components/ui";
import { successHaptic } from "@/lib/haptics";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontFamily, fontSize, radius } from "@/theme/tokens";

const WEIGHT_STEP_KG = 0.1;
const STEP_SIZE = 56;
const SAVE_REFUSED = "Não foi possível salvar o peso. Confira o valor.";
const UNDO_REFUSED = "O peso desse dia mudou depois; nada foi desfeito.";

/** Campo vazio, "," ou "." não é número (Number("") seria 0). */
const parseKg = (text: string) => (text.trim() === "" ? NaN : Number(text.trim().replace(",", ".")));

function StepButton({ icon: Icon, label, disabled, onPress }: { icon: LucideIcon; label: string; disabled: boolean; onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.step, pressed && styles.stepPressed, disabled && styles.disabled]}
    >
      <Icon size={22} color={colors.text2} />
    </Pressable>
  );
}

/**
 * Peso com passos de ±0,1 kg a partir do último registrado (WeightForm do web). Mostra só o valor,
 * sem diferenças nem tendências, e salva na medição do dia; "Desfazer" volta exatamente ao estado
 * anterior, guardado dentro da própria gravação. Com "Ocultar números do corpo" (ESPACO-13) o campo
 * começa vazio, os passos esperam um número digitado (nunca partem do peso salvo, nem com "," ou ".")
 * e o aviso não repete o peso. Recusas de validação são atenção (laranja), nunca o vermelho de falha.
 */
export function WeightForm({ day, onDone }: { day: string; onDone: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const safeCommit = useSafeCommit();
  const today = localDate();
  const hidden = state.profile ? bodyNumbers(state.profile, today) === "hidden" : false;
  const initial = latestWeight(state) ?? state.profile?.weight ?? WEIGHT_MIN;
  const [text, setText] = useState(hidden ? "" : fmtNumber(initial, 1));
  const typed = parseKg(text);
  const canStep = !hidden || Number.isFinite(typed);
  const [error, setError] = useState("");
  const [isBusy, setBusy] = useState(false);
  const step = (delta: number) => {
    // Oculto: sem número digitado, nada muda (partir do peso salvo o revelaria).
    if (!Number.isFinite(typed) && hidden) return;
    setText(fmtNumber(stepWeight(Number.isFinite(typed) ? typed : initial, delta), 1));
    setError("");
  };
  const save = async () => {
    const value = parseKg(text);
    if (!(value >= WEIGHT_MIN && value <= WEIGHT_MAX)) {
      setError(`Informe um peso entre ${WEIGHT_MIN} e ${WEIGHT_MAX} kg.`);
      return;
    }
    const weight = Math.round(value * 10) / 10;
    let before: Pick<AppState, "measurements" | "profile" | "goalHistory"> | null = null;
    setBusy(true);
    const saved = await safeCommit(
      (s) => {
        const result = quickWeight(s, { id: uid(), date: day, weight, today });
        if (!result.success) throw new Error(SAVE_REFUSED);
        before = { measurements: s.measurements, profile: s.profile, goalHistory: s.goalHistory };
        return result.state;
      },
      hidden ? BODY_PRIVACY_COPY.weightSaved : `Peso salvo: ${fmtKg(weight)}.`,
      {
        label: "Desfazer",
        onAction: () =>
          void safeCommit((s) => {
            // Só volta ao estado anterior se o peso do dia ainda for o que acabou de ser salvo.
            const snapshot = before;
            if (!snapshot || s.measurements.find((m) => m.date === day)?.weight !== weight) throw new Error(UNDO_REFUSED);
            return { ...s, ...snapshot };
          }, "Peso desfeito."),
      },
      // A folha continua aberta: a recusa aparece no campo, não num aviso escondido sob ela.
      { onRefuse: setError },
    );
    setBusy(false);
    if (!saved) return;
    successHaptic();
    onDone();
  };
  return (
    <View style={styles.form}>
      <AppText size={fontSize.sm} color={colors.muted}>
        {day === today ? "Hoje" : humanDate(day, today)} · ajuste de 0,1 em 0,1 kg ou digite.
      </AppText>
      <View style={styles.stepper}>
        <StepButton icon={Minus} label="Diminuir 0,1 kg" disabled={isBusy || !canStep} onPress={() => step(-WEIGHT_STEP_KG)} />
        <View style={styles.value}>
          <TextInput
            value={text}
            onChangeText={(next) => {
              setText(next);
              setError("");
            }}
            editable={!isBusy}
            keyboardType="decimal-pad"
            accessibilityLabel="Peso em kg"
            placeholder={hidden ? BODY_PRIVACY_COPY.weightPlaceholder : undefined}
            placeholderTextColor={colors.muted}
            {...webAttrs({ "aria-invalid": Boolean(error) })}
            maxLength={6}
            selectTextOnFocus
            style={[styles.input, error ? styles.inputInvalid : null]}
          />
          <AppText heading size={fontSize.lg} weight={700} color={colors.muted} importantForAccessibility="no">
            kg
          </AppText>
        </View>
        <StepButton icon={Plus} label="Aumentar 0,1 kg" disabled={isBusy || !canStep} onPress={() => step(WEIGHT_STEP_KG)} />
      </View>
      {error ? (
        <AppText size={fontSize.xs} color={colors.rose600} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button label={isBusy ? "Salvando…" : "Salvar peso"} busy={isBusy} wide onPress={() => void save()} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  form: { gap: 14 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  step: {
    width: STEP_SIZE,
    height: STEP_SIZE,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  stepPressed: { backgroundColor: colors.mint50 },
  disabled: { opacity: 0.45 },
  value: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 6 },
  input: {
    width: 120,
    paddingVertical: 6,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface3,
    textAlign: "center",
    color: colors.text,
    fontFamily: fontFamily(800, true),
    fontSize: fontSize["4xl"],
  },
  inputInvalid: { borderColor: colors.rose400 },
}));
