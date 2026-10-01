import { useState } from "react";
import { Plus } from "lucide-react";
import { useApp } from "../../lib/context";
import { localDate, uid } from "../../lib/domain";
import {
  addExam,
  createExam,
  EXAM_LIMIT,
  EXAM_MAX_BYTES,
  EXAM_PRIVACY_HINT,
  EXAM_TYPES,
  examHint,
} from "../../lib/exams";
import { readFile } from "../../lib/storage";
import { appointmentSchema } from "../../types";
import { Card, Empty, Field, Modal } from "../UI";
import { AppointmentsCard } from "./AppointmentsCard";
import { ExamCard } from "./ExamCard";
import "./Documents.css";

/** Aba "Exames e consultas": laudos como documentos, análise segura pelo agente e a agenda de consultas. */
export function DocumentsTab() {
  const { state, commit } = useApp();
  const [examOpen, setExamOpen] = useState(false),
    [appointmentOpen, setAppointmentOpen] = useState(false),
    [examName, setExamName] = useState(""),
    [examDate, setExamDate] = useState(localDate()),
    [examNotes, setExamNotes] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [professional, setProfessional] = useState(""),
    [registration, setRegistration] = useState(""),
    [appointmentDate, setAppointmentDate] = useState(localDate()),
    [appointmentTime, setAppointmentTime] = useState(""),
    [url, setUrl] = useState(""),
    [notes, setNotes] = useState("");
  // O mais recente primeiro (mesma data: o último adicionado primeiro).
  const exams = state.exams
    .map((exam, index) => ({ exam, index }))
    .sort((a, b) => b.exam.date.localeCompare(a.exam.date) || b.index - a.index)
    .map(({ exam }) => exam);
  return (
    <>
      <Card className="exams-card">
        <div className="row-between">
          <h2>Meus exames</h2>
          <button
            className="btn-secondary"
            disabled={state.exams.length >= EXAM_LIMIT}
            onClick={() => {
              setError("");
              setExamOpen(true);
            }}
          >
            <Plus size={16} aria-hidden="true" />
            Adicionar exame
          </button>
        </div>
        <p className="hint">{examHint(state.exams.length)}</p>
        {!exams.length ? (
          <Empty art="exams">Nenhum exame cadastrado.</Empty>
        ) : (
          <div className="exam-list">
            {exams.map((exam) => (
              <ExamCard key={exam.id} exam={exam} />
            ))}
          </div>
        )}
      </Card>
      <AppointmentsCard
        onAdd={() => {
          setError("");
          setAppointmentOpen(true);
        }}
      />
      {examOpen && (
        <Modal title="Adicionar exame" onClose={() => setExamOpen(false)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              if (!file) {
                setError("Selecione o laudo.");
                return;
              }
              setBusy(true);
              try {
                const data = await readFile(file, EXAM_MAX_BYTES, EXAM_TYPES);
                const exam = createExam(
                  { dataUrl: data, name: file.name, mimeType: file.type },
                  examName,
                  examDate,
                  examNotes,
                );
                // Valida antes de fechar o formulário; o commit repete a checagem no estado atual.
                addExam(state, exam, state.userId);
                if (
                  await commit(
                    (s) => addExam(s, exam, state.userId),
                    "Exame salvo neste navegador.",
                  )
                ) {
                  setExamOpen(false);
                  setFile(null);
                  setExamName("");
                  setExamNotes("");
                }
              } catch (cause) {
                setError((cause as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Nome do exame">
              <input
                required
                maxLength={200}
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
              />
            </Field>
            <Field label="Data do exame">
              <input
                type="date"
                required
                max={localDate()}
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
            </Field>
            <Field label="Arquivo do laudo" hint={EXAM_PRIVACY_HINT}>
              <input
                type="file"
                required
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            <Field label="Observações (opcional)">
              <textarea
                maxLength={2000}
                value={examNotes}
                onChange={(e) => setExamNotes(e.target.value)}
              />
            </Field>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn" disabled={busy}>
              {busy ? "Salvando…" : "Salvar exame"}
            </button>
          </form>
        </Modal>
      )}
      {appointmentOpen && (
        <Modal
          title="Registrar consulta combinada"
          onClose={() => setAppointmentOpen(false)}
        >
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const result = appointmentSchema.safeParse({
                id: uid(),
                professional,
                registration,
                date: appointmentDate,
                time: appointmentTime,
                url,
                notes,
              });
              if (!result.success) {
                setError("Confira os dados e utilize um link HTTPS válido.");
                return;
              }
              setBusy(true);
              if (
                await commit(
                  (s) => ({
                    ...s,
                    appointments: [...s.appointments, result.data],
                  }),
                  "Consulta registrada no seu espaço.",
                )
              )
                setAppointmentOpen(false);
              setBusy(false);
            }}
          >
            <Field label="Nome do profissional">
              <input
                required
                minLength={2}
                maxLength={200}
                value={professional}
                onChange={(e) => setProfessional(e.target.value)}
              />
            </Field>
            <Field label="Registro profissional (opcional)">
              <input
                maxLength={100}
                value={registration}
                onChange={(e) => setRegistration(e.target.value)}
              />
            </Field>
            <div className="form-grid">
              <Field label="Data">
                <input
                  type="date"
                  required
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                />
              </Field>
              <Field label="Horário">
                <input
                  type="time"
                  required
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Link HTTPS da sala">
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Field label="Observações (opcional)">
              <textarea
                value={notes}
                maxLength={2000}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
            <button className="btn" disabled={busy}>
              Salvar consulta
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
