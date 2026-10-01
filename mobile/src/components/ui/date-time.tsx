import { CalendarDays, Clock } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import {
  MONTHS_PT,
  daysInMonth,
  joinDate,
  joinTime,
  minuteOptions,
  splitDate,
  splitTime,
} from "@shared/components/anamnese/inputs";
import { formatDate, localDate, localTime } from "@shared/lib/domain";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows } from "@/theme/tokens";
import { Button } from "./button";
import { Field } from "./field";
import { Sheet } from "./sheet";
import { AppText } from "./text";
import { Wheel } from "./wheel";

const MIN_YEAR = 1900;
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

type DateSheetProps = {
  visible: boolean;
  title: string;
  value: string;
  min?: string;
  max?: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
};

/** Três rodas (dia, mês, ano) em um painel, com limites de data mínima e máxima. */
export function DatePickerSheet({ visible, title, value, min, max, onClose, onConfirm }: DateSheetProps) {
  const styles = useStyles();
  const fallback = splitDate(max ?? localDate())!;
  const initial = splitDate(value) ?? fallback;
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);

  useEffect(() => {
    if (!visible) return;
    const next = splitDate(value) ?? fallback;
    setYear(next.year);
    setMonth(next.month);
    setDay(next.day);
    // Reabre sempre no valor atual do campo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, value]);

  const maxYear = splitDate(max ?? "")?.year ?? fallback.year + 10;
  const minYear = splitDate(min ?? "")?.year ?? MIN_YEAR;
  const years = range(minYear, maxYear).reverse().map((y) => ({ value: y, label: String(y) }));
  const months = MONTHS_PT.map((name, i) => ({ value: i + 1, label: name }));
  const days = range(1, daysInMonth(year, month)).map((d) => ({ value: d, label: String(d).padStart(2, "0") }));

  const confirm = () => {
    let next = joinDate(year, month, day);
    if (max && next > max) next = max;
    if (min && next < min) next = min;
    onConfirm(next);
  };

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      footer={<Button label="Confirmar data" onPress={confirm} wide />}
    >
      <View style={styles.wheels}>
        <Wheel items={days} value={Math.min(day, days.length)} onChange={setDay} accessibilityLabel="Dia" style={styles.small} />
        <Wheel items={months} value={month} onChange={setMonth} accessibilityLabel="Mês" style={styles.large} />
        <Wheel items={years} value={year} onChange={setYear} accessibilityLabel="Ano" style={styles.medium} />
      </View>
    </Sheet>
  );
}

type TimeSheetProps = {
  visible: boolean;
  title: string;
  value: string;
  minuteStep?: number;
  onClose: () => void;
  onConfirm: (value: string) => void;
};

/** Duas rodas (hora e minuto) em um painel. */
export function TimePickerSheet({ visible, title, value, minuteStep = 1, onClose, onConfirm }: TimeSheetProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const initial = splitTime(value) ?? splitTime(localTime())!;
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);

  useEffect(() => {
    if (!visible) return;
    const next = splitTime(value) ?? splitTime(localTime())!;
    setHour(next.hour);
    setMinute(next.minute);
  }, [visible, value]);

  const hours = range(0, 23).map((h) => ({ value: h, label: String(h).padStart(2, "0") }));
  const minutes = minuteOptions(minuteStep, minute).map((m) => ({ value: m, label: String(m).padStart(2, "0") }));

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      footer={<Button label="Confirmar horário" onPress={() => onConfirm(joinTime(hour, minute))} wide />}
    >
      <View style={[styles.wheels, styles.timeWheels]}>
        <Wheel items={hours} value={hour} onChange={setHour} accessibilityLabel="Hora" />
        <AppText heading size={fontSize["2xl"]} weight={800} color={colors.muted}>
          :
        </AppText>
        <Wheel items={minutes} value={minute} onChange={setMinute} accessibilityLabel="Minuto" />
      </View>
    </Sheet>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
};

/** Campo de data que abre as rodas (substitui input type="date"). */
export function DateField({ label, value, onChange, min, max, hint, error }: FieldProps & { min?: string; max?: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isOpen, setOpen] = useState(false);
  return (
    <Field label={label} hint={hint} error={error} style={styles.flex}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatDate(value) : "não informada"}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.control, pressed && styles.pressed, error ? styles.invalid : null]}
      >
        <AppText size={fontSize.base} color={value ? colors.text : colors.muted}>
          {value ? formatDate(value) : "dd/mm/aaaa"}
        </AppText>
        <CalendarDays size={18} color={colors.muted} />
      </Pressable>
      <DatePickerSheet
        visible={isOpen}
        title={label}
        value={value}
        min={min}
        max={max}
        onClose={() => setOpen(false)}
        onConfirm={(next) => {
          setOpen(false);
          onChange(next);
        }}
      />
    </Field>
  );
}

/** Campo de horário que abre as rodas (substitui input type="time"). */
export function TimeField({ label, value, onChange, hint, error, minuteStep }: FieldProps & { minuteStep?: number }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isOpen, setOpen] = useState(false);
  return (
    <Field label={label} hint={hint} error={error} style={styles.flex}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || "não informado"}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.control, pressed && styles.pressed, error ? styles.invalid : null]}
      >
        <AppText size={fontSize.base} color={value ? colors.text : colors.muted}>
          {value || "--:--"}
        </AppText>
        <Clock size={18} color={colors.muted} />
      </Pressable>
      <TimePickerSheet
        visible={isOpen}
        title={label}
        value={value}
        minuteStep={minuteStep}
        onClose={() => setOpen(false)}
        onConfirm={(next) => {
          setOpen(false);
          onChange(next);
        }}
      />
    </Field>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1, minWidth: 140 },
  wheels: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  timeWheels: { alignItems: "center", alignSelf: "center", width: 240 },
  small: { flex: 1 },
  large: { flex: 1.6 },
  medium: { flex: 1.2 },
  control: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingVertical: 11,
    paddingHorizontal: 13,
    backgroundColor: colors.surface3,
  },
  pressed: { backgroundColor: colors.surface2 },
  invalid: { borderColor: colors.rose400 },
}));
