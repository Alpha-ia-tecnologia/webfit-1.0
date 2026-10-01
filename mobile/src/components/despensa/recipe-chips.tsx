import { Clock, Thermometer, Timer, Users, Utensils, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { recipeChips } from "@shared/lib/recipe-set";
import type { RecipeCard } from "@shared/types";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

/** Ícones dos chips na ordem de recipeChips: refeição, tempo e rendimento. */
const CHIP_ICONS: LucideIcon[] = [Utensils, Clock, Users];

/** Chips "Almoço", "20 min", "2 porções" com os ícones de refeição, tempo e rendimento. */
export function RecipeChips({ card }: { card: RecipeCard }) {
  const styles = useStyles();
  return (
    <View style={styles.chips}>
      {recipeChips(card).map((text, i) => (
        <Chip key={i} icon={CHIP_ICONS[i]!} text={text} />
      ))}
    </View>
  );
}

/** Tempo e temperatura de um passo ("25 min", "200 °C"), de stepExtras. */
export function StepExtras({ extras }: { extras: string[] }) {
  const styles = useStyles();
  if (!extras.length) return null;
  return (
    <View style={styles.chips}>
      {extras.map((text) => (
        <Chip key={text} icon={text.endsWith("°C") ? Thermometer : Timer} text={text} tinted />
      ))}
    </View>
  );
}

function Chip({ icon: Icon, text, tinted = false }: { icon: LucideIcon; text: string; tinted?: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={[styles.chip, tinted && styles.tinted]}>
      <Icon size={13} color={colors.green700} />
      <AppText size={fontSize.xs} weight={600} color={colors.text2}>
        {text}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  tinted: { backgroundColor: colors.mint50, borderColor: colors.mint200 },
}));
