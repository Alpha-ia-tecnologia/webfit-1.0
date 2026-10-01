import type { LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

// Canto dos cartões de objetivo (.starter-goal) e do ícone (.starter-goal-icon).
const GOAL_RADIUS = 18;
const ICON_RADIUS = 14;

type GoalProps = {
  label: string;
  icon: LucideIcon;
  isOn: boolean;
  /** Até 360 dp o cartão vira uma linha (ícone ao lado do texto). */
  isCompact: boolean;
  onPress: () => void;
};

/** Objetivo em cartão com ícone (.starter-goal), com semântica de rádio. */
export function GoalCard({ label, icon: Icon, isOn, isCompact, onPress }: GoalProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: isOn }}
      aria-checked={isOn}
      onPress={onPress}
      style={({ pressed }) => [
        styles.goal,
        isCompact && styles.goalCompact,
        isOn && styles.goalOn,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.goalIcon, isOn && styles.goalIconOn]}>
        <Icon size={20} color={isOn ? colors.white : colors.green700} />
      </View>
      <AppText weight={600} lineHeight={19} style={isCompact ? styles.grow : undefined}>
        {label}
      </AppText>
    </Pressable>
  );
}

type HabitProps = {
  title: string;
  /** Horário sugerido, em linha menor abaixo do título. */
  time?: string;
  isOn: boolean;
  onPress: () => void;
};

/** Opção do primeiro combinado (.starter-choices label): rádio redondo, título e horário. */
export function HabitChoice({ title, time, isOn, onPress }: HabitProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={time ? `${title}, ${time}` : title}
      accessibilityState={{ checked: isOn }}
      aria-checked={isOn}
      onPress={onPress}
      style={({ pressed }) => [styles.habit, isOn && styles.habitOn, pressed && styles.pressed]}
    >
      <View style={[styles.radio, isOn && styles.radioOn]}>
        {isOn ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.grow}>
        <AppText lineHeight={20}>{title}</AppText>
        {time ? (
          <AppText size={fontSize.xs} color={colors.muted}>
            {time}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  goal: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: "47%",
    minHeight: 112,
    gap: 10,
    padding: 14,
    borderRadius: GOAL_RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  goalCompact: {
    flexBasis: "100%",
    minWidth: "100%",
    minHeight: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  goalOn: {
    borderColor: colors.green600,
    backgroundColor: colors.mint50,
    boxShadow: "inset 0px 0px 0px 1px " + colors.green600,
  },
  goalIcon: {
    width: 40,
    height: 40,
    borderRadius: ICON_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.mint50,
  },
  goalIconOn: { backgroundColor: colors.accentFill },
  habit: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  habitOn: { borderColor: colors.green600, backgroundColor: colors.mint50 },
  radio: {
    width: 18,
    height: 18,
    marginTop: 1,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.green600 },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green600 },
  pressed: { transform: [{ scale: 0.98 }] },
  grow: { flex: 1, minWidth: 0 },
}));
