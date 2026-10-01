import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { dayBars, type DayPoint } from "../../lib/evolution";
import type { SeriesInsight } from "../../lib/progress-insights";
import { dailyChartDescription } from "./chart-geometry";
import { InsightChips } from "./InsightChips";

type Props = {
  /** Nome da série, ex.: "Calorias". */
  title: string;
  icon: LucideIcon;
  /** Cor por domínio: comida, água, proteína ou refeições (sem calorias). */
  tone: "food" | "water" | "protein" | "meals";
  points: DayPoint[];
  today: string;
  /** Unidade da descrição acessível e da média. */
  unit: string;
  /** Formata a média (ex.: 2.200 ml → "2,2"). */
  format: (value: number) => string;
  /** Unidade exibida ao lado da média (ex.: "L"). */
  unitLabel: string;
  /** Texto depois de "média/dia", ex.: "meta 1.645" (gráficos do chat). */
  goalText?: string | null;
  /** Destaques calculados (Evolução): substituem a legenda "média/dia" por chips. */
  insight?: SeriesInsight;
  /** Faixa de referência (proteína). */
  band?: { min: number; max: number } | null;
  emptyText: string;
  /**
   * compact (Evolução, conceito 09): média grande, "média/dia · meta 1.645" e as barras; o cartão
   * inteiro abre os detalhes (período e destaques) com `onOpen`.
   */
  variant?: "full" | "compact";
  onOpen?: () => void;
  /** Nível do título (3 dentro de uma seção; 2 dentro de uma folha). */
  headingLevel?: 2 | 3;
};

/** Barras de 7 ou 28 dias em pixels reais: média no topo, hoje destacado, dia sem registro tracejado. */
export function DayBarsCard({
  title,
  icon: Icon,
  tone,
  points,
  today,
  unit,
  format,
  unitLabel,
  goalText,
  insight,
  band = null,
  emptyText,
  variant = "full",
  onOpen,
  headingLevel = 3,
}: Props) {
  const id = useId();
  const { bars, goal, goalPct, average, bandPct } = dayBars(points, today, band);
  const isLong = points.length > 7;
  const isCompact = variant === "compact";
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const caption = isCompact ? (insight?.goalText ?? goalText ?? null) : goalText;
  return (
    <section
      className={`card evol-mini ${tone} ${isCompact ? "is-compact" : ""}`}
      aria-labelledby={id}
    >
      <header className="evol-mini-head">
        <span className={`evol-icon ${tone}`} aria-hidden="true">
          <Icon size={isCompact ? 20 : 18} />
        </span>
        <Heading id={id}>{title}</Heading>
      </header>
      {average === null ? (
        <p className="evol-mini-empty">{emptyText}</p>
      ) : insight && !isCompact ? (
        <>
          <p className="evol-mini-value">
            <strong>{format(average)}</strong> <small>{unitLabel}/dia</small>
          </p>
          <InsightChips chips={insight.chips} label={`Destaques de ${title}`} />
        </>
      ) : (
        <>
          <p className="evol-mini-value">
            <strong>{format(average)}</strong> <small>{unitLabel}</small>
          </p>
          <p className="evol-mini-caption">
            média/dia{caption ? <> · <b>{caption}</b></> : null}
          </p>
        </>
      )}
      <div
        className={`evol-bars ${isLong ? "is-long" : ""}`}
        role="img"
        aria-label={dailyChartDescription(title, points, unit, goal)}
      >
        {bandPct && (
          <span
            className="evol-bars-band"
            style={{ bottom: `${bandPct.min}%`, height: `${bandPct.max - bandPct.min}%` }}
          />
        )}
        {goalPct !== null && <span className="evol-bars-goal" style={{ bottom: `${goalPct}%` }} />}
        {bars.map((bar) => (
          <span
            key={bar.date}
            className={`evol-bar ${bar.hasRecord ? "" : "is-empty"} ${bar.isToday ? "is-today" : ""}`}
          >
            {bar.hasRecord && (
              <span className="evol-bar-fill" style={{ height: `${Math.max(4, bar.heightPct)}%` }} />
            )}
          </span>
        ))}
      </div>
      <div className={`evol-bars-labels ${isLong ? "is-long" : ""}`} aria-hidden="true">
        {bars.map((bar) => (
          <span key={bar.date} className={bar.isToday ? "is-today" : ""}>
            {isLong ? bar.label : bar.label.charAt(0)}
          </span>
        ))}
      </div>
      {isCompact && onOpen && (
        <button
          type="button"
          className="evol-mini-hit"
          aria-haspopup="dialog"
          aria-label={`${title}: ver detalhes`}
          onClick={onOpen}
        />
      )}
    </section>
  );
}
