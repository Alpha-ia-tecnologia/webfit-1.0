import { useEffect, useRef, useState, type RefObject } from "react";
import { Info } from "lucide-react";
import { adjustmentChipText, proteinChipText } from "../../lib/day";
import { balanceEquation } from "../../lib/diary-day";
import type { DailyTarget } from "../../lib/domain";
import { fmtNumber } from "../../lib/format";
import { macroBars, percentOf, type Totals } from "../../lib/today";
import { MacroSummary } from "../hoje/MacroSummary";
import { MacroDonut } from "./MacroDonut";

const BAND_MACROS: Record<string, string> = { protein: "Prot", carbs: "Carb", fat: "Gord" };

/** Mostra a faixa fixa quando o cartão do balanço some por baixo do cabeçalho. */
function useStickyBand(card: RefObject<HTMLElement | null>) {
  const [top, setTop] = useState(0);
  const [isShown, setShown] = useState(false);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".app-header");
    if (!header || typeof ResizeObserver === "undefined") return;
    const measure = () => setTop(Math.round(header.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = card.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setShown(!entry.isIntersecting && entry.boundingClientRect.top < top),
      { rootMargin: `-${top}px 0px 0px 0px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [card, top]);
  return { top, isShown };
}

/**
 * Balanço do dia no Diário (DIARIO-09): [Meta] − [Consumido] = [Restam], o (i) com o gasto estimado,
 * os macros do mesmo bloco do Hoje e uma faixa de 56 px que fica visível ao rolar. O ajuste dinâmico
 * do dia é um chip de delta no cabeçalho ("↑ +147 kcal · ontem você comeu menos"; "Neste dia +147 kcal"
 * em outra data; "Meta um pouco maior" com calorias ocultas), que abre "Como calculamos".
 * Com as calorias ocultas não há equação, número de kcal nem explicação.
 */
export function BalanceCard({
  totals,
  goals,
  hideCalories,
  isToday,
  onExplain,
}: {
  totals: Totals;
  goals: DailyTarget;
  hideCalories: boolean;
  /** "Balanço de hoje" no dia de hoje; "Balanço do dia" nos outros. */
  isToday: boolean;
  onExplain: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  const band = useStickyBand(card);
  const macros = macroBars(totals, goals);
  const equation = hideCalories ? null : balanceEquation(totals.calories, goals.calories);
  const percent = percentOf(totals.calories, goals.calories) ?? 0;
  const title = isToday ? "Balanço de hoje" : "Balanço do dia";
  const canExplain = !hideCalories && goals.calories !== null;
  // Delta do ajuste (kcal ou, sem ajuste de kcal, a proteína somada); a frase inteira fica no title.
  const delta = adjustmentChipText(goals, { hideCalories, isToday }) ?? proteinChipText(goals.proteinBoost);
  const deltaNote = goals.adjustmentNote ?? undefined;
  const spoken = equation
    ? `Meta de ${fmtNumber(equation.goal)} kcal menos ${fmtNumber(equation.consumed)} kcal consumidas: ${
        equation.over
          ? `${fmtNumber(equation.result)} kcal acima do planejado.`
          : `restam ${fmtNumber(equation.result)} kcal.`
      }`
    : "";
  return (
    <>
      <section ref={card} className="card diary-balance stagger-1" aria-labelledby="diary-balance-title">
        <div className="diary-balance-head">
          <div className="diary-balance-lead">
            <h2 id="diary-balance-title">{hideCalories ? title : `${title} · kcal`}</h2>
            {delta &&
              (canExplain ? (
                <button
                  type="button"
                  className="balance-delta"
                  data-testid="balance-delta"
                  aria-haspopup="dialog"
                  title={deltaNote}
                  onClick={onExplain}
                >
                  {delta}
                </button>
              ) : (
                <span className="balance-delta" data-testid="balance-delta" title={deltaNote}>
                  {delta}
                </span>
              ))}
          </div>
          {canExplain && (
            <button type="button" className="diary-balance-info" aria-label="Como calculamos" onClick={onExplain}>
              <Info size={20} aria-hidden="true" />
            </button>
          )}
        </div>
        {!hideCalories &&
          (equation ? (
            <>
              <p className="sr-only">{spoken}</p>
              <div className="balance-eq" aria-hidden="true">
                <span className="eq-term">
                  <strong>{fmtNumber(equation.goal)}</strong>
                  <small>Meta</small>
                </span>
                <span className="eq-op">−</span>
                <span className="eq-term">
                  <strong>{fmtNumber(equation.consumed)}</strong>
                  <small>Consumido</small>
                </span>
                <span className="eq-op">=</span>
                <span className={`eq-term result ${equation.over ? "over" : ""}`}>
                  <strong>{fmtNumber(equation.result)}</strong>
                  <small>{equation.over ? "Acima do planejado" : "Restam"}</small>
                </span>
              </div>
              <span className="diary-balance-bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${percent / 100})` }} />
              </span>
            </>
          ) : (
            <p className="diary-balance-plain">
              <strong>{fmtNumber(totals.calories)}</strong> kcal consumidas · sem meta definida
            </p>
          ))}
        {hideCalories && <MacroDonut macros={totals} />}
        <MacroSummary macros={macros} showBars />
      </section>
      {/* Âncora de altura zero: gruda sob o cabeçalho e desenha a faixa só depois que o cartão sai. */}
      <div className="diary-band-anchor" style={{ top: band.top }}>
        {band.isShown && (
          <div className="diary-band" aria-hidden="true">
            {!hideCalories && (
              <span className="diary-band-kcal">
                <strong>{fmtNumber(equation ? equation.result : totals.calories)}</strong>
                <small>{!equation ? "kcal consumidas" : equation.over ? "kcal acima" : "kcal restantes"}</small>
              </span>
            )}
            <span className="diary-band-macros">
              {macros.map((m) => (
                <span key={m.key}>
                  <i className={`dot macro-${m.key}`} />
                  {BAND_MACROS[m.key]} {fmtNumber(m.value)} g
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
