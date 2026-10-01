import { Moon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { MOOD_LABELS } from "@shared/lib/day";
import { fmtNumber } from "@shared/lib/format";
import type { DiaryEntry } from "@shared/types";
import { AppText, Button, Card } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone, type ThemeColors } from "@/theme/tokens";

/** Marcadores visíveis no cartão depois do registro; o Diário mostra todos. */
const MAX_TAGS_SHOWN = 2;

/** Tons sem julgamento: nenhum rosto usa vermelho. */
const faceTones = (colors: ThemeColors) =>
  [
    { fill: colors.indigo50, ink: colors.indigo500 },
    { fill: colors.violet50, ink: colors.violet600 },
    { fill: colors.surface2, ink: colors.muted },
    { fill: colors.mint100, ink: colors.green600 },
    { fill: colors.mint200, ink: colors.green700 },
  ] as const;

/** Rosto desenhado: a boca vai de triste (1) a sorrindo (5). */
export function MoodFace({ rating, size = 40 }: { rating: number; size?: number }) {
  const colors = useThemeColors();
  const faces = faceTones(colors);
  const level = Math.min(5, Math.max(1, rating));
  const tone = faces[level - 1] ?? faces[2];
  const curve = (level - 3) * 4;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle cx={20} cy={20} r={18} fill={tone.fill} stroke={tone.ink} strokeWidth={1.5} />
      <Circle cx={14} cy={16} r={2} fill={tone.ink} />
      <Circle cx={26} cy={16} r={2} fill={tone.ink} />
      <Path
        d={`M12 ${26 - curve / 2} Q20 ${26 + curve} 28 ${26 - curve / 2}`}
        fill="none"
        stroke={tone.ink}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

type Props = {
  latest: DiaryEntry | null;
  onLog: (rating: number) => void;
  onDetails: () => void;
};

/** Bem-estar em um toque: cinco rostos; depois de registrar, mostra o último, o sono e até 2 marcadores. */
export function MoodCard({ latest, onLog, onDetails }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  if (latest?.rating)
    return (
      <Card style={styles.done}>
        <MoodFace rating={latest.rating} size={44} />
        <View style={styles.copy}>
          <AppText heading size={fontSize.md} weight={800} accessibilityRole="header">
            {MOOD_LABELS[latest.rating - 1] ?? "Bem-estar"}
          </AppText>
          <View style={styles.meta}>
            <AppText size={fontSize.xs} color={colors.muted}>
              Registrado às {latest.time}
            </AppText>
            {latest.sleepHours !== undefined && (
              <View style={styles.sleep}>
                <Moon size={12} color={colors.indigo700} />
                <AppText size={fontSize.xs} weight={600} color={colors.indigo700} lineHeight={16}>
                  Sono {fmtNumber(latest.sleepHours, 1)} h
                </AppText>
              </View>
            )}
            {latest.tags?.slice(0, MAX_TAGS_SHOWN).map((tag) => (
              <View key={tag} style={styles.tag}>
                <AppText size={fontSize.xs} weight={600} color={colors.text2} lineHeight={16}>
                  {tag}
                </AppText>
              </View>
            ))}
          </View>
        </View>
        <Button label="Detalhes" variant="text" onPress={onDetails} />
      </Card>
    );
  return (
    <Card>
      <AppText heading size={fontSize.md} weight={800} accessibilityRole="header">
        Como você está?
      </AppText>
      <View style={styles.faces} accessibilityLabel="Como você está?">
        {MOOD_LABELS.map((label, i) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={`Registrar como me sinto: ${label}`}
            onPress={() => onLog(i + 1)}
            style={({ pressed }) => [styles.face, pressed && styles.facePressed]}
          >
            <MoodFace rating={i + 1} />
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  done: { flexDirection: "row", alignItems: "center", gap: 12 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 },
  sleep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.indigo50,
  },
  tag: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).mind.border,
    backgroundColor: themeDomainTone(scheme).mind.bg,
  },
  faces: { flexDirection: "row", gap: 6 },
  face: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 14 },
  facePressed: { backgroundColor: colors.surface3, transform: [{ scale: 0.92 }] },
}));
