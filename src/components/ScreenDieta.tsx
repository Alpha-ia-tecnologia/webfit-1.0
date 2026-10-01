import { useId, useState } from "react";
import { ClipboardList, FileText, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useApp } from "../lib/context";
import { SETTINGS_TAB } from "../lib/copy";
import { isSensitive } from "../lib/day";
import { dietChips, isDietPlanStale } from "../lib/diet";
import { PLAN_TIMES_NOTE, SLOT_CATEGORY, type DietMeal } from "../lib/diet-plan";
import {
  planDayStatus,
  planMealStates,
  PLAN_DAY_COPY,
  swapStatus,
  type DayPlan,
  type PlanDayStatus,
  type PlanMealState,
} from "../lib/diet-week";
import { dailyTargets, localDate, totalsFor } from "../lib/domain";
import { fmtNumber, fmtRelDate } from "../lib/format";
import { isCalmProfile } from "../lib/space";
import { visiblePlainText } from "../lib/text";
import { AiProgress, AiResultSkeleton } from "./AiProgress";
import { DietStructured } from "./dieta/DietStructured";
import type { TimelineToday } from "./dieta/DietTimeline";
import { DietWeek } from "./dieta/DietWeek";
import type { PlanMealHandlers } from "./dieta/MealActions";
import { PlanDayHeader, type DayGoal } from "./dieta/PlanDayHeader";
import { PlanProgress, type PlanStep } from "./dieta/PlanProgress";
import { PlanShortcuts } from "./dieta/PlanShortcuts";
import { OverflowMenu } from "./OverflowMenu";
import { RichText } from "./RichText";
import { Card, Page } from "./UI";
import { useBodyNumbersHidden } from "./useBodyNumbersHidden";
import {
  useMinuteClock,
  useNextPlannedMeal,
  usePlanDay,
  usePlanMealEat,
  usePlannedMealRegister,
  usePlanWeek,
  useStructuredPlan,
} from "./usePlannedMeal";
import "./Dieta.css";
import "./dieta/PlanDay.css";

/** Sem "Trocar" ainda: referência estável (a memória do dia não refaz a conta a cada render). */
const NO_SWAPS: Readonly<Record<number, number>> = {};
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
function AboutDiet({
  highlights,
  hasTimes,
  createdAt,
}: {
  highlights: readonly string[];
  hasTimes: boolean;
  createdAt: string | null;
}) {
  return (
    <>
      {highlights.length > 0 && (
        <>
          <h3>Resumo</h3>
          <ul className="diet-highlights">
            {highlights.map((highlight, index) => (
              <li key={`${index}-${highlight}`}>{highlight}</li>
            ))}
          </ul>
        </>
      )}
      {hasTimes && <p>{PLAN_TIMES_NOTE}</p>}
      <p>
        Sugestão alimentar educativa gerada por IA, com revisão automática. Se você segue um plano
        profissional, ele continua sendo a referência.
      </p>
      {createdAt && (
        <p>
          Gerada em{" "}
          {new Date(createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} ·
          plano de um dia. Ao gerar novamente, a nova dieta substitui esta; as versões anteriores
          continuam na conversa do agente.
        </p>
      )}
    </>
  );
}

export function ScreenDieta() {
  const {
    state,
    navigate,
    aiReady,
    aiBusy,
    aiStage,
    dietBusy,
    dietSaving,
    dietError,
    dietProgress,
    requestDietPlan,
    cancelAi,
    askAgent,
  } = useApp();
  const textId = useId();
  const staleId = useId();
  const [isTextOpen, setTextOpen] = useState(false);
  const profile = state.profile!;
  const plan = state.dietPlan;
  const stale = !!plan && isDietPlanStale(plan, profile);
  const sensitive = isSensitive(profile);
  const today = localDate();
  const now = useMinuteClock();
  // Plano estruturado já sem gramas (perfil sensível) e com calorias mascaradas.
  const view = useStructuredPlan();
  const hideBody = useBodyNumbersHidden();
  // Semana do plano (IA-X5) e "Trocar" (AGENTE-09): só em memória; outro plano ou outro dia zera.
  const dayKey = `${plan?.id ?? ""}|${today}`;
  const fresh: DayChoice = { key: dayKey, selected: today, extra: NO_SWAPS };
  const [choice, setChoice] = useState<DayChoice>(fresh);
  const day = choice.key === dayKey ? choice : fresh;
  const updateDay = (change: (current: DayChoice) => DayChoice) =>
    setChoice((current) => change(current.key === dayKey ? current : fresh));
  const todayDay = usePlanDay(today, day.extra);
  const selectedDay = usePlanDay(day.selected);
  const week = usePlanWeek(today);
  const isPreview = !stale && day.selected !== today;
  const shownDay = isPreview ? selectedDay : todayDay;
  const next = useNextPlannedMeal(todayDay?.plan);
  const status: PlanDayStatus | null = todayDay ? planDayStatus(todayDay.plan, state.diary, today) : null;
  const calm = isCalmProfile(profile, today);
  const eat = usePlanMealEat();
  const register = usePlannedMealRegister();
  const [eating, setEating] = useState<number | null>(null);
  const eatMeal = async (meal: DietMeal, index: number) => {
    setEating(index);
    try {
      await eat(meal);
    } finally {
      setEating(null);
    }
  };
  const swapMeal = (index: number) =>
    updateDay((current) => ({
      ...current,
      extra: { ...current.extra, [index]: (current.extra[index] ?? 0) + 1 },
    }));
  const isToday = !!todayDay && !!status && !isPreview && !stale;
  const states =
    todayDay && status ? planMealStates(todayDay.plan, status.registeredAt, next?.index ?? null, now) : [];
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
        kcal={consumedText(
          totalsFor(state.diary, today).calories,
          goal,
          !calm && !profile.hideCalories,
        )}
        steps={planSteps(todayDay, states, calm)}
      />
    ) : null;
  const canGenerate = profile.consentAi && aiReady && !aiBusy && !dietBusy;
  const generate = () => void requestDietPlan();
  const openAnamnese = () => navigate("anamnese");
  const openText = () => {
    setTextOpen(true);
    requestAnimationFrame(() => document.getElementById(textId)?.scrollIntoView({ block: "center" }));
  };
  const updatedAt = plan && fmtRelDate(localDate(new Date(plan.createdAt)), today);
  const error = dietError && visiblePlainText(dietError, profile.hideCalories, hideBody);
  const menu = plan ? (
    <OverflowMenu
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
      <DietWeek
        days={week}
        value={day.selected}
        onChange={(date) => updateDay((current) => ({ ...current, selected: date }))}
      />
    ) : null;
  return (
    <Page title="Minha dieta" header={{ actions: menu, hideBell: true }}>
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
          <div className="notice">
            <p>
              Para criar sua dieta, autorize o envio da anamnese ao agente em Meu espaço →{" "}
              {SETTINGS_TAB.label}.
            </p>
            <button type="button" className="text-btn" onClick={() => navigate("espaco")}>
              Abrir Meu espaço
            </button>
          </div>
        ) : (
          !aiReady && (
            <div className="notice">
              O agente ainda não está conectado. Sua anamnese está salva; a dieta pode ser gerada
              quando a conexão voltar.
            </div>
          )
        )}
        {!plan && !dietBusy && (
          <div className="form-actions">
            <button type="button" className="btn" disabled={!canGenerate} onClick={generate}>
              <Sparkles size={17} />
              {dietError ? "Tentar novamente" : "Gerar minha dieta"}
            </button>
            <button type="button" className="btn-secondary" onClick={openAnamnese}>
              <ClipboardList size={17} />
              Revisar anamnese
            </button>
          </div>
        )}
      </PlanDayHeader>

      {dietBusy && (
        <AiProgress
          title={dietSaving ? "Salvando sua dieta" : "Criando sua dieta"}
          detail={dietSaving ? undefined : dietProgress || undefined}
          progress={dietSaving ? null : aiStage}
          mode={dietProgress ? "exam" : "diet"}
          note="Você pode continuar usando o app."
          onCancel={dietSaving ? undefined : cancelAi}
          cancelLabel="Cancelar geração"
        />
      )}
      {dietBusy && !plan && <AiResultSkeleton rows={4} />}
      {!dietBusy && error && (
        <div className="diet-error">
          <p role="alert" className="notice">
            {error}
          </p>
          {plan && !stale && (
            <button
              type="button"
              className="btn-secondary"
              disabled={!canGenerate}
              onClick={generate}
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}
      {!dietBusy && aiBusy && (
        <p className="hint">Aguarde a solicitação atual do agente para gerar sua dieta.</p>
      )}
      {plan && stale && !dietBusy && (
        <section className="diet-stale" aria-labelledby={staleId}>
          <span className="diet-stale-icon" aria-hidden="true">
            <RefreshCw size={18} />
          </span>
          <div>
            <h2 id={staleId}>Seu plano precisa ser atualizado</h2>
            <p>Sua anamnese mudou desde esta dieta.</p>
          </div>
          <button type="button" className="btn" disabled={!canGenerate} onClick={generate}>
            {dietError ? "Tentar novamente" : "Atualizar dieta"}
          </button>
        </section>
      )}
      {plan && view && (
        <DietStructured
          plan={plan}
          view={!stale && shownDay ? shownDay.plan : view}
          stale={stale}
          sensitive={sensitive}
          calm={calm}
          hideCalories={profile.hideCalories}
          dayNote={
            isPreview ? (
              <p className="diet-preview-note">{PLAN_DAY_COPY.preview(day.selected)}</p>
            ) : null
          }
          swaps={stale ? undefined : shownDay?.meals.map((meal) => meal.swaps)}
          today={timelineToday}
          week={weekStrip}
          textId={textId}
          isTextOpen={isTextOpen}
          onToggleText={() => setTextOpen(!isTextOpen)}
        />
      )}
      {plan && !view && (
        <Card className={`diet-plan${stale ? " is-stale" : ""}`}>
          {stale && <span className="diet-plan-tag">Versão anterior</span>}
          <RichText
            text={plan.text}
            hideCalories={profile.hideCalories}
            className="diet-text"
            testId="diet-plan-text"
          />
          {plan.meta.notes.length > 0 && (
            <div className="notice">
              {plan.meta.notes.map((note, i) => (
                <p key={i}>{visiblePlainText(note, profile.hideCalories, hideBody)}</p>
              ))}
            </div>
          )}
          <p className="diet-plan-foot">
            <ShieldCheck size={14} aria-hidden="true" />
            Apoio educativo · revisão automática, sem revisão humana
          </p>
        </Card>
      )}
      {plan && !view && <PlanShortcuts tips={[]} />}
    </Page>
  );
}
