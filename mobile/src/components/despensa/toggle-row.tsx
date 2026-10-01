import { Pressable, View } from "react-native";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

/** Alvo de toque real (o react-native-web ignora hitSlop). */
const MIN_TOUCH = 44;

type Props<T extends string> = {
  /** Nome acessível do grupo ("Filtrar por local", "Guardar item 1 em"). */
  label: string;
  /** Rótulo visível acima dos botões; sem ele, só o nome acessível (como o controle do web). */
  caption?: string;
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

/**
 * Escolha única em botões de alternância (group + aria-pressed), como o SegmentedControl do web.
 * Não usa ui/segmented-control, que tem semântica de abas.
 */
export function ToggleRow<T extends string>({ label, caption, options, value, onChange, disabled = false }: Props<T>) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.field}>
      {caption ? (
        <AppText size={fontSize.sm} weight={600} color={colors.text2}>
          {caption}
        </AppText>
      ) : null}
      <View role="group" accessibilityLabel={label} style={styles.row}>
        {options.map(([key, text]) => {
          const isOn = key === value;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={text}
              accessibilityState={{ selected: isOn, disabled }}
              {...webAttrs({ "aria-pressed": isOn })}
              disabled={disabled}
              onPress={() => {
                if (isOn) return;
                selectionHaptic();
                onChange(key);
              }}
              style={({ pressed }) => [
                styles.option,
                isOn && styles.optionOn,
                pressed && !disabled && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <AppText size={fontSize.sm} weight={isOn ? 700 : 600} color={isOn ? colors.green800 : colors.text2} align="center">
                {text}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  field: { gap: 7 },
  row: {
    flexDirection: "row",
    gap: 4,
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  option: {
    flex: 1,
    minHeight: MIN_TOUCH,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  optionOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.mint200 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
}));
