import { useState } from "react";
import { View } from "react-native";
import { BODY_PRIVACY_COPY } from "@shared/lib/body-privacy";
import { COPY } from "@shared/lib/copy";
import { localDate, uid, withMeasurements } from "@shared/lib/domain";
import { parseGrams } from "@shared/lib/household-measures";
import { MEASURE_METHODS, lastValueHint, measureRuler, weightRuler, type MeasureKey } from "@shared/lib/measures";
import { bodyNumbers } from "@shared/lib/space";
import { measurementSchema, type Measurement } from "@shared/types";
import { ChoiceChips } from "@/components/anamnese/choice-chips";
import { DateWheels } from "@/components/anamnese/date-wheels";
import { Ruler } from "@/components/anamnese/ruler";
import { AppText, Button, Field, Sheet, TextField } from "@/components/ui";
import { confirmAsync } from "@/lib/confirm";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

const CHECK_VALUES = "Confira a data, o peso e as medidas informadas.";
const METHOD_MISSING = "Escolha ou escreva o método da medição.";
const OPTIONAL: { key: MeasureKey; label: string }[] = [
  { key: "waist", label: "Cintura (cm)" },
  { key: "hip", label: "Quadril (cm)" },
  { key: "bodyFat", label: "Gordura medida (%)" },
];

/** Último valor registrado de uma medida opcional (ponto de partida da régua quando a pessoa toca "Informar"). */
function lastValue(measurements: readonly Measurement[], key: MeasureKey): number | null {
  const withValue = measurements.filter((m) => m[key] != null).sort((a, b) => a.date.localeCompare(b.date));
  return withValue.at(-1)?.[key] ?? null;
}

/** Com os números do corpo ocultos: campos vazios, sem régua nem valor anterior. */
const HIDDEN_MEASURES: { key: MeasureKey; label: string }[] = [
  { key: "waist", label: "Cintura (cm)" },
  { key: "hip", label: "Quadril (cm)" },
  { key: "bodyFat", label: "Gordura corporal (%)" },
];
/** Número digitado ("72,5"); vazio fica vazio (medida opcional) e texto inválido vira NaN (recusado). */
const typedNumber = (text: string): number | string => (text.trim() ? (parseGrams(text) ?? Number.NaN) : "");

type Values = Record<"weight" | MeasureKey, string>;

/** Campo numérico digitado (modo oculto): o valor é o que a pessoa escreve agora. */
function TypedField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <TextField
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        inputMode="decimal"
        accessibilityLabel={label}
        placeholder={placeholder}
        maxLength={6}
      />
    </Field>
  );
}

function MeasurementForm({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, commit } = useApp();
  const p = state.profile!;
  const today = localDate();
  // "Ocultar números do corpo" (ESPACO-13): as réguas viram campos vazios, sem valor anterior.
  const [hidden] = useState(() => bodyNumbers(p, today) === "hidden");
  // Configurações estáveis durante a abertura: a régua não se reposiciona a cada toque.
  const [rulers] = useState(() => ({
    weight: weightRuler(p.weight),
    waist: measureRuler("waist", lastValue(state.measurements, "waist")),
    hip: measureRuler("hip", lastValue(state.measurements, "hip")),
    bodyFat: measureRuler("bodyFat", lastValue(state.measurements, "bodyFat")),
  }));
  // Cintura, quadril e gordura começam vazios: a medição nova não repete valores antigos como se fossem de hoje.
  const [values, setValues] = useState<Values>({ weight: hidden ? "" : String(p.weight), waist: "", hip: "", bodyFat: "" });
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState(p.measurementMethod ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof Values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setError("");
    if (!method.trim()) {
      setError(METHOD_MISSING);
      return;
    }
    const measure = (key: MeasureKey) => (hidden ? typedNumber(values[key]) : values[key]);
    const result = measurementSchema.safeParse({
      id: uid(),
      date,
      weight: hidden ? typedNumber(values.weight) : Number(values.weight),
      height: p.height,
      waist: measure("waist"),
      hip: measure("hip"),
      bodyFat: measure("bodyFat"),
      method,
    });
    if (!result.success || date > localDate() || date < p.birthDate) {
      setError(CHECK_VALUES);
      return;
    }
    // Substituir não tem volta: confirmação nativa antes de trocar a medição do dia.
    if (
      state.measurements.some((m) => m.date === date) &&
      !(await confirmAsync("Substituir a medição?", "Já existe uma medição nesta data. A nova substitui a anterior.", "Substituir medição"))
    )
      return;
    setBusy(true);
    const ok = await commit(
      (s) => withMeasurements(s, [...s.measurements.filter((m) => m.date !== date), result.data], localDate()),
      "Medição salva e perfil atualizado.",
    );
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet
      visible={visible}
      title={COPY.measure}
      onClose={onClose}
      footer={<Button label={busy ? "Salvando…" : "Salvar medidas"} disabled={busy} onPress={() => void save()} wide />}
    >
      <View style={styles.form}>
        <DateWheels
          label="Data da medição"
          quick
          value={date}
          minYear={Number(p.birthDate.slice(0, 4))}
          maxYear={Number(today.slice(0, 4))}
          initial={today}
          onChange={setDate}
        />
        {hidden ? (
          <>
            <TypedField
              label="Peso (kg)"
              value={values.weight}
              placeholder={BODY_PRIVACY_COPY.weightPlaceholder}
              onChange={set("weight")}
            />
            {HIDDEN_MEASURES.map(({ key, label }) => (
              <TypedField key={key} label={label} hint="Opcional" value={values[key]} onChange={set(key)} />
            ))}
          </>
        ) : (
          <>
            <Ruler label="Peso (kg)" value={values.weight} config={rulers.weight} onChange={set("weight")} />
            {OPTIONAL.map(({ key, label }) => (
              <Ruler
                key={key}
                label={label}
                optional
                hint={lastValueHint(state.measurements, key) ?? undefined}
                value={values[key]}
                config={rulers[key]}
                onChange={set(key)}
              />
            ))}
          </>
        )}
        <ChoiceChips label="Método ou origem da medição" value={method} config={MEASURE_METHODS} onChange={setMethod} />
        {error ? (
          <AppText size={fontSize.xs} color={colors.errorText} accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
      </View>
    </Sheet>
  );
}

/**
 * "Registrar medidas" (EVOL-08): data em rodas com Hoje/Ontem, peso na régua, cintura, quadril e gordura
 * opcionais (recolhidos em "Informar", com o último valor como dica), método em escolhas e confirmação ao
 * substituir o dia. Sem IMC, variação ou meta na folha. Cada abertura começa do zero.
 */
export function MeasurementSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [session, setSession] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setSession((n) => n + 1);
  }
  return <MeasurementForm key={session} visible={visible} onClose={onClose} />;
}

const useStyles = makeStyles(() => ({
  form: { gap: 16 },
}));
