import { View } from "react-native";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, themeMacroColor } from "@/theme/tokens";
import { AppText } from "./text";

type Share = { protein: number; carbs: number; fat: number };

const PARTS = [
  { key: "protein", short: "P", name: "proteínas" },
  { key: "carbs", short: "C", name: "carboidratos" },
  { key: "fat", short: "G", name: "gorduras" },
] as const;
const BAR_HEIGHT = 8;

/**
 * Proporção estimada de proteínas, carboidratos e gorduras de uma sugestão (.macro-estimate do web),
 * calculada pelo app a partir da TACO: só porcentagens, nunca calorias. O leitor de tela ouve a
 * frase completa; a barra e a legenda curta ficam só visuais.
 */
export function MacroSplitBar({ share }: { share: Share }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const macroColor = themeMacroColor(scheme);
  const label = `Estimativa TACO: ${PARTS.map((p) => `${p.name} ${share[p.key]}%`).join(", ")}`;
  const caption = `Estimativa TACO · ${PARTS.map((p) => `${p.short} ${share[p.key]}%`).join(" · ")}`;
  return (
    <View
      testID="macro-estimate"
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={styles.wrap}
    >
      <View style={styles.bar}>
        {PARTS.map((p) =>
          share[p.key] > 0 ? (
            <View key={p.key} style={[styles.part, { flexGrow: share[p.key], backgroundColor: macroColor[p.key] }]} />
          ) : null,
        )}
      </View>
      <AppText size={fontSize.xs} weight={600} color={colors.muted} lineHeight={16}>
        {caption}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { gap: 6, alignSelf: "stretch" },
  bar: {
    flexDirection: "row",
    height: BAR_HEIGHT,
    gap: 2,
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.surface2,
  },
  part: { flexBasis: 0, height: BAR_HEIGHT },
}));
