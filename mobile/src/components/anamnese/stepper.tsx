import { Minus, Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { toNumber } from "@shared/components/anamnese/inputs";
import type { StepperConfig } from "@shared/data/anamneseOptions";
import { AppText, ChipRow, QuickChip } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { QBlock } from "./q-block";

type Props = {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  value: string | number | null;
  config: StepperConfig;
  onChange: (value: string) => void;
};

/** Inteiros pequenos: chips rápidos e botões de menos e mais, sem digitação. */
export function Stepper({ label, hint, error, optional, value, config, onChange }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const numeric = toNumber(value);
  const current = numeric ?? config.initial;
  const set = (next: number) => onChange(String(Math.min(config.max, Math.max(config.min, next))));
  return (
    <QBlock label={label} optional={optional} hint={hint} error={error}>
      <View style={styles.stepper}>
        <StepButton icon={Minus} label={`Diminuir ${config.step} ${config.unit}`} disabled={current <= config.min} onPress={() => set(current - config.step)} />
        {/* aria-value* explícitos: o react-native-web não gera aria-valuetext a partir do accessibilityValue. */}
        <View
          style={styles.value}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min: config.min, max: config.max, now: numeric ?? undefined, text: numeric === null ? "não informado" : `${numeric} ${config.unit}` }}
          aria-valuemin={config.min}
          aria-valuemax={config.max}
          aria-valuenow={numeric ?? undefined}
          aria-valuetext={numeric === null ? "não informado" : `${numeric} ${config.unit}`}
        >
          <AppText heading size={fontSize["4xl"]} weight={800} tracking={-0.03} lineHeight={36} color={numeric === null ? colors.faint : colors.text}>
            {numeric === null ? "—" : String(numeric)}
          </AppText>
          <AppText size={fontSize.xs} weight={600} color={colors.muted}>
            {config.unit}
          </AppText>
        </View>
        <StepButton icon={Plus} label={`Aumentar ${config.step} ${config.unit}`} disabled={current >= config.max} onPress={() => set(numeric === null ? config.initial : current + config.step)} />
      </View>
      <ChipRow center>
        {config.quick.map((option) => (
          <QuickChip key={option} label={String(option)} sublabel={config.quickLabels?.[option]} isOn={numeric === option} onPress={() => set(option)} />
        ))}
      </ChipRow>
    </QBlock>
  );
}

function StepButton({ icon: Icon, label, disabled, onPress }: { icon: typeof Minus; label: string; disabled: boolean; onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}>
      <Icon size={18} color={colors.text2} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  button: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  value: { alignItems: "center", minWidth: 100 },
  pressed: { transform: [{ scale: 0.95 }] },
  disabled: { opacity: 0.4 },
}));
