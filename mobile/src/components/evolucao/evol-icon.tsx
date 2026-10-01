import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { makeStyles, useTheme } from "@/theme/theme";
import { themeDomainTone, type ColorScheme, type ThemeColors } from "@/theme/tokens";

export type EvolTone = "body" | "food" | "water" | "protein" | "meals" | "mind" | "habit" | "weight" | "calendar";
/** lg 40 pt (cartões grandes), md 36 (Peso e Seus registros, conceito 09), sm 34, xs 28 (mini gráficos). */
export type EvolIconSize = "lg" | "md" | "sm" | "xs";

const SIZES: Record<EvolIconSize, { box: number; radius: number; icon: number }> = {
  lg: { box: 40, radius: 14, icon: 20 },
  md: { box: 36, radius: 12, icon: 20 },
  sm: { box: 34, radius: 12, icon: 18 },
  xs: { box: 28, radius: 10, icon: 16 },
};

/** Cor por domínio dos cartões da Evolução (.evol-icon do web), no tema atual. */
function evolTones(colors: ThemeColors, scheme: ColorScheme): Record<EvolTone, { fg: string; bg: string }> {
  const domain = themeDomainTone(scheme);
  return {
    body: { fg: domain.body.fg, bg: domain.body.bg },
    food: { fg: domain.food.fg, bg: domain.food.bg },
    water: { fg: domain.water.fg, bg: domain.water.bg },
    // Bem-estar e sono (EVOL-07) e os blocos de rotina de "Sua semana" (EVOL-05).
    mind: { fg: domain.mind.fg, bg: domain.mind.bg },
    habit: { fg: domain.habit.fg, bg: domain.habit.bg },
    protein: { fg: colors.green700, bg: colors.mint50 },
    meals: { fg: colors.text2, bg: colors.surface2 },
    // Peso (menta) e Seus registros (índigo), como no conceito 09.
    weight: { fg: colors.green700, bg: colors.mint100 },
    calendar: { fg: domain.water.fg, bg: colors.indigo50 },
  };
}

/** Ícone em quadro arredondado (40 pt por padrão; `small` = 34, o tamanho antigo dos mini gráficos). */
export function EvolIcon({
  icon: Icon,
  tone,
  small = false,
  size,
}: {
  icon: LucideIcon;
  tone: EvolTone;
  small?: boolean;
  size?: EvolIconSize;
}) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const t = evolTones(colors, scheme)[tone];
  const s = SIZES[size ?? (small ? "sm" : "lg")];
  return (
    <View style={[styles.box, { width: s.box, height: s.box, borderRadius: s.radius, backgroundColor: t.bg }]} aria-hidden>
      <Icon size={s.icon} color={t.fg} />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  box: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
}));
