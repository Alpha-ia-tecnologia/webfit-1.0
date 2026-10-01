import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { spaceKey } from "@/components/refeicao/web-a11y";
import { AppText } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

/** Toque real de 44 px (o react-native-web ignora hitSlop). */
const TARGET = 44;

export type RadioPillOption = {
  value: string;
  label: string;
  /** Texto visível mais curto (ex.: "Q" para Quinta-feira); o nome acessível continua `label`. */
  short?: string;
  /** Círculo de 44 × 44 em vez de pílula (dias da semana). */
  isCircle?: boolean;
};

type Props = {
  /** Rótulo visível e nome do grupo de rádios. */
  label: string;
  options: readonly RadioPillOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** Leva o foco ao rádio marcado (ou ao primeiro) ao aparecer. */
  focusOnMount?: boolean;
  testID?: string;
};

/** Grupo de rádios em pílulas compactas (frequência, dia, quando, local e tipo da caneta). */
export function RadioPills({ label, options, value, onChange, focusOnMount, testID }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const stop = useRef<View>(null);
  const checkedIndex = options.findIndex((o) => o.value === value);
  const stopIndex = checkedIndex === -1 ? 0 : checkedIndex;
  useEffect(() => {
    if (focusOnMount) focusNode(stop.current);
    // Só ao aparecer (a pessoa abriu o trecho); depois o foco segue a pessoa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.block} testID={testID}>
      <AppText heading size={fontSize.sm} weight={700} color={colors.text}>
        {label}
      </AppText>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option, i) => {
          const isOn = option.value === value;
          return (
            <Pressable
              key={option.value || "empty"}
              ref={i === stopIndex ? stop : undefined}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: isOn }}
              aria-checked={isOn}
              {...spaceKey(() => onChange(option.value))}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [styles.pill, option.isCircle && styles.circle, isOn && styles.on, pressed && styles.pressed]}
            >
              <AppText heading size={fontSize.sm} weight={700} color={isOn ? colors.white : colors.text2} align="center">
                {option.short ?? option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  block: { gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { minHeight: TARGET, minWidth: TARGET, alignItems: "center", justifyContent: "center", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  circle: { width: TARGET, height: TARGET, paddingHorizontal: 0, paddingVertical: 0 },
  on: { borderColor: colors.accentFill, backgroundColor: colors.accentFill },
  pressed: { transform: [{ scale: 0.97 }] },
}));
