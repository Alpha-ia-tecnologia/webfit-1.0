import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Bell,
  Check,
  ClipboardList,
  Droplets,
  LineChart,
  Sprout,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { HABIT_SUGGESTIONS } from "../../data/habit-suggestions";
import { motion as motionTokens } from "../../design/tokens";
import { useApp } from "../../lib/context";
import { localDate, localTime, uid } from "../../lib/domain";
import { fmtMl } from "../../lib/format";
import { tapFeedback } from "../../lib/haptics";
import {
  addStarterHabit,
  recordStarterWater,
  removeStarterWater,
  restoreStarterWater,
  STARTER_UNLOCKS,
  toggleStarterHabit,
} from "../../lib/starter";
import type { DiaryEntry } from "../../types";
import { OverflowMenu } from "../OverflowMenu";
import { Card, Empty } from "../UI";
import { StarterDataSheet } from "./StarterDataSheet";
import { WaterCups } from "./WaterCups";

const UNLOCK_ICONS = [ClipboardList, UtensilsCrossed, Bell, LineChart] as const;
const RECENT_MAX = 10;
const CHECK_SPRING = { type: "spring" as const, ...motionTokens.spring.snappy };

/**
 * Início do primeiro acesso (ESPACO-12): combinados com marca redonda, água em copos (só o que
 * foi bebido), registros recentes com "⋯ → Remover" e Desfazer, o que a anamnese libera e os
 * dados numa folha. Nada aqui chama a IA.
 */
export function StarterHome({
  onPersonalize,
  busy,
  onReset,
}: {
  onPersonalize: () => void;
  busy: boolean;
  onReset: () => void;
}) {
  const { state, commit } = useApp();
  const reducedMotion = !!useReducedMotion();
  const [dataOpen, setDataOpen] = useState(false);
  const today = localDate();
  const habits = state.habits.filter((habit) => habit.createdDate <= today);
  const water = state.diary
    .filter((entry) => entry.type === "agua" && entry.date === today)
    .reduce((sum, entry) => sum + (entry.amountMl ?? 0), 0);
  const recent = state.diary
    .slice()
    .sort(
      (a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time),
    )
    .slice(0, RECENT_MAX);
  const firstName = String(state.draft?.name ?? "").trim().split(/\s+/)[0];

  const addWater = () => {
    const id = uid();
    const timestamp = new Date().toISOString();
    tapFeedback();
    void commit(
      (current) => recordStarterWater(current, today, localTime(), timestamp, id),
      "250 ml registrados.",
      {
        label: "Desfazer",
        onAction: () =>
          void commit(
            (current) => removeStarterWater(current, id),
            "Registro desfeito.",
          ),
      },
    );
  };
  const removeWater = (entry: DiaryEntry) =>
    void commit((current) => removeStarterWater(current, entry.id), "Registro removido.", {
      label: "Desfazer",
      onAction: () =>
        void commit(
          (current) => restoreStarterWater(current, entry),
          "Registro restaurado.",
        ),
    });

  return (
    <div className="starter-entry">
      <div className="starter-intro">
        <span className="starter-mark" aria-hidden="true">
          <Sprout size={28} />
        </span>
        <p className="eyebrow">Um pequeno passo por dia</p>
        <h1>Olá, {firstName}.</h1>
        <p className="muted">
          Registre o que você fez hoje. Amanhã é uma nova oportunidade de
          continuar.
        </p>
      </div>
      <Card>
        <h2>Seu combinado de hoje</h2>
        {habits.length ? (
          <div className="stack">
            {habits.map((habit) => {
              const isDone = habit.completedDates.includes(today);
              return (
                <label
                  className={`starter-habit ${isDone ? "is-done" : ""}`}
                  key={habit.id}
                >
                  {/* Checkbox nativo, transparente sobre a linha inteira (alvo de toque e nome pelo texto). */}
                  <input
                    type="checkbox"
                    className="starter-habit-input"
                    checked={isDone}
                    onChange={() => {
                      tapFeedback();
                      void commit((current) =>
                        toggleStarterHabit(current, habit.id, today),
                      );
                    }}
                  />
                  <span className="starter-check" aria-hidden="true">
                    {isDone && (
                      <motion.span
                        className="starter-check-mark"
                        initial={reducedMotion ? false : { scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={reducedMotion ? { duration: 0 } : CHECK_SPRING}
                      >
                        <Check size={18} strokeWidth={3} />
                      </motion.span>
                    )}
                  </span>
                  <span className="starter-habit-text">
                    {habit.title}
                    <small>{isDone ? "Feito hoje" : habit.timeOfDay}</small>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <>
            <Empty art="habits">Escolha algo simples para experimentar hoje.</Empty>
            <div className="stack">
              {HABIT_SUGGESTIONS.map((suggestion, index) => (
                <button
                  key={suggestion.title}
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const id = uid();
                    void commit((current) =>
                      addStarterHabit(current, index, today, id),
                    );
                  }}
                >
                  {suggestion.title}
                </button>
              ))}
            </div>
          </>
        )}
      </Card>
      <Card className="starter-water-card">
        <h2>Água registrada hoje</h2>
        <strong className="starter-water" data-testid="starter-water-total">
          {water.toLocaleString("pt-BR")} ml
        </strong>
        <WaterCups ml={water} />
        <p className="hint">
          Registre apenas o que você bebeu. Nenhuma meta de água foi definida.
        </p>
        <button type="button" className="btn-secondary" onClick={addWater}>
          <Droplets size={17} aria-hidden="true" />
          Registrar 250 ml
        </button>
      </Card>
      <Card>
        <h2>Seus registros recentes</h2>
        {recent.length ? (
          <ul className="starter-records">
            {recent.map((entry) => (
              <li key={entry.id}>
                <span>
                  {entry.type === "agua"
                    ? `${fmtMl(entry.amountMl ?? 0)} de água`
                    : entry.title}
                  <small>
                    {entry.date.split("-").reverse().join("/")} · {entry.time}
                  </small>
                </span>
                {entry.type === "agua" && (
                  <OverflowMenu
                    label={`Mais ações: água de ${entry.time}`}
                    items={[
                      {
                        label: "Remover",
                        icon: Trash2,
                        onSelect: () => removeWater(entry),
                      },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty art="diary">Os registros que você fizer aparecerão aqui.</Empty>
        )}
        {state.diary.length > RECENT_MAX && (
          <p className="hint">
            Mostrando os 10 mais recentes. O backup inclui todo o histórico.
          </p>
        )}
      </Card>
      <Card>
        <h2>O próximo passo, no seu tempo</h2>
        <p>
          Para personalizar sua alimentação, complete suas informações de
          rotina e saúde. Seus combinados e registros serão mantidos.
        </p>
        <ul className="starter-unlocks" aria-label="O que você libera">
          {STARTER_UNLOCKS.map((text, index) => {
            const Icon = UNLOCK_ICONS[index] ?? ClipboardList;
            return (
              <li key={text}>
                <Icon size={15} aria-hidden="true" />
                {text}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={onPersonalize}
        >
          Personalizar alimentação
        </button>
      </Card>
      <Card>
        <h2>Seus dados</h2>
        <p className="hint">
          Tudo fica neste navegador. Exporte um backup para não perder o
          histórico.
        </p>
        <button
          type="button"
          className="btn-secondary"
          aria-haspopup="dialog"
          onClick={() => setDataOpen(true)}
        >
          Backup e dados
        </button>
      </Card>
      {dataOpen && (
        <StarterDataSheet
          onClose={() => setDataOpen(false)}
          onReset={() => {
            setDataOpen(false);
            onReset();
          }}
        />
      )}
    </div>
  );
}
