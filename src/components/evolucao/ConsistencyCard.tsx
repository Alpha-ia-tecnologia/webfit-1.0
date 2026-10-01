import { CalendarDays } from "lucide-react";
import { useApp } from "../../lib/context";
import { arcPath, thirdArcs } from "../../lib/charts";
import { consistencyCalendar, type ConsistencyDay } from "../../lib/consistency";
import "./EvolucaoCards.css";

const RING_CENTER = 18;
const RING_RADIUS = 15.5;
/** Mesma ordem e folga do anel da semana (Hoje/Diário): água, refeição, combinado. */
const PRESENCE: { key: "water" | "meal" | "habit"; label: string }[] = [
  { key: "water", label: "Água" },
  { key: "meal", label: "Refeição" },
  { key: "habit", label: "Combinado" },
];
const ARCS = thirdArcs(14).map((arc) =>
  arcPath(RING_CENTER, RING_CENTER, RING_RADIUS, arc.start, arc.sweep),
);
/** Blocos de contagem do conceito: refeições, água e combinados (dias até hoje). */
const TILES: { key: "meal" | "water" | "habit"; label: string }[] = [
  { key: "meal", label: "Refeições" },
  { key: "water", label: "Água" },
  { key: "habit", label: "Combinados" },
];

/** Anel de presença do dia (água, refeição, combinado); também nos stories de "Sua semana". */
export function DayRing({ day }: { day: ConsistencyDay }) {
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      {PRESENCE.map((p, i) => (
        <path
          key={p.key}
          className={`consist-arc is-${p.key} ${day[p.key] ? "on" : ""}`}
          d={ARCS[i]}
        />
      ))}
    </svg>
  );
}

/**
 * "Seus registros" (EVOL-09, conceito 09): calendário das últimas 4 semanas, de segunda a domingo,
 * com o anel do que foi registrado em cada dia (água, refeição, combinado). Dia sem registro é um
 * círculo tracejado; os dias que ainda não chegaram ficam apagados. As contagens descrevem os dias
 * até hoje: nada conta dias seguidos nem cobra o que faltou.
 */
export function ConsistencyCard({ today }: { today: string }) {
  const { state } = useApp();
  const cal = consistencyCalendar(state, today);
  const days = cal.rows.flat();
  const { elapsed } = cal.counts;
  return (
    <section className="card evol-card consist-card" data-testid="consistency-card" aria-labelledby="consist-title">
      <header className="evol-card-head">
        <span className="evol-icon calendar" aria-hidden="true">
          <CalendarDays size={22} />
        </span>
        <div>
          <h2 id="consist-title">Seus registros</h2>
          <p className="muted">Últimas 4 semanas</p>
        </div>
      </header>
      <div className="consist-weekdays" aria-hidden="true">
        {cal.weekdays.map((weekday, i) => (
          <span key={`${weekday}-${i}`}>{weekday}</span>
        ))}
      </div>
      <ol className="consist-grid" aria-label={cal.aria}>
        {days.map((day) =>
          day.isFuture ? (
            <li key={day.date} className="is-future" aria-hidden="true">
              <span className="consist-day">{day.day}</span>
            </li>
          ) : (
            <li
              key={day.date}
              className={[day.isToday ? "is-today" : "", day.hasRecord ? "" : "is-empty"]
                .filter(Boolean)
                .join(" ") || undefined}
              aria-current={day.isToday ? "date" : undefined}
            >
              <DayRing day={day} />
              <span className="consist-day" aria-hidden="true">
                {day.day}
              </span>
              <span className="sr-only">{day.aria}</span>
            </li>
          ),
        )}
      </ol>
      <ul className="consist-tiles" aria-label="Dias com registro nas 4 semanas">
        {TILES.map((tile) => (
          <li key={tile.key}>
            <span className="consist-tile-label" aria-hidden="true">
              <i className={`is-${tile.key}`} />
              {tile.label}
            </span>
            <span className="consist-tile-value" aria-hidden="true">
              <strong>{cal.counts[tile.key]}</strong>
              <small>/{elapsed} dias</small>
            </span>
            <span className="sr-only">
              {tile.label}: {cal.counts[tile.key]} de {elapsed} dias
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
