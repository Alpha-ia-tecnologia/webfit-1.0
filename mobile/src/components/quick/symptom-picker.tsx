import { useRef } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import {
  INTENSITY_LABELS,
  STRONG_NOTICE,
  SYMPTOM_LABELS,
  hasStrong,
  setIntensity,
  toggleSymptom,
} from "@shared/lib/symptoms";
import { SYMPTOM_KEYS, SYMPTOMS_MAX, type Symptom, type SymptomKey } from "@shared/types";
import { useWebAriaDisabled } from "@/components/injecao/use-web-aria-disabled";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText } from "@/components/ui";
import { useIosAnnouncement } from "@/lib/announce";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { ChipGroup } from "./entry-chip";

const GROUP = "Efeitos percebidos (opcional)";
const LIMIT_HINT = `Até ${SYMPTOMS_MAX} efeitos por registro.`;
/** Abaixo desta largura o nome do efeito fica numa linha própria, acima das bolinhas. */
const STACK_BELOW = 360;
const LEVELS = [1, 2, 3] as const;

type Props = { value: Symptom[]; onChange: (next: Symptom[]) => void };

/** Chip de alternância com 44 px reais; com 6 efeitos ligados, os outros ficam aria-disabled (o toque não faz nada). */
function SymptomChip({ symptomKey, isOn, isBlocked, onPress }: { symptomKey: SymptomKey; isOn: boolean; isBlocked: boolean; onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const ref = useRef<View>(null);
  useWebAriaDisabled(ref, isBlocked);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={SYMPTOM_LABELS[symptomKey]}
      accessibilityState={{ selected: isOn, disabled: isBlocked }}
      {...webAttrs({ "aria-pressed": isOn })}
      onPress={isBlocked ? undefined : onPress}
      style={({ pressed }) => [styles.chip, isOn && styles.chipOn, isBlocked && styles.chipBlocked, pressed && !isOn && styles.chipPressed]}
    >
      <AppText size={fontSize.sm} weight={700} color={isOn ? colors.surface : colors.text2}>
        {SYMPTOM_LABELS[symptomKey]}
      </AppText>
    </Pressable>
  );
}

/** Nome, três bolinhas de 12 px em rádios de 44 × 44 (Leve, Moderada, Forte) e a palavra escolhida; nunca vermelho. */
function IntensityRow({ symptom, isStacked, onPick }: { symptom: Symptom; isStacked: boolean; onPick: (level: 1 | 2 | 3) => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const label = SYMPTOM_LABELS[symptom.key];
  return (
    <View style={styles.row}>
      <AppText size={fontSize.sm} weight={600} style={isStacked ? styles.nameStacked : styles.name}>
        {label}
      </AppText>
      <View style={styles.levels} accessibilityRole="radiogroup" accessibilityLabel={`Intensidade de ${label}`}>
        {LEVELS.map((level) => {
          const isChecked = symptom.intensity === level;
          return (
            <Pressable
              key={level}
              accessibilityRole="radio"
              accessibilityLabel={INTENSITY_LABELS[level - 1]}
              accessibilityState={{ checked: isChecked }}
              aria-checked={isChecked}
              onPress={() => onPick(level)}
              style={({ pressed }) => [styles.radio, pressed && styles.radioPressed]}
            >
              <View style={[styles.dot, level <= symptom.intensity && styles.dotOn]} />
            </Pressable>
          );
        })}
      </View>
      <AppText size={fontSize.xs} weight={600} color={colors.muted} aria-hidden importantForAccessibility="no">
        {INTENSITY_LABELS[symptom.intensity - 1]}
      </AppText>
    </View>
  );
}

/**
 * Efeitos percebidos no bem-estar (SERINGA-07): até 6 efeitos em chips, a intensidade de cada um em
 * rádios e, com algum efeito forte, uma nota neutra (sem dose, sem medicamento) numa região viva.
 */
export function SymptomPicker({ value, onChange }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const isFull = value.length >= SYMPTOMS_MAX;
  const isStrong = hasStrong(value);
  // A nota do efeito forte: região viva no Android e no web; no iOS, o leitor de tela fala.
  useIosAnnouncement(isStrong ? `${STRONG_NOTICE.title} ${STRONG_NOTICE.text}` : "");
  return (
    <View style={styles.wrap}>
      <ChipGroup label={GROUP} hasLegend>
        {SYMPTOM_KEYS.map((key) => {
          const isOn = value.some((s) => s.key === key);
          return (
            <SymptomChip
              key={key}
              symptomKey={key}
              isOn={isOn}
              isBlocked={isFull && !isOn}
              onPress={() => onChange(toggleSymptom(value, key))}
            />
          );
        })}
      </ChipGroup>
      {isFull ? (
        <AppText size={fontSize.xs} color={colors.muted}>
          {LIMIT_HINT}
        </AppText>
      ) : null}
      {value.map((symptom) => (
        <IntensityRow
          key={symptom.key}
          symptom={symptom}
          isStacked={width < STACK_BELOW}
          onPick={(level) => onChange(setIntensity(value, symptom.key, level))}
        />
      ))}
      <View accessibilityLiveRegion="polite" aria-live="polite">
        {isStrong ? (
          <View role="note" style={styles.note} testID="symptom-strong-note">
            <AppText size={fontSize.sm} weight={700} color={colors.text}>
              {STRONG_NOTICE.title}
            </AppText>
            <AppText size={fontSize.sm} color={colors.text2} lineHeight={20}>
              {STRONG_NOTICE.text}
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const DOT = 12;
const TARGET = 44;
const useStyles = makeStyles((colors) => ({
  wrap: { gap: 10 },
  chip: {
    minHeight: TARGET,
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.green700, backgroundColor: colors.green700 },
  chipBlocked: { opacity: 0.45 },
  chipPressed: { borderColor: colors.mint200, backgroundColor: colors.mint50 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8 },
  name: { flex: 1, minWidth: 96 },
  nameStacked: { width: "100%" },
  levels: { flexDirection: "row" },
  radio: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center", borderRadius: TARGET / 2 },
  radioPressed: { backgroundColor: colors.surface2 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, borderColor: colors.slate300, backgroundColor: "transparent" },
  dotOn: { borderColor: colors.text2, backgroundColor: colors.text2 },
  note: {
    gap: 4,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface3,
  },
}));
