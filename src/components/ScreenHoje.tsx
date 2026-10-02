import { useRef, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useApp } from "../lib/context";
import { pendingMealSlot } from "../lib/diary-day";
import { adjustmentView } from "../lib/balance-explain";
import { dailyTargets, localDate, localTime, totalsFor, uid } from "../lib/domain";
import { bentoLayout, parseHomeLayout, type HomeSectionKey } from "../lib/home-layout";
import { macroBars, weekWater } from "../lib/today";
import { dayInsight, isCalmOn, type InsightSheetAction } from "../lib/day";
import { latestDailyComment } from "../lib/daily-comment";
import { intakeAlert } from "../lib/intake-alert";
import { activeSignals, dismissSignal } from "../lib/signals";
import { defaultMealCategory } from "../lib/meals";
import { canCelebrate } from "../lib/wellbeing";
import { habitSchema, type HabitItem } from "../types";
import { injectionCardModel, shouldShowTreatment } from "../lib/treatment";
import { Modal, Page } from "./UI";
import { InjectionCard } from "./hoje/InjectionCard";
import { ConfirmDoseSheet, fieldsFromPlan, planFromRecipe, type DoseWhen } from "./injecao/ConfirmDoseSheet";
import { useInjectionSave } from "./injecao/useInjectionSave";
import { DayHero } from "./hoje/DayHero";
import { NextStepCard } from "./hoje/NextStepCard";
import { MoodCard } from "./hoje/MoodCard";
import { WaterCard } from "./hoje/WaterCard";
import { Combinados } from "./hoje/Combinados";
import { WeekStrip } from "./hoje/WeekStrip";
import { StartCard } from "./hoje/StartCard";
import { MealsTimeline } from "./hoje/MealsTimeline";
import { BalanceExplain } from "./hoje/BalanceExplain";
import { HomeLayoutSheet } from "./hoje/HomeLayoutSheet";
import { QuickEntryForm } from "./QuickEntryForm";
// As linhas vêm dos próprios arquivos: as telas Dieta e Despensa carregam sob demanda.
import { DietPlanCard } from "./dieta/DietPlanCard";
import { PantryRow } from "./hoje/PantryRow";
import { HojeWeekRecap } from "./semana/HojeWeekRecap";
import { InsightChips } from "./signals/InsightChips";
import { useDiaryActions } from "./useDiaryActions";
import "./hoje/Hoje.css";

/** Volume do toque único de água no "Comece seu dia". */
const START_WATER_ML = 250;
/** Rola até a seção; devolve falso quando ela está oculta em "Editar Hoje". */
const scrollToSection = (id: string) => {
  const section = document.getElementById(id);
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
  return Boolean(section);
};

/** Visão do dia: a semana, anéis no topo, um próximo passo, registros de um toque e o planejamento. */
export function ScreenHoje() {
  const { state, navigate, setDate, editMeal, commit, notify, openInjection, askAgent } = useApp();
  const actions = useDiaryActions();
  const p = state.profile!;
  const firstName = p.name.split(" ")[0];
  const today = localDate();
  const now = localTime();
  const goals = dailyTargets(state, today),
    totals = totalsFor(state.diary, today);
  const [isWaterOpen, setWaterOpen] = useState(false),
    [isMoodOpen, setMoodOpen] = useState(false),
    [isExplainOpen, setExplainOpen] = useState(false),
    [isLayoutOpen, setLayoutOpen] = useState(false);
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
  const [isDoseSheetOpen, setDoseSheetOpen] = useState(false);
  const injectionHeading = useRef<HTMLHeadingElement>(null);
  const { save: saveInjection, isBusy: isSavingInjection } = useInjectionSave();
  /** "Registrar aplicação" do card promovido: confirma na folha e fica no Hoje, com "Desfazer". */
  const registerRecipe = async (when: DoseWhen) => {
    const recipe = injectionModel.recipe;
    if (!recipe) return;
    const saved = await saveInjection(fieldsFromPlan(planFromRecipe(recipe), when), { editing: null, stay: true });
    if (!saved) return;
    setDoseSheetOpen(false);
    // O botão promovido some com o registro: o foco vai para o título do card.
    requestAnimationFrame(() => injectionHeading.current?.focus());
  };
  // A única voz proativa do Hoje: o Resumo junta recado do dia, alerta da caneta, sinais e ajuste da meta.
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
    else if (action.kind === "chat") navigate("agente");
    else setExplainOpen(true);
  };
  const dismissInsight = (key: string) => void commit((s) => dismissSignal(s, key, today));
  /** Atalhos do Hoje registram sempre no dia de hoje, mesmo que o Diário esteja em outra data. */
  const addMealToday = (category?: string) => {
    setDate(today);
    editMeal(null, category ? { category } : undefined);
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
    else if (action.kind === "chat") navigate("agente");
    else askAgent(insight.prompt);
  };
  const celebrates = canCelebrate(p);
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
        onSeeAll={() => {
          setDate(today);
          navigate("diario");
        }}
      />
    ),
    habits: (
      <Combinados
        habits={habits}
        today={today}
        onToggle={(id) => void toggleHabit(id)}
        onRemove={removeHabit}
        onCreate={createHabit}
        canCelebrate={celebrates}
        isCalm={isCalmOn(p, today)}
      />
    ),
    injection: showsInjections && (
      <InjectionCard
        model={injectionModel}
        headingRef={injectionHeading}
        onOpen={() => openInjection(null)}
        onRegister={() => setDoseSheetOpen(true)}
        onMood={() => setMoodOpen(true)}
      />
    ),
    diet: <DietPlanCard />,
    pantry: <PantryRow />,
  };
  const visibleSections = parseHomeLayout(p.homeLayout).filter(
    (section) => !section.isHidden && sections[section.key],
  );
  // No dia estimado, o card sobe na mesma lista (mesmas chaves): nada remonta.
  const homeOrder = injectionModel.isPromoted
    ? [
        ...visibleSections.filter((s) => s.key === "injection"),
        ...visibleSections.filter((s) => s.key !== "injection"),
      ]
    : visibleSections;
  // Grade de 12 colunas no desktop (SIS-12): pares, pilhas ou linha inteira na ordem da pessoa;
  // abaixo de 1024 px, uma coluna.
  const cells = bentoLayout(
    homeOrder.map((section) => section.key),
    { hasHabits: habits.length > 0 },
  );

  return (
    <Page title={`Olá, ${firstName}.`}>
      {/* A ordem do DOM é a ordem visual em qualquer largura: leitor de tela e Tab seguem a grade. */}
      <div className="hoje-grid" data-testid="hoje-grid">
        <div className="hoje-week">
          <WeekStrip
            value={today}
            label="Esta semana"
            range="week"
            onChange={(day) => {
              setDate(day);
              navigate("diario");
            }}
          />
        </div>
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
            scrollToSection("hoje-combinados") ||
            notify("Os combinados estão ocultos. Use “Editar Hoje” para mostrá-los.", "info")
          }
          onExplain={() => setExplainOpen(true)}
        />
        <div className="hoje-lead-side">
          {goals.reason && <div className="notice">{goals.reason}</div>}
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
        </div>
        <HojeWeekRecap today={today} />
        {homeOrder.map((section) => (
          <div
            key={section.key}
            className="hoje-slot"
            data-section={section.key}
            data-span={cells[section.key]?.span}
            data-rows={cells[section.key]?.rows === 2 ? 2 : undefined}
          >
            {sections[section.key]}
          </div>
        ))}
        <button type="button" className="home-edit" onClick={() => setLayoutOpen(true)}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          Editar Hoje
        </button>
      </div>

      {isWaterOpen && (
        <Modal title="Registrar água" onClose={() => setWaterOpen(false)}>
          <QuickEntryForm type="agua" onDone={() => setWaterOpen(false)} />
        </Modal>
      )}
      {isMoodOpen && (
        <Modal title="Registrar bem-estar" onClose={() => setMoodOpen(false)}>
          <QuickEntryForm type="bem_estar" entry={latestMood ?? undefined} onDone={() => setMoodOpen(false)} />
        </Modal>
      )}
      {isExplainOpen && (
        <BalanceExplain consumed={totals.calories} goals={goals} onClose={() => setExplainOpen(false)} />
      )}
      {isLayoutOpen && (
        <HomeLayoutSheet unavailable={showsInjections ? [] : ["injection"]} onClose={() => setLayoutOpen(false)} />
      )}
      {isDoseSheetOpen && injectionModel.recipe && (
        <ConfirmDoseSheet
          plan={planFromRecipe(injectionModel.recipe)}
          initial={{ site: injectionModel.recipe.site, date: today, time: localTime() }}
          isEditable
          suggestedSite={injectionModel.summary.suggestedSite}
          injections={state.injections}
          perMonth={p.weightLossPenPerMonth}
          today={today}
          isBusy={isSavingInjection}
          onConfirm={(when) => void registerRecipe(when)}
          onClose={() => setDoseSheetOpen(false)}
          onOtherDose={() => openInjection(null, "form")}
        />
      )}
    </Page>
  );
}
