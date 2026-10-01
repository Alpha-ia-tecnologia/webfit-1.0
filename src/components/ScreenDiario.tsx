import { useEffect, useMemo, useState } from "react";
import {
  Apple,
  Coffee,
  CookingPot,
  Heart,
  Plus,
  Sandwich,
  Search,
  Syringe,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "../lib/context";
import { groupDiaryDay, mealWord, type DiarySearchHit } from "../lib/diary-day";
import { dailyTargets, localDate, totalsFor } from "../lib/domain";
import type { DiaryEntry } from "../types";
import { MealCard, type MealCardTone } from "./meal/MealCard";
import { Card, Empty, Modal, Page } from "./UI";
import { QuickEntryForm } from "./QuickEntryForm";
import { BalanceExplain } from "./hoje/BalanceExplain";
import { BalanceCard } from "./diario/BalanceCard";
import { MealGroupCard } from "./diario/MealGroupCard";
import { InjectionRow, WATER_QUICK_ML, WaterLine, WellbeingRow } from "./diario/DayRows";
import { DiarySearch } from "./diario/DiarySearch";
import { QualityCard } from "./diario/QualityCard";
import { useDiaryActions } from "./useDiaryActions";
import "./diario/Diario.css";

/** Vaga de refeição sem registro: ícone e tom de cada uma (lanche azul: rosa é só para erro). */
const PENDING_SLOTS: Record<string, { icon: LucideIcon; tone: MealCardTone }> = {
  "Café da manhã": { icon: Coffee, tone: "amber" },
  Almoço: { icon: Sandwich, tone: "mint" },
  Lanche: { icon: Apple, tone: "sky" },
  Jantar: { icon: CookingPot, tone: "indigo" },
};

/**
 * Diário do dia escolhido: balanço [Meta] − [Consumido] = [Restam], refeições agrupadas por tipo,
 * uma linha de água, bem-estar e aplicações; a lupa busca em todo o histórico.
 */
export function ScreenDiario() {
  const { state, date, setDate, editMeal, openInjection } = useApp();
  const p = state.profile!;
  const actions = useDiaryActions();
  const [edit, setEdit] = useState<DiaryEntry | null>(null),
    [isWellOpen, setWellOpen] = useState(false),
    [isExplainOpen, setExplainOpen] = useState(false),
    [isSearchOpen, setSearchOpen] = useState(false),
    [highlightId, setHighlightId] = useState<string | null>(null);
  const today = localDate();
  const totals = totalsFor(state.diary, date),
    goals = dailyTargets(state, date);
  const day = useMemo(
    () => groupDiaryDay({ diary: state.diary, injections: state.injections, date }),
    [state.diary, state.injections, date],
  );
  const usesPen = p.weightLossPen === "sim" || state.injections.length > 0;
  const addMeal = (category: string) => editMeal(null, { category });
  // Um resultado da busca abre o dia dele e rola até o registro, que fica destacado por um instante.
  useEffect(() => {
    if (!highlightId) return;
    const frame = requestAnimationFrame(() =>
      document
        .querySelector(`[data-entry-id="${CSS.escape(highlightId)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [highlightId, date]);
  const pick = (hit: DiarySearchHit) => {
    setSearchOpen(false);
    setDate(hit.date);
    setHighlightId(hit.id);
  };
  // Conceito 03: a lupa fica no cabeçalho, ao lado do calendário (o App põe o calendário e tira o sino).
  const header = {
    actions: (
      <button type="button" className="icon-btn" aria-label="Buscar no diário" onClick={() => setSearchOpen(true)}>
        <Search size={20} aria-hidden="true" />
      </button>
    ),
  };
  return (
    <Page title="Meu diário" header={header}>
      <BalanceCard
        totals={totals}
        goals={goals}
        hideCalories={p.hideCalories}
        isToday={date === today}
        onExplain={() => setExplainOpen(true)}
      />

      {day.isEmpty && (
        <Card className="diary-empty">
          <Empty art="diary">Nenhum registro encontrado para este dia. Seus primeiros registros aparecerão aqui.</Empty>
        </Card>
      )}

      <section className="diary-section stagger-2" aria-labelledby="diary-meals-title">
        <h2 id="diary-meals-title" aria-describedby="diary-count">
          Refeições
        </h2>
        <p id="diary-count" className="sr-only">
          {day.count} {day.count === 1 ? "registro" : "registros"} neste dia
        </p>
        {day.meals.map((group) => (
          <MealGroupCard
            key={group.category}
            group={group}
            hideCalories={p.hideCalories}
            repeatLabel={date === today ? "Repetir agora" : "Repetir hoje"}
            highlightId={highlightId}
            onAdd={addMeal}
            onEdit={(entry) => editMeal(entry)}
            onRepeat={(entry) => void actions.repeatMeal(entry.items ?? [])}
            onRemove={(entry) => actions.removeEntry(entry.id)}
          />
        ))}
        {/* Refeições do dia ainda sem registro: vagas tracejadas de meia largura, sem cobrança. */}
        {day.pending.length > 0 && (
          <div className="diary-pending" role="group" aria-label="Adicionar refeição">
            {day.pending.map((category) => {
              const slot = PENDING_SLOTS[category] ?? PENDING_SLOTS.Jantar;
              return (
                <MealCard
                  key={category}
                  variant="slot"
                  compact
                  title={category}
                  icon={slot.icon}
                  tone={slot.tone}
                  subtitle={
                    <span className="diary-pending-add">
                      <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
                      Adicionar
                    </span>
                  }
                  onPress={() => addMeal(category)}
                  pressLabel={`Adicionar ${mealWord(category)}`}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="diary-section stagger-3" aria-labelledby="diary-water-title">
        <h2 id="diary-water-title">Água e bem-estar</h2>
        <WaterLine
          totalMl={day.water.totalMl}
          goalMl={goals.water}
          entries={day.water.entries}
          highlightId={highlightId}
          onAdd={() => void actions.addWater(WATER_QUICK_ML, date)}
          onEdit={setEdit}
          onRemove={actions.removeEntry}
        />
        {day.wellbeing.map((entry) => (
          <WellbeingRow
            key={entry.id}
            entry={entry}
            isHighlighted={highlightId === entry.id}
            onEdit={() => setEdit(entry)}
            onRemove={() => actions.removeEntry(entry.id)}
          />
        ))}
        <button type="button" className="text-btn" onClick={() => setWellOpen(true)}>
          <Heart size={15} aria-hidden="true" />
          Registrar bem-estar
        </button>
      </section>

      <QualityCard date={date} />

      {(day.injections.length > 0 || usesPen) && (
        <section className="diary-section stagger-5" aria-labelledby="diary-injection-title">
          <h2 id="diary-injection-title">Medicação injetável</h2>
          {day.injections.map((entry) => (
            <InjectionRow
              key={entry.id}
              entry={entry}
              isHighlighted={highlightId === entry.id}
              onEdit={() => openInjection(entry)}
              onRemove={() => actions.removeInjection(entry.id)}
            />
          ))}
          {usesPen && (
            <button type="button" className="text-btn" onClick={() => openInjection(null)}>
              <Syringe size={15} aria-hidden="true" />
              Registrar aplicação
            </button>
          )}
        </section>
      )}

      {edit && edit.type !== "refeicao" && (
        <Modal title="Editar registro" onClose={() => setEdit(null)}>
          <QuickEntryForm entry={edit} type={edit.type} onDone={() => setEdit(null)} />
        </Modal>
      )}
      {isWellOpen && (
        <Modal title="Registrar bem-estar" onClose={() => setWellOpen(false)}>
          <QuickEntryForm type="bem_estar" onDone={() => setWellOpen(false)} />
        </Modal>
      )}
      {isExplainOpen && (
        <BalanceExplain consumed={totals.calories} goals={goals} onClose={() => setExplainOpen(false)} />
      )}
      {isSearchOpen && <DiarySearch onPick={pick} onClose={() => setSearchOpen(false)} />}
    </Page>
  );
}
