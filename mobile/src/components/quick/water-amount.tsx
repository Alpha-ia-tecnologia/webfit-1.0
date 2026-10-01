import { Minus, Plus, type LucideIcon } from "lucide-react-native";
import { Pressable, TextInput, View } from "react-native";
import { fmtNumber } from "@shared/lib/format";
import { AppText } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontFamily, fontSize, radius, themeDomainTone } from "@/theme/tokens";
import { ChipGroup, EntryChip } from "./entry-chip";

const WATER_STEP_ML = 50;
const WATER_MIN_ML = 50;
const WATER_MAX_ML = 5000;
const WATER_PRESETS = [150, 200, 250, 300, 500, 750] as const;
/** Botões redondos de ±50 ml. */
const STEP_SIZE = 48;

function StepButton({ icon: Icon, label, disabled, onPress }: { icon: LucideIcon; label: string; disabled: boolean; onPress: () => void }) {
  const styles = useStyles();
  const domainTone = themeDomainTone(useTheme().scheme);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.step, pressed && !disabled && styles.stepPressed, disabled && styles.disabled]}
    >
      <Icon size={20} color={domainTone.water.fg} />
    </Pressable>
  );
}

/** Volume em destaque com ±50 ml e tamanhos comuns em um toque; o campo aceita qualquer valor. */
export function WaterAmount({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const current = Number(value) || 0;
  const step = (delta: number) => onChange(String(Math.min(WATER_MAX_ML, Math.max(WATER_MIN_ML, current + delta))));
  return (
    <View style={styles.editor}>
      <AppText size={fontSize.sm} weight={600} color={colors.text2} aria-hidden importantForAccessibility="no">
        Volume (ml)
      </AppText>
      <View style={styles.row}>
        <StepButton
          icon={Minus}
          label={`Diminuir ${WATER_STEP_ML} ml`}
          disabled={current <= WATER_MIN_ML}
          onPress={() => step(-WATER_STEP_ML)}
        />
        <View style={styles.big}>
          <TextInput
            value={value}
            onChangeText={(text) => onChange(text.replace(/\D/g, ""))}
            keyboardType="number-pad"
            accessibilityLabel="Volume (ml)"
            maxLength={4}
            selectTextOnFocus
            style={styles.input}
          />
          <AppText heading size={fontSize.lg} weight={700} color={colors.muted} aria-hidden importantForAccessibility="no">
            ml
          </AppText>
        </View>
        <StepButton
          icon={Plus}
          label={`Aumentar ${WATER_STEP_ML} ml`}
          disabled={current >= WATER_MAX_ML}
          onPress={() => step(WATER_STEP_ML)}
        />
      </View>
      <ChipGroup label="Volumes comuns" isCentered>
        {WATER_PRESETS.map((ml) => (
          <EntryChip key={ml} label={`${fmtNumber(ml)} ml`} tone="water" isOn={current === ml} onPress={() => onChange(String(ml))} />
        ))}
      </ChipGroup>
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  editor: { alignItems: "center", gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, width: "100%", maxWidth: 320 },
  step: {
    width: STEP_SIZE,
    height: STEP_SIZE,
    borderRadius: STEP_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).water.border,
    backgroundColor: themeDomainTone(scheme).water.bg,
  },
  stepPressed: { backgroundColor: colors.sky100, transform: [{ scale: 0.9 }] },
  disabled: { opacity: 0.4 },
  big: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 6 },
  input: {
    width: 130,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface3,
    textAlign: "center",
    color: themeDomainTone(scheme).water.fg,
    fontFamily: fontFamily(800, true),
    fontSize: fontSize["6xl"],
    letterSpacing: -0.03 * fontSize["6xl"],
    fontVariant: ["tabular-nums"],
  },
}));
