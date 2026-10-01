import { useRouter } from "expo-router";
import { ChevronDown, MessageCircle, ShieldCheck } from "lucide-react-native";
import { useMemo, useRef, type ReactNode } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { renderDietText, sanitizeDietPlan, type DietPlanV2 } from "@shared/lib/diet-plan";
import type { SwapMark } from "@shared/lib/diet-week";
import { visiblePlainText } from "@shared/lib/text";
import type { DietPlan } from "@shared/types";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, Notice, RichText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";
import { DietTimeline, type TimelineToday } from "./diet-timeline";
import { PlanShortcuts } from "./plan-shortcuts";

function Bullets({ items, label }: { items: readonly string[]; label: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View role="list" aria-label={label} style={styles.bullets}>
      {items.map((item, index) => (
        <View key={`${index}-${item}`} role="listitem" style={styles.bulletRow}>
          <View style={styles.bullet} />
          <AppText size={fontSize.sm} lineHeight={21} color={colors.text2} style={styles.bulletText}>
            {item}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/**
 * Plano estruturado (DietStructured do web, conceito 04): o dia em linha do tempo com cartões por refeição, a semana
 * do plano, "Para facilitar" em atalhos, perguntas e, no fim, o texto integral (o salvo e enviado ao chat; no perfil
 * sensível, refeito sem gramas). O resumo e a nota dos horários ficam no (i) do cabeçalho do dia. `view` já chega sem
 * gramas no perfil sensível e com as calorias mascaradas.
 */
export function DietStructured({
  plan,
  view,
  stale,
  sensitive,
  calm,
  hideCalories,
  hideBodyNumbers,
  allergyDetails,
  dayNote,
  swaps,
  today,
  week,
  isTextOpen,
  onToggleText,
  onTextLayout,
}: {
  plan: DietPlan;
  view: DietPlanV2;
  stale: boolean;
  sensitive: boolean;
  calm: boolean;
  hideCalories: boolean;
  hideBodyNumbers: boolean;
  allergyDetails: string;
  /** Acima da linha do tempo: o aviso da prévia de outro dia. */
  dayNote?: ReactNode;
  /** Trocas do dia mostrado (IA-X5), por refeição. */
  swaps?: readonly (readonly SwapMark[])[];
  /** Estados e ações das refeições, só no dia de hoje. */
  today?: TimelineToday;
  /** "Outros dias do plano", logo depois da linha do tempo. */
  week?: ReactNode;
  /** Painel "Ver plano em texto" (o ⋯ do cabeçalho também o abre). */
  isTextOpen: boolean;
  onToggleText: () => void;
  /** Posição do "Ver plano em texto" dentro do plano (para o ⋯ rolar até ele). */
  onTextLayout?: (y: number) => void;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const router = useRouter();
  // O texto salvo traz "(≈ 100 g)": no perfil sensível, o texto sai do plano estruturado sem gramas.
  const fullText = useMemo(
    () => (sensitive && plan.structured ? renderDietText(sanitizeDietPlan(plan.structured, { sensitive: true })) : plan.text),
    [sensitive, plan.structured, plan.text],
  );
  // O botão fica dentro de "Mais sobre o plano": a posição dele no plano é a soma das duas (a ordem dos eventos varia).
  const moreY = useRef(0);
  const toggleY = useRef(0);
  const onMoreLayout = (event: LayoutChangeEvent) => {
    moreY.current = event.nativeEvent.layout.y;
    onTextLayout?.(moreY.current + toggleY.current);
  };
  const onToggleLayout = (event: LayoutChangeEvent) => {
    toggleY.current = event.nativeEvent.layout.y;
    onTextLayout?.(moreY.current + toggleY.current);
  };
  return (
    <View style={styles.root}>
      {stale ? (
        <View style={styles.tag}>
          <AppText size={fontSize["2xs"]} weight={700} upper tracking={0.06} color={colors.text2}>
            Versão anterior
          </AppText>
        </View>
      ) : null}
      {dayNote}
      <DietTimeline
        meals={view.refeicoes}
        sensitive={sensitive}
        calm={calm}
        hideCalories={hideCalories}
        allergyDetails={allergyDetails}
        swaps={swaps}
        today={today}
      />
      {week}
      <PlanShortcuts tips={view.dicas} />
      <View style={styles.more} aria-label="Mais sobre o plano" onLayout={onMoreLayout}>
        {view.perguntas.length ? (
          <>
            <AppText heading size={fontSize.lg} weight={800} accessibilityRole="header" style={styles.moreTitle}>
              Para ajustar seu plano
            </AppText>
            <Bullets items={view.perguntas} label="Perguntas para ajustar seu plano" />
            <Button label="Responder no chat" variant="text" icon={MessageCircle} onPress={() => router.push("/agente")} style={styles.textButton} />
          </>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isTextOpen }}
          {...webAttrs({ "aria-expanded": isTextOpen })}
          onPress={onToggleText}
          onLayout={onToggleLayout}
          style={({ pressed }) => [styles.textToggle, pressed && styles.pressed]}
        >
          <AppText size={fontSize.md} weight={700} color={colors.green700}>
            Ver plano em texto
          </AppText>
          <ChevronDown size={16} color={colors.green700} style={isTextOpen ? styles.chevronOpen : undefined} />
        </Pressable>
        {isTextOpen ? (
          <RichText text={fullText} hideCalories={hideCalories} hideBodyNumbers={hideBodyNumbers} selectable testID="diet-plan-text" />
        ) : null}
        {plan.meta.notes.map((note, index) => (
          <Notice key={index}>{visiblePlainText(note, hideCalories, hideBodyNumbers)}</Notice>
        ))}
        <View style={styles.foot}>
          <ShieldCheck size={14} color={colors.green700} />
          <AppText size={fontSize.sm} color={colors.muted} style={styles.footText}>
            Apoio educativo · revisão automática, sem revisão humana
          </AppText>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  root: { gap: 16, minWidth: 0 },
  tag: { alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  more: { gap: 8, minWidth: 0 },
  moreTitle: { marginTop: 8 },
  bullets: { gap: 6 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bullet: {
    width: 6,
    height: 6,
    marginTop: 8,
    marginLeft: 2,
    borderRadius: 3,
    backgroundColor: themeDomainTone(scheme).food.fg,
  },
  bulletText: { flex: 1, minWidth: 0 },
  textButton: { alignSelf: "flex-start" },
  textToggle: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, minHeight: 44, paddingHorizontal: 2 },
  pressed: { opacity: 0.7 },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  foot: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  footText: { flex: 1, minWidth: 0 },
}));
