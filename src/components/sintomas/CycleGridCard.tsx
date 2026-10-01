import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { CYCLE_GRID_DAYS, cycleDayPhrase, cycleGrid, type CycleGridModel } from "../../lib/symptoms";
import type { DiaryEntry, InjectionEntry } from "../../types";
import { SegmentedControl, type Segment } from "../SegmentedControl";
import "./Sintomas.css";

const ALL_DOSES = "all";
/** Só os dois degraus mais recentes entram no filtro (o resto fica em "Todas as doses"). */
const STEPS_SHOWN = 2;
const DAYS = Array.from({ length: CYCLE_GRID_DAYS }, (_, day) => day);

function GridTable({ model }: { model: CycleGridModel }) {
  return (
    <table className="cycle-grid" data-testid="cycle-grid">
      <caption className="sr-only">{model.caption}</caption>
      <thead>
        <tr>
          <td className="cg-corner" />
          {DAYS.map((day) => (
            <th key={day} scope="col">
              <span aria-hidden="true">D{day}</span>
              <span className="sr-only">{cycleDayPhrase(day)}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {model.rows.map((row) => (
          <tr key={row.key}>
            <th scope="row">{row.label}</th>
            {row.cells.map((cell) => (
              <td key={cell.day}>
                <span className={`cg-cell is-l${cell.level}`} aria-hidden="true">
                  {cell.maxIntensity === 3 && <i className="cg-dot" />}
                </span>
                <span className="sr-only">{cell.aria}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * "Seu ciclo" na Evolução (SERINGA-07): efeitos registrados no bem-estar por dia desde a aplicação
 * (D0–D6), em escala de ardósia. Só descreve os registros: nenhuma comparação entre doses, nenhuma
 * interpretação, nenhuma cor de alerta. O filtro de dose é só um filtro.
 */
export function CycleGridCard({
  diary,
  injections,
  today,
}: {
  diary: readonly DiaryEntry[];
  injections: readonly InjectionEntry[];
  today: string;
}) {
  const [picked, setPicked] = useState<string>(ALL_DOSES);
  // Cada grade percorre o diário e as aplicações: só de novo quando os dados ou o filtro mudam.
  const all = useMemo(() => cycleGrid(diary, injections, today), [diary, injections, today]);
  const steps = all.steps.slice(0, STEPS_SHOWN);
  const step = steps.some((s) => s.key === picked) ? picked : ALL_DOSES;
  const model = useMemo(
    () => (step === ALL_DOSES ? all : cycleGrid(diary, injections, today, step)),
    [all, diary, injections, today, step],
  );
  const segments: Segment<string>[] = [
    { value: ALL_DOSES, label: "Todas as doses" },
    ...steps.map((s) => ({ value: s.key, label: s.label })),
  ];
  return (
    <section className="card evol-card cycle-grid-card" data-testid="cycle-grid-card" aria-labelledby="cycle-grid-title">
      <header className="evol-card-head">
        <span className="evol-icon medication" aria-hidden="true">
          <CalendarRange size={20} />
        </span>
        <div>
          <h2 id="cycle-grid-title">Seu ciclo</h2>
          <p className="muted">Efeitos registrados por dia desde a aplicação.</p>
        </div>
      </header>
      {all.steps.length >= STEPS_SHOWN && (
        <SegmentedControl label="Dose" segments={segments} value={step} onChange={setPicked} />
      )}
      {model.isEmpty ? (
        <p className="muted cycle-grid-empty">Registre efeitos no bem-estar para vê-los por dia desde a aplicação.</p>
      ) : (
        <>
          <GridTable model={model} />
          <p className="cycle-grid-legend" aria-hidden="true">
            <span>Menos</span>
            <i className="cg-cell is-l1" />
            <i className="cg-cell is-l2" />
            <i className="cg-cell is-l3" />
            <span>Mais</span>
            <span className="cg-legend-sep">·</span>
            <i className="cg-dot is-legend" />
            <span>registro forte</span>
          </p>
          <p className="hint">{model.caption} D0 é o dia da aplicação registrada. Só descreve seus registros.</p>
        </>
      )}
    </section>
  );
}
