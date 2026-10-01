import { useState } from "react";
import { View } from "react-native";
import { daysInMonth, joinDate, MONTHS_PT, splitDate } from "@shared/components/anamnese/inputs";
import { localDate, shiftDate } from "@shared/lib/domain";
import { AppText, ChipRow, QuickChip, Wheel } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { QBlock } from "./q-block";

type Props = {
  label: string;
  hint?: string;
  error?: string;
  value: string;
  minYear: number;
  maxYear: number;
  /** Data usada para posicionar as rodas enquanto o campo está vazio. */
  initial: string;
  /** Exibe atalhos "Hoje" e "Ontem" antes das rodas. */
  quick?: boolean;
  onChange: (value: string) => void;
};

const longDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

/** Data em três rodas (dia, mês, ano) com atalhos opcionais. */
export function DateWheels({ label, hint, error, value, minYear, maxYear, initial, quick, onChange }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const parsed = splitDate(value);
  const base = parsed ?? splitDate(initial) ?? { year: maxYear, month: 1, day: 1 };
  const today = localDate();
  const yesterday = shiftDate(today, -1);
  const isCustom = quick && value !== "" && value !== today && value !== yesterday;
  const [showWheels, setShowWheels] = useState(!quick || isCustom);
  const set = (part: Partial<typeof base>) => {
    const next = { ...base, ...part };
    onChange(joinDate(next.year, next.month, Math.min(next.day, daysInMonth(next.year, next.month))));
  };
  const days = Array.from({ length: daysInMonth(base.year, base.month) }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
  const months = MONTHS_PT.map((month, i) => ({ value: i + 1, label: month }));
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => ({ value: maxYear - i, label: String(maxYear - i) }));
  const wheelsOpen = !quick || showWheels;
  return (
    <QBlock
      label={label}
      hint={hint}
      error={error}
      right={
        <AppText size={fontSize.xs} weight={600} color={parsed ? colors.green700 : colors.muted}>
          {parsed ? longDate(value) : "Role para escolher"}
        </AppText>
      }
    >
      {quick && (
        <ChipRow>
          <QuickChip
            label="Hoje"
            isOn={value === today}
            onPress={() => {
              setShowWheels(false);
              onChange(today);
            }}
          />
          <QuickChip
            label="Ontem"
            isOn={value === yesterday}
            onPress={() => {
              setShowWheels(false);
              onChange(yesterday);
            }}
          />
          <QuickChip label="Outra data" isOn={wheelsOpen} onPress={() => setShowWheels(true)} />
        </ChipRow>
      )}
      {wheelsOpen && (
        <View style={styles.wheels}>
          <Wheel items={days} value={base.day} onChange={(day) => set({ day })} accessibilityLabel={`${label}: dia`} style={styles.small} />
          <Wheel items={months} value={base.month} onChange={(month) => set({ month })} accessibilityLabel={`${label}: mês`} style={styles.wide} />
          <Wheel items={years} value={base.year} onChange={(year) => set({ year })} accessibilityLabel={`${label}: ano`} style={styles.medium} />
        </View>
      )}
    </QBlock>
  );
}

const useStyles = makeStyles(() => ({
  wheels: { flexDirection: "row", gap: 8 },
  small: { flex: 0.8 },
  medium: { flex: 1 },
  wide: { flex: 1.5 },
}));
