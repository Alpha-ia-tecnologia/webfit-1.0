import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Platform, View } from "react-native";
import { RULER_FIELDS } from "@shared/data/anamneseOptions";
import { isSensitiveDraft } from "@shared/lib/anamnese-flow";
import { draftGoalProfile, draftGoals, goalsCoherence, recommendedModel } from "@shared/lib/goal-editor";
import type { Draft } from "@shared/types";
import { AppText, Button, StatusPill } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, themeMacroColor } from "@/theme/tokens";
import { CoherenceChip } from "./coherence-chip";
import { MacroSplitEditor } from "./macro-split-editor";
import { QHelp } from "./q-block";
import { Ruler } from "./ruler";

const MANUAL_KEYS = ["manualCalories", "manualProtein", "manualCarbs", "manualFat"] as const;
const KCAL_STEP = 25;
const KCAL_LABEL = "Meta calórica informada (kcal/dia)";

type Props = {
  answers: Draft;
  errors: Record<string, string>;
  setMany: (values: Record<string, string>) => void;
  today: string;
};

/** Leva o foco à régua de calorias do painel (no web, o primeiro role="slider" dentro dele). */
function focusSlider(panel: View | null) {
  if (!panel) return;
  if (Platform.OS === "web") {
    const node = panel as unknown as HTMLElement;
    (node.querySelector?.('[role="slider"]') as HTMLElement | null)?.focus();
  } else AccessibilityInfo.sendAccessibilityEvent(panel, "focus");
}

/**
 * "Recomendado para você" (ANAM-05): as metas que a anamnese estima (ou as informadas), com
 * "Personalizar" para a meta de energia, a divisão dos macronutrientes e o aviso de coerência.
 * Com "Ocultar calorias" não aparece número de calorias; perfis sensíveis veem só o motivo.
 */
export function GoalsWidget({ answers, errors, setMany, today }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const macroColor = themeMacroColor(scheme);
  const goals = draftGoals(answers, today);
  const profile = draftGoalProfile(answers);
  const hide = answers.hideCalories === true;
  const errorText = MANUAL_KEYS.map((key) => errors[key]).find(Boolean);
  const [isOpen, setOpen] = useState(Boolean(errorText));
  const panel = useRef<View>(null);
  const firstHandle = useRef<View>(null);
  const focusOnOpen = useRef(false);
  const isShown = isOpen || Boolean(errorText);
  const initialKcal = goals?.calories ? Math.round(goals.calories / KCAL_STEP) * KCAL_STEP : RULER_FIELDS.manualCalories!.initial;
  const kcalConfig = useMemo(() => ({ ...RULER_FIELDS.manualCalories!, initial: initialKcal }), [initialKcal]);
  useEffect(() => {
    if (!focusOnOpen.current || !isShown) return;
    focusOnOpen.current = false;
    if (hide) focusNode(firstHandle.current);
    else focusSlider(panel.current);
  }, [isShown, hide]);
  if (!goals || !profile)
    return (
      <View testID="goals-recommended" style={styles.card}>
        <AppText size={fontSize.sm} lineHeight={19} color={colors.text2}>
          Complete as etapas anteriores para ver a recomendação.
        </AppText>
      </View>
    );
  const model = recommendedModel(profile, goals, hide, isSensitiveDraft(answers));
  const coherence = goalsCoherence(profile, goals, hide);
  const hasManual = MANUAL_KEYS.some((key) => String(answers[key] ?? "") !== "");
  return (
    <View testID="goals-recommended" style={styles.root}>
      <View style={styles.card}>
        <StatusPill label={model.origin} tone="neutral" />
        {model.calories ? (
          <View style={styles.kcal}>
            <AppText heading size={fontSize["4xl"]} weight={800} tracking={-0.03} lineHeight={36} color={colors.text}>
              {model.calories}
            </AppText>
            <AppText size={fontSize.sm} weight={600} color={colors.muted}>
              kcal por dia
            </AppText>
          </View>
        ) : null}
        {model.macros ? (
          <View style={styles.macros}>
            {model.macros.map((macro) => (
              <View key={macro.key} style={styles.macro}>
                <View style={[styles.dot, { backgroundColor: macroColor[macro.key] }]} />
                <AppText size={fontSize.sm} weight={600} color={colors.text2}>
                  {`${macro.label} ${macro.grams}`}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
        <AppText size={fontSize.sm} color={colors.text2}>
          {model.water ? `Água: ${model.water}` : "Água: você define abaixo"}
        </AppText>
        {model.reason ? (
          <AppText size={fontSize.sm} lineHeight={20} color={colors.text2}>
            {model.reason}
          </AppText>
        ) : null}
        <Button
          label={model.actionLabel}
          variant="secondary"
          expanded={isShown}
          onPress={() => {
            focusOnOpen.current = !isShown;
            setOpen(!isShown);
          }}
        />
      </View>
      {isShown ? (
        <View ref={panel} style={styles.panel}>
          {hide ? null : <Ruler label={KCAL_LABEL} error={errors.manualCalories} value={String(answers.manualCalories ?? "")} config={kcalConfig} onChange={(next) => setMany({ manualCalories: next })} />}
          <MacroSplitEditor
            goals={goals}
            hide={hide}
            firstHandleRef={firstHandle}
            onChange={(grams) => setMany({ manualProtein: String(grams.protein), manualCarbs: String(grams.carbs), manualFat: String(grams.fat) })}
          />
          {coherence ? (
            <CoherenceChip
              testID="goals-coherence"
              text={coherence.text}
              actionLabel={coherence.fixLabel}
              onAction={() =>
                setMany({
                  manualProtein: String(coherence.fix.manualProtein),
                  manualCarbs: String(coherence.fix.manualCarbs),
                  manualFat: String(coherence.fix.manualFat),
                })
              }
            />
          ) : null}
          {hasManual ? (
            <Button label="Voltar ao recomendado" variant="text" onPress={() => setMany({ manualCalories: "", manualProtein: "", manualCarbs: "", manualFat: "" })} />
          ) : null}
        </View>
      ) : null}
      <QHelp error={errorText} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 14 },
  card: { gap: 10, alignItems: "flex-start", paddingVertical: 14, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.mint200, backgroundColor: colors.mint50 },
  kcal: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  macros: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  macro: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.surface },
  dot: { width: 8, height: 8, borderRadius: 4 },
  panel: { gap: 18 },
}));
