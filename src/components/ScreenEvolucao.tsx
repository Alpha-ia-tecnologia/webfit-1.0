import { useState } from "react";
import { Info } from "lucide-react";
import { useApp } from "../lib/context";
import { localDate } from "../lib/domain";
import {
  dailySeries,
  journeyFor,
  nextWeighIn,
  proteinBand,
  startChecklist,
  type DailyKind,
} from "../lib/evolution";
import { insightPrivacy, seriesInsight } from "../lib/progress-insights";
import { EVOLUCAO_TITLE } from "../lib/copy";
import { bodyNumbers, isCalmProfile } from "../lib/space";
import { doseTimeline } from "../lib/treatment";
import { Page } from "./UI";
import { ConsistencyCard } from "./evolucao/ConsistencyCard";
import { DayBarsCard } from "./evolucao/DayBarsCard";
import { EvolMoreList } from "./evolucao/EvolMoreList";
import { HowWeCalculate } from "./evolucao/HowWeCalculate";
import { JourneyCard, StartLine } from "./evolucao/JourneyCard";
import { MeasurementModal } from "./evolucao/MeasurementModal";
import { SERIES, SeriesSheet } from "./evolucao/SeriesSheet";
import { WeightCard } from "./evolucao/WeightCard";
import { focusWhenReady, HIDE_BODY_SWITCH_ID } from "./espaco/focusWhenReady";
import "./evolucao/Evolucao.css";
import "./evolucao/Hidden.css";

/** Pesagens a partir das quais a jornada substitui a linha de partida. */
const JOURNEY_MIN_MEASUREMENTS = 2;
/** Os mini gráficos da tela mostram a última semana; 28 dias ficam na folha de detalhes. */
const MINI_DAYS = 7;

/**
 * Evolução (conceito 09): "Sua jornada" (ou "Sua linha de partida" na primeira visita), peso com
 * tendência e as aplicações no mesmo gráfico (fora de perfil calmo), calorias (ou refeições, com
 * calorias ocultas) e água lado a lado, o calendário "Seus registros" das últimas 4 semanas e
 * "Mais da sua evolução" com o resto a um toque. Perfil calmo (sensível ou menor de 18,
 * isCalmProfile) não vê meta, ritmo, variação, proteína, doses sobre o peso nem medidas.
 */
export function ScreenEvolucao() {
  const { state, navigate, openEspaco } = useApp();
  const p = state.profile!;
  const [open, setOpen] = useState(false);
  const [isHowOpen, setHowOpen] = useState(false);
  const [series, setSeries] = useState<DailyKind | null>(null);
  const today = localDate();
  const journey = journeyFor(state, today);
  const calm = isCalmProfile(p, today);
  // Números do corpo (ESPACO-13): "hidden" tira pesos, medidas e a faixa de proteína (vem do peso).
  const level = bodyNumbers(p, today);
  const bodyHidden = level === "hidden";
  const hasJourney = journey !== null && journey.count >= JOURNEY_MIN_MEASUREMENTS;
  const timeline = doseTimeline(state.injections, today, p.weightLossPenPerMonth);
  const band = level === "full" ? proteinBand(journey?.current.weight ?? p.weight) : null;
  // Mini gráficos (EVOL-06): a meta depois de "média/dia" sai de seriesInsight (regras de privacidade).
  const privacy = insightPrivacy(p, today);
  const week = dailySeries(state, today, MINI_DAYS);
  const minis: DailyKind[] = [p.hideCalories ? "meals" : "calories", "water"];
  return (
    <Page title={EVOLUCAO_TITLE}>
      {hasJourney ? (
        <JourneyCard
          journey={journey}
          today={today}
          next={nextWeighIn(state, today)}
          onRegister={() => setOpen(true)}
          hidden={bodyHidden}
          onAdjust={() => {
            openEspaco("preferencias");
            focusWhenReady(HIDE_BODY_SWITCH_ID);
          }}
        />
      ) : (
        <StartLine
          journey={journey}
          items={startChecklist(state, today)}
          onRegister={() => setOpen(true)}
          hidden={bodyHidden}
        />
      )}
      {hasJourney && (
        <WeightCard
          target={journey.target}
          dose={calm ? null : timeline}
          isSensitive={calm}
          hidden={bodyHidden}
        />
      )}
      <section className="evol-days" aria-labelledby="evol-days-title">
        <div className="evol-days-head">
          <div className="evol-days-title">
            <h2 id="evol-days-title" className="evol-eyebrow">
              Últimos {MINI_DAYS} dias
            </h2>
            <button
              type="button"
              className="icon-btn evol-info-btn"
              aria-label="Como calculamos"
              aria-haspopup="dialog"
              onClick={() => setHowOpen(true)}
            >
              <Info size={18} aria-hidden="true" />
            </button>
          </div>
          <button type="button" className="link-btn evol-diary-link" onClick={() => navigate("diario")}>
            Ver diário
          </button>
        </div>
        <div className="evol-mini-grid">
          {minis.map((kind) => {
            const spec = SERIES[kind];
            return (
              <DayBarsCard
                key={kind}
                variant="compact"
                title={spec.title}
                icon={spec.icon}
                tone={spec.tone}
                points={week[kind]}
                today={today}
                unit={spec.unit}
                format={spec.format}
                unitLabel={spec.unitLabel}
                insight={seriesInsight(kind, week[kind], privacy)}
                emptyText={spec.emptyText}
                onOpen={() => setSeries(kind)}
              />
            );
          })}
        </div>
      </section>
      <ConsistencyCard today={today} />
      <EvolMoreList
        today={today}
        journey={journey}
        timeline={timeline}
        calm={calm}
        showMeasures={level === "full"}
        proteinBand={band}
        onRegisterMeasures={() => setOpen(true)}
      />
      {open && <MeasurementModal onClose={() => setOpen(false)} hidden={bodyHidden} />}
      {isHowOpen && (
        <HowWeCalculate
          privacy={privacy}
          hasDoses={!calm && timeline !== null}
          onClose={() => setHowOpen(false)}
        />
      )}
      {series && <SeriesSheet kind={series} today={today} band={band} onClose={() => setSeries(null)} />}
    </Page>
  );
}
