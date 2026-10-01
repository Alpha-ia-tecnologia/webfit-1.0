import { useState } from "react";
import { Check, Pencil, Plus } from "lucide-react";
import { HABIT_SUGGESTIONS } from "../../data/habit-suggestions";
import { circumference, ringSegments } from "../../lib/charts";
import { habitWeek, habitWeekLabel } from "../../lib/habit-week";
import type { HabitItem } from "../../types";
import { OverflowMenu } from "../OverflowMenu";
import { Empty, Field } from "../UI";
import { WeekDots } from "../meal/WeekDots";
import { habitIcon } from "./habitIcon";
import { useCelebration } from "./useCelebration";
import { tapFeedback } from "../../lib/haptics";

type Props = {
  habits: HabitItem[];
  today: string;
  onToggle: (id: string) => void;
  onRemove: (habit: HabitItem) => void;
  onCreate: (title: string, time: string) => Promise<boolean>;
  /** Brilho ao fechar os combinados do dia; desligado para perfis sensíveis. */
  canCelebrate?: boolean;
  /** Perfil calmo (sensível ou menor): sem os pontos da semana nem a contagem de dias. */
  isCalm?: boolean;
};

/** Anel de 24 px dividido em um segmento por combinado. */
function SegmentRing({ done, total }: { done: number; total: number }) {
  const radius = 9.5;
  return (
    <svg className="segment-ring" viewBox="0 0 24 24" aria-hidden="true">
      {ringSegments(radius, Math.max(total, 1), 3).map((segment, i) => (
        <circle
          key={i}
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          stroke={i < done ? "var(--wf-tone-habit-fg)" : "var(--wf-surface-2)"}
          strokeDasharray={`${segment.length} ${circumference(radius)}`}
          strokeDashoffset={segment.offset}
          transform="rotate(-90 12 12)"
        />
      ))}
    </svg>
  );
}

/** Uma linha: ícone redondo, título, "Feito" ou o horário, os 7 pontos da semana e o check de 40 px. */
function HabitRow({
  habit,
  today,
  isCalm,
  isEditing,
  onToggle,
  onRemove,
}: {
  habit: HabitItem;
  today: string;
  isCalm: boolean;
  isEditing: boolean;
  onToggle: (id: string) => void;
  onRemove: (habit: HabitItem) => void;
}) {
  const isDone = habit.completedDates.includes(today);
  const { icon: Icon, tone } = habitIcon(habit.title);
  const week = isCalm ? null : habitWeek(habit, today);
  const status = isDone ? "feito hoje" : `às ${habit.timeOfDay}`;
  const name = [habit.title, status, week ? habitWeekLabel(week) : null].filter(Boolean).join(", ");
  return (
    <li className={`combinado ${isDone ? "done" : ""} tone-${tone}`}>
      <label>
        <input
          type="checkbox"
          className="sr-only"
          checked={isDone}
          aria-label={name}
          onChange={() => {
            tapFeedback();
            onToggle(habit.id);
          }}
        />
        <span className="combinado-icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <span className="combinado-text" aria-hidden="true">
          <span className="combinado-title">{habit.title}</span>
          <span className="combinado-sub">
            <span className="combinado-tag">{isDone ? "Feito" : habit.timeOfDay}</span>
            {week && <WeekDots states={week} label={habitWeekLabel(week)} />}
          </span>
        </span>
        <span className="combinado-check" aria-hidden="true">
          {isDone && <Check size={20} strokeWidth={3} />}
        </span>
      </label>
      {isEditing && (
        <OverflowMenu
          label={`Opções de ${habit.title}`}
          variant="ghost"
          items={[{ label: "Excluir combinado", onSelect: () => onRemove(habit) }]}
        />
      )}
    </li>
  );
}

/** Combinados do dia: marcar é um toque; criar e excluir ficam no menu ⋯ (excluir pode ser desfeito). */
export function Combinados({
  habits,
  today,
  onToggle,
  onRemove,
  onCreate,
  canCelebrate = false,
  isCalm = false,
}: Props) {
  const [isAdding, setAdding] = useState(false);
  const [isEditing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [isExpanded, setExpanded] = useState(false);
  const done = habits.filter((h) => h.completedDates.includes(today)).length;
  const allDone = habits.length > 0 && done === habits.length;
  const showList = !allDone || isExpanded || isEditing;
  const isCelebrating = useCelebration(allDone, canCelebrate, done);
  const menu = (
    <OverflowMenu
      label="Opções dos combinados"
      className="combinados-more"
      items={[
        { label: "Novo combinado", icon: Plus, onSelect: () => setAdding(true) },
        ...(habits.length
          ? [{ label: "Editar combinados", icon: Pencil, onSelect: () => setEditing(true) }]
          : []),
      ]}
    />
  );
  return (
    <section
      className={`card combinados stagger-4 ${isCelebrating ? "is-celebrating" : ""}`}
      id="hoje-combinados"
      aria-labelledby="combinados-title"
    >
      <div className="combinados-head">
        <h2 id="combinados-title">Combinados</h2>
        {habits.length > 0 && (
          <span className="combinados-count" role="img" aria-label={`${done} de ${habits.length} feitos`}>
            <SegmentRing done={done} total={habits.length} />
            <strong>{done}</strong>
            <small>/{habits.length}</small>
          </span>
        )}
        {isEditing ? (
          <button type="button" className="text-btn combinados-finish" onClick={() => setEditing(false)}>
            Concluir
          </button>
        ) : (
          menu
        )}
      </div>
      {isAdding && (
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onCreate(title, time)) {
              setTitle("");
              setAdding(false);
            }
          }}
        >
          <Field label="Nome do combinado">
            <input
              required
              minLength={2}
              maxLength={150}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: fazer uma pausa para caminhar"
            />
          </Field>
          <Field label="Horário">
            <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>
              Cancelar
            </button>
            <button className="btn">Salvar combinado</button>
          </div>
        </form>
      )}
      {!habits.length ? (
        <div>
          <Empty art="habits">Escolha um pequeno passo para começar.</Empty>
          {!isAdding && (
            <div className="suggestion-chips">
              {HABIT_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.title}
                  type="button"
                  className="quick-chip"
                  onClick={() => {
                    setTitle(suggestion.title);
                    setTime(suggestion.timeOfDay);
                    setAdding(true);
                  }}
                >
                  {suggestion.title}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {allDone && !isEditing && (
            <button type="button" className="combinados-done" onClick={() => setExpanded(!isExpanded)}>
              <Check size={16} strokeWidth={3} aria-hidden="true" />
              Tudo feito hoje
              <span className="link-btn">{isExpanded ? "Ocultar" : "Ver"}</span>
            </button>
          )}
          {showList && (
            <ul className="combinado-list">
              {habits.map((h) => (
                <HabitRow
                  key={h.id}
                  habit={h}
                  today={today}
                  isCalm={isCalm}
                  isEditing={isEditing}
                  onToggle={onToggle}
                  onRemove={onRemove}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
