import type { ReactNode } from "react";
import { View } from "react-native";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { CountPill } from "./pill";
import { AppText } from "./text";

type Props = {
  title: string;
  subtitle?: string;
  count?: number;
  right?: ReactNode;
};

/** Título de seção com subtítulo, contador e ações à direita (.section-head). */
export function SectionHead({ title, subtitle, count, right }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.head}>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <AppText heading size={fontSize.base} weight={800} accessibilityRole="header">
            {title}
          </AppText>
          {count !== undefined && <CountPill count={count} />}
        </View>
        {subtitle ? (
          <AppText size={fontSize.xs} color={colors.muted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
  },
  copy: { flexShrink: 1, gap: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  right: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
  },
}));
