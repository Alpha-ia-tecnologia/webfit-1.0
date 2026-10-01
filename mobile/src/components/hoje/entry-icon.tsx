import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { makeStyles, useTheme } from "@/theme/theme";
import { themeTones, type Tone } from "@/theme/tokens";

/** Ícone em quadro colorido arredondado (.meal-icon). */
export function EntryIcon({ icon: Icon, tone, size = 46 }: { icon: LucideIcon; tone: Tone; size?: number }) {
  const styles = useStyles();
  const t = themeTones(useTheme().scheme)[tone];
  return (
    <View style={[styles.box, { width: size, height: size, backgroundColor: t.bg, borderColor: t.border }]}>
      <Icon size={Math.round(size * 0.48)} color={t.fg} />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  box: { borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
}));
