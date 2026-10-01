import { CircleCheck, EyeOff } from "lucide-react-native";
import { useEffect, useId, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { canShowProjection } from "@shared/lib/anamnese-flow";
import { weightProjection } from "@shared/lib/body-metrics";
import type { PenLastPreview } from "@shared/lib/pen-setup";
import {
  HIDE_CALORIES_COPY,
  PLAN_LOADER_STEP_MS,
  PLAN_LOADER_TEXT,
  planChecklist,
  planConsidered,
  planFirstName,
  type PlanVariant,
} from "@shared/lib/plan-reveal";
import type { Draft, Goals, Profile } from "@shared/types";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, IconTile, Pill } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows, themeDomainTone } from "@/theme/tokens";
import { PlanBody } from "./plan-energy";
import { PlanDuo } from "./plan-duo";
import { PlanTitle } from "./plan-title";
import { ProjectionCard } from "./projection-card";

/** Depois da 4ª linha, uma pausa curta antes do plano. */
const LOADER_TAIL_MS = 300;
const SWITCH = { width: 46, height: 28, knob: 22, inset: 3 } as const;
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

type Props = {
  profile: Profile;
  goals: Goals;
  variant: PlanVariant;
  today: string;
  /** Só logo depois de "Salvar e continuar" na etapa 7: a lista de montagem aparece uma vez. */
  animate: boolean;
  /** Registro da última aplicação que será feito ao concluir (confirmado, válido e primeiro). */
  pending: PenLastPreview | null;
  /** "Ocultar números do corpo": sem projeção de peso. */
  bodyHidden: boolean;
  onCancelPen: () => void;
  onToggleHideCalories: () => void;
};

/**
 * "Seu plano inicial, Nome" (ANAM-04, conceito 08): o que foi considerado, "Ocultar números de calorias"
 * antes de qualquer número, o corpo do plano (completo, prato ou de hábitos), água e dia lado a lado e a
 * projeção segura. Perfis sensíveis e menores recebem o plano de hábitos: sem números de peso ou energia
 * e sem projeção. O carregamento pode ser pulado e nunca bloqueia a conclusão. No app nativo não há confete.
 */
export function PlanReveal({ profile, goals, variant, today, animate, pending, bodyHidden, onCancelPen, onToggleHideCalories }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isReduced = useReducedMotion();
  const [isLoading, setLoading] = useState(() => animate);
  const [shown, setShown] = useState(0);
  const title = useRef<View>(null);
  const skipped = useRef(false);
  const lines = planChecklist(profile, variant);
  const isLoaderOn = isLoading && !isReduced;
  useEffect(() => {
    if (!isLoaderOn) return;
    const timers = lines.map((_, i) => setTimeout(() => setShown(i + 1), PLAN_LOADER_STEP_MS * (i + 1)));
    timers.push(setTimeout(() => setLoading(false), PLAN_LOADER_STEP_MS * lines.length + LOADER_TAIL_MS));
    return () => timers.forEach(clearTimeout);
    // A lista roda uma vez, ao montar; as linhas não mudam durante a montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaderOn]);
  useEffect(() => {
    if (isLoading || !skipped.current) return;
    skipped.current = false;
    focusNode(title.current);
  }, [isLoading]);
  const considered = planConsidered(profile);
  const projection =
    variant !== "habitos" &&
    !bodyHidden &&
    profile.targetWeight !== null &&
    canShowProjection(profile as unknown as Draft, today)
      ? weightProjection({
          current: profile.weight,
          target: profile.targetWeight,
          height: profile.height,
          goal: profile.goal,
          today,
        })
      : null;
  return (
    <View testID="plan-reveal" style={styles.plan}>
      <PlanTitle variant={variant} firstName={planFirstName(profile.name)} titleRef={title} />
      {isLoaderOn ? (
        <View testID="plan-loader" style={styles.loader}>
          <AppText role="status" accessibilityLiveRegion="polite" heading size={fontSize.md} weight={700} color={colors.text}>
            {PLAN_LOADER_TEXT}
          </AppText>
          <View role="list" aria-label="O que usamos" style={styles.loaderList}>
            {lines.slice(0, shown).map((line) => (
              <View key={line} role="listitem" style={styles.check}>
                <CircleCheck size={16} color={colors.green600} />
                <AppText size={fontSize.sm} lineHeight={18} color={colors.text2} style={styles.grow}>
                  {line}
                </AppText>
              </View>
            ))}
          </View>
          <Button
            label="Pular"
            variant="text"
            accessibilityLabel="Pular e ver o plano"
            onPress={() => {
              skipped.current = true;
              setLoading(false);
            }}
          />
        </View>
      ) : (
        <>
          {considered.length > 0 ? (
            <View role="list" aria-label="Considerado" style={styles.considered}>
              <AppText {...HIDDEN} size={fontSize.sm} weight={600} color={colors.muted}>
                Considerado:
              </AppText>
              {considered.map((item) => (
                <View key={item.text} role="listitem" style={styles.consideredItem}>
                  <Pill tone="neutral" variant="outline" emoji={item.emoji} style={styles.chip}>
                    {item.text}
                  </Pill>
                </View>
              ))}
            </View>
          ) : null}
          {variant !== "habitos" ? <HideCaloriesRow checked={variant === "prato"} onToggle={onToggleHideCalories} /> : null}
          <PlanBody profile={profile} goals={goals} variant={variant} />
          <PlanDuo profile={profile} goals={goals} />
          {projection && profile.targetWeight !== null ? (
            <ProjectionCard
              projection={projection}
              current={profile.weight}
              target={profile.targetWeight}
              goal={profile.goal}
              today={today}
              usesPen={profile.weightLossPen === "sim"}
            />
          ) : null}
          {pending ? (
            <View style={styles.pending}>
              <AppText size={fontSize.sm} lineHeight={19} color={colors.text} style={styles.pendingText}>
                {`Ao concluir, registramos no diário: ${pending.text}`}
              </AppText>
              <Button label="Não registrar" variant="text" onPress={onCancelPen} />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

/**
 * "Ocultar números de calorias": a linha inteira é o interruptor (como o <label> do web), antes de qualquer
 * número; troca o plano completo pelo de prato na hora. Espaço também liga e desliga no export web.
 */
function HideCaloriesRow({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const hintId = `plan-hide-hint-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const onKey = (event: { key: string; preventDefault: () => void }) => {
    if (event.key !== " ") return;
    event.preventDefault();
    onToggle();
  };
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={HIDE_CALORIES_COPY.title}
      accessibilityHint={HIDE_CALORIES_COPY.hint}
      accessibilityState={{ checked }}
      {...webAttrs({ "aria-checked": checked })}
      {...{ "aria-describedby": hintId }}
      {...(Platform.OS === "web" ? { onKeyDown: onKey } : {})}
      onPress={onToggle}
      style={({ pressed }) => [styles.hideRow, pressed && styles.pressed]}
    >
      <IconTile tone="neutral" size="md" icon={EyeOff} />
      <View style={styles.hideText}>
        <AppText size={fontSize.base} weight={600} lineHeight={22}>
          {HIDE_CALORIES_COPY.title}
        </AppText>
        <AppText nativeID={hintId} size={fontSize.xs} lineHeight={19} color={colors.muted}>
          {HIDE_CALORIES_COPY.hint}
        </AppText>
      </View>
      <View {...HIDDEN} style={[styles.switchTrack, checked && styles.switchTrackOn]}>
        <View style={[styles.switchKnob, checked && styles.switchKnobOn]} />
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  plan: { gap: 16 },
  loader: { gap: 10 },
  loaderList: { gap: 8, minHeight: 112 },
  check: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  considered: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  consideredItem: { maxWidth: "100%" },
  chip: { minHeight: 30, paddingHorizontal: 12 },
  // .plan-hide-row
  hideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  pressed: { opacity: 0.85 },
  hideText: { flex: 1, minWidth: 0 },
  switchTrack: {
    width: SWITCH.width,
    height: SWITCH.height,
    padding: SWITCH.inset,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  switchTrackOn: { backgroundColor: colors.green600 },
  switchKnob: {
    width: SWITCH.knob,
    height: SWITCH.knob,
    borderRadius: SWITCH.knob / 2,
    backgroundColor: colors.white,
    boxShadow: shadows.knob,
  },
  switchKnobOn: { transform: [{ translateX: SWITCH.width - SWITCH.knob - 2 * SWITCH.inset }] },
  // .plan-pending: tom da medicação
  pending: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 12,
    rowGap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: themeDomainTone(scheme).medication.border,
    backgroundColor: themeDomainTone(scheme).medication.bg,
  },
  pendingText: { flexGrow: 1, flexShrink: 1, flexBasis: 200 },
}));
