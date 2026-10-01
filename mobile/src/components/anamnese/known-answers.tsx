import { CircleCheck, Target } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { questionnaire } from "@shared/data/questionnaire";
import type { Draft } from "@shared/types";
import { AppText, Button } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { ChoiceCards } from "./choice-cards";
import { onDevice } from "./device-copy";
import { TermsSheet } from "./terms-sheet";

const FIELDS = questionnaire[0]!.fields;
const GOAL = FIELDS.find((f) => f.key === "goal")!;
const CONSENT = FIELDS.find((f) => f.key === "consentLocal")!;

type Props = {
  /** Chaves que chegaram respondidas do primeiro acesso (prefilledKeys). */
  keys: readonly ("goal" | "consentLocal")[];
  answers: Draft;
  error?: string;
  set: (key: string, value: string | boolean) => void;
};

/**
 * "O que você já contou" (etapa 1): o objetivo e o consentimento escolhidos no primeiro acesso viram
 * linhas de resumo. "Alterar" reabre as opções do objetivo; os termos completos abrem numa folha.
 */
export function KnownAnswers({ keys, answers, error, set }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isGoalOpen, setGoalOpen] = useState(Boolean(error));
  const [isTermsOpen, setTermsOpen] = useState(false);
  const goalText = GOAL.options?.find(([value]) => value === answers.goal)?.[1] ?? "";
  return (
    <View testID="anamnese-known" style={styles.card}>
      <AppText heading size={fontSize.md} weight={700} color={colors.text} accessibilityRole="header">
        O que você já contou
      </AppText>
      {keys.includes("goal") ? (
        <View style={styles.item}>
          <View style={styles.row}>
            <Target size={18} color={colors.green700} />
            <View style={styles.text}>
              <AppText size={fontSize.xs} weight={600} color={colors.muted}>
                Objetivo
              </AppText>
              <AppText size={fontSize.sm} weight={700} color={colors.text}>
                {goalText}
              </AppText>
            </View>
            <Button label="Alterar" variant="text" accessibilityLabel="Alterar objetivo" expanded={isGoalOpen} onPress={() => setGoalOpen(!isGoalOpen)} style={styles.change} />
          </View>
          {isGoalOpen ? <ChoiceCards field={GOAL} value={String(answers.goal ?? "")} error={error} focusChecked onChange={(next) => set("goal", next)} /> : null}
        </View>
      ) : null}
      {keys.includes("consentLocal") ? (
        <View style={styles.row}>
          <CircleCheck size={18} color={colors.green700} />
          <AppText size={fontSize.sm} weight={600} color={colors.text2} style={styles.text}>
            {onDevice("Respostas salvas neste navegador")}
          </AppText>
          <Button label="Ler termos completos" variant="link" onPress={() => setTermsOpen(true)} />
          <TermsSheet visible={isTermsOpen} label={onDevice(CONSENT.label)} terms={onDevice(CONSENT.hint ?? "")} onClose={() => setTermsOpen(false)} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 12, paddingVertical: 16, paddingHorizontal: 14, borderRadius: 15, borderWidth: 1, borderColor: colors.mint200, backgroundColor: colors.mint50 },
  item: { gap: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 4 },
  text: { flex: 1, minWidth: 120 },
  change: { minWidth: 44, paddingHorizontal: 6 },
}));
