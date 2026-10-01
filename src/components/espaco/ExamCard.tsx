import {
  AlertTriangle,
  Download,
  FileText,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useApp } from "../../lib/context";
import { fmtDateBr } from "../../lib/format";
import { EXAM_AI_HINT, examFileKind } from "../../lib/exams";
import { downloadBlob } from "../../lib/storage";
import type { Exam } from "../../types";
import { OverflowMenu, type MenuItem } from "../OverflowMenu";
import { RichText } from "../RichText";
import { ExamResults } from "./ExamResults";

/**
 * Laudo como documento (ESPACO-11): miniatura, data e situação da análise, "⋯" com baixar,
 * analisar de novo e remover (com Desfazer). A análise estruturada vira ExamResults; análises
 * antigas (só texto) continuam na caixa "Ver análise do agente".
 */
export function ExamCard({ exam }: { exam: Exam }) {
  const {
    state,
    commit,
    aiBusy,
    aiReady,
    analyzeExam,
    analyzingExamId,
    examUrgent,
  } = useApp();
  const p = state.profile!;
  const canAnalyze = p.consentAi && aiReady && !aiBusy;
  const isAnalyzing = analyzingExamId === exam.id;
  const kind = examFileKind(exam);
  const titleId = `exam-${exam.id}-name`;
  const status = exam.analysisStructured
    ? "Resultados transcritos"
    : exam.analysis
      ? "Análise salva"
      : null;
  const meta = [fmtDateBr(exam.date), kind === "pdf" ? "PDF" : "Imagem", status]
    .filter(Boolean)
    .join(" · ");
  const download = async () => {
    const blob = await fetch(exam.data).then((r) => r.blob());
    downloadBlob(blob, exam.fileName);
  };
  // Remover é imediato e pode ser desfeito pelo aviso.
  const remove = () =>
    void commit(
      (s) => ({ ...s, exams: s.exams.filter((e) => e.id !== exam.id) }),
      "Exame removido.",
      {
        label: "Desfazer",
        onAction: () =>
          void commit(
            (s) =>
              s.exams.some((e) => e.id === exam.id)
                ? s
                : { ...s, exams: [...s.exams, exam] },
            "Exame restaurado.",
          ),
      },
    );
  const menu: MenuItem[] = [
    { label: "Baixar laudo", icon: Download, onSelect: () => void download() },
    ...(exam.analysis
      ? [
          {
            label: "Analisar de novo",
            icon: Sparkles,
            disabled: !canAnalyze,
            onSelect: () => void analyzeExam(exam.id),
          },
        ]
      : []),
    { label: "Remover exame", icon: Trash2, onSelect: remove },
  ];
  const blockedHint = !p.consentAi
    ? EXAM_AI_HINT.consent
    : !aiReady
      ? EXAM_AI_HINT.offline
      : null;
  return (
    <article className="exam-card" aria-labelledby={titleId}>
      <div className="exam-card-head">
        {kind === "image" ? (
          <img
            className="exam-thumb"
            src={exam.data}
            alt=""
            width={56}
            height={56}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="exam-thumb is-pdf" aria-hidden="true">
            <FileText size={20} />
            <small>PDF</small>
          </span>
        )}
        <div className="exam-card-id">
          <h3 id={titleId}>{exam.name}</h3>
          <p className="exam-meta">{meta}</p>
        </div>
        <OverflowMenu label={`Mais ações: ${exam.name}`} items={menu} />
      </div>
      {examUrgent[exam.id] && (
        <div role="alert" className="notice exam-urgent">
          <AlertTriangle size={18} aria-hidden="true" />
          <p>{examUrgent[exam.id]}</p>
        </div>
      )}
      {!exam.analysis ? (
        <div className="exam-analyze">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={!canAnalyze}
            onClick={() => void analyzeExam(exam.id)}
          >
            <Sparkles size={16} aria-hidden="true" />
            {isAnalyzing ? "Analisando…" : "Analisar com o agente"}
          </button>
          {blockedHint && <p className="hint">{blockedHint}</p>}
        </div>
      ) : (
        isAnalyzing && (
          <p role="status" className="exam-analyzing">
            Analisando…
          </p>
        )
      )}
      {exam.analysisStructured ? (
        <ExamResults exam={exam} />
      ) : (
        exam.analysis && (
          <details className="exam-legacy">
            <summary>Ver análise do agente</summary>
            <RichText
              text={exam.analysis}
              hideCalories={p.hideCalories}
              className="ai-text"
            />
          </details>
        )
      )}
      {exam.notes && <p className="exam-notes">{exam.notes}</p>}
    </article>
  );
}
