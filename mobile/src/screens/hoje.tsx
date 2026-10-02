import { useFocusEffect, useRouter } from "expo-router";
import { Fragment, useCallback, useRef, useState, type ReactNode } from "react";
import { ScrollView, View, type Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { latestDailyComment } from "@shared/lib/daily-comment";
import { dayInsight, isCalmOn, type InsightSheetAction } from "@shared/lib/day";
import { intakeAlert } from "@shared/lib/intake-alert";
import { pendingMealSlot } from "@shared/lib/diary-day";
import { adjustmentView } from "@shared/lib/balance-explain";
import { dailyTargets, localDate, localTime, totalsFor, uid } from "@shared/lib/domain";
import { parseHomeLayout, type HomeSectionKey } from "@shared/lib/home-layout";
import { defaultMealCategory } from "@shared/lib/meals";
import { activeSignals, dismissSignal } from "@shared/lib/signals";
import { macroBars, weekWater } from "@shared/lib/today";
import { injectionCardModel, shouldShowTreatment } from "@shared/lib/treatment";
import { canCelebrate } from "@shared/lib/wellbeing";
import { habitSchema, type HabitItem } from "@shared/types";
import { BalanceExplain } from "@/components/hoje/balance-explain";
import { Combinados } from "@/components/hoje/combinados";
import { DayHero } from "@/components/hoje/day-hero";
import { DietPlanRow } from "@/components/hoje/diet-plan-row";
import { HojePantryRow } from "@/components/hoje/hoje-pantry-row";
import { EditHomeButton, HomeLayoutSheet } from "@/components/hoje/home-layout-sheet";
import { InjectionCard } from "@/components/hoje/injection-card";
import { ConfirmDoseSheet, recipeDose } from "@/components/injecao/confirm-dose-sheet";
import { recipeInput, useInjectionSave, type InjectionWhen } from "@/components/injecao/use-injection-save";
import { MealsTimeline } from "@/components/hoje/meals-timeline";
import { MoodCard } from "@/components/hoje/mood-card";
import { NextStepCard } from "@/components/hoje/next-step-card";
import { StartCard } from "@/components/hoje/start-card";
import { WaterCard } from "@/components/hoje/water-card";
import { WeekStrip } from "@/components/hoje/week-strip";
import { AppHeader } from "@/components/layout/app-header";
import { QuickEntryForm } from "@/components/quick/quick-entry-form";
import { HojeWeekRecap } from "@/components/semana/hoje-week-recap";
import { InsightChips } from "@/components/signals/insight-chips";
import { Notice, Sheet } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { useTimeouts } from "@/lib/timeouts";
import { useApp } from "@/state/app-context";
import { useDiaryActions } from "@/state/use-diary-actions";
import { makeStyles } from "@/theme/theme";
import { TAB_BAR_SPACE } from "@/theme/tokens";

/** Folga acima da seção ao rolar a partir dos atalhos do topo. */
const SECTION_SCROLL_OFFSET = 8;
/** Volume do toque único de água no "Comece seu dia". */
const START_WATER_ML = 250;
/** O painel some com esmaecimento (~0,3 s): o foco volta ao título do card depois dele. */
const SHEET_FADE_MS = 350;

/** Visão do dia: a semana, anéis no topo, um próximo passo, as seções na ordem de "Editar Hoje". */
export function HojeScreen() {
  const styles = useStyles();
  const { state, clock, setDate, commit, notify, editMeal, openInjection, askAgent } = useApp();
  const actions = useDiaryActions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Rolagem própria (em vez de <Screen>) para o atalho do topo levar até os Combinados.
  const scroller = useRef<ScrollView>(null);
  const habitsY = useRef(0);
  const p = state.profile!;
  const today = localDate();
  const now = localTime(clock);
  const goals = dailyTargets(state, today);
  const totals = totalsFor(state.diary, today);
  const [isWaterOpen, setWaterOpen] = useState(false);
  const [isMoodOpen, setMoodOpen] = useState(false);
  const [isExplainOpen, setExplainOpen] = useState(false);
  const [isLayoutOpen, setLayoutOpen] = useState(false);
  const [isDoseOpen, setDoseOpen] = useState(false);
  const injectionHeading = useRef<Text>(null);
  // Foco depois do fade da folha: cancelado se a tela sair antes.
  const later = useTimeouts();
  const { save: saveInjection, isBusy: isSavingInjection } = useInjectionSave();
  // O Hoje mostra sempre o dia de hoje: voltar a ele descarta o dia aberto no Diário.
  useFocusEffect(
    useCallback(() => {
      setDate(localDate());
    }, [setDate]),
  );
  const habits = state.habits.filter((h) => h.createdDate <= today);
  const habitsDone = habits.filter((h) => h.completedDates.includes(today)).length;
  const meals = state.diary
    .filter((e) => e.date === today && e.type === "refeicao")
    .sort((a, b) => a.time.localeCompare(b.time));
  const latestMood =
    state.diary
      .filter((e) => e.date === today && e.type === "bem_estar")
      .sort((a, b) => b.time.localeCompare(a.time))[0] ?? null;
  const isDayBlank = !state.diary.some((e) => e.date === today);
  const injectionModel = injectionCardModel(p, state.injections, today);
  const showsInjections = shouldShowTreatment(p, state.injections);
  const layout = parseHomeLayout(p.homeLayout);
  const isShown = (key: HomeSectionKey) => layout.some((s) => s.key === key && !s.isHidden);
  const celebrates = canCelebrate(p);
  // A única voz proativa do Hoje (como no web): o Resumo junta recado do dia, alerta da caneta, sinais e ajuste.
  const insight = dayInsight({
    profile: p,
    totals,
    goals: { water: goals.water, protein: goals.protein },
    habits,
    meals,
    pantry: state.pantry,
    date: today,
    time: now,
    // Caneta: poucos dias seguidos com pouca comida ou pouca proteína (nunca para perfis calmos).
    intakeAlert: intakeAlert(state, today),
    comment: latestDailyComment(state, today),
    signals: activeSignals(state, today, "hoje"),
    adjustment: {
      adjustment: goals.adjustment,
      proteinBoost: goals.proteinBoost,
      note: goals.adjustmentNote,
      view: adjustmentView(goals),
    },
  });
  /** Chips com folha para o dia em branco (o Resumo ainda não aparece): recado, alerta, sinais e ajuste. */
  const blankChips = [...(insight.titleChip ? [insight.titleChip] : []), ...insight.chipItems];
  /** Ação de uma folha: pergunta pronta, abrir a conversa ou "Como calculamos". */
  const runSheetAction = (action: InsightSheetAction) => {
    if (action.kind === "agent") askAgent(action.prompt);
    else if (action.kind === "chat") router.push("/agente");
    else setExplainOpen(true);
  };
  const dismissInsight = (key: string) => void commit((s) => dismissSignal(s, key, today));

  const scrollTo = (y: number) =>
    scroller.current?.scrollTo({
      y: Math.max(0, y - SECTION_SCROLL_OFFSET),
      animated: true,
    });
  /** Atalhos do Hoje registram sempre no dia de hoje, mesmo que o Diário estivesse em outra data. */
  const addMealToday = (category?: string) => {
    setDate(today);
    editMeal(null, category ? { category } : undefined);
  };
  const openDiary = (day: string) => {
    setDate(day);
    router.navigate("/diario");
  };
  const addWater = (ml: number) => void actions.addWater(ml, today);
  const toggleHabit = (id: string) =>
    commit((s) => ({
      ...s,
      habits: s.habits.map((item) =>
        item.id === id
          ? {
              ...item,
              completedDates: item.completedDates.includes(today)
                ? item.completedDates.filter((d) => d !== today)
                : [...item.completedDates, today],
            }
          : item,
      ),
    }));
  /** "Desfazer" devolve o combinado como estava no momento da exclusão (lido dentro do commit). */
  const removeHabit = (habit: HabitItem) => {
    let removed: HabitItem | null = null;
    void commit(
      (s) => {
        removed = s.habits.find((item) => item.id === habit.id) ?? null;
        return removed ? { ...s, habits: s.habits.filter((item) => item.id !== habit.id) } : s;
      },
      "Combinado excluído.",
      {
        label: "Desfazer",
        onAction: () =>
          void commit(
            (s) =>
              !removed || s.habits.some((h) => h.id === habit.id) ? s : { ...s, habits: [...s.habits, removed] },
            "Combinado restaurado.",
          ),
      },
    );
  };
  const createHabit = async (title: string, time: string) => {
    const result = habitSchema.safeParse({
      id: uid(),
      title,
      timeOfDay: time,
      createdDate: today,
      completedDates: [],
    });
    if (!result.success) {
      notify("Confira o nome e o horário do combinado.", "warning");
      return false;
    }
    return commit((s) => ({ ...s, habits: [...s.habits, result.data] }), "Combinado criado.");
  };
  const runInsight = () => {
    const action = insight.action;
    if (!action) return;
    if (action.kind === "water") addWater(action.ml);
    else if (action.kind === "meal") editMeal(null);
    else if (action.kind === "habit") void toggleHabit(action.habitId);
    else if (action.kind === "chat") router.push("/agente");
    else askAgent(insight.prompt);
  };

  /** Seções reordenáveis em "Editar Hoje"; a de medicação só existe para quem usa caneta ou já registrou. */
  const sections: Record<HomeSectionKey, ReactNode> = {
    mood: (
      <MoodCard latest={latestMood} onLog={(rating) => void actions.logMood(rating, today)} onDetails={() => setMoodOpen(true)} />
    ),
    water: (
      <WaterCard
        totalMl={totals.water}
        goalMl={goals.water}
        week={weekWater(state.diary, today)}
        onTap={addWater}
        onCustom={() => setWaterOpen(true)}
        canCelebrate={celebrates}
      />
    ),
    meals: (
      <MealsTimeline
        meals={meals}
        slot={pendingMealSlot(meals, p, now)}
        hideCalories={p.hideCalories}
        onEdit={(entry) => editMeal(entry)}
        onAdd={(category) => addMealToday(category)}
        onSeeAll={() => openDiary(today)}
      />
    ),
    habits: (
      <View
        onLayout={(e) => {
          habitsY.current = e.nativeEvent.layout.y;
        }}
      >
        <Combinados
          habits={habits}
          today={today}
          onToggle={(id) => void toggleHabit(id)}
          onRemove={removeHabit}
          onCreate={createHabit}
          canCelebrate={celebrates}
          isCalm={isCalmOn(p, today)}
        />
      </View>
    ),
    injection: showsInjections ? (
      <InjectionCard
        model={injectionModel}
        headingRef={injectionHeading}
        onOpen={() => openInjection(null)}
        onRegister={() => setDoseOpen(true)}
        onMood={() => setMoodOpen(true)}
      />
    ) : null,
    diet: <DietPlanRow />,
    pantry: <HojePantryRow />,
  };
  const visibleSections = layout.filter((section) => !section.isHidden && sections[section.key]);
  // "No dia, o card sobe": a mesma lista com chave, com a medicação na frente (o card não remonta).
  const ordered = injectionModel.isPromoted
    ? [...visibleSections.filter((s) => s.key === "injection"), ...visibleSections.filter((s) => s.key !== "injection")]
    : visibleSections;
  const doseRecipe = injectionModel.recipe;
  /** Registro pelo Hoje: fica no Hoje com o aviso (e "Desfazer"); o foco volta ao título do card. */
  const registerInjection = async (when: InjectionWhen) => {
    if (!doseRecipe) return;
    const saved = await saveInjection(recipeInput(doseRecipe, when, state.userId), { editing: false, stay: true });
    if (!saved) return;
    setDoseOpen(false);
    const focusHeading = () => focusNode(injectionHeading.current as unknown as View | null);
    requestAnimationFrame(focusHeading);
    later(focusHeading, SHEET_FADE_MS);
  };

  return (
    <View style={styles.root}>
      <AppHeader variant="home" />
      <ScrollView
        ref={scroller}
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <WeekStrip value={today} label="Esta semana" range="week" onChange={openDiary} />
        <DayHero
          consumed={totals.calories}
          goal={goals.calories}
          hideCalories={p.hideCalories}
          macros={macroBars(totals, goals)}
          water={{ ml: totals.water, goal: goals.water }}
          habits={{ done: habitsDone, total: habits.length }}
          meals={meals.length}
          onWater={() => setWaterOpen(true)}
          onWaterAdd={p.fluidRestriction === "sim" ? undefined : addWater}
          onHabits={() =>
            isShown("habits")
              ? scrollTo(habitsY.current)
              : notify("Os combinados estão ocultos. Use “Editar Hoje” para mostrá-los.", "info")
          }
          onExplain={() => setExplainOpen(true)}
        />
        {goals.reason && <Notice>{goals.reason}</Notice>}
        {/* Dia em branco: "Comece seu dia" com a linha de chips (recado, alerta, sinais, ajuste) acima;
            depois do 1º registro, o Resumo é a única voz proativa (ajuste e sinais viram chips dele). */}
        {isDayBlank ? (
          <>
            <InsightChips chips={blankChips} label="Para hoje" onAction={runSheetAction} onDismiss={dismissInsight} />
            <StartCard
              time={now}
              mealCategory={defaultMealCategory(now, p)}
              quickWaterMl={p.fluidRestriction === "sim" ? null : START_WATER_ML}
              onMeal={() => addMealToday(defaultMealCategory(localTime(), p))}
              onWater={() => (p.fluidRestriction === "sim" ? setWaterOpen(true) : addWater(START_WATER_ML))}
              onMood={() => setMoodOpen(true)}
            />
          </>
        ) : (
          <NextStepCard
            insight={insight}
            onAction={runInsight}
            onAsk={() => askAgent(insight.prompt)}
            onSheetAction={runSheetAction}
            onDismiss={dismissInsight}
          />
        )}
        <HojeWeekRecap today={today} />
        {ordered.map((section) => (
          <Fragment key={section.key}>{sections[section.key]}</Fragment>
        ))}
        <EditHomeButton onPress={() => setLayoutOpen(true)} />
      </ScrollView>

      <Sheet visible={isWaterOpen} title="Registrar água" onClose={() => setWaterOpen(false)}>
        {isWaterOpen && <QuickEntryForm type="agua" onDone={() => setWaterOpen(false)} />}
      </Sheet>
      <Sheet visible={isMoodOpen} title="Registrar bem-estar" onClose={() => setMoodOpen(false)}>
        {isMoodOpen && (
          <QuickEntryForm type="bem_estar" entry={latestMood ?? undefined} onDone={() => setMoodOpen(false)} />
        )}
      </Sheet>
      <BalanceExplain
        visible={isExplainOpen && !p.hideCalories}
        consumed={totals.calories}
        goals={goals}
        onClose={() => setExplainOpen(false)}
      />
      <ConfirmDoseSheet
        visible={isDoseOpen && doseRecipe !== null}
        dose={doseRecipe ? recipeDose(doseRecipe) : null}
        editable
        site={doseRecipe?.site ?? injectionModel.summary.suggestedSite}
        suggestedSite={doseRecipe?.site ?? injectionModel.summary.suggestedSite}
        date={today}
        time={now}
        injections={state.injections}
        perMonth={p.weightLossPenPerMonth}
        isBusy={isSavingInjection}
        onConfirm={(when) => void registerInjection(when)}
        onClose={() => setDoseOpen(false)}
        onOtherDose={() => {
          setDoseOpen(false);
          openInjection(null, "form");
        }}
      />
      <HomeLayoutSheet
        visible={isLayoutOpen}
        unavailable={showsInjections ? [] : ["injection"]}
        onClose={() => setLayoutOpen(false)}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14 },
}));
