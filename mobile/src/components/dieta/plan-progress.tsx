import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, gradients, horizontal, radius } from "@/theme/tokens";

/** Um horário do plano na faixa do cabeçalho: feita, a próxima ou os demais (sem cobrança). */
export interface PlanStep {
  time: string;
  state: "done" | "next" | "other";
}

/**
 * Linha "2 de 5 refeições hoje" do cabeçalho do dia (PlanProgress do web, conceito 04): a contagem, o consumido de
 * hoje (kcal do diário, sem ela com calorias ocultas) e um segmento por refeição com o horário. Nunca vermelho;
 * perfis calmos só veem os horários (quem usa decide: `count` null).
 */
export function PlanProgress({
  count,
  kcal,
  steps,
}: {
  /** "2 de 5 refeições hoje"; null = sem contagem (perfil calmo). */
  count: string | null;
  /** "930 de 1.645 kcal"; null com calorias ocultas ou sem meta. */
  kcal: string | null;
  steps: readonly PlanStep[];
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.root}>
      {count ? (
        <View style={styles.head}>
          <AppText size={fontSize.base} weight={800} testID="plan-progress">
            {count}
          </AppText>
          {kcal ? (
            <AppText size={fontSize.sm} color={colors.muted} style={styles.tabular}>
              {kcal}
            </AppText>
          ) : null}
        </View>
      ) : null}
      <View style={styles.steps} aria-hidden importantForAccessibility="no-hide-descendants">
        {steps.map((step, index) => (
          <View key={`${step.time}-${index}`} style={styles.step}>
            {step.state === "done" ? (
              <LinearGradient colors={gradients.brand} start={horizontal.start} end={horizontal.end} style={styles.seg} />
            ) : (
              <View style={[styles.seg, step.state === "next" && styles.segNext]} />
            )}
            <AppText
              size={fontSize.xs}
              weight={step.state === "next" ? 800 : 700}
              color={step.state === "next" ? colors.green700 : step.state === "done" ? colors.text2 : colors.muted}
              style={styles.tabular}
            >
              {step.time}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 12 },
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: 10, rowGap: 2 },
  tabular: { fontVariant: ["tabular-nums"] },
  steps: { flexDirection: "row", gap: 6 },
  step: { flex: 1, minWidth: 0, alignItems: "center", gap: 8 },
  /** Segmento de 8 px; a próxima é mais alta (12), menta com contorno verde de 2 px. */
  seg: { alignSelf: "stretch", height: 8, marginVertical: 2, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  segNext: { height: 12, marginVertical: 0, backgroundColor: colors.mint50, borderWidth: 2, borderColor: colors.green500 },
}));
