import { useEffect, useRef, useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { Paperclip } from "lucide-react-native";
import {
  addExam,
  createExam,
  EXAM_LIMIT,
  EXAM_MAX_BYTES,
  EXAM_TYPES,
} from "@shared/lib/exams";
import { formatDate, localDate } from "@shared/lib/domain";
import {
  AppText,
  Button,
  DateField,
  Field,
  Notice,
  TextField,
} from "@/components/ui";
import { srOnly } from "@/components/refeicao/web-a11y";
import { pickDocument, type PickedFile } from "@/lib/storage";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

type Props = {
  selected: string[];
  onSelect: (ids: string[]) => void;
  disabled: boolean;
  consentAi: boolean;
  onBusy: (busy: boolean) => void;
};

/**
 * Anexos de exames sob o plano (.anamnese-exams.is-compact do web): uma linha tracejada "Adicionar exame ·
 * Opcional" que abre o seletor de arquivos no toque, o formulário do arquivo escolhido e a lista dos salvos.
 */
export function ExamAttachments({
  selected,
  onSelect,
  disabled,
  consentAi,
  onBusy,
}: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, commit, aiReady } = useApp();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState(localDate());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    onBusy(!!file || busy);
    return () => onBusy(false);
  }, [file, busy, onBusy]);
  const locked = disabled || busy;
  const isFull = state.exams.length >= EXAM_LIMIT;
  const pick = async () => {
    if (locked || isFull || pending.current) return;
    pending.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const picked = await pickDocument(EXAM_MAX_BYTES, EXAM_TYPES);
      if (picked && active.current) {
        setFile(picked);
        setName(picked.name.replace(/\.[^.]+$/, "").slice(0, 200));
      }
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error ? e.message : "Não foi possível escolher o exame.",
        );
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  };
  const save = async () => {
    if (!file || locked || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const exam = createExam(file, name, date, notes);
      const ok = await commit(
        (s) => addExam(s, exam, state.userId),
        "Exame anexado.",
      );
      if (!ok)
        throw new Error("Não foi possível salvar o exame. Tente novamente.");
      if (active.current) {
        setFile(null);
        setName("");
        setNotes("");
      }
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error ? e.message : "Não foi possível anexar o exame.",
        );
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  };
  const isDropDisabled = locked || isFull;
  return (
    <View style={styles.exams}>
      <AppText accessibilityRole="header" style={srOnly}>
        Exames
      </AppText>
      {/* .exam-row: no aparelho não há arrastar e soltar; o toque abre o seletor de arquivos. */}
      <Pressable
        accessibilityRole="button"
        // O nome começa pelo texto visível da linha ("Adicionar exame" ou o arquivo): rótulo no nome.
        accessibilityLabel={
          file ? `${file.name}: trocar arquivo do exame` : "Adicionar exame: escolher arquivo"
        }
        accessibilityHint={
          file ? file.name : "PDF, JPG, PNG ou WebP, até 5 MB"
        }
        accessibilityState={{ disabled: isDropDisabled }}
        disabled={isDropDisabled}
        onPress={() => void pick()}
        style={({ pressed }) => [
          styles.pick,
          pressed && styles.pickPressed,
          isDropDisabled && styles.pickDisabled,
        ]}
      >
        {/* A View mantém o clipe em 18 px quando o nome do arquivo é longo (export web). */}
        <View style={styles.pickIcon}>
          <Paperclip size={18} color={colors.muted} />
        </View>
        <AppText
          size={fontSize.md}
          weight={700}
          numberOfLines={1}
          style={styles.pickTitle}
        >
          {file ? file.name : "Adicionar exame"}
        </AppText>
        <AppText size={fontSize.xs} color={colors.muted} style={styles.pickMeta}>
          {file ? "Trocar arquivo" : "Opcional"}
        </AppText>
      </Pressable>
      <AppText size={fontSize.xs} color={colors.muted} lineHeight={20}>
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={20}>
          Os laudos ficam neste aparelho. A IA só lê os que você marcar.
        </AppText>
        {" PDF, JPG, PNG ou WebP, até 5 MB."}
      </AppText>
      {file && (
        <View style={styles.stack} pointerEvents={locked ? "none" : "auto"}>
          <Field label="Nome do exame">
            <TextField
              accessibilityLabel="Nome do exame"
              maxLength={200}
              value={name}
              onChangeText={setName}
              editable={!locked}
            />
          </Field>
          <DateField
            label="Data do exame"
            value={date}
            onChange={setDate}
            max={localDate()}
          />
          <Field label="Observações do exame">
            <TextField
              accessibilityLabel="Observações do exame"
              multiline
              maxLength={2000}
              value={notes}
              onChangeText={setNotes}
              editable={!locked}
            />
          </Field>
          <View style={styles.actions}>
            <Button
              label={busy ? "Anexando…" : "Salvar anexo"}
              variant="secondary"
              disabled={locked}
              onPress={() => void save()}
            />
            <Button
              label="Descartar seleção"
              variant="text"
              disabled={locked}
              onPress={() => {
                setFile(null);
                setError("");
              }}
            />
          </View>
          <AppText size={fontSize.xs} color={colors.muted}>
            Salve o anexo ou descarte a seleção antes de concluir.
          </AppText>
        </View>
      )}
      {!!error && <Notice tone="error">{error}</Notice>}
      {isFull && (
        <AppText size={fontSize.xs} color={colors.muted}>
          Limite de {EXAM_LIMIT} exames atingido.
        </AppText>
      )}
      {state.exams.map((exam) => (
        <View key={exam.id} style={styles.exam}>
          <AppText weight={700}>{exam.name}</AppText>
          <AppText size={fontSize.xs} color={colors.muted}>
            {formatDate(exam.date)} · {exam.fileName}
            {exam.analysis ? " · Análise salva" : " · Aguardando análise"}
          </AppText>
          <View style={styles.row}>
            <AppText size={fontSize.sm} style={styles.grow}>
              Analisar {exam.name} ao concluir
            </AppText>
            <Switch
              accessibilityLabel={"Analisar " + exam.name + " ao concluir"}
              value={selected.includes(exam.id) && consentAi && aiReady}
              disabled={locked || !consentAi || !aiReady}
              trackColor={{ false: colors.border, true: colors.green500 }}
              thumbColor={colors.white}
              onValueChange={(value) =>
                onSelect(
                  value
                    ? [...selected, exam.id]
                    : selected.filter((id) => id !== exam.id),
                )
              }
            />
          </View>
          <Button
            label={"Excluir exame " + exam.name}
            variant="text"
            tone="danger"
            disabled={locked}
            onPress={async () => {
              // Excluir é imediato e pode ser desfeito pelo aviso (sem diálogo).
              if (
                await commit(
                  (s) => {
                    if (s.userId !== state.userId)
                      throw new Error("Os dados locais mudaram.");
                    return {
                      ...s,
                      exams: s.exams.filter((item) => item.id !== exam.id),
                    };
                  },
                  "Exame excluído.",
                  {
                    label: "Desfazer",
                    onAction: () =>
                      void commit(
                        (s) =>
                          s.userId !== state.userId ||
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
          />
        </View>
      ))}
      {state.exams.length > 0 && (
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
          {!consentAi
            ? "Para analisar, autorize a IA na etapa Metas e preferências."
            : !aiReady
              ? "Agente desconectado: peça a análise depois em Meu espaço."
              : "Os exames marcados vão para a IA ao concluir, antes da dieta."}
        </AppText>
      )}
    </View>
  );
}
const useStyles = makeStyles((colors) => ({
  exams: { gap: 8 },
  // .exam-row: 48 px, tracejada em slate-300
  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.slate300,
  },
  pickPressed: {
    borderColor: colors.green500,
    backgroundColor: colors.mint50,
  },
  pickDisabled: { opacity: 0.6 },
  pickIcon: { flexShrink: 0 },
  pickTitle: { flexShrink: 1, minWidth: 0 },
  pickMeta: { marginLeft: "auto", flexShrink: 0 },
  stack: { gap: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  exam: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
    gap: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  grow: { flex: 1, minWidth: 0 },
}));
