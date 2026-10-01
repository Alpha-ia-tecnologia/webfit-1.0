import { useId, useState } from "react";
import { Printer } from "lucide-react";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/domain";
import {
  buildReport,
  pendingExamQuestions,
  REPORT_COPY,
  REPORT_PERIODS,
  reportSections,
  type ReportModel,
  type ReportSectionKey,
  type ReportSectionOption,
} from "../../lib/report";
import { visiblePlainText } from "../../lib/text";
import { SegmentedControl } from "../SegmentedControl";
import { Modal } from "../UI";
import { ReportPrint } from "./ReportPrint";
import "./Essential.css";

const QUESTION_ROWS = 4;

/**
 * "Relatório para consulta" (ESPACO-08): período, seções e perguntas, montado neste aparelho e sem
 * IA. As seções começam marcadas pelo padrão do modelo (Medidas desmarcada em perfil calmo ou com
 * os números ocultos; Calorias desmarcada em perfil calmo e ausente com "Ocultar calorias"). As
 * perguntas vêm das análises de exame ainda não levadas e não são salvas. Imprimir abre o diálogo
 * do navegador, que também salva em PDF.
 */
export function ReportSheet({ onClose }: { onClose: () => void }) {
  const { state, notify } = useApp();
  const today = localDate();
  const id = useId();
  const [periodDays, setPeriodDays] = useState<number>(REPORT_PERIODS[0].days);
  // Só o que a pessoa mudou; o resto segue o padrão da seção no período escolhido.
  const [choices, setChoices] = useState<Partial<Record<ReportSectionKey, boolean>>>({});
  // Como na análise do exame: com "Ocultar calorias", as perguntas já aparecem mascaradas.
  const [questions, setQuestions] = useState(() =>
    pendingExamQuestions(state)
      .map((q) => visiblePlainText(q, !!state.profile?.hideCalories))
      .join("\n"),
  );
  const [model, setModel] = useState<ReportModel | null>(null);
  const options = reportSections(state, periodDays, today);
  const isChecked = (option: ReportSectionOption) =>
    option.available && (choices[option.key] ?? option.defaultOn);
  const selected = options.filter(isChecked).map((option) => option.key);
  const print = () => {
    try {
      setModel(buildReport(state, { periodDays, sections: selected, questions, today }));
    } catch (error) {
      notify((error as Error).message, "warning");
    }
  };
  return (
    <Modal title={REPORT_COPY.title} onClose={onClose} className="report-sheet">
      <p className="report-intro">{REPORT_COPY.intro}</p>
      <SegmentedControl
        label={REPORT_COPY.period}
        segments={REPORT_PERIODS.map((p) => ({ value: String(p.days), label: p.label }))}
        value={String(periodDays)}
        onChange={(value) => setPeriodDays(Number(value))}
      />
      <fieldset className="report-sections">
        <legend>{REPORT_COPY.sections}</legend>
        {options.map((option) => {
          const labelId = `${id}-${option.key}-label`;
          const hintId = `${id}-${option.key}-hint`;
          return (
            <label
              key={option.key}
              className={option.available ? "report-option" : "report-option is-off"}
            >
              <input
                type="checkbox"
                aria-labelledby={labelId}
                aria-describedby={hintId}
                checked={isChecked(option)}
                disabled={!option.available}
                onChange={(e) =>
                  setChoices((current) => ({ ...current, [option.key]: e.target.checked }))
                }
              />
              <span className="report-option-text">
                <span id={labelId} className="report-option-label">
                  {option.label}
                </span>
                <span id={hintId} className="report-option-hint">
                  {option.hint}
                  {option.note && <span className="report-option-note">{option.note}</span>}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <div className="field">
        <label htmlFor={`${id}-questions`}>{REPORT_COPY.questions}</label>
        <textarea
          id={`${id}-questions`}
          rows={QUESTION_ROWS}
          value={questions}
          onChange={(e) => setQuestions(e.target.value)}
        />
      </div>
      <div className="report-actions">
        <button type="button" className="btn" disabled={selected.length === 0} onClick={print}>
          <Printer size={17} aria-hidden="true" />
          {REPORT_COPY.print}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
      </div>
      {model && <ReportPrint model={model} onDone={() => setModel(null)} />}
    </Modal>
  );
}
