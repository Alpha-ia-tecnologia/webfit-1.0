import { useState } from "react";
import { View } from "react-native";
import { joinTime, minuteOptions, splitTime } from "@shared/components/anamnese/inputs";
import { AppText, ChipRow, QuickChip, Wheel } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { QBlock } from "./q-block";

type Props = {
  label: string;
  hint?: string;
  error?: string;
  value: string;
  presets: string[];
  onChange: (value: string) => void;
};

const MINUTE_STEP = 5;
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: String(h).padStart(2, "0") }));

/** Horário em chips sugeridos mais "Outro horário" com rodas de hora e minuto. */
export function TimePicker({ label, hint, error, value, presets, onChange }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const parsed = splitTime(value);
  const normalized = parsed ? joinTime(parsed.hour, parsed.minute) : "";
  const isCustom = normalized !== "" && !presets.includes(normalized);
  const [showWheels, setShowWheels] = useState(isCustom);
  const base = parsed ?? { hour: 8, minute: 0 };
  const minutes = minuteOptions(MINUTE_STEP, parsed?.minute ?? null).map((m) => ({ value: m, label: String(m).padStart(2, "0") }));
  return (
    <QBlock
      label={label}
      hint={hint}
      error={error}
      right={
        <AppText size={fontSize.xs} weight={600} color={normalized ? colors.green700 : colors.muted}>
          {normalized || "Toque para escolher"}
        </AppText>
      }
    >
      <ChipRow>
        {presets.map((time) => (
          <QuickChip
            key={time}
            label={time}
            isOn={normalized === time}
            onPress={() => {
              setShowWheels(false);
              onChange(time);
            }}
          />
        ))}
        <QuickChip label="Outro horário" isOn={showWheels} onPress={() => setShowWheels(true)} />
      </ChipRow>
      {showWheels && (
        <View style={styles.wheels}>
          <Wheel items={HOURS} value={base.hour} onChange={(hour) => onChange(joinTime(hour, base.minute))} accessibilityLabel={`${label}: hora`} style={styles.wheel} />
          <AppText heading size={fontSize["2xl"]} weight={800} color={colors.muted}>
            :
          </AppText>
          <Wheel items={minutes} value={base.minute} onChange={(minute) => onChange(joinTime(base.hour, minute))} accessibilityLabel={`${label}: minutos`} style={styles.wheel} />
        </View>
      )}
    </QBlock>
  );
}

const useStyles = makeStyles(() => ({
  wheels: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  wheel: { width: 96 },
}));
