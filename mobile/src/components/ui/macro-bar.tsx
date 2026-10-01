import { View, type DimensionValue } from "react-native";
import { makeStyles, useTheme } from "@/theme/theme";
import { radius, themeMacroColor } from "@/theme/tokens";

/** Proporção (ou gramas) de proteínas, carboidratos e gorduras; só a razão entre as três importa. */
export type MacroShare = { protein: number; carbs: number; fat: number };

const PARTS = ["protein", "carbs", "fat"] as const;
/** Altura: sm 5 px (linhas do Diário), md 6 px (cartão do Hoje), lg 8 px (refeição aberta da Dieta). */
const HEIGHT = { sm: 5, md: 6, lg: 8 } as const;

type Props = {
  share: MacroShare | null | undefined;
  size?: keyof typeof HEIGHT;
  /** Largura em px; padrão, a largura toda. */
  width?: number;
  /** Nome para o leitor de tela; sem ele a barra é só visual (o texto ao lado já diz os números). */
  label?: string;
  testID?: string;
};

/**
 * Barra P/C/G (MacroBar do web, src/components/meal): segmentos arredondados nas cores fixas dos macros,
 * cada um do tamanho da sua parte (0% some). Sem julgamento: nenhuma cor de alerta. Sem dados, nada.
 */
export function MacroBar({ share, size = "sm", width, label, testID }: Props) {
  const styles = useStyles();
  const macroColor = themeMacroColor(useTheme().scheme);
  if (!share || PARTS.every((key) => share[key] <= 0)) return null;
  const barWidth: DimensionValue = width ?? "100%";
  const a11y = label
    ? ({ accessible: true, accessibilityRole: "image", accessibilityLabel: label } as const)
    : ({ "aria-hidden": true, accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" } as const);
  return (
    <View {...a11y} testID={testID} style={[styles.bar, { width: barWidth }]}>
      {PARTS.map((key) =>
        share[key] > 0 ? (
          <View key={key} style={[styles.part, { height: HEIGHT[size], flexGrow: share[key], backgroundColor: macroColor[key] }]} />
        ) : null,
      )}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  bar: { flexDirection: "row", alignItems: "center", gap: 3, minWidth: 0, flexShrink: 1 },
  part: { flexBasis: 0, minWidth: 4, borderRadius: radius.pill },
}));
