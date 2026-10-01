import { useEffect, useRef, useState, type DragEvent } from "react";
import { Paperclip } from "lucide-react";
import { useApp } from "../../lib/context";
import { formatDate, localDate } from "../../lib/domain";
import {
  addExam,
  createExam,
  EXAM_LIMIT,
  EXAM_MAX_BYTES,
  EXAM_TYPES,
} from "../../lib/exams";
import { readFile } from "../../lib/storage";
import { Card, Field } from "../UI";

export function ExamAttachments({
  selected,
  onSelect,
  disabled,
  consentAi,
  onBusy,
}: {
  selected: string[];
  onSelect: (ids: string[]) => void;
  disabled: boolean;
  consentAi: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const { state, commit, aiReady } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState(localDate());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isDragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    onBusy(!!file || saving);
    return () => onBusy(false);
  }, [file, saving, onBusy]);
  const locked = disabled || saving;
  const isFull = state.exams.length >= EXAM_LIMIT;
  const choose = (next: File | null) => {
    setFile(next);
    setName(next?.name.replace(/\.[^.]+$/, "").slice(0, 200) ?? "");
    setError("");
    onBusy(!!next);
  };
  const discard = () => {
    choose(null);
    if (input.current) input.current.value = "";
  };
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (locked || isFull) return;
    const dropped = event.dataTransfer.files[0];
    if (dropped) choose(dropped);
  };
  const save = async () => {
    if (!file || locked) return;
    setSaving(true);
    onBusy(true);
    setError("");
    try {
      const dataUrl = await readFile(file, EXAM_MAX_BYTES, EXAM_TYPES);
      const exam = createExam(
        { dataUrl, name: file.name, mimeType: file.type },
        name,
        date,
        notes,
      );
      if (
        !(await commit((s) => addExam(s, exam, state.userId), "Exame anexado."))
      )
        throw new Error("Não foi possível salvar. Tente novamente.");
      setFile(null);
      setName("");
      setNotes("");
      if (input.current) input.current.value = "";
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível anexar o exame.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    // Uma linha compacta sob o plano: tocar abre o arquivo (arrastar também funciona no computador).
    <Card className="anamnese-exams is-compact">
      <h3 className="sr-only">Exames</h3>
      <label
        className={`exam-row ${isDragging ? "is-dragging" : ""} ${locked || isFull ? "is-disabled" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!locked && !isFull) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Paperclip size={18} aria-hidden="true" />
        <strong>{file ? file.name : "Adicionar exame"}</strong>
        <span className="exam-row-meta">{file ? "Trocar arquivo" : "Opcional"}</span>
        <input
          ref={input}
          className="sr-only"
          type="file"
          aria-label="Arquivo do exame"
          accept={EXAM_TYPES.join(",")}
          disabled={locked || isFull}
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
        />
      </label>
      <p className="hint">
        Os laudos ficam neste navegador. A IA só lê os que você marcar. PDF,
        JPG, PNG ou WebP, até 5 MB.
      </p>
      {file && (
        <div className="stack">
          <Field label="Nome do exame">
            <input
              maxLength={200}
              value={name}
              disabled={locked}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Data do exame">
            <input
              type="date"
              value={date}
              max={localDate()}
              disabled={locked}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Observações do exame">
            <textarea
              maxLength={2000}
              value={notes}
              disabled={locked}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <div className="row">
            <button
              type="button"
              className="btn-secondary"
              disabled={locked}
              onClick={() => void save()}
            >
              {saving ? "Anexando…" : "Salvar anexo"}
            </button>
            <button
              type="button"
              className="text-btn"
              disabled={locked}
              onClick={discard}
            >
              Descartar seleção
            </button>
          </div>
          <p className="hint">
            Salve o anexo ou descarte a seleção antes de concluir.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {isFull && (
        <p className="hint">Limite de {EXAM_LIMIT} exames atingido.</p>
      )}
      {state.exams.map((exam) => (
        <div className="document-item" key={exam.id}>
          <strong style={{ overflowWrap: "anywhere" }}>{exam.name}</strong>
          <p className="hint" style={{ overflowWrap: "anywhere" }}>
            {formatDate(exam.date)} · {exam.fileName}
            {exam.analysis ? " · Análise salva" : " · Aguardando análise"}
          </p>
          <label className="row">
            <input
              type="checkbox"
              checked={selected.includes(exam.id) && consentAi && aiReady}
              disabled={locked || !consentAi || !aiReady}
              onChange={(e) =>
                onSelect(
                  e.target.checked
                    ? [...selected, exam.id]
                    : selected.filter((id) => id !== exam.id),
                )
              }
            />
            Analisar {exam.name} ao concluir
          </label>
          <button
            type="button"
            className="text-btn danger"
            disabled={locked}
            onClick={async () => {
              if (
                await commit(
                  (s) => ({
                    ...s,
                    exams: s.exams.filter((item) => item.id !== exam.id),
                  }),
                  "Exame excluído.",
                  {
                    label: "Desfazer",
                    onAction: () =>
                      void commit(
                        (s) =>
                          s.exams.some((item) => item.id === exam.id)
                            ? s
                            : { ...s, exams: [...s.exams, exam] },
                        "Exame restaurado.",
                      ),
                  },
                )
              )
                onSelect(selected.filter((id) => id !== exam.id));
            }}
          >
            Excluir exame {exam.name}
          </button>
        </div>
      ))}
      {state.exams.length > 0 && (
        <p className="hint">
          {!consentAi
            ? "Para analisar, autorize a IA na etapa Metas e preferências."
            : !aiReady
              ? "Agente desconectado: peça a análise depois em Meu espaço."
              : "Os exames marcados vão para a IA ao concluir, antes da dieta."}
        </p>
      )}
    </Card>
  );
}
