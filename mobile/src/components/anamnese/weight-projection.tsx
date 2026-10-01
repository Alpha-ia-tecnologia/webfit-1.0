import { CalendarRange, Info } from "lucide-react-native";
import { View } from "react-native";
import { toNumber } from "@shared/components/anamnese/inputs";
import { canShowProjection } from "@shared/lib/anamnese-flow";
import { weightProjection } from "@shared/lib/body-metrics";
import type { Draft } from "@shared/types";
import { AppText } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, themeDomainTone } from "@/theme/tokens";

/**
 * Projeção segura do peso desejado (.weight-projection): sempre uma faixa de meses, nunca uma data.
 * Só sem motivo de avaliação individual (a tela já esconde o peso desejado de perfis sensíveis e
 * menores); meta abaixo da faixa de referência vira só o texto de cautela.
 */
export function WeightProjection({ answers, today }: { answers: Draft; today: string }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  if (!canShowProjection(answers, today)) return null;
  const current = toNumber(answers.weight);
  const target = toNumber(answers.targetWeight);
  const height = toNumber(answers.height);
  if (current === null || target === null || height === null) return null;
  const projection = weightProjection({ current, target, height, goal: String(answers.goal ?? ""), today });
  if (!projection) return null;
  const Icon = projection.kind === "range" ? CalendarRange : Info;
  return (
    <View testID="weight-projection" style={styles.card}>
      <View style={styles.icon}>
        <Icon size={18} color={domainTone.body.fg} />
      </View>
      <View style={styles.text}>
        {projection.title ? (
          <AppText heading size={fontSize.md} weight={700} lineHeight={20} color={colors.text}>
            {projection.title}
          </AppText>
        ) : null}
        <AppText size={fontSize.sm} lineHeight={19} color={colors.text2}>
          {projection.caption}
        </AppText>
      </View>
    </View>
  );
}

const useStyles = makeStyles((_colors, scheme) => ({
  card: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: themeDomainTone(scheme).body.border, backgroundColor: themeDomainTone(scheme).body.bg },
  icon: { marginTop: 1 },
  text: { flex: 1, minWidth: 0, gap: 2 },
}));
