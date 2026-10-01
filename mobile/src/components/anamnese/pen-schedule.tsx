import { CircleCheck } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { STEPPER_FIELDS } from "@shared/data/anamneseOptions";
import { localTime, shiftDate } from "@shared/lib/dates";
import { METHODS, SITES } from "@shared/lib/injection";
import {
  isWeeklyDraft,
  PEN_FREQUENCIES,
  PEN_KEYS,
  penFrequencyOf,
  penLastPreview,
  WEEKDAYS,
} from "@shared/lib/pen-setup";
import type { Draft } from "@shared/types";
import { AppText, Button } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { DateWheels } from "./date-wheels";
import { QHelp } from "./q-block";
import { RadioPills, type RadioPillOption } from "./radio-pills";
import { Stepper } from "./stepper";

const FREQUENCY_OPTIONS: RadioPillOption[] = PEN_FREQUENCIES.map((f) => ({ value: f.key, label: f.label }));
const WEEKDAY_OPTIONS: RadioPillOption[] = [
  ...WEEKDAYS.map((d) => ({ value: String(d.value), label: d.label, short: d.short, isCircle: true })),
  { value: "", label: "Varia" },
];
const SITE_OPTIONS: RadioPillOption[] = SITES.map((s) => ({ value: s.key, label: s.label }));
/** Só canetas: frasco e seringa ficam com a calculadora de Seringa e dose. */
const METHOD_OPTIONS: RadioPillOption[] = METHODS.filter((m) => m.key !== "frasco").map((m) => ({ value: m.key, label: m.label }));
const PER_MONTH = { semanal: "4", diaria: "30" } as const;
const MIN_TOUCH = 44;

type Props = {
  answers: Draft;
  errors: Record<string, string>;
  set: (key: string, value: string | boolean) => void;
  /** Aplicações já registradas: com alguma, a última não é registrada daqui. */
  injectionsCount: number;
  today: string;
  /** Falso no editor de uma seção (?secao=N), que não registra aplicações: aponta para Seringa e dose. */
  canRegister?: boolean;
};

/**
 * Caneta configurada (ANAM-12): frequência, dia da aplicação semanal e o registro opcional da última
 * aplicação. Nunca sugere dose nem estima a próxima; o registro só acontece com "Confirmar para
 * registrar" e apenas como primeira aplicação, ao concluir a anamnese.
 */
export function PenSchedule({ answers, errors, set, injectionsCount, today, canRegister = true }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const perMonth = answers.weightLossPenPerMonth;
  const [isOther, setOther] = useState(() => penFrequencyOf(perMonth) === "outra");
  const frequency = isOther ? "outra" : penFrequencyOf(perMonth);
  const error = errors.weightLossPenPerMonth || errors.penWeekday;
  return (
    <View testID="pen-schedule" style={styles.root}>
      <RadioPills
        label="Com que frequência?"
        options={FREQUENCY_OPTIONS}
        value={frequency}
        onChange={(next) => {
          setOther(next === "outra");
          if (next === "semanal" || next === "diaria") set("weightLossPenPerMonth", PER_MONTH[next]);
        }}
      />
      {frequency === "outra" ? (
        <Stepper label="Aplicações por mês" value={String(perMonth ?? "")} config={STEPPER_FIELDS.weightLossPenPerMonth!} onChange={(next) => set("weightLossPenPerMonth", next)} />
      ) : null}
      {isWeeklyDraft(answers) ? (
        <RadioPills label="Dia da aplicação" options={WEEKDAY_OPTIONS} value={String(answers.penWeekday ?? "")} onChange={(next) => set("penWeekday", next)} />
      ) : null}
      <QHelp error={error} />
      {injectionsCount > 0 ? (
        <View style={styles.readOnly}>
          <AppText size={fontSize.sm} weight={600} color={colors.text2}>
            Sua última aplicação já está no diário.
          </AppText>
          <AppText size={fontSize.xs} color={colors.muted}>
            Novas aplicações ficam em Seringa e dose.
          </AppText>
        </View>
      ) : canRegister ? (
        <LastApplication answers={answers} set={set} today={today} />
      ) : (
        <View testID="pen-register-elsewhere" style={styles.readOnly}>
          <AppText size={fontSize.sm} weight={600} color={colors.text2}>
            Para registrar uma aplicação, use Seringa e dose.
          </AppText>
        </View>
      )}
    </View>
  );
}

/** "Registrar a última aplicação": quando, onde e qual caneta, com pré-visualização e confirmação explícita. */
function LastApplication({ answers, set, today }: Omit<Props, "errors" | "injectionsCount" | "canRegister">) {
  const styles = useStyles();
  const colors = useThemeColors();
  const date = String(answers[PEN_KEYS.date] ?? "");
  const yesterday = shiftDate(today, -1);
  const wasConfirmed = answers[PEN_KEYS.confirmed] === true;
  const [isOpen, setOpen] = useState(() => date !== "" || wasConfirmed);
  const [isOtherDate, setOtherDate] = useState(() => date !== "" && date !== today && date !== yesterday);
  const openedByPerson = useRef(false);
  const confirmButton = useRef<View>(null);
  const undoButton = useRef<View>(null);
  const pendingFocus = useRef<"undo" | "confirm" | null>(null);
  const preview = penLastPreview(answers, today, localTime());
  const isBlocked = preview.block !== null;
  // Data bloqueada (futura, antiga demais…) nunca aparece como "será registrada", como no web.
  const isConfirmed = wasConfirmed && !isBlocked;
  const when = isOtherDate ? "outra" : date === today ? "hoje" : date === yesterday ? "ontem" : null;
  useEffect(() => {
    const target = pendingFocus.current === "undo" ? undoButton.current : pendingFocus.current === "confirm" ? confirmButton.current : null;
    pendingFocus.current = null;
    focusNode(target);
  }, [isConfirmed]);
  // aria-disabled direto no DOM do export web: o botão continua focável e anunciado como indisponível.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = confirmButton.current as unknown as HTMLElement | null;
    if (!node?.setAttribute) return;
    if (isBlocked) node.setAttribute("aria-disabled", "true");
    else node.removeAttribute("aria-disabled");
  }, [isBlocked, isOpen, isConfirmed]);
  return (
    <View style={styles.last}>
      <Button
        label="Registrar a última aplicação"
        variant="secondary"
        expanded={isOpen}
        onPress={() => {
          openedByPerson.current = !isOpen;
          setOpen(!isOpen);
        }}
      />
      <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
        Opcional. Fica no diário, como os outros registros.
      </AppText>
      {isOpen ? (
        <View style={styles.panel}>
          <RadioPills
            label="Quando foi?"
            focusOnMount={openedByPerson.current}
            options={[
              { value: "hoje", label: "Hoje" },
              { value: "ontem", label: "Ontem" },
              { value: "outra", label: "Outra data" },
            ]}
            value={when}
            onChange={(next) => {
              setOtherDate(next === "outra");
              set(PEN_KEYS.date, next === "hoje" ? today : next === "ontem" ? yesterday : "");
            }}
          />
          {isOtherDate ? (
            <DateWheels
              label="Data da última aplicação"
              value={date}
              minYear={Number(today.slice(0, 4)) - 1}
              maxYear={Number(today.slice(0, 4))}
              initial={shiftDate(today, -2)}
              onChange={(next) => set(PEN_KEYS.date, next)}
            />
          ) : null}
          <RadioPills label="Local" options={SITE_OPTIONS} value={String(answers[PEN_KEYS.site] ?? "")} onChange={(next) => set(PEN_KEYS.site, next)} />
          <RadioPills label="Tipo de caneta" options={METHOD_OPTIONS} value={String(answers[PEN_KEYS.method] ?? "")} onChange={(next) => set(PEN_KEYS.method, next)} />
          <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
            Usa frasco e seringa? Registre pela calculadora em Seringa e dose.
          </AppText>
          <AppText testID="pen-last-preview" size={fontSize.sm} weight={600} lineHeight={19} color={isBlocked ? colors.muted : colors.text}>
            {isBlocked ? preview.text : `Vamos registrar: ${preview.text}`}
          </AppText>
          {isConfirmed ? (
            <View style={styles.confirmed}>
              <View style={styles.confirmedRow}>
                <CircleCheck size={18} color={colors.green700} />
                <AppText size={fontSize.sm} lineHeight={19} color={colors.green800} style={styles.grow}>
                  Será registrada no diário ao concluir a anamnese.
                </AppText>
              </View>
              <Pressable
                ref={undoButton}
                accessibilityRole="button"
                onPress={() => {
                  pendingFocus.current = "confirm";
                  set(PEN_KEYS.confirmed, false);
                }}
                style={styles.textButton}
              >
                <AppText size={fontSize.xs} weight={600} color={colors.green700}>
                  Não registrar
                </AppText>
              </Pressable>
            </View>
          ) : (
            <Pressable
              ref={confirmButton}
              accessibilityRole="button"
              accessibilityState={{ disabled: isBlocked }}
              onPress={() => {
                if (isBlocked) return;
                pendingFocus.current = "undo";
                set(PEN_KEYS.confirmed, true);
              }}
              style={({ pressed }) => [styles.confirm, isBlocked && styles.confirmBlocked, pressed && !isBlocked && styles.pressed]}
            >
              <AppText heading size={fontSize.sm} weight={700} color={isBlocked ? colors.muted : colors.green700}>
                Confirmar para registrar
              </AppText>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 16 },
  readOnly: { gap: 2, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surface2 },
  last: { gap: 6 },
  panel: { gap: 16, marginTop: 8, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface3 },
  confirmed: { gap: 2 },
  confirmedRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  textButton: { alignSelf: "flex-start", minHeight: MIN_TOUCH, justifyContent: "center", paddingHorizontal: 2 },
  confirm: { alignSelf: "flex-start", minHeight: MIN_TOUCH, justifyContent: "center", paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: colors.green600, backgroundColor: colors.surface },
  confirmBlocked: { borderColor: colors.border, backgroundColor: colors.surface2 },
  pressed: { transform: [{ scale: 0.97 }] },
}));
