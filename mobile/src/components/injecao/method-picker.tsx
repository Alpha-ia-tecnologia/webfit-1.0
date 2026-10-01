import { Pressable, View } from "react-native";
import { METHODS } from "@shared/lib/injection";
import type { InjectionMethod } from "@shared/types";
import { AppText, Card } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, shadows, themeDomainTone } from "@/theme/tokens";
import { MethodArt } from "./method-art";

/** Cartão de escolha: 72 px de altura mínima (toque real, o react-native-web ignora hitSlop). */
const CARD_MIN = 72;

/** "Como você aplica?": frasco e seringa, caneta com seletor ou caneta de dose única (SERINGA-08). */
export function MethodPicker({ value, onChange }: { value: InjectionMethod; onChange: (method: InjectionMethod) => void }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme).medication;
  return (
    <Card>
      <AppText heading size={fontSize.md} weight={800} accessibilityRole="header">
        Como você aplica?
      </AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel="Como você aplica?" style={styles.row}>
        {METHODS.map((m) => {
          const isOn = m.key === value;
          return (
            <Pressable
              key={m.key}
              accessibilityRole="radio"
              accessibilityLabel={m.label}
              accessibilityState={{ checked: isOn }}
              aria-checked={isOn}
              onPress={() => onChange(m.key)}
              style={({ pressed }) => [styles.option, isOn && styles.optionOn, pressed && styles.pressed]}
            >
              <MethodArt method={m.key} />
              <AppText heading size={fontSize.sm} weight={800} color={isOn ? tone.fg : colors.text2} align="center" lineHeight={17}>
                {m.label}
              </AppText>
              <AppText size={fontSize.xs} color={colors.muted} align="center" lineHeight={16}>
                {m.hint}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  row: { flexDirection: "row", gap: 8 },
  option: {
    flex: 1,
    minWidth: 0,
    minHeight: CARD_MIN,
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface3,
  },
  optionOn: {
    borderColor: themeDomainTone(scheme).medication.fg,
    backgroundColor: themeDomainTone(scheme).medication.bg,
    boxShadow: shadows.medicationOn,
  },
  pressed: { transform: [{ scale: 0.97 }] },
}));
