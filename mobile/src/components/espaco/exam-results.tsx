import { Check } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import {
  biomarkerHistory,
  EXAM_COPY,
  examCounters,
  examGroups,
  type ExamResult,
} from "@shared/lib/exam-result";
import { toggleExamQuestion } from "@shared/lib/exams";
import { localDate } from "@shared/lib/domain";
import { bodyNumbers } from "@shared/lib/space";
import { maskStructured } from "@shared/lib/structured";
import type { Exam } from "@shared/types";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, Disclosure, RichText, TagPill } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { BiomarkerRow } from "./biomarker-row";

const BOX = 24;

/**
 * Resultados estruturados do laudo (ESPACO-05): contagens neutras, a lista por grupo (recolhida),
 * o que não foi possível ler, as perguntas para a consulta (marcadas e salvas) e o texto completo.
 */
export function ExamResults({ exam, result }: { exam: Exam; result: ExamResult }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, commit } = useApp();
  const hideCalories = state.profile?.hideCalories ?? false;
  // "Ocultar números do corpo" também vale na análise dos laudos, como no web (ExamResults.tsx).
  const hideBody = state.profile ? bodyNumbers(state.profile, localDate()) === "hidden" : false;
  const r = useMemo(
    () => maskStructured(result, hideCalories, { plain: true, hideBodyNumbers: hideBody }),
    [result, hideCalories, hideBody],
  );
  const [isOpen, setOpen] = useState(false);
  const groups = examGroups(r);
  const done = exam.questionsDone ?? [];
  return (
    <View style={styles.root} testID="exam-results">
      <View role="list" aria-label={EXAM_COPY.countersLabel} style={styles.counters}>
        {examCounters(r).map((text) => (
          <View key={text} role="listitem">
            <TagPill label={text} tone="neutral" />
          </View>
        ))}
      </View>
      <Button
        label={isOpen ? EXAM_COPY.hideResults : EXAM_COPY.showResults(r.resultados.length)}
        variant="text"
        expanded={isOpen}
        onPress={() => setOpen(!isOpen)}
        style={styles.toggle}
      />
      {isOpen && (
        <View style={styles.panel}>
          {groups.length ? (
            groups.map((group) => (
              <View key={group.title ?? "resultados"} style={styles.group}>
                {group.title ? <SubHead text={group.title} /> : null}
                <View role="list">
                  {group.rows.map((row, i) => (
                    <BiomarkerRow key={`${row.nome}-${i}`} row={row} history={biomarkerHistory(state.exams, row)} />
                  ))}
                </View>
              </View>
            ))
          ) : (
            <AppText size={fontSize.sm} color={colors.muted}>
              {EXAM_COPY.none}
            </AppText>
          )}
          <TextList title={EXAM_COPY.illegible} items={r.ilegiveis} />
          <TextList title={EXAM_COPY.notes} items={r.observacoes} />
        </View>
      )}
      {r.perguntas.length > 0 && (
        <View style={styles.group} role="group" aria-label={EXAM_COPY.questionsLegend}>
          <SubHead text={EXAM_COPY.questionsLegend} />
          {r.perguntas.map((question, index) => {
            const isChecked = done.includes(index);
            return (
              <Pressable
                key={`${index}-${question}`}
                accessibilityRole="checkbox"
                accessibilityLabel={question}
                accessibilityState={{ checked: isChecked }}
                {...webAttrs({ "aria-checked": isChecked })}
                onPress={() => {
                  selectionHaptic();
                  void commit((s) => toggleExamQuestion(s, exam.id, index));
                }}
                style={({ pressed }) => [styles.question, pressed && styles.pressed]}
              >
                <View style={[styles.box, isChecked && styles.boxOn]}>
                  {isChecked ? <Check size={15} color={colors.white} strokeWidth={3} /> : null}
                </View>
                <AppText size={fontSize.sm} lineHeight={20} color={colors.text2} style={styles.grow}>
                  {question}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}
      <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
        {EXAM_COPY.hint}
      </AppText>
      {exam.analysis ? (
        <Disclosure title={EXAM_COPY.textToggle}>
          <RichText
            text={exam.analysis}
            hideCalories={hideCalories}
            hideBodyNumbers={hideBody}
            size={fontSize.sm}
            color={colors.text2}
          />
        </Disclosure>
      ) : null}
    </View>
  );
}

function SubHead({ text }: { text: string }) {
  const colors = useThemeColors();
  return (
    <AppText heading size={fontSize.sm} weight={700} color={colors.text} accessibilityRole="header">
      {text}
    </AppText>
  );
}

function TextList({ title, items }: { title: string; items: readonly string[] }) {
  const styles = useStyles();
  const colors = useThemeColors();
  if (!items.length) return null;
  return (
    <View style={styles.group}>
      <SubHead text={title} />
      <View role="list">
        {items.map((item) => (
          <View key={item} role="listitem" style={styles.bullet}>
            <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
              {`• ${item}`}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 10 },
  counters: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  toggle: { alignSelf: "flex-start" },
  panel: { gap: 14 },
  group: { gap: 6 },
  grow: { flex: 1, minWidth: 0 },
  bullet: { paddingVertical: 2 },
  // Pergunta como caixa de marcação: linha inteira com 44 pt de alvo.
  question: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingVertical: 6 },
  pressed: { opacity: 0.7 },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radius.xs,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { borderColor: colors.green600, backgroundColor: colors.green600 },
}));
