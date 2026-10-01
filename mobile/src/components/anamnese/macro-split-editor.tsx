import { useState, type Ref } from "react";
import { View } from "react-native";
import {
  gramsOf,
  handlePercent,
  MACRO_MIN_PCT,
  moveSplit,
  splitAtPercent,
  splitOf,
  splitValueText,
  type MacroSplit,
} from "@shared/lib/goal-editor";
import { fmtNumber } from "@shared/lib/format";
import type { Goals } from "@shared/types";
import { AppText } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, shadows, themeMacroColor } from "@/theme/tokens";
import { HANDLE_BOX, TrackHandle } from "./track-handle";

const PARTS = [
  { key: "protein", label: "Proteína" },
  { key: "carbs", label: "Carboidratos" },
  { key: "fat", label: "Gorduras" },
] as const;
const HANDLES = [
  { handle: 0, label: "Divisão entre proteína e carboidratos" },
  { handle: 1, label: "Divisão entre carboidratos e gorduras" },
] as const;
/** Divisão usada só para desenhar a barra desativada (sem meta de energia). */
const PLACEHOLDER: MacroSplit = { protein: 20, carbs: 50, fat: 30 };
const BAR_HEIGHT = 16;
const KNOB = 22;
const KEY_DELTA: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -5, PageUp: 5 };

type Props = {
  goals: Goals;
  /** "Ocultar calorias": rótulos e valores falados em gramas, nunca em %. */
  hide: boolean;
  onChange: (grams: { protein: number; carbs: number; fat: number }) => void;
  firstHandleRef?: Ref<View>;
};

/**
 * Divisão dos macronutrientes (.macro-split): barra em três fatias com duas alças ajustáveis. Cada
 * fatia fica com 10 % ou mais, e cada mudança grava as gramas a partir da meta de energia atual.
 */
export function MacroSplitEditor({ goals, hide, onChange, firstHandleRef }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const macroColor = themeMacroColor(scheme);
  const [width, setWidth] = useState(0);
  const calories = goals.calories;
  const current = splitOf(goals);
  const isDisabled = calories === null || current === null;
  const split = current ?? PLACEHOLDER;
  const grams = calories === null ? { protein: 0, carbs: 0, fat: 0 } : gramsOf(calories, split);
  const apply = (next: MacroSplit) => {
    if (calories === null) return;
    if (next.protein === split.protein && next.carbs === split.carbs) return;
    onChange(gramsOf(calories, next));
  };
  return (
    <View testID="macro-split" role="group" aria-label="Divisão dos macronutrientes" style={styles.root}>
      <View style={styles.labels} aria-hidden>
        {PARTS.map((part) => (
          <View key={part.key} style={styles.label}>
            <View style={[styles.dot, { backgroundColor: macroColor[part.key] }]} />
            <AppText size={fontSize.xs} weight={600} color={colors.text2}>
              {isDisabled ? part.label : `${part.label} ${hide ? `${fmtNumber(grams[part.key])} g` : `${split[part.key]}%`}`}
            </AppText>
          </View>
        ))}
      </View>
      <View style={[styles.stage, isDisabled && styles.disabled]} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        <View style={styles.bar}>
          {PARTS.map((part) => (
            <View key={part.key} style={{ flexGrow: split[part.key], flexBasis: 0, backgroundColor: macroColor[part.key] }} />
          ))}
        </View>
        {HANDLES.map(({ handle, label }) => (
          <TrackHandle
            key={handle}
            ref={handle === 0 ? firstHandleRef : undefined}
            label={label}
            isDisabled={isDisabled}
            value={{ min: MACRO_MIN_PCT, max: 100 - MACRO_MIN_PCT, now: handlePercent(split, handle), text: splitValueText(split, grams, handle, hide) }}
            percent={handlePercent(split, handle)}
            top={0}
            trackWidth={width}
            onDragPercent={(percent) => apply(splitAtPercent(split, handle, percent))}
            onKey={(key) => {
              const delta = KEY_DELTA[key];
              if (delta === undefined) return false;
              apply(moveSplit(split, handle, delta));
              return true;
            }}
            onStep={(direction) => apply(moveSplit(split, handle, direction))}
          >
            <View style={styles.knob} />
          </TrackHandle>
        ))}
      </View>
      {isDisabled ? (
        <AppText size={fontSize.xs} lineHeight={18} color={colors.muted}>
          Informe uma meta de energia para dividir os macronutrientes.
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 8 },
  labels: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4 },
  label: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  // Recuo de meia alça: as caixas de toque das pontas não passam da largura do cartão.
  stage: { height: HANDLE_BOX, justifyContent: "center", marginHorizontal: HANDLE_BOX / 2 },
  disabled: { opacity: 0.45 },
  bar: { flexDirection: "row", height: BAR_HEIGHT, gap: 2, borderRadius: 999, overflow: "hidden" },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, borderWidth: 2, borderColor: colors.text2, backgroundColor: colors.white, boxShadow: shadows.knob },
}));
