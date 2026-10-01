import { Check, Clock, Info, Pencil, Sparkles, Zap } from "lucide-react";
import { useId, useState } from "react";
import { useApp } from "../../lib/context";
import { activityFactors, ageAt, goalsFor } from "../../lib/domain";
import { fmtKg, fmtLiters, fmtNumber } from "../../lib/format";
import {
  canAdjustGoals,
  goalOrigin,
  goalRuler,
  macroShares,
  type GoalOrigin,
} from "../../lib/space";
import { MacroColumns } from "../MacroColumns";
import { MacroBar } from "../meal/MacroBar";
import { Card } from "../UI";
import { GoalsSheet } from "./GoalsSheet";

const ORIGIN_ICON: Record<GoalOrigin["key"], typeof Clock> = {
  manual: Check,
  auto: Sparkles,
  pending: Clock,
};

/** Posição (0–100%) de um valor na régua basal → meta → gasto. */
function rulerPosition(value: number, min: number, max: number) {
  return max === min ? 50 : ((value - min) / (max - min)) * 100;
}

/** Anel de energia (conceito 11): círculo em degradê da marca com o raio no meio. */
function EnergyRing() {
  const gradientId = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <span className="goal-art is-energy" aria-hidden="true">
      <svg viewBox="0 0 50 50" width="50" height="50" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="goal-art-stop-a" />
            <stop offset="1" className="goal-art-stop-b" />
          </linearGradient>
        </defs>
        <circle cx="25" cy="25" r="21.5" fill="none" stroke={`url(#${gradientId})`} strokeWidth="5" />
      </svg>
      <Zap size={20} />
    </span>
  );
}

/** Gota d'água (conceito 11): degradê azul com um brilho. */
function WaterDrop() {
  const gradientId = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <span className="goal-art is-water" aria-hidden="true">
      <svg viewBox="0 0 40 48" width="40" height="48" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="goal-drop-stop-a" />
            <stop offset="1" className="goal-drop-stop-b" />
          </linearGradient>
        </defs>
        <path
          d="M20 3C20 3 5 20.5 5 31a15 15 0 0 0 30 0C35 20.5 20 3 20 3Z"
          fill={`url(#${gradientId})`}
        />
        <path className="goal-drop-shine" d="M12.5 33.5a8 8 0 0 0 5.5 6.5" />
      </svg>
    </span>
  );
}

/**
 * "Minhas metas diárias" (conceito 11): anel de energia, gota d'água, barra P/C/G e as gramas. Com
 * calorias ocultas mostra só água e gramas; perfis que pedem avaliação veem um card calmo. "Editar"
 * abre os passos das metas manuais; perfil sensível só revisa pela anamnese. "Como calculamos?" é
 * um (i) que abre a régua basal → meta → gasto.
 */
export function GoalsCard() {
  const { state, navigate } = useApp();
  const [isAdjusting, setAdjusting] = useState(false);
  const [isHowOpen, setHowOpen] = useState(false);
  const howId = useId();
  const p = state.profile!;
  const goals = goalsFor(p);
  const origin = goalOrigin(p, goals);
  const OriginIcon = ORIGIN_ICON[origin.key];
  const hide = p.hideCalories;
  const shares = macroShares(goals);
  const ruler = hide || goals.reason ? null : goalRuler(goals);
  const min = ruler ? Math.min(ruler.basal, ruler.target) : 0;
  const max = ruler ? Math.max(ruler.expenditure, ruler.target) : 0;
  const stops = ruler
    ? [
        { key: "basal", label: "Basal", value: ruler.basal },
        { key: "meta", label: "Meta", value: ruler.target },
        { key: "gasto", label: "Gasto", value: ruler.expenditure },
      ]
    : [];
  const percentOf = (key: "protein" | "carbs" | "fat") =>
    shares?.find((share) => share.key === key)?.percent ?? null;
  const share = shares
    ? { protein: percentOf("protein") ?? 0, carbs: percentOf("carbs") ?? 0, fat: percentOf("fat") ?? 0 }
    : null;
  const canAdjust = canAdjustGoals(p);
  return (
    <Card className="goals-card">
      <div className="goals-head">
        <div className="goals-title">
          <h2>Minhas metas diárias</h2>
          <p className="goals-origin-row">
            <span className={`goal-origin ${origin.key}`}>
              <OriginIcon size={16} aria-hidden="true" />
              {origin.label}
            </span>
            <button
              type="button"
              className="goals-how-btn"
              aria-label="Como calculamos?"
              aria-expanded={isHowOpen}
              aria-controls={howId}
              onClick={() => setHowOpen((open) => !open)}
            >
              <Info size={18} aria-hidden="true" />
            </button>
          </p>
        </div>
        <button
          type="button"
          className="goals-edit"
          aria-label="Editar metas"
          aria-haspopup={canAdjust ? "dialog" : undefined}
          onClick={() => (canAdjust ? setAdjusting(true) : navigate("anamnese"))}
        >
          <Pencil size={16} aria-hidden="true" />
          Editar
        </button>
      </div>
      {goals.reason && <p className="notice goals-calm">{goals.reason}</p>}
      <div className="goal-tiles">
        {!hide && (
          <div className="goal-tile energy">
            <EnergyRing />
            <div>
              <strong>
                {goals.calories === null ? "—" : fmtNumber(goals.calories)}
              </strong>
              <small>kcal por dia</small>
            </div>
          </div>
        )}
        <div className="goal-tile water">
          <WaterDrop />
          <div>
            <strong>
              {goals.water === null ? "—" : fmtLiters(goals.water)}
            </strong>
            <small>água por dia</small>
          </div>
        </div>
      </div>
      {!hide && <MacroBar share={share} size="lg" className="goals-macro-bar" />}
      <MacroColumns
        className="goals-macro-columns"
        showPercent={!hide}
        items={[
          { key: "protein", grams: goals.protein, percent: percentOf("protein") },
          { key: "carbs", grams: goals.carbs, percent: percentOf("carbs") },
          { key: "fat", grams: goals.fat, percent: percentOf("fat") },
        ]}
      />
      <div id={howId} className="goals-how" hidden={!isHowOpen}>
        {isHowOpen && (
          <>
            {ruler && (
              <div className="goal-ruler" aria-hidden="true">
                <span className="goal-ruler-track" />
                {stops.map((stop) => (
                  <span
                    key={stop.key}
                    className={`goal-ruler-stop ${stop.key}`}
                    style={{ left: `${rulerPosition(stop.value, min, max)}%` }}
                  >
                    <b>{fmtNumber(stop.value)}</b>
                    {stop.label}
                  </span>
                ))}
              </div>
            )}
            {ruler && (
              <p className="sr-only">
                Basal {fmtNumber(ruler.basal)} kcal, meta{" "}
                {fmtNumber(ruler.target)} kcal, gasto estimado{" "}
                {fmtNumber(ruler.expenditure)} kcal por dia.
              </p>
            )}
            <p>{goals.source}.</p>
            {ruler && (
              <>
                <p className="hint">
                  {/* Números do corpo ocultos (ESPACO-13): a equação sem peso nem altura. */}
                  {p.hideBodyNumbers ? (
                    <>
                      Mifflin–St Jeor com seu peso, altura, idade e sexo ={" "}
                      {fmtNumber(ruler.basal)} kcal/dia.
                    </>
                  ) : (
                    <>
                      Mifflin–St Jeor: 10 × {fmtKg(p.weight)} + 6,25 × {p.height} cm
                      − 5 × {ageAt(p.birthDate)} anos{" "}
                      {p.sex === "masculino" ? "+ 5" : "− 161"} ={" "}
                      {fmtNumber(ruler.basal)} kcal/dia.
                    </>
                  )}{" "}
                  Gasto estimado:{" "}
                  {fmtNumber(ruler.basal)} ×{" "}
                  {fmtNumber(activityFactors[p.activityLevel], 3)} ={" "}
                  {fmtNumber(ruler.expenditure)} kcal/dia (o fator de atividade é
                  uma aproximação).
                </p>
                {goals.note && <p className="hint">{goals.note}</p>}
              </>
            )}
            <p className="hint">
              A meta de água é informada por você; {hide ? "" : "calorias e "}
              macronutrientes em branco seguem a estimativa da anamnese, e valores
              informados prevalecem.{" "}
              <a
                href="https://pubmed.ncbi.nlm.nih.gov/2305711/"
                target="_blank"
                rel="noreferrer"
              >
                Referência da equação
              </a>
              .
            </p>
          </>
        )}
      </div>
      {isAdjusting && <GoalsSheet onClose={() => setAdjusting(false)} />}
    </Card>
  );
}
