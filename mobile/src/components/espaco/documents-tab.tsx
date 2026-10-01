import { FileText, Plus } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import {
  addExam,
  createExam,
  EXAM_LIMIT,
  EXAM_MAX_BYTES,
  EXAM_PRIVACY_HINT,
  EXAM_TYPES,
  examHint,
} from "@shared/lib/exams";
import { localDate, uid } from "@shared/lib/domain";
import { appointmentSchema } from "@shared/types";
import {
  AppText,
  Button,
  Card,
  DateField,
  Empty,
  Field,
  Sheet,
  TextField,
  TimeField,
} from "@/components/ui";
import { pickDocument, type PickedFile } from "@/lib/storage";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { AppointmentsCard } from "./appointments-card";
import { ExamCard } from "./exam-card";

/** Aba "Exames e consultas": laudos como documentos, análise segura pelo agente e a agenda de consultas. */
export function DocumentsTab() {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, commit } = useApp();
  const [isExamOpen, setExamOpen] = useState(false);
  const [isAppointmentOpen, setAppointmentOpen] = useState(false);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState(localDate());
  const [examNotes, setExamNotes] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [professional, setProfessional] = useState("");
  const [registration, setRegistration] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(localDate());
  const [appointmentTime, setAppointmentTime] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  // Mais recente primeiro (mesma data: o último adicionado em cima).
  const exams = state.exams
    .map((exam, index) => ({ exam, index }))
    .sort((a, b) => b.exam.date.localeCompare(a.exam.date) || b.index - a.index)
    .map(({ exam }) => exam);

  const saveExam = async () => {
    setError("");
    if (!file) {
      setError("Selecione o laudo.");
      return;
    }
    setBusy(true);
    try {
      const exam = createExam(file, examName, examDate, examNotes);
      // Valida antes de fechar o formulário; o commit repete a checagem no estado atual.
      addExam(state, exam, state.userId);
      if (await commit((s) => addExam(s, exam, state.userId), "Exame salvo neste aparelho.")) {
        setExamOpen(false);
        setFile(null);
        setExamName("");
        setExamNotes("");
      }
    } catch (e) {
      setError((e as Error).message || "Confira o nome, a data e o arquivo.");
    } finally {
      setBusy(false);
    }
  };
  const saveAppointment = async () => {
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
        (s) => ({ ...s, appointments: [...s.appointments, result.data] }),
        "Consulta registrada no seu espaço.",
      )
    )
      setAppointmentOpen(false);
    setBusy(false);
  };
  const errorText = error ? (
    <AppText size={fontSize.xs} color={colors.errorText} accessibilityRole="alert">
      {error}
    </AppText>
  ) : null;

  return (
    <>
      <Card>
        <View style={styles.headRow}>
          <AppText heading size={fontSize.lg} weight={700} style={styles.grow} accessibilityRole="header">
            Meus exames
          </AppText>
          <Button
            label="Adicionar exame"
            variant="secondary"
            size="sm"
            icon={Plus}
            disabled={state.exams.length >= EXAM_LIMIT}
            onPress={() => {
              setError("");
              setExamOpen(true);
            }}
          />
        </View>
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
          {examHint(state.exams.length)}
        </AppText>
        {!exams.length ? (
          <Empty art="exams">Nenhum exame cadastrado.</Empty>
        ) : (
          exams.map((exam) => <ExamCard key={exam.id} exam={exam} />)
        )}
      </Card>
      <AppointmentsCard
        onAdd={() => {
          setError("");
          setAppointmentOpen(true);
        }}
      />

      <Sheet
        visible={isExamOpen}
        title="Adicionar exame"
        onClose={() => setExamOpen(false)}
        footer={
          <Button
            label={busy ? "Salvando…" : "Salvar exame"}
            disabled={busy}
            onPress={() => void saveExam()}
            wide
          />
        }
      >
        <Field label="Nome do exame">
          <TextField
            maxLength={200}
            value={examName}
            onChangeText={setExamName}
            accessibilityLabel="Nome do exame"
          />
        </Field>
        <DateField label="Data do exame" value={examDate} onChange={setExamDate} max={localDate()} />
        <Field label="Arquivo do laudo" hint={EXAM_PRIVACY_HINT}>
          <View style={styles.fileRow}>
            <Button
              label={file ? "Trocar arquivo" : "Escolher arquivo"}
              variant="secondary"
              size="sm"
              icon={FileText}
              onPress={async () => {
                try {
                  const picked = await pickDocument(EXAM_MAX_BYTES, EXAM_TYPES);
                  if (picked) setFile(picked);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
            <AppText size={fontSize.xs} color={colors.muted} numberOfLines={1} style={styles.grow}>
              {file ? file.name : "Nenhum arquivo selecionado"}
            </AppText>
          </View>
        </Field>
        <Field label="Observações (opcional)">
          <TextField
            multiline
            maxLength={2000}
            value={examNotes}
            onChangeText={setExamNotes}
            accessibilityLabel="Observações do exame"
          />
        </Field>
        {errorText}
      </Sheet>

      <Sheet
        visible={isAppointmentOpen}
        title="Registrar consulta combinada"
        onClose={() => setAppointmentOpen(false)}
        footer={
          <Button
            label={busy ? "Salvando…" : "Salvar consulta"}
            disabled={busy}
            onPress={() => void saveAppointment()}
            wide
          />
        }
      >
        <Field label="Nome do profissional">
          <TextField
            maxLength={200}
            value={professional}
            onChangeText={setProfessional}
            accessibilityLabel="Nome do profissional"
          />
        </Field>
        <Field label="Registro profissional (opcional)">
          <TextField
            maxLength={100}
            value={registration}
            onChangeText={setRegistration}
            accessibilityLabel="Registro profissional"
          />
        </Field>
        <View style={styles.grid}>
          <DateField label="Data" value={appointmentDate} onChange={setAppointmentDate} />
          <TimeField label="Horário" value={appointmentTime} onChange={setAppointmentTime} />
        </View>
        <Field label="Link HTTPS da sala">
          <TextField
            keyboardType="url"
            autoCapitalize="none"
            value={url}
            onChangeText={setUrl}
            placeholder="https://…"
            accessibilityLabel="Link HTTPS da sala"
          />
        </Field>
        <Field label="Observações (opcional)">
          <TextField
            multiline
            maxLength={2000}
            value={notes}
            onChangeText={setNotes}
            accessibilityLabel="Observações da consulta"
          />
        </Field>
        {errorText}
      </Sheet>
    </>
  );
}

const useStyles = makeStyles(() => ({
  grow: { flex: 1, minWidth: 0 },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  grid: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
}));
