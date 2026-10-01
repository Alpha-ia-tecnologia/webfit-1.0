import { useState } from "react";
import { Pressable, View } from "react-native";
import { CYCLE_GRID_DAYS, cycleGrid, type CycleGridCell } from "@shared/lib/symptoms";
import type { DiaryEntry, InjectionEntry } from "@shared/types";
import { AppText, Card } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

const ALL = "all";
const ALL_LABEL = "Todas as doses";
const EMPTY_TEXT = "Registre efeitos no bem-estar para vê-los por dia desde a aplicação.";
const HINT_TAIL = "D0 é o dia da aplicação registrada. Só descreve seus registros.";
const DAYS = Array.from({ length: CYCLE_GRID_DAYS }, (_, day) => day);
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;
const DOSE_STEPS_SHOWN = 2;

/** Rádios "Dose" (Todas as doses + os 2 degraus mais recentes): um filtro, nunca uma comparação. */
function DoseFilter({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (key: string) => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Dose" style={styles.filter}>
      {options.map((option) => {
        const isOn = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: isOn }}
            aria-checked={isOn}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [styles.option, isOn && styles.optionOn, pressed && styles.pressed]}
          >
            <AppText size={fontSize.sm} weight={isOn ? 700 : 600} color={isOn ? colors.text : colors.muted}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Quadrado de um dia: ardósia pela quantidade de dias (0 = só contorno) e ponto de 6 px quando houve registro forte. */
function Cell({ cell }: { cell: CycleGridCell }) {
  const styles = useStyles();
  const level = [styles.level0, styles.level1, styles.level2, styles.level3][cell.level];
  return (
    <View style={styles.cellBox} accessibilityRole="image" accessibilityLabel={cell.aria} testID="cycle-grid-cell">
      <View style={[styles.square, level]}>
        {cell.maxIntensity === 3 ? <View style={[styles.strong, cell.level >= 2 ? styles.strongOnDark : styles.strongOnLight]} /> : null}
      </View>
    </View>
  );
}

function Legend() {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.legend} {...HIDDEN}>
      <AppText size={fontSize.xs} color={colors.muted}>
        Menos
      </AppText>
      <View style={[styles.swatch, styles.level1]} />
      <View style={[styles.swatch, styles.level2]} />
      <View style={[styles.swatch, styles.level3]} />
      <AppText size={fontSize.xs} color={colors.muted}>
        Mais ·
      </AppText>
      <View style={[styles.strong, styles.strongOnLight]} />
      <AppText size={fontSize.xs} color={colors.muted}>
        registro forte
      </AppText>
    </View>
  );
}

type Props = { diary: readonly DiaryEntry[]; injections: readonly InjectionEntry[]; today: string };

/**
 * "Seu ciclo" na Evolução (SERINGA-07): efeitos registrados por dia desde a aplicação (D0 a D6), nas
 * últimas 8 semanas. Só descreve os registros: sem interpretação, sem comparar doses, sem cores de alerta.
 */
export function CycleGridCard({ diary, injections, today }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [step, setStep] = useState(ALL);
  const model = cycleGrid(diary, injections, today, step === ALL ? null : step);
  const filter =
    model.steps.length >= 2
      ? [{ key: ALL, label: ALL_LABEL }, ...model.steps.slice(0, DOSE_STEPS_SHOWN)]
      : null;
  return (
    <Card testID="cycle-grid-card">
      <View style={styles.head}>
        <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header">
          Seu ciclo
        </AppText>
        <AppText size={fontSize.sm} color={colors.muted}>
          Efeitos registrados por dia desde a aplicação.
        </AppText>
      </View>
      {filter && <DoseFilter options={filter} value={model.steps.some((s) => s.key === step) ? step : ALL} onChange={setStep} />}
      {model.isEmpty ? (
        <AppText size={fontSize.sm} color={colors.muted} testID="cycle-grid-empty">
          {EMPTY_TEXT}
        </AppText>
      ) : (
        <>
          <View style={styles.grid} testID="cycle-grid">
            <View style={styles.gridRow} {...HIDDEN}>
              <View style={styles.label} />
              {DAYS.map((day) => (
                <View key={day} style={styles.cellBox}>
                  <AppText size={fontSize.xs} weight={700} color={colors.muted} align="center">
                    D{day}
                  </AppText>
                </View>
              ))}
            </View>
            {model.rows.map((row) => (
              <View key={row.key} style={styles.gridRow} testID="cycle-grid-row">
                <AppText size={fontSize.xs} weight={600} color={colors.text2} style={styles.label}>
                  {row.label}
                </AppText>
                {row.cells.map((cell) => (
                  <Cell key={cell.day} cell={cell} />
                ))}
              </View>
            ))}
          </View>
          <Legend />
        </>
      )}
      {model.records > 0 ? (
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
          {`${model.caption} ${HINT_TAIL}`}
        </AppText>
      ) : null}
    </Card>
  );
}

const CELL_MIN = 22;
const CELL_MAX = 28;
const LABEL_MIN = 64;
const useStyles = makeStyles((colors) => ({
  head: { gap: 2 },
  filter: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionOn: { borderColor: colors.text2, backgroundColor: colors.surface2 },
  pressed: { opacity: 0.75 },
  grid: { gap: 4 },
  gridRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  label: { flexGrow: 1, flexShrink: 1, flexBasis: LABEL_MIN, minWidth: LABEL_MIN },
  cellBox: { flexGrow: 1, flexShrink: 1, flexBasis: CELL_MIN, minWidth: CELL_MIN, maxWidth: CELL_MAX, alignItems: "center" },
  square: { width: "100%", aspectRatio: 1, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  level0: { backgroundColor: "transparent", borderColor: colors.border },
  level1: { backgroundColor: colors.slate200, borderColor: colors.slate200 },
  level2: { backgroundColor: colors.slate400, borderColor: colors.slate400 },
  level3: { backgroundColor: colors.text2, borderColor: colors.text2 },
  strong: { width: 6, height: 6, borderRadius: 3 },
  strongOnDark: { backgroundColor: colors.surface },
  strongOnLight: { backgroundColor: colors.text2 },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 },
}));
