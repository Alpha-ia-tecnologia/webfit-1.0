import { Download, FileText, Sparkles, Trash2 } from "lucide-react-native";
import { Image, View } from "react-native";
import { EXAM_COPY } from "@shared/lib/exam-result";
import { localDate } from "@shared/lib/domain";
import { EXAM_AI_HINT, examFileKind } from "@shared/lib/exams";
import { fmtDateBr } from "@shared/lib/format";
import { bodyNumbers } from "@shared/lib/space";
import type { Exam } from "@shared/types";
import { AppText, Button, Disclosure, Notice, OverflowMenu, RichText, type MenuItem } from "@/components/ui";
import { shareDataUrl } from "@/lib/storage";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { ExamResults } from "./exam-results";

const THUMB = 56;
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

/**
 * Laudo como documento (ESPACO-11): miniatura, nome, data e tipo, "⋯" com baixar, analisar de novo e
 * remover (com "Desfazer"), o alerta urgente da análise e os resultados transcritos (ou o texto das
 * análises antigas).
 */
export function ExamCard({ exam }: { exam: Exam }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, commit, notify, aiBusy, aiReady, analyzeExam, analyzingExamId, examUrgent } = useApp();
  const p = state.profile!;
  const kind = examFileKind(exam);
  const isAnalyzing = analyzingExamId === exam.id;
  const canAnalyze = p.consentAi && aiReady && !aiBusy;
  const hasAnalysis = Boolean(exam.analysis || exam.analysisStructured);
  const status = exam.analysisStructured ? EXAM_COPY.heading : exam.analysis ? "Análise salva" : null;
  const meta = [fmtDateBr(exam.date), kind === "pdf" ? "PDF" : "Imagem", status].filter(Boolean).join(" · ");
  const blockedHint = !p.consentAi ? EXAM_AI_HINT.consent : !aiReady ? EXAM_AI_HINT.offline : null;

  const download = () =>
    void shareDataUrl(exam.data, exam.fileName, exam.mimeType).catch((e: Error) => notify(e.message, "warning"));
  // Remover é imediato e pode ser desfeito pelo aviso (sem diálogo).
  const remove = () =>
    void commit((s) => ({ ...s, exams: s.exams.filter((e) => e.id !== exam.id) }), "Exame removido.", {
      label: "Desfazer",
      onAction: () =>
        void commit(
          (s) => (s.exams.some((e) => e.id === exam.id) ? s : { ...s, exams: [...s.exams, exam] }),
          "Exame restaurado.",
        ),
    });
  const menu: MenuItem[] = [
    { label: "Baixar laudo", icon: Download, onSelect: download },
    ...(hasAnalysis
      ? [{ label: "Analisar de novo", icon: Sparkles, disabled: !canAnalyze, onSelect: () => void analyzeExam(exam.id) }]
      : []),
    { label: "Remover exame", icon: Trash2, onSelect: remove },
  ];

  return (
    <View style={styles.card} testID="exam-card">
      <View style={styles.head}>
        {kind === "image" ? (
          <Image source={{ uri: exam.data }} style={styles.thumb} resizeMode="cover" {...HIDDEN} />
        ) : (
          <View style={[styles.thumb, styles.pdf]} {...HIDDEN}>
            <FileText size={20} color={colors.marker} />
            <AppText size={fontSize.xs} weight={800} color={colors.marker}>
              PDF
            </AppText>
          </View>
        )}
        <View style={styles.grow}>
          <AppText heading size={fontSize.base} weight={700} accessibilityRole="header" numberOfLines={2}>
            {exam.name}
          </AppText>
          <AppText size={fontSize.xs} color={colors.muted}>
            {meta}
          </AppText>
        </View>
        <OverflowMenu label={`Mais ações: ${exam.name}`} items={menu} />
      </View>
      {examUrgent[exam.id] ? <Notice tone="attention">{examUrgent[exam.id]}</Notice> : null}
      {!hasAnalysis ? (
        <View style={styles.analyze}>
          <Button
            label={isAnalyzing ? "Analisando…" : "Analisar com o agente"}
            variant="secondary"
            size="sm"
            icon={Sparkles}
            disabled={!canAnalyze}
            onPress={() => void analyzeExam(exam.id)}
            style={styles.start}
          />
          {blockedHint ? (
            <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
              {blockedHint}
            </AppText>
          ) : null}
        </View>
      ) : isAnalyzing ? (
        <AppText size={fontSize.sm} color={colors.text2} accessibilityLiveRegion="polite" role="status">
          Analisando…
        </AppText>
      ) : null}
      {exam.analysisStructured ? (
        <ExamResults exam={exam} result={exam.analysisStructured} />
      ) : exam.analysis ? (
        <Disclosure title="Ver análise do agente">
          <RichText
            text={exam.analysis}
            hideCalories={p.hideCalories}
            hideBodyNumbers={bodyNumbers(p, localDate()) === "hidden"}
            size={fontSize.sm}
            color={colors.text2}
          />
        </Disclosure>
      ) : null}
      {exam.notes ? (
        <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
          {exam.notes}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72 },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  pdf: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  analyze: { gap: 6 },
  start: { alignSelf: "flex-start" },
}));
