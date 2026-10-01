import { ChevronDown, Minus, Plus, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import {
  CONCENTRATION_MAX,
  CONCENTRATION_MIN,
  CONCENTRATION_QUICK,
  CONCENTRATION_STEP,
  MEDICATIONS,
  fmtConcentration,
  fmtMg,
  fmtNumber2,
  parseDoseMg,
  type DoseRuler as Ruler,
  type MedicationKey,
} from "@shared/lib/injection";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Card } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontFamily, fontSize, radius, shadows, themeDomainTone } from "@/theme/tokens";
import { DoseRuler } from "./dose-ruler";

/** Tom da medicação no tema atual. */
const useMedicationTone = () => themeDomainTone(useTheme().scheme).medication;
const STEP_LABEL = CONCENTRATION_STEP.toLocaleString("pt-BR");
const fmtConcentrationValue = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const PEN_VIEW = { width: 320, height: 104 } as const;

type Props = {
  isPen: boolean;
  medKey: MedicationKey;
  medLabel: (key: MedicationKey) => string;
  onMedication: (key: MedicationKey) => void;
  concentration: number;
  onConcentration: (value: number) => void;
  isFrascoOpen: boolean;
  onFrascoToggle: () => void;
  frascoToggleRef: Ref<View>;
  doseValue: number | null;
  /** Atalho ligado: no frasco, a UI atual é a marca mais próxima dele (presetMatches); na caneta, a dose. */
  isPresetOn: (mg: number) => boolean;
  /** "50 UI é a marca mais próxima de 2,52 mg na seringa (2,50 mg)." (nearestMarkText) ou null. */
  nearestMark: string | null;
  onDose: (mg: number) => void;
  onInvalidDose: () => void;
  /** ±0,05 mg (só no frasco; null esconde os botões). */
  onStep: ((direction: 1 | -1) => void) | null;
  canStep: boolean;
  /** "Diminuir 0,05 mg": falso na menor marca da seringa (1 UI); sem ela, vale canStep. */
  canDecrease?: boolean;
  overflowText: string | null;
  ruler: Ruler | null;
  aboveText: string;
  /** Nota neutra da concentração personalizada (sem régua da bula). */
  customNote: string | null;
  doseButtonRef: Ref<View>;
  /** "Ler rótulo por foto" (INJECAO-X2) no editor do frasco, logo após "Confira no rótulo (mg/ml)". */
  labelAction?: ReactNode;
};

/** Chip com estado ligado anunciado (aria-pressed) e 44 px reais de toque. */
export function PressChip({ label, accessibilityLabel, isOn, onPress }: { label: string; accessibilityLabel?: string; isOn: boolean; onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: isOn }}
      {...webAttrs({ "aria-pressed": isOn })}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, isOn && styles.chipOn, pressed && styles.pressed]}
    >
      <AppText heading size={fontSize.sm} weight={700} color={isOn ? colors.onEmeraldInk : colors.text2}>
        {label}
      </AppText>
    </Pressable>
  );
}

function RoundButton({ icon: Icon, label, disabled, onPress }: { icon: LucideIcon; label: string; disabled: boolean; onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.round, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Icon size={18} color={colors.text2} />
    </Pressable>
  );
}

/**
 * Valor da dose em mg: um botão grande que vira campo de digitação. Enter ou sair do campo aplica,
 * Esc cancela; o foco volta ao botão. Enter nunca abre a confirmação nem registra.
 */
function DoseValue({
  value,
  onApply,
  onInvalid,
  buttonRef,
  onPen,
}: {
  value: number | null;
  onApply: (mg: number) => void;
  onInvalid: () => void;
  buttonRef: Ref<View>;
  onPen: boolean;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const tone = useMedicationTone();
  const [isTyping, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [shouldRefocus, setRefocus] = useState(false);
  const isDone = useRef(false);
  const input = useRef<TextInput>(null);
  const button = useRef<View | null>(null);
  useEffect(() => {
    if (isTyping) input.current?.focus();
  }, [isTyping]);
  useEffect(() => {
    if (!shouldRefocus) return;
    setRefocus(false);
    focusNode(button.current);
  }, [shouldRefocus]);
  const finish = (apply: boolean) => {
    if (isDone.current) return;
    isDone.current = true;
    setTyping(false);
    setRefocus(true);
    const typed = text.trim();
    if (!apply || !typed) return;
    const mg = parseDoseMg(typed);
    if (mg === null) onInvalid();
    else onApply(mg);
  };
  if (isTyping)
    return (
      <TextInput
        ref={input}
        value={text}
        onChangeText={setText}
        inputMode="decimal"
        keyboardType="decimal-pad"
        accessibilityLabel="Dose prescrita em mg"
        placeholder="Ex.: 2,5"
        placeholderTextColor={colors.muted}
        returnKeyType="done"
        onSubmitEditing={() => finish(true)}
        onBlur={() => finish(true)}
        onKeyPress={(event) => {
          if (event.nativeEvent.key === "Escape") finish(false);
        }}
        style={[styles.input, onPen && styles.inputOnPen]}
      />
    );
  return (
    <Pressable
      ref={(node: View | null) => {
        button.current = node;
        if (typeof buttonRef === "function") buttonRef(node);
        else if (buttonRef) (buttonRef as { current: View | null }).current = node;
      }}
      accessibilityRole="button"
      accessibilityLabel={value === null ? "Digitar a dose prescrita" : `Dose prescrita: ${fmtMg(value)}. Digitar outra dose`}
      onPress={() => {
        isDone.current = false;
        setText("");
        setTyping(true);
      }}
      style={({ pressed }) => [styles.value, pressed && styles.valuePressed]}
    >
      <AppText heading size={fontSize["6xl"]} weight={900} tracking={-0.03} lineHeight={50} testID="injection-dose" style={styles.tabular}>
        {value === null ? "—" : fmtNumber2(value)}
      </AppText>
      <AppText heading size={fontSize.lg} weight={800} color={tone.fg}>
        mg
      </AppText>
    </Pressable>
  );
}

/** Caneta desenhada com a janela da dose; o valor (texto de verdade) fica sobre a janela. */
function PenWindow({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const tone = useMedicationTone();
  return (
    <View style={styles.pen}>
      <Svg
        viewBox={`0 0 ${PEN_VIEW.width} ${PEN_VIEW.height}`}
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        {...{ accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants", "aria-hidden": true }}
      >
        <Rect x={0} y={40} width={18} height={24} rx={4} fill={colors.slate400} />
        <Rect x={12} y={26} width={284} height={52} rx={26} fill={tone.bg} stroke={tone.fg} strokeWidth={2} />
        <Rect x={290} y={32} width={28} height={40} rx={8} fill={colors.slate300} />
        <Line x1={298} x2={298} y1={38} y2={66} stroke={colors.slate400} strokeWidth={2} />
        <Line x1={306} x2={306} y1={38} y2={66} stroke={colors.slate400} strokeWidth={2} />
        <Rect x={76} y={10} width={168} height={84} rx={16} fill={colors.surface} stroke={tone.fg} strokeWidth={2} />
      </Svg>
      <View style={styles.penValue}>{children}</View>
    </View>
  );
}

/**
 * Medicação, frasco (concentração) e a dose prescrita num único valor (SERINGA-06): atalhos da receita,
 * digitação livre e ±0,05 mg no frasco. Nada é sugerido nem grampeado; a régua da bula só informa.
 */
export function DoseCard(props: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const tone = useMedicationTone();
  const { isPen, medKey, concentration, doseValue } = props;
  const value = (
    <DoseValue value={doseValue} onApply={props.onDose} onInvalid={props.onInvalidDose} buttonRef={props.doseButtonRef} onPen={isPen} />
  );
  const presets = MEDICATIONS.find((m) => m.key === medKey)?.presetsMg ?? [];
  return (
    <Card>
      <View accessibilityRole="radiogroup" accessibilityLabel="Medicação" style={styles.wrapRow}>
        {MEDICATIONS.map((m) => {
          const isOn = m.key === medKey;
          const label = props.medLabel(m.key);
          return (
            <Pressable
              key={m.key}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked: isOn }}
              aria-checked={isOn}
              onPress={() => props.onMedication(m.key)}
              style={({ pressed }) => [styles.medOption, isOn && styles.medOn, pressed && styles.pressed]}
            >
              <AppText heading size={fontSize.sm} weight={800} color={isOn ? tone.fg : colors.text2} numberOfLines={1}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {!isPen && (
        <View style={styles.frasco}>
          <View style={styles.frascoRow}>
            <AppText size={fontSize.base} color={colors.text2} style={styles.grow}>
              Frasco:{" "}
              <AppText heading size={fontSize.lg} weight={800} color={colors.text} testID={props.isFrascoOpen ? undefined : "injection-concentration"}>
                {fmtConcentrationValue(concentration)}
              </AppText>{" "}
              mg/ml
            </AppText>
            <Pressable
              ref={props.frascoToggleRef}
              accessibilityRole="button"
              accessibilityLabel="Alterar a concentração do frasco"
              accessibilityState={{ expanded: props.isFrascoOpen }}
              aria-expanded={props.isFrascoOpen}
              onPress={props.onFrascoToggle}
              style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
            >
              <AppText size={fontSize.sm} weight={700} color={colors.green700}>
                Alterar
              </AppText>
              <View style={props.isFrascoOpen && styles.chevronOpen}>
                <ChevronDown size={16} color={colors.green700} />
              </View>
            </Pressable>
          </View>
          {props.isFrascoOpen && (
            <View style={styles.frascoEditor}>
              <AppText size={fontSize.xs} color={colors.muted}>
                Confira no rótulo (mg/ml)
              </AppText>
              {props.labelAction}
              <View style={styles.stepper}>
                <RoundButton
                  icon={Minus}
                  label={`Diminuir ${STEP_LABEL} mg/ml`}
                  disabled={concentration <= CONCENTRATION_MIN}
                  onPress={() => props.onConcentration(concentration - CONCENTRATION_STEP)}
                />
                <View style={styles.stepValue}>
                  <AppText heading size={fontSize["4xl"]} weight={900} tracking={-0.03} lineHeight={36} testID="injection-concentration" style={styles.tabular}>
                    {fmtConcentrationValue(concentration)}
                  </AppText>
                  <AppText size={fontSize.xs} weight={600} color={colors.muted}>
                    mg/ml
                  </AppText>
                </View>
                <RoundButton
                  icon={Plus}
                  label={`Aumentar ${STEP_LABEL} mg/ml`}
                  disabled={concentration >= CONCENTRATION_MAX}
                  onPress={() => props.onConcentration(concentration + CONCENTRATION_STEP)}
                />
              </View>
              <View style={[styles.wrapRow, styles.center]}>
                {CONCENTRATION_QUICK.map((c) => (
                  <PressChip key={c} label={fmtConcentration(c)} isOn={Math.abs(c - concentration) < 0.001} onPress={() => props.onConcentration(c)} />
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      <View style={styles.dose}>
        <AppText heading size={fontSize.md} weight={800} accessibilityRole="header">
          Dose prescrita
        </AppText>
        <AppText size={fontSize.xs} color={colors.muted}>
          Da sua prescrição: o app não sugere nem ajusta doses.
        </AppText>
        {isPen ? (
          <PenWindow>{value}</PenWindow>
        ) : (
          <View style={styles.valueRow}>
            {props.onStep && (
              <RoundButton icon={Minus} label="Diminuir 0,05 mg" disabled={!(props.canDecrease ?? props.canStep)} onPress={() => props.onStep?.(-1)} />
            )}
            {value}
            {props.onStep && (
              <RoundButton icon={Plus} label="Aumentar 0,05 mg" disabled={!props.canStep} onPress={() => props.onStep?.(1)} />
            )}
          </View>
        )}
        {props.nearestMark && (
          <AppText size={fontSize.xs} color={colors.muted} align="center" testID="injection-nearest-mark">
            {props.nearestMark}
          </AppText>
        )}
        <View style={[styles.wrapRow, styles.center]}>
          {presets.map((mg) => (
            <PressChip
              key={mg}
              label={fmtMg(mg)}
              accessibilityLabel={`Dose de ${fmtMg(mg)}`}
              isOn={props.isPresetOn(mg)}
              onPress={() => props.onDose(mg)}
            />
          ))}
        </View>
        {doseValue === null && (
          <AppText size={fontSize.sm} color={colors.muted} align="center">
            Escolha a dose da receita ou digite o valor em mg.
          </AppText>
        )}
        {props.overflowText && (
          <View role="status" style={[styles.note, styles.neutral]}>
            <AppText size={fontSize.sm} color={colors.text2} lineHeight={19}>
              {props.overflowText}
            </AppText>
          </View>
        )}
        {props.ruler && <DoseRuler ruler={props.ruler} aboveText={props.aboveText} />}
        {props.customNote && (
          <View style={[styles.note, styles.neutral]}>
            <AppText size={fontSize.sm} color={colors.text2} lineHeight={19}>
              {props.customNote}
            </AppText>
          </View>
        )}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  grow: { flex: 1, minWidth: 0 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  center: { justifyContent: "center" },
  tabular: { fontVariant: ["tabular-nums"] },
  pressed: { transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.4 },
  medOption: {
    minHeight: 44,
    maxWidth: "100%",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface3,
  },
  medOn: { borderColor: themeDomainTone(scheme).medication.fg, backgroundColor: themeDomainTone(scheme).medication.bg },
  frasco: { gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  frascoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  togglePressed: { backgroundColor: colors.mint50 },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  frascoEditor: { gap: 10 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 },
  stepValue: { alignItems: "center", minWidth: 96 },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.green500, borderColor: colors.green500, boxShadow: shadows.chipOn },
  dose: { gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  valueRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  value: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 4,
    minHeight: 64,
    flexShrink: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  valuePressed: { backgroundColor: colors.surface2 },
  input: {
    minHeight: 64,
    minWidth: 140,
    maxWidth: 200,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: colors.green500,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fontFamily(800, true),
    fontSize: fontSize["4xl"],
    textAlign: "center",
    boxShadow: shadows.focus,
  },
  inputOnPen: { alignSelf: "center" },
  pen: { width: "100%", height: PEN_VIEW.height, justifyContent: "center", alignItems: "center" },
  penValue: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  note: { padding: 12, borderRadius: radius.md, borderWidth: 1 },
  neutral: { backgroundColor: colors.surface3, borderColor: colors.border },
}));
