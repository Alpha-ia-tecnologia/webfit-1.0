import { useId, useState } from "react";
import { BODY_PRIVACY_COPY } from "../../lib/body-privacy";
import { useApp } from "../../lib/context";
import { COPY } from "../../lib/copy";
import { localDate, uid, withMeasurements } from "../../lib/domain";
import { parseGrams } from "../../lib/household-measures";
import {
  MEASURE_METHODS,
  bodyMeasures,
  lastValueHint,
  measureRuler,
  weightRuler,
  type MeasureKey,
} from "../../lib/measures";
import { bodyNumbers } from "../../lib/space";
import { measurementSchema } from "../../types";
import { ChoiceChips } from "../anamnese/ChoiceChips";
import { DateWheels } from "../anamnese/DateWheels";
import { Ruler } from "../anamnese/Ruler";
import { Field, Modal } from "../UI";
import "../anamnese/AnamneseInputs.css";

const INVALID_MESSAGE = "Confira a data, o peso e as medidas informadas.";
const METHOD_MESSAGE = "Escolha ou escreva o método da medição.";
const OPTIONAL_MEASURES: { key: MeasureKey; label: string }[] = [
  { key: "waist", label: "Cintura (cm)" },
  { key: "hip", label: "Quadril (cm)" },
  { key: "bodyFat", label: "Gordura medida (%)" },
];
/** Campos de texto do modo oculto (sem régua, sem valor anterior). */
const HIDDEN_MEASURES: { key: MeasureKey; label: string }[] = [
  { key: "waist", label: "Cintura (cm)" },
  { key: "hip", label: "Quadril (cm)" },
  { key: "bodyFat", label: "Gordura corporal (%)" },
];
/** Número digitado ("72,5"); vazio fica vazio (medida opcional) e texto inválido vira NaN (recusado). */
const typedNumber = (text: string): number | string =>
  text.trim() ? (parseGrams(text) ?? Number.NaN) : "";

/**
 * "Registrar medidas" (EVOL-08) com o kit da anamnese: data em rodas com Hoje/Ontem, régua do peso
 * e réguas opcionais recolhidas. Cintura, quadril e gordura começam vazias (nada de repetir valores
 * antigos como se fossem de hoje); a última medida aparece como dica. Igual para perfil sensível.
 * Com "Ocultar números do corpo" (ESPACO-13) as réguas viram campos vazios, sem valor anterior.
 * O modal lê a preferência do perfil (como o RN): quem o abre de qualquer tela (Evolução, Seringa)
 * nunca mostra o peso salvo por esquecer a prop; `hidden` só pode forçar o modo oculto.
 */
export function MeasurementModal({
  onClose,
  hidden: forceHidden = false,
}: {
  onClose: () => void;
  hidden?: boolean;
}) {
  const { state, commit, confirm } = useApp();
  const p = state.profile!;
  const id = useId();
  const today = localDate();
  const hidden = forceHidden || bodyNumbers(p, today) === "hidden";
  // Configurações estáveis (as réguas recalculam os traços só quando a configuração muda).
  const [rulers] = useState(() => {
    const body = bodyMeasures(state.measurements);
    const last = (key: MeasureKey) => body[key].points.at(-1)?.value ?? null;
    return {
      weight: weightRuler(p.weight),
      waist: measureRuler("waist", last("waist")),
      hip: measureRuler("hip", last("hip")),
      bodyFat: measureRuler("bodyFat", last("bodyFat")),
    };
  });
  const [date, setDate] = useState(today),
    [weight, setWeight] = useState(hidden ? "" : String(p.weight)),
    [values, setValues] = useState<Record<MeasureKey, string>>({ waist: "", hip: "", bodyFat: "" }),
    [method, setMethod] = useState(p.measurementMethod ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const setValue = (key: MeasureKey) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!method.trim()) {
      setError(METHOD_MESSAGE);
      return;
    }
    const measure = (key: MeasureKey) => (hidden ? typedNumber(values[key]) : values[key]);
    const result = measurementSchema.safeParse({
      id: uid(),
      date,
      weight: hidden ? typedNumber(weight) : Number(weight),
      height: p.height,
      waist: measure("waist"),
      hip: measure("hip"),
      bodyFat: measure("bodyFat"),
      method: method.trim(),
    });
    if (!result.success || date > localDate() || date < p.birthDate) {
      setError(INVALID_MESSAGE);
      return;
    }
    setError("");
    if (
      state.measurements.some((m) => m.date === date) &&
      !(await confirm({
        title: "Substituir a medição?",
        message: "Já existe uma medição nesta data. A nova substitui a anterior.",
        confirmLabel: "Substituir medição",
      }))
    )
      return;
    setBusy(true);
    if (
      await commit(
        (s) =>
          withMeasurements(
            s,
            [...s.measurements.filter((m) => m.date !== date), result.data],
            localDate(),
          ),
        "Medição salva e perfil atualizado.",
      )
    )
      onClose();
    setBusy(false);
  };
  return (
    <Modal title={COPY.measure} onClose={onClose}>
      <form
        className="stack measure-sheet"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <DateWheels
          id={`${id}-date`}
          name="measurementDate"
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
            <Field label="Peso (kg)">
              <input
                name="weight"
                inputMode="decimal"
                autoComplete="off"
                placeholder={BODY_PRIVACY_COPY.weightPlaceholder}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </Field>
            {HIDDEN_MEASURES.map(({ key, label }) => (
              <Field key={key} label={label} hint="Opcional">
                <input
                  name={key}
                  inputMode="decimal"
                  autoComplete="off"
                  value={values[key]}
                  onChange={(e) => setValue(key)(e.target.value)}
                />
              </Field>
            ))}
          </>
        ) : (
          <>
            <Ruler
              id={`${id}-weight`}
              name="weight"
              label="Peso (kg)"
              value={weight}
              config={rulers.weight}
              onChange={setWeight}
            />
            {OPTIONAL_MEASURES.map(({ key, label }) => (
              <Ruler
                key={key}
                id={`${id}-${key}`}
                name={key}
                label={label}
                optional
                hint={lastValueHint(state.measurements, key) ?? undefined}
                value={values[key]}
                config={rulers[key]}
                onChange={setValue(key)}
              />
            ))}
          </>
        )}
        <ChoiceChips
          id={`${id}-method`}
          name="method"
          label="Método ou origem da medição"
          value={method}
          config={MEASURE_METHODS}
          onChange={setMethod}
        />
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <button className="btn" disabled={busy}>
          {busy ? "Salvando…" : "Salvar medidas"}
        </button>
      </form>
    </Modal>
  );
}
