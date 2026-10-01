import { Coffee, Moon, Soup, Sun, Utensils, type LucideIcon } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { STEPPER_FIELDS, TIME_PRESETS } from "@shared/data/anamneseOptions";
import type { Question } from "@shared/data/questionnaire";
import {
  DAY_POINTS,
  DAY_SPAN,
  dayOffset,
  dayPointAtPercent,
  dayTimelineModel,
  moveDayPoint,
  PAGE_STEP,
  sleepMismatch,
  TIME_STEP,
  toMinutes,
  type DayPoint,
  type DayPointKey,
} from "@shared/lib/day-timeline";
import type { Draft } from "@shared/types";
import { AppText, Button, Sheet } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { selectionHaptic } from "@/lib/haptics";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, shadows, themeDomainTone } from "@/theme/tokens";
import { CoherenceChip } from "./coherence-chip";
import { QHelp } from "./q-block";
import { Stepper } from "./stepper";
import { TimePicker } from "./time-picker";
import { HANDLE_BOX, TrackHandle } from "./track-handle";

const ICONS: Record<DayPoint["icon"], LucideIcon> = { sun: Sun, coffee: Coffee, utensils: Utensils, soup: Soup, moon: Moon };
/** Acordar e dormir ficam acima da linha; as refeições, abaixo (evita a maior parte das colisões). */
const IS_ABOVE: Record<DayPointKey, boolean> = { wakeTime: true, breakfastTime: false, lunchTime: false, dinnerTime: false, sleepTime: true };
const TRACK_TOP = 12;
const TRACK_HEIGHT = 56;
const DOT = 28;
const KEYS = ["wakeTime", "breakfastTime", "lunchTime", "dinnerTime", "sleepTime", "mealsPerDay", "sleepHours"] as const;
const KEY_DELTA: Record<string, number> = {
  ArrowLeft: -TIME_STEP,
  ArrowDown: -TIME_STEP,
  ArrowRight: TIME_STEP,
  ArrowUp: TIME_STEP,
  PageDown: -PAGE_STEP,
  PageUp: PAGE_STEP,
  // Home e End vão até o limite dos vizinhos (moveDayPoint prende à janela e a MIN_GAP).
  Home: -DAY_SPAN,
  End: DAY_SPAN,
};

type Props = {
  answers: Draft;
  errors: Record<string, string>;
  set: (key: string, value: string | boolean) => void;
  /** Campos da etapa: rótulo e dica de "Refeições por dia". */
  fields: Question[];
};

/**
 * Linha do dia (ANAM-09): acordar, café, almoço, jantar e dormir numa trilha de 05:00 a 01:00, com
 * pontos arrastáveis, legenda que abre a folha de horário, sono derivado e refeições por dia.
 */
export function DayTimeline({ answers, errors, set, fields }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const model = dayTimelineModel(answers);
  const [width, setWidth] = useState(0);
  const [editing, setEditing] = useState<DayPointKey | null>(null);
  const legend = useRef<Partial<Record<DayPointKey, View | null>>>({});
  const mismatch = sleepMismatch(answers);
  const meals = fields.find((f) => f.key === "mealsPerDay");
  const hasEmpty = model.points.some((p) => !p.time);
  const errorText = KEYS.map((key) => errors[key]).find(Boolean);
  const move = (key: DayPointKey, next: string) => {
    if (next === answers[key]) return;
    set(key, next);
    selectionHaptic();
  };
  const closeSheet = () => {
    const key = editing;
    setEditing(null);
    if (key) requestAnimationFrame(() => focusNode(legend.current[key] ?? null));
  };
  const editingPoint = DAY_POINTS.find((p) => p.key === editing);
  return (
    <View testID="day-timeline" role="group" aria-label="A linha do seu dia" style={styles.root}>
      {model.isLinear ? (
        <View>
          <View style={styles.stage} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
            <View style={styles.track}>
              {model.nightBands.map((band) => (
                <View key={band.from} style={[styles.night, { left: `${band.from}%` as const, width: `${band.to - band.from}%` as const }]} />
              ))}
              <View style={styles.line} />
            </View>
            {DAY_POINTS.map((point, i) => {
              const info = model.points[i]!;
              const minutes = toMinutes(answers[point.key]);
              const Icon = ICONS[point.icon];
              return (
                <TrackHandle
                  key={point.key}
                  label={point.label}
                  value={{ min: 0, max: DAY_SPAN, now: minutes === null ? 0 : dayOffset(minutes), text: info.time }}
                  percent={info.percent ?? 0}
                  top={IS_ABOVE[point.key] ? TRACK_TOP + DOT / 2 - HANDLE_BOX / 2 : TRACK_TOP + TRACK_HEIGHT - DOT / 2 - HANDLE_BOX / 2}
                  trackWidth={width}
                  onDragPercent={(percent) => move(point.key, dayPointAtPercent(answers, point.key, percent))}
                  onKey={(key) => {
                    const delta = KEY_DELTA[key];
                    if (delta === undefined) return false;
                    move(point.key, moveDayPoint(answers, point.key, delta));
                    return true;
                  }}
                  onStep={(direction) => move(point.key, moveDayPoint(answers, point.key, direction * TIME_STEP))}
                >
                  <View style={[styles.dot, IS_ABOVE[point.key] ? styles.dotBody : styles.dotMeal]}>
                    <Icon size={14} color={colors.white} />
                  </View>
                </TrackHandle>
              );
            })}
          </View>
          <View style={styles.ticks} aria-hidden>
            {model.ticks.map((tick) => (
              <AppText key={tick.label} size={fontSize.xs} lineHeight={16} color={colors.muted} align="center" style={[styles.tick, { left: `${tick.percent}%` as const }]}>
                {tick.label}
              </AppText>
            ))}
          </View>
        </View>
      ) : (
        <AppText size={fontSize.sm} lineHeight={19} color={colors.text2} style={styles.note}>
          {hasEmpty
            ? "Toque em cada horário abaixo para montar seu dia."
            : "Seus horários passam da madrugada: ajuste cada um pelos botões abaixo."}
        </AppText>
      )}
      <View style={styles.legend}>
        {model.points.map((point) => (
          <Pressable
            key={point.key}
            ref={(node) => {
              legend.current[point.key] = node;
            }}
            accessibilityRole="button"
            accessibilityLabel={point.time ? `${point.short} ${point.time}, alterar horário` : `${point.short}, escolher horário`}
            onPress={() => setEditing(point.key)}
            style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
          >
            <AppText heading size={fontSize.sm} weight={700} color={colors.text2}>
              {`${point.short} ${point.time || "—"}`}
            </AppText>
          </Pressable>
        ))}
      </View>
      {model.sleep ? (
        <AppText testID="sleep-summary" size={fontSize.sm} weight={600} color={colors.text}>
          {model.sleep.text}
        </AppText>
      ) : null}
      {mismatch ? (
        <CoherenceChip testID="sleep-coherence" text={mismatch.text} actionLabel={mismatch.actionLabel} onAction={() => set("sleepHours", String(mismatch.derived))} />
      ) : null}
      <QHelp error={errorText} />
      {meals ? (
        <Stepper label={meals.label} hint={meals.hint} error={errors.mealsPerDay} value={String(answers.mealsPerDay ?? "")} config={STEPPER_FIELDS.mealsPerDay!} onChange={(next) => set("mealsPerDay", next)} />
      ) : null}
      <AppText size={fontSize.xs} lineHeight={18} color={colors.muted}>
        Arraste os pontos ou toque num horário para ajustar.
      </AppText>
      <Sheet visible={editingPoint !== undefined} title={editingPoint?.label ?? ""} onClose={closeSheet} footer={<Button label="Concluir" wide onPress={closeSheet} />}>
        {editingPoint ? (
          <TimePicker label="Horário" value={String(answers[editingPoint.key] ?? "").slice(0, 5)} presets={TIME_PRESETS[editingPoint.key] ?? []} onChange={(next) => set(editingPoint.key, next)} />
        ) : null}
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  root: { gap: 14 },
  // Recuo de meia alça dos dois lados: a caixa de toque do ponto nas pontas não passa da largura.
  stage: { height: TRACK_TOP * 2 + TRACK_HEIGHT, marginHorizontal: HANDLE_BOX / 2 },
  track: { position: "absolute", top: TRACK_TOP, left: 0, right: 0, height: TRACK_HEIGHT, borderRadius: 14, backgroundColor: colors.surface2, overflow: "hidden" },
  night: { position: "absolute", top: 0, bottom: 0, backgroundColor: themeDomainTone(scheme).body.bg },
  line: { position: "absolute", left: 0, right: 0, top: TRACK_HEIGHT / 2, height: 1, backgroundColor: colors.border },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.white, boxShadow: shadows.knob },
  dotBody: { backgroundColor: themeDomainTone(scheme).body.fg },
  dotMeal: { backgroundColor: colors.green600 },
  ticks: { height: 16, marginHorizontal: HANDLE_BOX / 2 },
  tick: { position: "absolute", width: 24, marginLeft: -12 },
  note: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surface2 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pressed: { transform: [{ scale: 0.97 }] },
}));
