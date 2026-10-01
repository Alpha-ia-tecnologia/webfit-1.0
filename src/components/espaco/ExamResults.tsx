import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useApp } from "../../lib/context";
import {
  biomarkerHistory,
  EXAM_COPY,
  examCounters,
  examGroups,
} from "../../lib/exam-result";
import { toggleExamQuestion } from "../../lib/exams";
import { maskStructured } from "../../lib/structured";
import type { Exam } from "../../types";
import { RichText } from "../RichText";
import { useBodyNumbersHidden } from "../useBodyNumbersHidden";
import { BiomarkerRow } from "./BiomarkerRow";

/**
 * Resultados estruturados de um laudo (ESPACO-05): contagens neutras, a lista por grupo do laudo
 * (fechada até pedir), o que não foi lido, as perguntas para levar à consulta (marcadas e salvas)
 * e o texto da análise. Com calorias ocultas, os textos já chegam mascarados.
 */
export function ExamResults({ exam }: { exam: Exam }) {
  const { state, commit } = useApp();
  const [isOpen, setOpen] = useState(false);
  const hideBody = useBodyNumbersHidden();
  if (!exam.analysisStructured) return null;
  const hide = !!state.profile?.hideCalories;
  const r = maskStructured(exam.analysisStructured, hide, { plain: true, hideBodyNumbers: hideBody });
  const groups = examGroups(r);
  const done = exam.questionsDone ?? [];
  const panelId = `exam-${exam.id}-results`;
  return (
    <div className="exam-results">
      <ul className="exam-counters" aria-label={EXAM_COPY.countersLabel}>
        {examCounters(r).map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      <button
        type="button"
        className="text-btn exam-results-toggle"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => setOpen(!isOpen)}
      >
        {isOpen
          ? EXAM_COPY.hideResults
          : EXAM_COPY.showResults(r.resultados.length)}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {isOpen && (
        <div id={panelId} className="exam-results-panel">
          {groups.length ? (
            groups.map((group, index) => (
              <section
                key={group.title ?? `grupo-${index}`}
                className="exam-group"
              >
                {group.title && <h4>{group.title}</h4>}
                <ul className="biomarkers">
                  {group.rows.map((row, rowIndex) => (
                    <BiomarkerRow
                      key={`${row.nome}-${rowIndex}`}
                      row={row}
                      history={biomarkerHistory(state.exams, row)}
                    />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <p className="hint">{EXAM_COPY.none}</p>
          )}
          {r.ilegiveis.length > 0 && (
            <section className="exam-group">
              <h4>{EXAM_COPY.illegible}</h4>
              <ul className="exam-notes-list">
                {r.ilegiveis.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </section>
          )}
          {r.observacoes.length > 0 && (
            <section className="exam-group">
              <h4>{EXAM_COPY.notes}</h4>
              <ul className="exam-notes-list">
                {r.observacoes.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {r.perguntas.length > 0 && (
        <fieldset className="exam-questions">
          <legend>{EXAM_COPY.questionsLegend}</legend>
          {r.perguntas.map((question, index) => (
            <label key={`${index}-${question}`} className="exam-question">
              <input
                type="checkbox"
                checked={done.includes(index)}
                onChange={() =>
                  void commit((current) =>
                    toggleExamQuestion(current, exam.id, index),
                  )
                }
              />
              <span>{question}</span>
            </label>
          ))}
        </fieldset>
      )}
      <p className="hint exam-results-hint">{EXAM_COPY.hint}</p>
      {exam.analysis && (
        <details className="exam-text">
          <summary>{EXAM_COPY.textToggle}</summary>
          <RichText text={exam.analysis} hideCalories={hide} className="ai-text" />
        </details>
      )}
    </div>
  );
}
