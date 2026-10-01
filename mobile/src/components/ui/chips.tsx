import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, shadows } from "@/theme/tokens";
import { AppText } from "./text";

type ChipProps = {
  label: string;
  sublabel?: string;
  isOn?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Chip arredondado de atalho (.quick-chip). */
export function QuickChip({ label, sublabel, isOn = false, onPress, accessibilityLabel, style }: ChipProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: isOn }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        isOn && styles.chipOn,
        pressed && styles.pressed,
        style,
      ]}
    >
      {/* Ligado: tinta escura sobre o esmeralda (o branco ficava em 2,5:1). */}
      <AppText heading size={fontSize.sm} weight={600} color={isOn ? colors.onEmeraldInk : colors.text2} align="center">
        {label}
      </AppText>
      {sublabel ? (
        <AppText size={fontSize["2xs"]} weight={500} color={isOn ? colors.onEmeraldInk : colors.muted} align="center" lineHeight={13}>
          {sublabel}
        </AppText>
      ) : null}
    </Pressable>
  );
}

export function ChipRow({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  const styles = useStyles();
  return <View style={[styles.row, center && styles.center]}>{children}</View>;
}

type TabsProps<T extends string> = {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

/** Filtros em pílulas (.tabs). */
export function SegmentedTabs<T extends string>({ options, value, onChange, accessibilityLabel }: TabsProps<T>) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map(([key, label]) => {
        const isActive = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(key)}
            style={[styles.tab, isActive && styles.tabActive]}
          >
            <AppText size={fontSize.xs} weight={isActive ? 700 : 600} color={isActive ? colors.green800 : colors.muted}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  center: { justifyContent: "center" },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  chipOn: {
    backgroundColor: colors.green500,
    borderColor: colors.green500,
    boxShadow: shadows.chipOn,
  },
  pressed: { transform: [{ scale: 0.96 }] },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabActive: {
    backgroundColor: colors.chipOnTint,
    borderColor: colors.selectedBorder,
  },
}));
