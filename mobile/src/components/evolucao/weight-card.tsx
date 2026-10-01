import { Scale } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { BODY_PRIVACY_COPY } from "@shared/lib/body-privacy";
import { localDate, withMeasurements } from "@shared/lib/domain";
import {
  defaultRange,
  nextWeighIn,
  rangeStart,
  WEIGHT_RANGES,
  weightChartEnd,
  weightTrend,
  type WeightRange,
} from "@shared/lib/evolution";
import { plural } from "@shared/lib/format";
import { weighInRows } from "@shared/lib/measures";
import { nextDoseEstimate, tracksDoseSchedule, type DoseTimeline } from "@shared/lib/treatment";
import type { Measurement, ToastAction, ToastMessage } from "@shared/types";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Card, Disclosure, SegmentedControl, useSheetNotice } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { EvolIcon } from "./evol-icon";
import { WeighInList } from "./weigh-in-list";
import { WeighInsSheet } from "./weigh-ins-sheet";
import { WeightTrendChart } from "./weight-trend-chart";

const RANGE_SEGMENTS = WEIGHT_RANGES.map((r) => ({
  value: r.key,
  label: r.label,
  accessibilityLabel: r.days === null ? "Tudo" : `${r.label}: últimos ${r.days} dias`,
}));

type Props = {
  target: number | null;
  /** Degraus de dose sobre o gráfico; sempre null em perfil calmo. */
  dose: DoseTimeline | null;
  /** Perfil calmo (sensível ou menor de 18): pesagens sem variação nem medidas. */
  isSensitive: boolean;
  /** "Ocultar números do corpo" (ESPACO-13): sem período nem gráfico, só as pesagens sem valor. */
  hidden?: boolean;
};

/**
 * Peso (conceito 09): título com "8 pesagens" (abre a folha "Pesagens") e os períodos 1M a Tudo na mesma linha,
 * tendência, meta na legenda (fora de perfil sensível) e as aplicações no próprio gráfico. Com os números do corpo
 * ocultos: "Pesagens", todas, sem peso, gráfico ou variação.
 */
export function WeightCard({ target, dose, isSensitive, hidden = false }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, commit, notify } = useApp();
  const today = localDate();
  const sorted = [...state.measurements].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0]?.date ?? today;
  const [range, setRange] = useState<WeightRange>(() => defaultRange(first, today));
  const [isListOpen, setListOpen] = useState(false);
  const sheetNotice = useSheetNotice(notify);
  const start = hidden ? first : rangeStart(range, today, first);
  const rows = weighInRows(state.measurements, start, today, isSensitive || hidden);
  // Excluir é imediato e pode ser desfeito pelo aviso; o perfil segue a medição mais recente. Na folha "Pesagens"
  // o aviso (com o "Desfazer") aparece dentro dela: o da janela principal ficaria coberto.
  const remove = async (m: Measurement, inSheet: boolean) => {
    const say = (text: string, type: ToastMessage["type"], action?: ToastAction) =>
      inSheet ? sheetNotice.showLocal(text, type, action) : notify(text, type, action);
    const saved = await commit((s) => withMeasurements(s, s.measurements.filter((v) => v.id !== m.id), today));
    if (!saved) return;
    say("Medição excluída.", "success", {
      label: "Desfazer",
      onAction: async () => {
        // Uma medição por data: se outra foi registrada no mesmo dia, ela prevalece.
        let restored = false;
        await commit((s) => {
          if (s.measurements.some((v) => v.id === m.id || v.date === m.date)) return s;
          restored = true;
          return withMeasurements(s, [...s.measurements, m], today);
        });
        say(
          restored ? "Medição restaurada." : "Já existe uma medição nessa data; a anterior não foi restaurada.",
          restored ? "success" : "info",
        );
      },
    });
  };
  const removeById = (id: string, inSheet: boolean) => {
    const m = state.measurements.find((v) => v.id === id);
    if (m) void remove(m, inSheet);
  };
  const closeList = () => {
    setListOpen(false);
    sheetNotice.clear();
  };
  if (hidden)
    return (
      <Card style={styles.card} testID="weight-card">
        <View style={styles.head}>
          <EvolIcon icon={Scale} tone="body" size="md" />
          <AppText heading size={fontSize.lg} weight={800} accessibilityRole="header" style={styles.headCopy}>
            {BODY_PRIVACY_COPY.weighIns}
          </AppText>
        </View>
        {rows.length > 0 && (
          <Disclosure title={plural(rows.length, "pesagem", "pesagens")}>
            <WeighInList rows={rows} canDelete={state.measurements.length > 1} onDelete={(id) => removeById(id, false)} hidden />
          </Disclosure>
        )}
      </Card>
    );
  const p = state.profile;
  // Próxima aplicação estimada no gráfico: só quem acompanha a frequência (nunca calmo ou gestação).
  const estimate = dose && p && !isSensitive && tracksDoseSchedule(p) ? nextDoseEstimate(state.injections, today, p.weightLossPenPerMonth) : null;
  const nextDose = estimate && estimate.date >= today ? estimate.date : null;
  const count = plural(rows.length, "pesagem", "pesagens");
  return (
    <Card style={styles.card} testID="weight-card">
      <View style={styles.head}>
        <EvolIcon icon={Scale} tone="weight" size="md" />
        <View style={styles.headCopy}>
          <AppText heading size={fontSize.lg} weight={800} accessibilityRole="header">
            Peso
          </AppText>
          {rows.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${count} no período`}
              {...webAttrs({ "aria-haspopup": "dialog" })}
              onPress={() => setListOpen(true)}
              style={({ pressed }) => [styles.countButton, pressed && styles.pressed]}
            >
              <AppText size={fontSize.sm} color={colors.muted} style={styles.dotted}>
                {count}
              </AppText>
            </Pressable>
          ) : (
            <AppText size={fontSize.sm} color={colors.muted}>
              Sem pesagens no período
            </AppText>
          )}
        </View>
        <SegmentedControl label="Período do gráfico de peso" size="xs" segments={RANGE_SEGMENTS} value={range} onChange={setRange} />
      </View>
      <WeightTrendChart
        points={weightTrend(sorted)}
        start={start}
        end={weightChartEnd(today, nextDose)}
        today={today}
        target={target}
        dose={dose}
        withLane
        nextDose={nextDose}
        medication={dose?.spans.at(-1)?.medication ?? null}
      />
      <WeighInsSheet
        visible={isListOpen}
        rows={rows}
        next={nextWeighIn(state, today)}
        canDelete={state.measurements.length > 1}
        onDelete={(id) => removeById(id, true)}
        notice={sheetNotice.notice}
        onDismissNotice={sheetNotice.clear}
        onClose={closeList}
      />
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 12 },
  // Título, "8 pesagens" e os períodos numa linha; a 320 pt os períodos descem para a de baixo.
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 10 },
  headCopy: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  // "8 pesagens": alvo de 44 px sem crescer a linha (margens negativas).
  countButton: { alignSelf: "flex-start", minHeight: 44, marginVertical: -12, justifyContent: "center" },
  pressed: { opacity: 0.7 },
  dotted: { textDecorationLine: "underline", textDecorationStyle: "dotted", textDecorationColor: colors.border },
}));
