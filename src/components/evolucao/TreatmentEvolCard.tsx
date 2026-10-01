import { Syringe } from "lucide-react";
import { circumference, donutArcs } from "../../lib/charts";
import { useApp } from "../../lib/context";
import { plural } from "../../lib/format";
import { siteCounts } from "../../lib/rotation";
import { showsCycleGrid } from "../../lib/symptoms";
import { doseCards, type DoseTimeline } from "../../lib/treatment";
import type { InjectionEntry, InjectionSite } from "../../types";
import { CycleGridCard } from "../sintomas/CycleGridCard";
import "./EvolucaoCards.css";

const DONUT_SIZE = 72;
const DONUT_CENTER = DONUT_SIZE / 2;
const DONUT_RADIUS = 28;
const DONUT_GAP = 4;
const DONUT_ROTATE = `rotate(-90 ${DONUT_CENTER} ${DONUT_CENTER})`;
/** Cores por local: tons frios e neutros, sem sugerir certo ou errado. */
const SITE_TONE: Record<InjectionSite, string> = {
  abdomen: "is-abdomen",
  coxa: "is-coxa",
  braco: "is-braco",
};

type Props = {
  timeline: DoseTimeline;
  injections: readonly InjectionEntry[];
  today: string;
};

/**
 * Medicação na Evolução (EVOL-04): cartões "Por dose" (do mais recente) e os locais dos últimos
 * 90 dias. Só o que foi registrado: nenhum peso, caloria ou variação por dose, nenhum nível estimado.
 * Logo depois vem "Seu ciclo" (SERINGA-07), só com acompanhamento semanal da dose.
 */
export function TreatmentEvolCard({ timeline, injections, today }: Props) {
  const { state } = useApp();
  const showsGrid = state.profile ? showsCycleGrid(state.profile, injections, today) : false;
  return (
    <>
      <TreatmentSection timeline={timeline} injections={injections} today={today} />
      {showsGrid && <CycleGridCard diary={state.diary} injections={injections} today={today} />}
    </>
  );
}

function TreatmentSection({ timeline, injections, today }: Props) {
  const cards = doseCards(timeline, today);
  const sites = siteCounts(injections, today);
  const arcs = donutArcs(
    DONUT_RADIUS,
    sites.counts.map((c) => c.count),
    DONUT_GAP,
  );
  const c = circumference(DONUT_RADIUS);
  return (
    <section className="card evol-card evol-treatment" data-testid="evol-treatment-card" aria-labelledby="evol-treatment-title">
      <header className="evol-card-head">
        <span className="evol-icon medication" aria-hidden="true">
          <Syringe size={20} />
        </span>
        <h2 id="evol-treatment-title">Medicação injetável</h2>
      </header>
      <h3 className="evol-subtitle">Por dose</h3>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- carrossel com rolagem lateral: a parada de Tab deixa rolar pelo teclado */}
      <ol className="dose-carousel" data-testid="dose-carousel" aria-label="Por dose" tabIndex={0}>
        {cards.map((card) => (
          <li key={card.key} className={`dose-step-card ${card.isLatest ? "is-latest" : ""}`}>
            <strong>{card.dose}</strong>
            <span className="dose-step-med">{card.medication}</span>
            <span className="dose-step-period">{card.period}</span>
            <span className="dose-step-count">{card.count}</span>
            {card.isLatest && <span className="dose-step-tag">Mais recente</span>}
          </li>
        ))}
      </ol>
      <h3 className="evol-subtitle">Locais nos últimos 90 dias</h3>
      {sites.total > 0 ? (
        <div className="site-donut-row">
          <div className="site-donut">
            <svg
              viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
              role="img"
              aria-label={sites.aria}
              data-testid="site-donut"
              focusable="false"
            >
              <circle className="site-donut-track" cx={DONUT_CENTER} cy={DONUT_CENTER} r={DONUT_RADIUS} />
              {arcs.map((arc, i) => {
                const site = sites.counts[i]!;
                return arc.length > 0 ? (
                  <circle
                    key={site.site}
                    className={`site-donut-arc ${SITE_TONE[site.site]}`}
                    cx={DONUT_CENTER}
                    cy={DONUT_CENTER}
                    r={DONUT_RADIUS}
                    strokeDasharray={`${arc.length} ${c}`}
                    strokeDashoffset={arc.offset}
                    transform={DONUT_ROTATE}
                  />
                ) : null;
              })}
            </svg>
            {/* Só o número no centro: "aplicações" em 12 px não cabe no furo de 46 px e vai para a legenda. */}
            <span className="site-donut-total" aria-hidden="true">
              {sites.total}
            </span>
          </div>
          <ul className="site-legend" aria-hidden="true">
            <li className="site-legend-total">{plural(sites.total, "aplicação", "aplicações")}</li>
            {sites.counts.map((s) => (
              <li key={s.site}>
                <i className={SITE_TONE[s.site]} />
                {s.label} <b>{s.count}</b>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted">Sem aplicações nos últimos 90 dias.</p>
      )}
      <p className="hint">Informativo: siga a prescrição de quem acompanha seu tratamento.</p>
    </section>
  );
}
