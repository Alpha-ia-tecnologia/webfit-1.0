import * as Sharing from "expo-sharing";
import { Check, Share2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { utf8Base64 } from "@shared/lib/appointments";
import { localDate } from "@shared/lib/domain";
import {
  buildReport,
  pendingExamQuestions,
  REPORT_COPY,
  REPORT_PERIODS,
  reportFileName,
  reportSections,
  type ReportSectionKey,
  type ReportSectionOption,
} from "@shared/lib/report";
import { renderReportDocument } from "@shared/lib/report-html";
import { visiblePlainText } from "@shared/lib/text";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, SegmentedControl, Sheet, SheetNotice, TextField, useSheetNotice } from "@/components/ui";
import { clearReportFiles, shareDataUrl } from "@/lib/storage";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

const QUESTION_LINES = 4;
type PeriodValue = `${(typeof REPORT_PERIODS)[number]["days"]}`;
const PERIOD_SEGMENTS = REPORT_PERIODS.map((p) => ({ value: String(p.days) as PeriodValue, label: p.label }));

/** Uma seção do relatório: caixa de 48 px com o nome e a dica (e a nota quando os números estão ocultos). */
function SectionOption({
  option,
  checked,
  onToggle,
}: {
  option: ReportSectionOption;
  checked: boolean;
  onToggle: () => void;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const hint = option.note ? `${option.hint}. ${option.note}` : option.hint;
  return (
    <Pressable
      role="checkbox"
      accessibilityLabel={option.label}
      accessibilityHint={hint}
      accessibilityState={{ checked, disabled: !option.available }}
      {...webAttrs({ "aria-checked": checked })}
      disabled={!option.available}
      onPress={onToggle}
      style={({ pressed }) => [styles.option, !option.available && styles.off, pressed && styles.pressed]}
    >
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Check size={15} color={colors.white} /> : null}</View>
      <View style={styles.optionText}>
        <AppText size={fontSize.sm} weight={700}>
          {option.label}
        </AppText>
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={17}>
          {option.hint}
        </AppText>
        {option.note ? (
          <AppText size={fontSize.xs} weight={600} color={colors.amber900} lineHeight={17}>
            {option.note}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * "Relatório para consulta" (ESPACO-08): período, seções e perguntas, montado neste aparelho e sem
 * IA. As seções começam pelo padrão do modelo (Medidas desmarcada em perfil calmo ou com os números
 * ocultos; Calorias desmarcada em perfil calmo e ausente com "Ocultar calorias"). As perguntas vêm
 * das análises de exame ainda não levadas e não são salvas (com "Ocultar calorias", já mascaradas, como
 * no web). O HTML escapado vira um arquivo local compartilhado (no export web, um download): nada passa
 * por servidor. Ao abrir, os relatórios compartilhados antes saem do cache. O resultado aparece dentro
 * da folha (o aviso ficaria sob ela).
 */
export function ReportSheet({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, notify } = useApp();
  const sheetNotice = useSheetNotice(notify);
  const today = localDate();
  const [period, setPeriod] = useState<PeriodValue>(PERIOD_SEGMENTS[0]!.value);
  // Só o que a pessoa mudou; o resto segue o padrão da seção no período escolhido.
  const [choices, setChoices] = useState<Partial<Record<ReportSectionKey, boolean>>>({});
  // Como na análise do exame: com "Ocultar calorias", as perguntas já aparecem mascaradas.
  const [questions, setQuestions] = useState(() =>
    pendingExamQuestions(state)
      .map((q) => visiblePlainText(q, !!state.profile?.hideCalories))
      .join("\n"),
  );
  const [isSharing, setSharing] = useState(false);
  const periodDays = Number(period);
  const options = reportSections(state, periodDays, today);
  const isChecked = (option: ReportSectionOption) => option.available && (choices[option.key] ?? option.defaultOn);
  const selected = options.filter(isChecked).map((option) => option.key);
  // O arquivo do relatório anterior sai do cache na próxima abertura (nunca logo depois de compartilhar).
  useEffect(() => clearReportFiles(), []);

  const share = async () => {
    if (isSharing || !selected.length) return;
    setSharing(true);
    sheetNotice.clear();
    try {
      if (Platform.OS !== "web" && !(await Sharing.isAvailableAsync())) {
        sheetNotice.show(REPORT_COPY.shareFailed, "warning");
        return;
      }
      const model = buildReport(state, { periodDays, sections: selected, questions, today });
      const html = renderReportDocument(model);
      await shareDataUrl(`data:text/html;base64,${utf8Base64(html)}`, reportFileName(today), "text/html");
      sheetNotice.show(REPORT_COPY.shared, "success");
    } catch {
      sheetNotice.show(REPORT_COPY.shareFailed, "warning");
    } finally {
      setSharing(false);
    }
  };

  const footer = (
    <View style={styles.actions}>
      <SheetNotice notice={sheetNotice.notice} />
      <Button
        label={REPORT_COPY.share}
        icon={Share2}
        wide
        busy={isSharing}
        disabled={!selected.length}
        onPress={() => void share()}
      />
      <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
        {REPORT_COPY.shareHint}
      </AppText>
      <Button label="Cancelar" variant="secondary" wide onPress={onClose} />
    </View>
  );

  return (
    <Sheet visible title={REPORT_COPY.title} onClose={onClose} footer={footer}>
      <AppText size={fontSize.sm} color={colors.text2} lineHeight={21}>
        {REPORT_COPY.intro}
      </AppText>
      <SegmentedControl label={REPORT_COPY.period} segments={PERIOD_SEGMENTS} value={period} onChange={setPeriod} />
      <View role="group" aria-label={REPORT_COPY.sections} style={styles.sections}>
        <AppText size={fontSize.sm} weight={700} color={colors.text2}>
          {REPORT_COPY.sections}
        </AppText>
        {options.map((option) => (
          <SectionOption
            key={option.key}
            option={option}
            checked={isChecked(option)}
            onToggle={() => setChoices((current) => ({ ...current, [option.key]: !isChecked(option) }))}
          />
        ))}
      </View>
      <View style={styles.field}>
        <AppText size={fontSize.sm} weight={600} color={colors.text2}>
          {REPORT_COPY.questions}
        </AppText>
        <TextField
          multiline
          numberOfLines={QUESTION_LINES}
          value={questions}
          onChangeText={setQuestions}
          accessibilityLabel={REPORT_COPY.questions}
        />
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  sections: { gap: 6 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
  },
  off: { opacity: 0.6 },
  pressed: { backgroundColor: colors.surface3 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.slate400,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.green600, borderColor: colors.green600 },
  optionText: { flex: 1, minWidth: 0, gap: 1 },
  field: { gap: 7 },
  actions: { gap: 10 },
}));
