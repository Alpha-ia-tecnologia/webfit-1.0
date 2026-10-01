import { useState } from "react";
import { Scale } from "lucide-react";
import { BODY_PRIVACY_COPY } from "../../lib/body-privacy";
import { useApp } from "../../lib/context";
import { localDate, withMeasurements } from "../../lib/domain";
import { plural } from "../../lib/format";
import {
  defaultRange,
  nextWeighIn,
  rangeStart,
  WEIGHT_RANGES,
  weightChartEnd,
  weightTrend,
  type WeightRange,
} from "../../lib/evolution";
import { weighInRows } from "../../lib/measures";
import { nextDoseEstimate, tracksDoseSchedule, type DoseTimeline } from "../../lib/treatment";
import type { Measurement } from "../../types";
import { SegmentedControl } from "../SegmentedControl";
import { WeighInList } from "./WeighInList";
import { WeighInsSheet } from "./WeighInsSheet";
import { WeightTrendChart } from "./WeightTrendChart";

type Props = {
  target: number | null;
  /** Degraus de dose sobre o gráfico; null sem aplicações e sempre null em perfil calmo. */
  dose: DoseTimeline | null;
  /** Perfil calmo (sensível ou menor de 18): as linhas mostram só o peso, sem variação nem medidas. */
  isSensitive: boolean;
  /** "Ocultar números do corpo" (ESPACO-13): "Pesagens" sem gráfico nem período, linhas sem valor. */
  hidden?: boolean;
};

/**
 * Peso (conceito 09): título com "8 pesagens" (abre a folha "Pesagens") e os períodos 1M a Tudo na
 * mesma linha, tendência, meta na legenda (fora de perfil sensível) e as aplicações no próprio
 * gráfico. Com os números do corpo ocultos: só a lista de todas as pesagens, sem valores.
 */
export function WeightCard({ target, dose, isSensitive, hidden = false }: Props) {
  const { state, commit, notify } = useApp();
  const today = localDate();
  const sorted = [...state.measurements].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0]?.date ?? today;
  const [range, setRange] = useState<WeightRange>(() => defaultRange(first, today));
  const [isListOpen, setListOpen] = useState(false);
  const start = hidden ? first : rangeStart(range, today, first);
  const rows = weighInRows(state.measurements, start, today, isSensitive || hidden);
  const remove = (m: Measurement) =>
    void commit(
      (s) =>
        withMeasurements(
          s,
          s.measurements.filter((v) => v.id !== m.id),
          today,
        ),
      "Medição excluída.",
      {
        label: "Desfazer",
        onAction: async () => {
          // Uma medição por data: se outra foi registrada no mesmo dia, ela prevalece.
          let restored = false;
          await commit((s) => {
            if (s.measurements.some((v) => v.id === m.id || v.date === m.date)) return s;
            restored = true;
            return withMeasurements(s, [...s.measurements, m], today);
          });
          notify(
            restored
              ? "Medição restaurada."
              : "Já existe uma medição nessa data; a anterior não foi restaurada.",
            restored ? "success" : "info",
          );
        },
      },
    );
  const removeById = (id: string) => {
    const m = state.measurements.find((v) => v.id === id);
    if (m) remove(m);
  };
  if (hidden)
    return (
      <section className="card evol-card" aria-labelledby="evol-weight-title">
        <header className="evol-card-head">
          <span className="evol-icon body" aria-hidden="true">
            <Scale size={20} />
          </span>
          <div>
            <h2 id="evol-weight-title">{BODY_PRIVACY_COPY.weighIns}</h2>
          </div>
        </header>
        {rows.length > 0 && (
          <details className="evol-history">
            <summary>{plural(rows.length, "pesagem", "pesagens")}</summary>
            <WeighInList
              rows={rows}
              canRemove={state.measurements.length > 1}
              onRemove={removeById}
              hidden
            />
          </details>
        )}
      </section>
    );
  const p = state.profile;
  // Próxima aplicação estimada no gráfico: só quem acompanha a frequência (nunca calmo ou gestação).
  const estimate =
    dose && p && !isSensitive && tracksDoseSchedule(p)
      ? nextDoseEstimate(state.injections, today, p.weightLossPenPerMonth)
      : null;
  const nextDose = estimate && estimate.date >= today ? estimate.date : null;
  const count = plural(rows.length, "pesagem", "pesagens");
  return (
    <section className="card evol-card evol-weight" aria-labelledby="evol-weight-title">
      <header className="evol-card-head evol-weight-head">
        <span className="evol-icon weight" aria-hidden="true">
          <Scale size={24} />
        </span>
        <div className="evol-weight-title">
          <h2 id="evol-weight-title">Peso</h2>
          {rows.length > 0 ? (
            <button
              type="button"
              className="evol-weighins-btn"
              aria-haspopup="dialog"
              aria-label={`${count} no período`}
              onClick={() => setListOpen(true)}
            >
              {count}
            </button>
          ) : (
            <p className="muted">Sem pesagens no período</p>
          )}
        </div>
        <SegmentedControl
          label="Período do gráfico de peso"
          size="sm"
          segments={WEIGHT_RANGES.map((r) => ({
            value: r.key,
            label: r.label,
            ariaLabel: r.key === "tudo" ? "Tudo" : `${r.label}: últimos ${r.days} dias`,
          }))}
          value={range}
          onChange={setRange}
        />
      </header>
      <WeightTrendChart
        points={weightTrend(sorted)}
        start={start}
        end={weightChartEnd(today, nextDose)}
        today={today}
        target={target}
        dose={dose}
        withLane
        nextDose={nextDose}
        medication={dose?.spans.at(-1)?.medication ?? null}
      />
      {isListOpen && (
        <WeighInsSheet
          rows={rows}
          next={nextWeighIn(state, today)}
          canRemove={state.measurements.length > 1}
          onRemove={removeById}
          onClose={() => setListOpen(false)}
        />
      )}
    </section>
  );
}
