import { useMemo, useState } from "react";
import { Smile } from "lucide-react";
import { useApp } from "../../lib/context";
import { wellbeingTrend, type CrossReading, type WellbeingDay } from "../../lib/wellbeing-trend";
import { MoodFace } from "../hoje/MoodCard";
import { QuickEntryForm } from "../QuickEntryForm";
import { Modal } from "../UI";
import { InsightChips } from "./InsightChips";
import "./Insights.css";

/** Até 7 dias: colunas com rosto e cápsula; acima disso, mapa de rostos. */
const WEEK_DAYS = 7;

/** Rosto do humor do dia ou o anel tracejado de "sem humor registrado" (forma, não só cor). */
function DayFace({ day, size }: { day: WellbeingDay; size: number }) {
  return day.mood ? <MoodFace rating={day.mood} size={size} /> : <i className="wb-face-empty" />;
}

/** Semana em colunas: dia, rosto do humor, cápsula de sono e horas; o texto completo vai no sr-only. */
export function WellbeingWeek({ days, label }: { days: readonly WellbeingDay[]; label: string }) {
  return (
    <ol className="wb-week" aria-label={label}>
      {days.map((day) => (
        <li
          key={day.date}
          className={day.isToday ? "is-today" : undefined}
          aria-current={day.isToday ? "date" : undefined}
        >
          <span className="wb-weekday" aria-hidden="true">
            {day.weekday}
          </span>
          <span className="wb-face" aria-hidden="true">
            <DayFace day={day} size={28} />
          </span>
          <span className="wb-sleep" aria-hidden="true">
            <i style={{ height: `${day.sleepPct}%` }} />
          </span>
          <span className="wb-hours" aria-hidden="true">
            {day.sleepText}
          </span>
          <span className="sr-only">{day.aria}</span>
        </li>
      ))}
    </ol>
  );
}

/** 28 dias em mapa 4 × 7 (blocos de 7 dias a partir do início, como a consistência). */
export function WellbeingHeat({
  rows,
  weekdays,
  label,
}: {
  rows: readonly (readonly WellbeingDay[])[];
  weekdays: readonly string[];
  label: string;
}) {
  return (
    <>
      <div className="wb-weekdays" aria-hidden="true">
        {weekdays.map((weekday, i) => (
          <span key={`${weekday}-${i}`}>{weekday}</span>
        ))}
      </div>
      <ol className="wb-heat" aria-label={label}>
        {rows.flat().map((day) => (
          <li
            key={day.date}
            className={day.isToday ? "is-today" : undefined}
            aria-current={day.isToday ? "date" : undefined}
          >
            <DayFace day={day} size={24} />
            <span className="sr-only">{day.aria}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Leitura cruzada descritiva: o texto, o detalhe dos grupos e o aviso de que não há relação de causa. */
export function CrossReadingView({ cross }: { cross: CrossReading }) {
  return (
    <div className="wb-cross" data-testid="wellbeing-cross">
      {cross.kind === "insufficient" ? (
        <p className="muted">
          {cross.text} <strong>{cross.progress}</strong>
        </p>
      ) : (
        <>
          <p className="wb-cross-text">{cross.text}</p>
          {cross.detail && <p className="wb-cross-detail">{cross.detail}</p>}
          {cross.note && <p className="hint">{cross.note}</p>}
        </>
      )}
    </div>
  );
}

/**
 * Bem-estar e sono (EVOL-07) no mesmo período dos mini gráficos: humor e sono de cada dia e uma
 * leitura cruzada que só descreve os registros. Vale para todos os perfis (sem peso nem energia).
 */
export function WellbeingCard({ dates, today }: { dates: readonly string[]; today: string }) {
  const { state } = useApp();
  const [isMoodOpen, setMoodOpen] = useState(false);
  // O diário inteiro é percorrido: só de novo quando os registros ou o período mudam.
  const trend = useMemo(() => wellbeingTrend(state.diary, dates, today), [state.diary, dates, today]);
  const isWeek = dates.length <= WEEK_DAYS;
  return (
    <section className="card evol-card wb-card" data-testid="wellbeing-card" aria-labelledby="wb-title">
      <header className="evol-card-head">
        <span className="evol-icon mind" aria-hidden="true">
          <Smile size={20} />
        </span>
        <h2 id="wb-title">Bem-estar e sono</h2>
      </header>
      {trend.isEmpty ? (
        <div className="wb-empty">
          <p className="muted">Registre como você está para ver o humor e o sono aqui.</p>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setMoodOpen(true)}>
            Registrar bem-estar
          </button>
        </div>
      ) : (
        <>
          <InsightChips chips={trend.stats} label="Destaques de bem-estar" />
          {isWeek ? (
            <WellbeingWeek days={trend.days} label={trend.aria} />
          ) : (
            <WellbeingHeat rows={trend.rows} weekdays={trend.weekdays} label={trend.aria} />
          )}
          <p className="wb-legend" aria-hidden="true">
            {isWeek ? "Rosto: humor do dia · Cápsula: horas de sono (até 12 h)" : "Rosto: humor do dia"}
          </p>
          <CrossReadingView cross={trend.cross} />
        </>
      )}
      {isMoodOpen && (
        <Modal title="Registrar bem-estar" onClose={() => setMoodOpen(false)}>
          <QuickEntryForm type="bem_estar" onDone={() => setMoodOpen(false)} />
        </Modal>
      )}
    </section>
  );
}
