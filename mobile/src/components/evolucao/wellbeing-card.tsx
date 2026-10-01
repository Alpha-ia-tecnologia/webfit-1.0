import { Smile } from "lucide-react-native";
import { useState } from "react";
import { View, type DimensionValue } from "react-native";
import { wellbeingTrend, type CrossReading, type WellbeingDay } from "@shared/lib/wellbeing-trend";
import { MoodFace } from "@/components/hoje/mood-card";
import { QuickEntryForm } from "@/components/quick/quick-entry-form";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, Card, Sheet } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { EvolIcon } from "./evol-icon";
import { InsightChips } from "./insight-chips";

/** Um sétimo da largura: 7 colunas sem rolagem lateral mesmo a 320 px (como a consistência). */
const COLUMN = `${100 / 7}%` as const;
const FACE = 28;
const HEAT_FACE = 24;
const CAPSULE_WIDTH = 12;
const CAPSULE_HEIGHT = 44;
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;
const pct = (value: number): DimensionValue => `${value}%`;
const currentDay = (d: WellbeingDay) => webAttrs({ "aria-current": d.isToday ? "date" : undefined });

/** Semana em colunas: dia, rosto do humor (ou anel tracejado), cápsula do sono e as horas. */
export function WellbeingWeek({ days, label }: { days: readonly WellbeingDay[]; label: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View role="list" aria-label={label} style={styles.row}>
      {days.map((d) => (
        <View key={d.date} accessible role="listitem" aria-label={d.aria} {...currentDay(d)} testID="wellbeing-day" style={styles.cell}>
          <View style={[styles.column, d.isToday && styles.today]} {...HIDDEN}>
            <AppText size={fontSize["2xs"]} weight={d.isToday ? 800 : 600} color={d.isToday ? colors.text : colors.text2}>
              {d.weekday}
            </AppText>
            {d.mood ? <MoodFace rating={d.mood} size={FACE} /> : <View style={styles.faceEmpty} />}
            <View style={styles.capsule}>
              <View style={[styles.capsuleFill, { height: pct(d.sleepPct) }]} />
            </View>
            <AppText size={fontSize["2xs"]} color={colors.text2} style={styles.tabular}>
              {d.sleepText}
            </AppText>
          </View>
        </View>
      ))}
    </View>
  );
}

/** 28 dias: mapa 4 × 7 de rostos (forma e tom, não só cor), hoje contornado. */
export function WellbeingHeat({ rows, weekdays, label }: { rows: readonly WellbeingDay[][]; weekdays: readonly string[]; label: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.heat}>
      <View style={styles.row} {...HIDDEN}>
        {weekdays.map((weekday, i) => (
          <View key={`${weekday}-${i}`} style={styles.cell}>
            <AppText size={fontSize.xs} weight={700} color={colors.muted}>
              {weekday}
            </AppText>
          </View>
        ))}
      </View>
      <View role="list" aria-label={label} style={styles.heatGrid}>
        {rows.flat().map((d) => (
          <View key={d.date} accessible role="listitem" aria-label={d.aria} {...currentDay(d)} testID="wellbeing-day" style={styles.cell}>
            <View style={[styles.heatCell, d.isToday && styles.today]} {...HIDDEN}>
              {d.mood ? <MoodFace rating={d.mood} size={HEAT_FACE} /> : <View style={[styles.faceEmpty, styles.heatEmpty]} />}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Leitura cruzada descritiva de humor e sono, sempre com o aviso de que não é causa. */
export function CrossReadingView({ cross }: { cross: CrossReading }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View testID="wellbeing-cross" style={styles.cross}>
      {cross.kind === "insufficient" ? (
        <AppText size={fontSize.sm} color={colors.muted} lineHeight={20}>
          {cross.text}{" "}
          <AppText size={fontSize.sm} weight={700} color={colors.text2}>
            {cross.progress}
          </AppText>
        </AppText>
      ) : (
        <>
          <AppText heading size={fontSize.md} weight={700} lineHeight={21}>
            {cross.text}
          </AppText>
          {cross.detail && (
            <AppText size={fontSize.xs} color={colors.muted} lineHeight={18} style={styles.tabular}>
              {cross.detail}
            </AppText>
          )}
          {cross.note && (
            <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
              {cross.note}
            </AppText>
          )}
        </>
      )}
    </View>
  );
}

/**
 * Bem-estar e sono (EVOL-07) no período dos mini gráficos: humor em rostos, sono em cápsulas e uma
 * leitura cruzada que descreve os registros (sem causa, sem diagnóstico). Vale para todos os perfis:
 * não mostra peso, calorias nem proteína.
 */
export function WellbeingCard({ dates, today }: { dates: readonly string[]; today: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const [isMoodOpen, setMoodOpen] = useState(false);
  const trend = wellbeingTrend(state.diary, dates, today);
  const isWeek = dates.length <= 7;
  return (
    <Card testID="wellbeing-card" style={styles.card}>
      <View style={styles.head}>
        <EvolIcon icon={Smile} tone="mind" />
        <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header" style={styles.grow}>
          Bem-estar e sono
        </AppText>
      </View>
      {trend.isEmpty ? (
        <View style={styles.empty}>
          <AppText size={fontSize.sm} color={colors.muted} lineHeight={20}>
            Registre como você está para ver o humor e o sono aqui.
          </AppText>
          <Button label="Registrar bem-estar" variant="secondary" size="sm" onPress={() => setMoodOpen(true)} />
        </View>
      ) : (
        <>
          <InsightChips chips={trend.stats} label="Destaques de bem-estar" />
          {isWeek ? (
            <WellbeingWeek days={trend.days} label={trend.aria} />
          ) : (
            <WellbeingHeat rows={trend.rows} weekdays={trend.weekdays} label={trend.aria} />
          )}
          <AppText size={fontSize.xs} color={colors.muted} {...HIDDEN}>
            {isWeek ? "Rosto: humor do dia · Cápsula: horas de sono (até 12 h)" : "Rosto: humor do dia"}
          </AppText>
          <CrossReadingView cross={trend.cross} />
        </>
      )}
      <Sheet visible={isMoodOpen} title="Registrar bem-estar" onClose={() => setMoodOpen(false)}>
        {isMoodOpen && <QuickEntryForm type="bem_estar" onDone={() => setMoodOpen(false)} />}
      </Sheet>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  empty: { gap: 10 },
  row: { flexDirection: "row" },
  cell: { width: COLUMN, alignItems: "center" },
  column: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 1,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: "transparent",
  },
  today: { borderColor: colors.marker },
  faceEmpty: { width: FACE, height: FACE, borderRadius: FACE / 2, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border },
  capsule: {
    width: CAPSULE_WIDTH,
    height: CAPSULE_HEIGHT,
    borderRadius: CAPSULE_WIDTH / 2,
    overflow: "hidden",
    justifyContent: "flex-end",
    backgroundColor: colors.indigo50,
  },
  capsuleFill: { width: "100%", backgroundColor: colors.indigo500 },
  heat: { gap: 4 },
  heatGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 6 },
  heatCell: {
    width: HEAT_FACE + 8,
    height: HEAT_FACE + 8,
    borderRadius: (HEAT_FACE + 8) / 2,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  heatEmpty: { width: HEAT_FACE, height: HEAT_FACE, borderRadius: HEAT_FACE / 2 },
  cross: { gap: 4 },
  tabular: { fontVariant: ["tabular-nums"] },
}));
