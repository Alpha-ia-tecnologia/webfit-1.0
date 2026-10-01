import {
  Apple,
  Check,
  Coffee,
  Cookie,
  Moon,
  MoonStar,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { SLOT_LABEL, type DietMeal, type DietSlot } from "@shared/lib/diet-plan";
import {
  macroGramsLabel,
  macroGramsText,
  mealEstimateText,
  PLAN_DAY_COPY,
  type PlanMealState,
  type SwapMark,
} from "@shared/lib/diet-week";
import { glyphForFood, glyphForName } from "@shared/lib/food-glyph";
import { fmtUntil } from "@shared/lib/format";
import { macroEstimate, resolvePlanned } from "@shared/lib/taco-match";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, MacroBar, MealCard, type MealCardTone } from "@/components/ui";
import { useIosAnnouncement } from "@/lib/announce";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { MealActions, MealRegisterButton, type PlanMealHandlers } from "./meal-actions";
import { PlanItemRow } from "./plan-item-row";
import { PlannedEstimate } from "./planned-items";

const SLOT_ICON: Record<DietSlot, LucideIcon> = {
  cafe_da_manha: Coffee,
  lanche_da_manha: Apple,
  almoco: UtensilsCrossed,
  lanche_da_tarde: Cookie,
  jantar: Moon,
  ceia: MoonStar,
};
/** Tom do bloco da refeição (lanche azul: rosa é só para erro). A próxima fica sempre menta. */
const SLOT_TONE: Record<DietSlot, MealCardTone> = {
  cafe_da_manha: "amber",
  lanche_da_manha: "sky",
  almoco: "mint",
  lanche_da_tarde: "sky",
  jantar: "indigo",
  ceia: "indigo",
};

/** Abaixo desta largura (o @media 359px do web) a recolhida perde a pilha de emojis e o título pode quebrar. */
const NARROW_BELOW_WIDTH = 360;

/** "preview" = outro dia da semana ou plano desatualizado: aberta, sem ações. */
export type PlanCardState = PlanMealState | "preview";

type Props = {
  meal: DietMeal;
  state: PlanCardState;
  /** Horário do registro que marca a refeição hoje. */
  registeredAt: string | null;
  sensitive: boolean;
  calm: boolean;
  hideCalories: boolean;
  /** Itens trocados no dia mostrado (IA-X5). */
  marks: readonly SwapMark[];
  allergyDetails: string;
  allergyTokens: readonly string[];
  /** Próxima: minutos até o horário (0 = agora; sem contagem no perfil sensível). */
  minutesUntil?: number | null;
  /** Aviso do "Trocar refeição" (região viva); vazio até a pessoa trocar. */
  statusText?: string;
  /** Ações de hoje; ausentes na prévia e no plano desatualizado. */
  handlers?: PlanMealHandlers;
};

/**
 * Refeição do plano na linha do tempo (PlanMealCard do web, conceito 04): feita e passada recolhidas (pilha de
 * emojis, toque abre), próxima e futuras abertas com os itens, a barra P/C/G e as ações. Números só da TACO
 * (macroEstimate), nunca do texto do modelo; sem kcal com calorias ocultas e nenhum número no perfil sensível.
 */
export function PlanMealCard({
  meal,
  state,
  registeredAt,
  sensitive,
  calm,
  hideCalories,
  marks,
  allergyDetails,
  allergyTokens,
  minutesUntil,
  statusText = "",
  handlers,
}: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const resolved = useMemo(() => resolvePlanned(meal.itens, { allergyDetails }), [meal.itens, allergyDetails]);
  const isCollapsible = state === "done" || state === "past";
  const isNarrow = useWindowDimensions().width < NARROW_BELOW_WIDTH;
  const [isExpanded, setExpanded] = useState(false);
  // Resultado de "Trocar refeição": região viva no Android e no web; no iOS, o leitor de tela fala.
  useIosAnnouncement(statusText);
  const estimate = macroEstimate(resolved);
  const numbers = mealEstimateText(estimate, { hideCalories, sensitive, compact: isCollapsible });
  const glyphs = resolved.flatMap((entry) => {
    const glyph = (entry.food ? glyphForFood(entry.food) : null) ?? glyphForName(entry.item.alimento);
    return glyph ? [glyph] : [];
  });
  const tone: MealCardTone = state === "next" ? "mint" : SLOT_TONE[meal.slot];
  const doneAt = state === "done" && registeredAt ? registeredAt : null;

  const subtitle = isCollapsible
    ? [numbers.kcal, doneAt ? null : numbers.protein, doneAt ? `às ${doneAt}` : null].filter(Boolean).join(" · ")
    : null;
  const until = state === "next" && !sensitive && minutesUntil ? fmtUntil(minutesUntil) : null;
  const hasMeta = !isCollapsible && (numbers.kcal || numbers.protein || until);
  const meta = hasMeta ? (
    <AppText size={fontSize.sm} color={colors.muted} lineHeight={18}>
      {numbers.kcal}
      {numbers.kcal && numbers.protein ? " · " : ""}
      {numbers.protein ? (
        <AppText size={fontSize.sm} weight={700} color={colors.green700}>
          {numbers.protein}
        </AppText>
      ) : null}
      {until && (numbers.kcal || numbers.protein) ? " · " : ""}
      {until ? (
        <AppText size={fontSize.sm} weight={700} color={colors.text2}>
          {until}
        </AppText>
      ) : null}
    </AppText>
  ) : null;

  const badge =
    state === "done" ? (
      <View style={styles.donePill}>
        <Check size={14} strokeWidth={3} color={colors.white} />
        <AppText size={fontSize.sm} weight={800} color={colors.white}>
          {PLAN_DAY_COPY.done}
          {doneAt ? <AppText style={srOnly}>{` às ${doneAt}`}</AppText> : null}
        </AppText>
      </View>
    ) : state === "next" ? (
      <View style={styles.nextPill}>
        <View style={styles.nextDot} />
        <AppText size={fontSize.xs} weight={800} color={colors.white}>
          {PLAN_DAY_COPY.next}
        </AppText>
      </View>
    ) : null;
  const trailing =
    handlers && state === "past" ? <MealRegisterButton slot={meal.slot} handlers={handlers} tone="outline" compact /> : null;

  const bar = sensitive ? (
    <PlannedEstimate resolved={resolved} sensitive />
  ) : estimate.share && estimate.grams ? (
    <View style={styles.bar}>
      <View style={styles.barFill}>
        <MacroBar share={estimate.share} size="lg" label={macroGramsLabel(estimate.grams)} testID="macro-estimate" />
      </View>
      <AppText size={fontSize.sm} weight={700} color={colors.muted} style={styles.tabular} aria-hidden>
        {macroGramsText(estimate.grams)}
      </AppText>
    </View>
  ) : null;
  const footer =
    handlers && state !== "done" ? (
      <MealActions slot={meal.slot} handlers={handlers} register={state === "next" ? "primary" : state === "future" ? "outline" : null} />
    ) : null;

  return (
    <MealCard
      variant={isCollapsible ? "collapsed" : "open"}
      title={SLOT_LABEL[meal.slot]}
      icon={SLOT_ICON[meal.slot]}
      glyphs={glyphs}
      tone={tone}
      subtitle={subtitle}
      meta={meta}
      badge={badge}
      badgeInTitle={state === "next"}
      showTile={!(isNarrow && isCollapsible)}
      titleLines={isNarrow ? 2 : 1}
      trailing={trailing}
      emphasis={state === "next" ? "next" : state === "done" ? "done" : null}
      isExpanded={isCollapsible ? isExpanded : undefined}
      onToggle={isCollapsible ? () => setExpanded(!isExpanded) : undefined}
      footer={footer}
      testID={state === "next" ? "next-meal" : undefined}
    >
      <View role="list" aria-label={`Itens: ${SLOT_LABEL[meal.slot]}`}>
        {resolved.map((entry, index) => (
          <PlanItemRow
            key={`${entry.item.alimento}-${index}`}
            entry={entry}
            swaps={meal.itens[index]?.trocas ?? []}
            replaces={marks.find((mark) => mark.item === index)?.replaces}
            allergyTokens={allergyTokens}
            showGrams={!calm && !sensitive}
            isFirst={index === 0}
          />
        ))}
      </View>
      {bar}
      {handlers ? (
        <AppText role="status" accessibilityLiveRegion="polite" size={fontSize.xs} color={colors.muted} style={statusText ? undefined : styles.silent}>
          {statusText}
        </AppText>
      ) : null}
    </MealCard>
  );
}

const useStyles = makeStyles((colors) => ({
  donePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 28,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.green600,
  },
  nextPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 26,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.inverse,
  },
  nextDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green500 },
  bar: { flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  barFill: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ["tabular-nums"] },
  /** O nó do aviso existe desde o início (sem texto, sem altura) para o leitor de tela ouvir a troca. */
  silent: { height: 0, overflow: "hidden" },
}));
