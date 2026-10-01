import { useId, useMemo } from "react";
import {
  Beef,
  BookOpen,
  Coffee,
  Droplets,
  Footprints,
  MessageCircle,
  Moon,
  type LucideIcon,
} from "lucide-react";
import type { HabitBlock } from "../../lib/agent-blocks";
import { weekSummary, type WeekRowKey } from "../../lib/block-charts";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/dates";
import { isCalmOn } from "../../lib/day";
import type { Domain } from "../../design/tokens";
import { Pill } from "../Pill";
import { ProgressRow, SegmentMeter } from "../SegmentMeter";
import { HabitChip } from "./ActionCard";

const ROW_ICON: Record<WeekRowKey, LucideIcon> = {
  registros: BookOpen,
  proteina: Beef,
  agua: Droplets,
  sono: Moon,
};
const ROW_TONE: Record<WeekRowKey, Domain> = {
  registros: "food",
  proteina: "food",
  agua: "water",
  sono: "body",
};

/** Ícone decorativo da pergunta sugerida (café, água, caminhada, sono); senão um balão. */
function suggestionIcon(text: string): LucideIcon {
  if (/caf[eé]/i.test(text)) return Coffee;
  if (/[aá]gua|garrafa/i.test(text)) return Droplets;
  if (/caminhad|exerc/i.test(text)) return Footprints;
  if (/sono|dormir/i.test(text)) return Moon;
  return MessageCircle;
}

/**
 * Resumo da semana num cartão só (conceito 05): título curto, as datas, o selo de kcal (neutro,
 * nunca vermelho) e 4 linhas com barra (registros, proteína, água e sono), todas calculadas com os
 * registros locais dos 7 dias que terminam na data da mensagem. No fim, os combinados propostos e
 * as perguntas sugeridas viram chips. Perfil calmo: sem proteína, sem selo e sem chips.
 */
export function WeekSummaryCard({
  endDate,
  title,
  habits,
  suggestions,
  onSuggestion,
}: {
  endDate: string;
  title: string;
  habits: readonly HabitBlock[];
  suggestions: readonly string[];
  onSuggestion: (text: string) => void;
}) {
  const { state } = useApp();
  const titleId = useId();
  const summary = useMemo(() => weekSummary(state, endDate), [state, endDate]);
  const calm = !state.profile || isCalmOn(state.profile, localDate());
  const hasChips = !calm && habits.length + suggestions.length > 0;
  return (
    <section className="week-card" aria-labelledby={titleId} data-testid="week-summary">
      <header className="week-card-head">
        <div className="week-card-heading">
          <h4 id={titleId}>{title}</h4>
          <p>{summary.range}</p>
        </div>
        {summary.kcalBadge && (
          <Pill tone="food" className="week-card-badge">
            {summary.kcalBadge}
          </Pill>
        )}
      </header>
      <ul className="week-card-rows">
        {summary.rows.map((row) => (
          <li key={row.key}>
            <ProgressRow
              icon={ROW_ICON[row.key]}
              tone={ROW_TONE[row.key]}
              label={row.label}
              value={
                <>
                  <span aria-hidden="true">
                    <strong>{row.value}</strong>
                    {row.rest}
                  </span>
                  <span className="sr-only">{row.text}</span>
                </>
              }
            >
              {row.meter && (
                <SegmentMeter
                  value={row.meter.value}
                  total={row.meter.total}
                  mode={row.meter.mode}
                  tone={ROW_TONE[row.key]}
                  size="lg"
                />
              )}
            </ProgressRow>
          </li>
        ))}
      </ul>
      {hasChips && (
        <div className="week-card-chips" role="group" aria-label="Próximos passos da semana">
          {habits.map((habit) => (
            <HabitChip key={habit.titulo} block={habit} />
          ))}
          {suggestions.map((text) => {
            const Icon = suggestionIcon(text);
            return (
              <button
                key={text}
                type="button"
                className="prompt-pill neutral"
                onClick={() => onSuggestion(text)}
              >
                <Icon size={16} aria-hidden="true" />
                {text}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
