import { Redirect, useRouter } from "expo-router";
import { ClipboardList, FileText, Sparkles } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { SETTINGS_TAB } from "@shared/lib/copy";
import { isSensitive } from "@shared/lib/day";
import { dietChips, isDietPlanStale } from "@shared/lib/diet";
import { PLAN_TIMES_NOTE, SLOT_CATEGORY, type DietMeal } from "@shared/lib/diet-plan";
import {
  planAnchor,
  planDayStatus,
  planMealStates,
  planWeek,
  PLAN_DAY_COPY,
  swapStatus,
  type DayPlan,
  type PlanDayStatus,
  type PlanMealState,
} from "@shared/lib/diet-week";
import { dailyTargets, localDate, totalsFor } from "@shared/lib/domain";
import { fmtNumber, fmtRelDate } from "@shared/lib/format";
import { bodyNumbers, isCalmProfile } from "@shared/lib/space";
import { visiblePlainText } from "@shared/lib/text";
import { DietPlanCard, StaleBand } from "@/components/dieta/diet-plan-card";
import { DietStructured } from "@/components/dieta/diet-structured";
import type { TimelineToday } from "@/components/dieta/diet-timeline";
import { DietWeek } from "@/components/dieta/diet-week";
import type { PlanMealHandlers } from "@/components/dieta/meal-actions";
import { PlanDayHeader, type DayGoal } from "@/components/dieta/plan-day-header";
import { PlanProgress, type PlanStep } from "@/components/dieta/plan-progress";
import { PlanShortcuts } from "@/components/dieta/plan-shortcuts";
import {
  useMinuteClock,
  useNextPlannedMeal,
  usePlanDay,
  usePlanMealEat,
  usePlannedMealRegister,
  useStructuredPlan,
} from "@/components/dieta/use-planned-meal";
import { Screen } from "@/components/layout/screen";
import { AiProgress, AiResultSkeleton, AppText, Button, Notice, OverflowMenu } from "@/components/ui";
import { espacoHref } from "@/lib/espaco-link";
import { selectionHaptic } from "@/lib/haptics";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";

/** Sem "Trocar" ainda: referência estável (a memória do dia não refaz a conta a cada render). */
const NO_SWAPS: Readonly<Record<number, number>> = {};
/** O "Ver plano em texto" aberto pelo ⋯ fica um pouco abaixo do topo (o cabeçalho de vidro cobre o início). */
const TEXT_SCROLL_MARGIN = 96;
/** Dia escolhido na semana e trocas do "Trocar", válidos para um plano e um dia (recarregar zera). */
type DayChoice = {
  key: string;
  selected: string;
  extra: Readonly<Record<number, number>>;
};

/** Faixa do cabeçalho: um segmento por refeição; perfis calmos não veem as feitas (sem cobrança). */
function planSteps(day: DayPlan, states: readonly PlanMealState[], calm: boolean): PlanStep[] {
  return day.plan.refeicoes.map((meal, index) => {
    const state = states[index];
    return {
      time: meal.horario ?? "Livre",
      state: state === "next" ? "next" : state === "done" && !calm ? "done" : "other",
    };
  });
}

/** "930 de 1.645 kcal": consumido hoje (diário) sobre a meta; nunca com calorias ocultas nem calmo. */
function consumedText(consumed: number, goal: DayGoal | null, show: boolean): string | null {
  if (!show || !goal?.calories) return null;
  return `${fmtNumber(consumed)} de ${fmtNumber(goal.calories)} kcal`;
}

/** O (i) "Sobre esta dieta": resumo do plano, a nota dos horários e o aviso educativo. */
function AboutDiet({ highlights, hasTimes, createdAt }: { highlights: readonly string[]; hasTimes: boolean; createdAt: string | null }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <>
      {highlights.length ? (
        <>
          <AppText heading size={fontSize.md} weight={800} accessibilityRole="header">
            Resumo
          </AppText>
          <View role="list" aria-label="Resumo" style={styles.bullets}>
            {highlights.map((highlight, index) => (
              <View key={`${index}-${highlight}`} role="listitem" style={styles.bulletRow}>
                <View style={styles.bullet} />
                <AppText size={fontSize.sm} lineHeight={20} color={colors.text2} style={styles.bulletText}>
                  {highlight}
                </AppText>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {hasTimes ? (
        <AppText size={fontSize.sm} color={colors.text2}>
          {PLAN_TIMES_NOTE}
        </AppText>
      ) : null}
      <AppText size={fontSize.sm} color={colors.text2}>
        Sugestão alimentar educativa gerada por IA, com revisão automática. Se você segue um plano profissional, ele continua sendo a
        referência.
      </AppText>
      {createdAt ? (
        <AppText size={fontSize.sm} color={colors.text2}>
          Gerada em {new Date(createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · plano de um dia. Ao gerar
          novamente, a nova dieta substitui esta; as versões anteriores continuam na conversa do agente.
        </AppText>
      ) : null}
    </>
  );
}

/**
 * Minha dieta (ScreenDieta do web, conceito 04): cabeçalho do dia com a meta, a rosca, os chips e "2 de 5 refeições
 * hoje"; a linha do tempo com as feitas recolhidas e a próxima destacada; "Outros dias do plano"; "Para facilitar" em
 * atalhos; o texto integral no fim. ⋯ no cabeçalho: gerar de novo, revisar a anamnese e ver o plano em texto.
 */
export function DietaScreen() {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state, clock, aiReady, aiBusy, aiStage, dietBusy, dietSaving, dietError, dietProgress, requestDietPlan, cancelAi, askAgent } =
    useApp();
  const router = useRouter();
  const profile = state.profile;
  const plan = state.dietPlan;
  const today = localDate(clock);
  const now = useMinuteClock();
  const allergyDetails = profile?.allergyDetails ?? "";
  const scrollRef = useRef<ScrollView>(null);
  const structY = useRef(0);
  const textY = useRef(0);
  const [isTextOpen, setTextOpen] = useState(false);
  // Semana do plano (IA-X5) e "Trocar" (AGENTE-09): só em memória; outro plano ou outro dia zera.
  const dayKey = `${plan?.id ?? ""}|${today}`;
  const fresh: DayChoice = { key: dayKey, selected: today, extra: NO_SWAPS };
  const [choice, setChoice] = useState<DayChoice>(fresh);
  const day = choice.key === dayKey ? choice : fresh;
  const updateDay = (change: (current: DayChoice) => DayChoice) => setChoice((current) => change(current.key === dayKey ? current : fresh));
  // Plano estruturado já sem gramas (perfil sensível) e com calorias mascaradas.
  const view = useStructuredPlan();
  const todayDay = usePlanDay(today, day.extra);
  const selectedDay = usePlanDay(day.selected);
  const week = useMemo(
    () => (view && plan ? planWeek(view, { anchor: planAnchor(plan.createdAt), today, allergyDetails }) : []),
    [view, plan, today, allergyDetails],
  );
  const next = useNextPlannedMeal(todayDay?.plan);
  const eat = usePlanMealEat();
  const register = usePlannedMealRegister();
  const [eating, setEating] = useState<number | null>(null);
  if (!profile) return <Redirect href="/anamnese" />;

  const stale = !!plan && isDietPlanStale(plan, profile);
  const sensitive = isSensitive(profile);
  const calm = isCalmProfile(profile, today);
  const hideBody = bodyNumbers(profile, today) === "hidden";
  const isPreview = !stale && day.selected !== today;
  const shownDay = isPreview ? selectedDay : todayDay;
  const status: PlanDayStatus | null = todayDay ? planDayStatus(todayDay.plan, state.diary, today) : null;
  const eatMeal = async (meal: DietMeal, index: number) => {
    setEating(index);
    try {
      await eat(meal);
    } finally {
      setEating(null);
    }
  };
  /** "Trocar refeição": a refeição avança para a próxima combinação das trocas revisadas (sem IA). */
  const swapMeal = (index: number) => {
    selectionHaptic();
    updateDay((current) => ({ ...current, extra: { ...current.extra, [index]: (current.extra[index] ?? 0) + 1 } }));
  };
  const isToday = !!todayDay && !!status && !isPreview && !stale;
  const states = todayDay && status ? planMealStates(todayDay.plan, status.registeredAt, next?.index ?? null, now) : [];
  const handlers = (meal: DietMeal, index: number): PlanMealHandlers => ({
    canSwap: !!todayDay?.meals[index]?.canSwap,
    canAsk: profile.consentAi,
    isBusy: eating === index,
    onEat: () => void eatMeal(meal, index),
    onAdjust: () => register(SLOT_CATEGORY[meal.slot], meal.itens),
    onSwap: () => swapMeal(index),
    onAsk: () => askAgent(PLAN_DAY_COPY.askPrompt(meal.slot)),
  });
  const timelineToday: TimelineToday | undefined =
    isToday && todayDay && status
      ? {
          states,
          registeredAt: status.registeredAt,
          statusText: todayDay.plan.refeicoes.map((meal, index) =>
            index in day.extra ? swapStatus(meal, todayDay.meals[index]?.swaps ?? []) : "",
          ),
          handlers,
          minutesUntil: next?.minutesUntil ?? null,
        }
      : undefined;
  const targets = dailyTargets(state, today);
  const goal: DayGoal | null = sensitive
    ? null
    : { calories: targets.calories, protein: targets.protein, carbs: targets.carbs, fat: targets.fat };
  const progress =
    isToday && todayDay && status ? (
      <PlanProgress
        count={calm ? null : status.text}
        kcal={consumedText(totalsFor(state.diary, today).calories, goal, !calm && !profile.hideCalories)}
        steps={planSteps(todayDay, states, calm)}
      />
    ) : null;
  const canGenerate = profile.consentAi && aiReady && !aiBusy && !dietBusy;
  const generate = () => void requestDietPlan();
  const openAnamnese = () => router.push("/anamnese");
  const openSettings = () => router.push(espacoHref("preferencias"));
  const openText = () => {
    setTextOpen(true);
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ y: Math.max(0, structY.current + textY.current - TEXT_SCROLL_MARGIN), animated: true }),
    );
  };
  const updatedAt = plan ? fmtRelDate(localDate(new Date(plan.createdAt)), today) : null;
  const error = dietError ? visiblePlainText(dietError, profile.hideCalories, hideBody) : "";
  const menu = plan ? (
    <OverflowMenu
      variant="header"
      label="Mais opções da dieta"
      items={[
        { label: "Gerar nova dieta", icon: Sparkles, disabled: !canGenerate, onSelect: generate },
        { label: "Revisar anamnese", icon: ClipboardList, onSelect: openAnamnese },
        ...(view ? [{ label: "Ver plano em texto", icon: FileText, onSelect: openText }] : []),
      ]}
    />
  ) : undefined;
  const weekStrip =
    view && !stale && week.some((d) => d.hasVariation) ? (
      <DietWeek days={week} value={day.selected} onChange={(date) => updateDay((current) => ({ ...current, selected: date }))} />
    ) : null;

  // Sem backTo: "Voltar" retorna à tela de origem (ex.: conversa do agente), não a Hoje.
  return (
    <Screen header={{ variant: "default", title: "Minha dieta", hideBell: true, actions: menu }} scrollRef={scrollRef}>
      <PlanDayHeader
        hasPlan={!!plan}
        updatedAt={updatedAt}
        goal={goal}
        hideCalories={profile.hideCalories}
        chips={dietChips(profile)}
        progress={progress}
        about={
          <AboutDiet
            highlights={view?.resumo.destaques ?? []}
            hasTimes={!!view?.refeicoes.some((meal) => meal.horario)}
            createdAt={plan?.createdAt ?? null}
          />
        }
      >
        {!profile.consentAi ? (
          <Notice>
            <AppText size={fontSize.sm} lineHeight={21} color={colors.green800}>
              Para criar sua dieta, autorize o envio da anamnese ao agente em Meu espaço → {SETTINGS_TAB.label}.
            </AppText>
            <Button label="Abrir Meu espaço" variant="text" onPress={openSettings} />
          </Notice>
        ) : !aiReady ? (
          <Notice>
            <AppText size={fontSize.sm} lineHeight={21} color={colors.green800}>
              O agente ainda não está conectado. Sua anamnese está salva; a dieta pode ser gerada quando a conexão voltar.
            </AppText>
            <Button label="Configurar agente" variant="text" onPress={openSettings} />
          </Notice>
        ) : null}
        {!plan && !dietBusy ? (
          <View style={styles.cta}>
            <Button label={dietError ? "Tentar novamente" : "Gerar minha dieta"} icon={Sparkles} wide disabled={!canGenerate} onPress={generate} />
            <Button label="Revisar anamnese" icon={ClipboardList} variant="secondary" wide onPress={openAnamnese} />
          </View>
        ) : null}
      </PlanDayHeader>

      {dietBusy ? (
        <AiProgress
          title={dietSaving ? "Salvando sua dieta" : "Criando sua dieta"}
          detail={dietSaving ? undefined : dietProgress || undefined}
          progress={dietSaving ? null : aiStage}
          mode={dietProgress ? "exam" : "diet"}
          note="Você pode continuar usando o app."
          onCancel={dietSaving ? undefined : cancelAi}
          cancelLabel="Cancelar geração"
        />
      ) : null}
      {dietBusy && !plan ? <AiResultSkeleton rows={4} /> : null}
      {!dietBusy && error ? (
        <View style={styles.error}>
          <Notice tone="attention">{error}</Notice>
          {plan && !stale ? <Button label="Tentar novamente" variant="secondary" disabled={!canGenerate} onPress={generate} /> : null}
        </View>
      ) : null}
      {!dietBusy && aiBusy ? (
        <AppText size={fontSize.sm} color={colors.muted}>
          Aguarde a solicitação atual do agente para gerar sua dieta.
        </AppText>
      ) : null}
      {plan && stale && !dietBusy ? <StaleBand hasError={!!dietError} canGenerate={canGenerate} onGenerate={generate} /> : null}
      {plan && view ? (
        <View
          onLayout={(event) => {
            structY.current = event.nativeEvent.layout.y;
          }}
        >
          <DietStructured
            plan={plan}
            view={!stale && shownDay ? shownDay.plan : view}
            stale={stale}
            sensitive={sensitive}
            calm={calm}
            hideCalories={profile.hideCalories}
            hideBodyNumbers={hideBody}
            allergyDetails={allergyDetails}
            dayNote={
              isPreview ? (
                <View style={styles.previewNote}>
                  <AppText size={fontSize.sm} weight={600} color={colors.text2} testID="plan-preview">
                    {PLAN_DAY_COPY.preview(day.selected)}
                  </AppText>
                </View>
              ) : null
            }
            swaps={stale ? undefined : shownDay?.meals.map((meal) => meal.swaps)}
            today={timelineToday}
            week={weekStrip}
            isTextOpen={isTextOpen}
            onToggleText={() => setTextOpen(!isTextOpen)}
            onTextLayout={(y) => {
              textY.current = y;
            }}
          />
        </View>
      ) : null}
      {plan && !view ? <DietPlanCard plan={plan} hideCalories={profile.hideCalories} hideBodyNumbers={hideBody} isStale={stale} /> : null}
      {plan && !view ? <PlanShortcuts tips={[]} /> : null}
    </Screen>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  error: { gap: 10 },
  cta: { gap: 10, marginTop: 4 },
  previewNote: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  bullets: { gap: 6 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bullet: { width: 6, height: 6, marginTop: 7, borderRadius: 3, backgroundColor: themeDomainTone(scheme).food.fg },
  bulletText: { flex: 1, minWidth: 0 },
}));
