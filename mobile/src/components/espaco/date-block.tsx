import { View } from "react-native";
import { dateBlock } from "@shared/lib/appointments";
import { AppText } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";

const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

type Props = {
  date: string;
  /** lg = consulta em destaque; sm = linhas da agenda. */
  size: "lg" | "sm";
  /** plain = quadro azul-claro "qua 30 set" (agenda); band = folhinha com a faixa verde do mês (conceito 11). */
  variant?: "plain" | "band";
};

/**
 * Bloco de data de uma consulta (DateBlock do web, extraído do AppointmentsCard). Decorativo: a leitura
 * completa da data vem no texto ao lado.
 */
export function DateBlock({ date, size, variant = "plain" }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const block = dateBlock(date);
  const isLarge = size === "lg";
  if (variant === "band")
    return (
      <View style={styles.band} {...HIDDEN}>
        <View style={styles.bandTop}>
          <AppText size={fontSize.xs} weight={800} color={colors.white} upper tracking={0.04} lineHeight={16}>
            {block.month}
          </AppText>
        </View>
        <AppText heading size={fontSize["2xl"]} weight={800} lineHeight={27} style={styles.tabular}>
          {block.day}
        </AppText>
        <AppText size={fontSize.xs} weight={700} color={colors.muted} upper lineHeight={14}>
          {block.weekday}
        </AppText>
      </View>
    );
  return (
    <View style={[styles.date, isLarge && styles.dateLarge]} {...HIDDEN}>
      <AppText size={fontSize.xs} weight={700} color={themeDomainTone(scheme).water.fg} upper>
        {block.weekday}
      </AppText>
      <AppText heading size={isLarge ? fontSize["3xl"] : fontSize.lg} weight={800} lineHeight={isLarge ? 32 : 20} style={styles.tabular}>
        {block.day}
      </AppText>
      <AppText size={fontSize.xs} weight={600} color={colors.muted} upper>
        {block.month}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  date: {
    width: 48,
    alignItems: "center",
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: themeDomainTone(scheme).water.bg,
  },
  dateLarge: { width: 64, paddingVertical: 8 },
  /** Folhinha do conceito 11 (56 × 62): faixa do mês em cima, dia grande e dia da semana; o mesmo nos dois tamanhos. */
  band: {
    width: 56,
    minHeight: 62,
    alignItems: "center",
    gap: 2,
    paddingBottom: 6,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  /** Faixa do mês no verde escuro do botão (o web usa o gradiente; aqui o branco fica ≥ 4,5:1). */
  bandTop: { alignSelf: "stretch", alignItems: "center", paddingVertical: 3, backgroundColor: colors.accentFill },
  tabular: { fontVariant: ["tabular-nums"] },
}));
