import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { starterCups } from "@shared/lib/starter";
import { AppText } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, themeDomainTone } from "@/theme/tokens";

const CUP = { width: 22, height: 28 } as const;
/** Copo levemente afunilado com a água até perto da borda. */
const CUP_OUTLINE = "M3 3 H19 L17 25 H5 Z";
const CUP_WATER = "M4.6 9 H17.4 L15.9 23.5 H6.1 Z";

/**
 * Um copo por 250 ml bebidos hoje (nunca copos vazios: sem meta implícita de água); além de 8,
 * "+n". Decorativo: o total em ml ao lado já diz quanto foi registrado.
 */
export function WaterCups({ ml }: { ml: number }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  const { full, more } = starterCups(ml);
  if (!full) return null;
  return (
    <View
      style={styles.row}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="starter-cups"
    >
      {Array.from({ length: full }, (_, i) => (
        <View key={i} testID="starter-cup">
          <Svg width={CUP.width} height={CUP.height} viewBox={`0 0 ${CUP.width} ${CUP.height}`}>
            <Path d={CUP_WATER} fill={domainTone.water.fg} opacity={0.85} />
            <Path d={CUP_OUTLINE} fill="none" stroke={domainTone.water.fg} strokeWidth={1.6} strokeLinejoin="round" />
          </Svg>
        </View>
      ))}
      {more > 0 ? (
        <AppText size={fontSize.sm} weight={700} color={colors.sky700}>
          {`+${more}`}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
}));
