import { Clock } from "lucide-react-native";
import { Platform, View } from "react-native";
import type { ExpiryPill as Pill } from "@shared/lib/pantry-view";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

/** No web o nome completo vem do aria-label de uma imagem; no aparelho, do elemento acessível. */
const LABELLED = Platform.OS === "web" ? ({ role: "img" } as const) : ({ accessible: true } as const);

/**
 * Pílula de validade da linha (conceito 06): "2 dias" âmbar com relógio perto do fim, "5 dias" / "3 meses" menta em
 * dia e "Venceu ontem" rosa (o único rosa da tela: é sobre o alimento, não sobre o consumo). O leitor de tela ouve a
 * frase completa (`label`, ou "Vence em 2 dias · 08/10").
 */
export function ExpiryPill({ pill, label, testID }: { pill: Pill; label?: string; testID?: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const color = pill.tone === "soon" ? colors.amber900 : pill.tone === "expired" ? colors.rose700 : colors.green700;
  return (
    <View
      {...LABELLED}
      accessibilityLabel={label ?? pill.full}
      testID={testID ?? `pantry-expiry-${pill.tone}`}
      style={[styles.pill, styles[pill.tone]]}
    >
      {pill.tone === "soon" ? <Clock size={14} color={color} /> : null}
      <AppText size={fontSize.xs} weight={700} color={color} lineHeight={16} numberOfLines={1}>
        {pill.compact}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 4,
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "transparent",
  },
  soon: { backgroundColor: colors.amber100 },
  ok: { backgroundColor: colors.mint50 },
  expired: { backgroundColor: colors.rose50, borderColor: colors.rose200 },
}));
