import type { ReactNode } from "react";
import { CheckCircle2, ImageDown } from "lucide-react";
import { dayBars, type DayPoint } from "../../lib/evolution";
import { plural } from "../../lib/format";
import { slideTitles, type RecapSlides, type WeekRecap } from "../../lib/week-recap";
import { DayRing } from "../evolucao/ConsistencyCard";
import { InsightChips } from "../evolucao/InsightChips";
import { CrossReadingView, WellbeingWeek } from "../evolucao/WellbeingCard";
import "../evolucao/Evolucao.css";
import "../evolucao/EvolucaoCards.css";
import "../evolucao/Insights.css";
import "./WeekRecap.css";

/** Mesma ordem e cores do anel de consistência: água, refeição, combinado. */
const PRESENCE = [
  { key: "water", label: "Água" },
  { key: "meal", label: "Refeição" },
  { key: "habit", label: "Combinado" },
] as const;

/** "6 de 11 combinados cumpridos" → contagem em destaque; frases sem contagem ficam como estão. */
function withLead(text: string): ReactNode {
  const match = /^(\d+ de \d+) (.+)$/.exec(text);
  if (!match) return text;
  return (
    <>
      <strong>{match[1]}</strong> {match[2]}
    </>
  );
}

function CoverSlide({ cover }: { cover: RecapSlides["cover"] }) {
  return (
    <>
      <p className="story-range">{cover.range}</p>
      <p className="story-lead">
        <strong>{cover.lead}</strong> dias com registro
      </p>
      <ol className="story-rings" aria-label="Registros de cada dia da semana">
        {cover.days.map((day, i) => (
          <li key={day.date}>
            <span className="story-ring" aria-hidden="true">
              <DayRing day={day} />
            </span>
            <span className="story-ring-day" aria-hidden="true">
              {cover.weekdays[i]}
            </span>
            <span className="sr-only">{day.aria}</span>
          </li>
        ))}
      </ol>
      <ul className="consist-legend" aria-hidden="true">
        {PRESENCE.map((p) => (
          <li key={p.key}>
            <i className={`is-${p.key}`} />
            {p.label}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Barras de água dos 7 dias, sem linha de meta (a escala ignora a meta). */
function WaterBars({ points, label }: { points: readonly DayPoint[]; label: string }) {
  const { bars } = dayBars(
    points.map((p) => ({ ...p, goal: null })),
    "",
  );
  return (
    <div className="story-bars">
      <div className="evol-bars" role="img" aria-label={label}>
        {bars.map((bar) => (
          <span key={bar.date} className={`evol-bar ${bar.hasRecord ? "" : "is-empty"}`}>
            {bar.hasRecord && (
              <span className="evol-bar-fill" style={{ height: `${Math.max(4, bar.heightPct)}%` }} />
            )}
          </span>
        ))}
      </div>
      <div className="evol-bars-labels" aria-hidden="true">
        {bars.map((bar) => (
          <span key={bar.date}>{bar.label}</span>
        ))}
      </div>
    </div>
  );
}

function RoutineSlide({ routine }: { routine: RecapSlides["routine"] }) {
  if (routine.empty) return <p className="story-empty">{routine.empty}</p>;
  const { water, meals } = routine;
  return (
    <>
      {water && (
        <div className="story-block">
          <p className="story-big">
            <strong>{water.average}</strong> <span>{water.caption}</span>
          </p>
          <WaterBars points={water.points} label={water.aria} />
        </div>
      )}
      {meals && <p className="story-line">{withLead(meals)}</p>}
    </>
  );
}

function WellbeingSlide({ wellbeing }: { wellbeing: RecapSlides["wellbeing"] }) {
  if (wellbeing.empty) return <p className="story-empty">{wellbeing.empty}</p>;
  const { trend } = wellbeing;
  return (
    <>
      <InsightChips chips={trend.stats} label="Destaques de bem-estar" />
      <WellbeingWeek days={trend.days} label={trend.aria} />
      <CrossReadingView cross={trend.cross} />
    </>
  );
}

function HabitsSlide({ habits }: { habits: RecapSlides["habits"] }) {
  return (
    <>
      {habits.summary && <p className="story-lead">{withLead(habits.summary)}</p>}
      {habits.items.length > 0 && (
        <ul className="story-habits" aria-label="Combinados da semana">
          {habits.items.map((item) => (
            <li key={item.id}>
              <span className="story-habit-title">{item.title}</span>
              <span className="story-habit-days">{item.text}</span>
            </li>
          ))}
        </ul>
      )}
      {habits.more > 0 && (
        <p className="muted">e mais {plural(habits.more, "combinado", "combinados")}</p>
      )}
      {habits.empty && <p className="story-empty">{habits.empty}</p>}
      {habits.weight && (
        <div className="story-weight">
          <span className="recap-label">Peso de tendência</span>
          <strong className="recap-value">{habits.weight.value}</strong>
          {habits.weight.delta && <span className="recap-delta">{habits.weight.delta}</span>}
        </div>
      )}
    </>
  );
}

function WinsSlide({ wins, onShare }: { wins: RecapSlides["wins"]; onShare: () => void }) {
  return (
    <>
      <ul className="story-wins" aria-label={wins.title}>
        {wins.items.map((win) => (
          <li key={win.key}>
            <CheckCircle2 size={22} aria-hidden="true" />
            <span>{win.text}</span>
          </li>
        ))}
      </ul>
      <div className="story-share">
        <button type="button" className="btn-secondary" onClick={onShare}>
          <ImageDown size={18} aria-hidden="true" />
          Salvar imagem
        </button>
        <p className="hint">Opcional: a imagem é criada neste aparelho.</p>
      </div>
    </>
  );
}

/**
 * Corpo de cada parte dos stories "Sua semana": capa com anéis, água e refeições, bem-estar e sono,
 * combinados (e peso fora do perfil calmo) e conquistas gentis com a imagem opcional.
 */
export function RecapSlide({ recap, index, onShare }: { recap: WeekRecap; index: number; onShare: () => void }) {
  const { slides } = recap;
  const bodies = [
    () => <CoverSlide cover={slides.cover} />,
    () => <RoutineSlide routine={slides.routine} />,
    () => <WellbeingSlide wellbeing={slides.wellbeing} />,
    () => <HabitsSlide habits={slides.habits} />,
    () => <WinsSlide wins={slides.wins} onShare={onShare} />,
  ];
  const body = bodies[index] ?? bodies[0]!;
  return (
    <>
      <h3 className="story-title">{slideTitles(recap)[index]}</h3>
      {body()}
    </>
  );
}
