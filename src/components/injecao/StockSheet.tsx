import { useId, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/domain";
import { STOCK_COPY, stockDefaults, stockDraft, type StockDraft } from "../../lib/treatment-stock";
import type { InjectionMethod, TreatmentStock } from "../../types";
import { Field, Modal } from "../UI";
import "./Estoque.css";

/** "create": primeiro estoque; "edit": o atual; "new": frasco ou caneta novos (mesma quantidade, aberto hoje). */
export type StockSheetMode = "create" | "edit" | "new";
type Problem = Extract<StockDraft, { ok: false }>;

const METHODS: { value: InjectionMethod; label: string }[] = [
  { value: "frasco", label: "Frasco" },
  { value: "caneta", label: "Caneta" },
  { value: "dose_unica", label: "Dose única" },
];
const DOSES_MIN = 1;
const DOSES_MAX = 60;
const volumeText = (ml: number | null) => (ml === null ? "" : ml.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

function initialForm(mode: StockSheetMode, stock: TreatmentStock | null, defaults: ReturnType<typeof stockDefaults>) {
  if (!stock || mode === "create")
    return { method: defaults.method, volume: "", doses: defaults.doses, openedOn: defaults.openedOn, useBy: "" };
  const isNew = mode === "new";
  return {
    method: stock.method,
    volume: volumeText(stock.volumeMl),
    doses: stock.doses ?? defaults.doses,
    openedOn: isNew ? defaults.openedOn : stock.openedOn,
    useBy: isNew ? "" : (stock.useBy ?? ""),
  };
}

/** Doses na caneta ou canetas na caixa: − valor + (1 a 60). */
function DosesStepper({ label, hint, value, error, onChange }: {
  label: string;
  hint: string;
  value: number;
  error?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  // Campo vazio (NaN) volta ao mínimo em qualquer um dos dois botões.
  const clamp = (n: number) => (Number.isFinite(n) ? Math.min(DOSES_MAX, Math.max(DOSES_MIN, n)) : DOSES_MIN);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="stock-stepper">
        <button type="button" className="stock-step" aria-label={`Diminuir: ${label}`} disabled={value <= DOSES_MIN}
          onClick={() => onChange(clamp(value - 1))}>
          <Minus size={18} aria-hidden="true" />
        </button>
        <input id={id} type="number" inputMode="numeric" min={DOSES_MIN} max={DOSES_MAX} step="1"
          value={Number.isFinite(value) ? value : ""} aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? `${id}-help` : undefined}
          onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Math.round(Number(e.target.value)))} />
        <button type="button" className="stock-step" aria-label={`Aumentar: ${label}`} disabled={value >= DOSES_MAX}
          onClick={() => onChange(clamp((Number.isFinite(value) ? value : 0) + 1))}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      {(error || hint) && (
        <p id={`${id}-help`} className={error ? "field-error" : "hint"} role={error ? "alert" : undefined}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

/**
 * "Estoque do frasco ou caneta" (SERINGA-12): tipo, quantidade, abertura e "usar até" digitados pela
 * pessoa. Salva com "Desfazer"; remover pede confirmação. Nada de mg, nada de lembrete.
 */
export function StockSheet({ mode, onClose }: { mode: StockSheetMode; onClose: () => void }) {
  const { state, commit, confirm } = useApp();
  const today = localDate();
  const current = state.treatmentStock;
  const [form, setForm] = useState(() => initialForm(mode, current, stockDefaults(state.injections, today)));
  const [problem, setProblem] = useState<Problem | null>(null);
  const [isBusy, setBusy] = useState(false);
  const methodName = useId();
  /** "Limpar data de uso" some ao limpar: o foco volta ao campo, nunca ao <body> do diálogo. */
  const useByRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setProblem(null);
  };
  const errorOf = (field: Problem["field"]) => (problem?.field === field ? problem.message : undefined);

  const save = async () => {
    const draft = stockDraft({
      method: form.method,
      volumeText: form.volume,
      doses: form.doses,
      openedOn: form.openedOn,
      useBy: form.useBy || null,
      today,
    });
    if (!draft.ok) {
      setProblem(draft);
      return;
    }
    setBusy(true);
    let before: TreatmentStock | null = null;
    const isSaved = await commit(
      (s) => {
        before = s.treatmentStock;
        return { ...s, treatmentStock: draft.stock };
      },
      STOCK_COPY.saved,
      {
        label: "Desfazer",
        onAction: () =>
          void commit((s) => ({ ...s, treatmentStock: before }), STOCK_COPY.saveUndone(before !== null)),
      },
    );
    setBusy(false);
    if (isSaved) onClose();
  };

  const remove = async () => {
    const isConfirmed = await confirm({
      title: STOCK_COPY.removeTitle,
      message: STOCK_COPY.removeMessage,
      confirmLabel: STOCK_COPY.removeOk,
      tone: "danger",
    });
    if (!isConfirmed) return;
    let removed: TreatmentStock | null = null;
    const isRemoved = await commit(
      (s) => {
        removed = s.treatmentStock;
        return { ...s, treatmentStock: null };
      },
      STOCK_COPY.removed,
      {
        label: "Desfazer",
        onAction: () =>
          void commit((s) => (s.treatmentStock ? s : { ...s, treatmentStock: removed }), STOCK_COPY.restored),
      },
    );
    if (isRemoved) onClose();
  };

  const isVial = form.method === "frasco";
  return (
    <Modal title={STOCK_COPY.title} onClose={onClose} className="stock-sheet">
      <form
        className="stack stock-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset className="stock-methods">
          <legend>Tipo</legend>
          <div className="stock-method-options">
            {METHODS.map((m) => (
              <label key={m.value} className="stock-method">
                <input type="radio" className="sr-only" name={methodName} value={m.value}
                  checked={form.method === m.value} onChange={() => set("method", m.value)} />
                <span>{m.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {isVial ? (
          <Field label={STOCK_COPY.volumeLabel} hint={STOCK_COPY.volumeHint} error={errorOf("volumeMl")}>
            <input inputMode="decimal" placeholder="Ex.: 2" value={form.volume} onChange={(e) => set("volume", e.target.value)} />
          </Field>
        ) : (
          <DosesStepper
            label={STOCK_COPY.dosesLabel(form.method)}
            hint={STOCK_COPY.dosesHint(form.method)}
            value={form.doses}
            error={errorOf("doses")}
            onChange={(n) => set("doses", n)}
          />
        )}
        <Field label={STOCK_COPY.openedLabel} hint={STOCK_COPY.openedHint} error={errorOf("openedOn")}>
          <input type="date" max={today} value={form.openedOn} onChange={(e) => set("openedOn", e.target.value)} />
        </Field>
        <Field label={STOCK_COPY.useByLabel} hint={STOCK_COPY.useByHint} error={errorOf("useBy")}>
          <input ref={useByRef} type="date" min={form.openedOn || undefined} value={form.useBy} onChange={(e) => set("useBy", e.target.value)} />
        </Field>
        {/* O campo de data nem sempre mostra como apagar (teclado, leitor de tela): o mesmo atalho do app. */}
        {form.useBy && (
          <button
            type="button"
            className="text-btn stock-clear"
            onClick={() => {
              set("useBy", "");
              useByRef.current?.focus();
            }}
          >
            {STOCK_COPY.clearUseBy}
          </button>
        )}
        <button className="btn stock-save" disabled={isBusy}>
          {isBusy ? STOCK_COPY.saving : STOCK_COPY.save}
        </button>
        {mode === "edit" && current && (
          <button type="button" className="text-btn stock-remove" onClick={() => void remove()}>
            {STOCK_COPY.remove}
          </button>
        )}
      </form>
    </Modal>
  );
}
