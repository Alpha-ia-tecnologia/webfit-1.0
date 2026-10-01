import { Flame, Utensils } from "lucide-react";
import type { DailyTarget } from "../../lib/domain";
import { fmtNumber } from "../../lib/format";
import { balanceStatus, percentOf } from "../../lib/today";
import { Modal } from "../UI";
import { Gauge } from "./Gauge";

/**
 * "Como calculamos": o balanço energético do dia com o gasto estimado e a origem da meta.
 * Aberto pelo Hoje e pelo (i) do Diário; só existe com as calorias visíveis.
 */
export function BalanceExplain({
  consumed,
  goals,
  onClose,
}: {
  consumed: number;
  goals: DailyTarget;
  onClose: () => void;
}) {
  const percent = percentOf(consumed, goals.calories);
  const remaining = goals.calories === null ? null : goals.calories - consumed;
  const status = balanceStatus(consumed, goals.calories);
  const label =
    goals.calories === null
      ? `${fmtNumber(consumed)} kcal consumidas, sem meta definida`
      : `${fmtNumber(consumed)} de ${fmtNumber(goals.calories)} kcal, ${percent}% da meta`;
  return (
    <Modal title="Como calculamos" onClose={onClose}>
      <div className="row-between">
        <h3>Balanço energético</h3>
        <span className={`status-pill ${status.tone}`}>{status.label}</span>
      </div>
      <Gauge percent={percent} label={label}>
        <strong>{fmtNumber(remaining === null ? consumed : Math.abs(remaining))}</strong>
        <span>
          {remaining === null ? "kcal consumidas" : remaining >= 0 ? "kcal restantes" : "kcal acima do planejado"}
        </span>
      </Gauge>
      <div className="balance-stats">
        <div className="balance-stat sky">
          <span className="balance-stat-icon" aria-hidden="true">
            <Utensils size={16} />
          </span>
          <div>
            <span className="balance-stat-label">Consumidas</span>
            <strong>{fmtNumber(consumed)}</strong>
            <small>kcal</small>
          </div>
        </div>
        <div className="balance-stat emerald">
          <span className="balance-stat-icon" aria-hidden="true">
            <Flame size={16} />
          </span>
          <div>
            <span className="balance-stat-label">{goals.expenditure !== null ? "Gasto estimado" : "Meta do dia"}</span>
            <strong>
              {goals.expenditure !== null
                ? fmtNumber(goals.expenditure)
                : goals.calories !== null
                  ? fmtNumber(goals.calories)
                  : "Não definida"}
            </strong>
            {(goals.expenditure !== null || goals.calories !== null) && <small>kcal</small>}
          </div>
        </div>
      </div>
      <p className="hint">
        {goals.source}
        {goals.expenditure !== null ? " · gasto diário estimado pela fórmula de Mifflin-St Jeor." : "."}
      </p>
      {goals.note && <p className="hint">{goals.note}</p>}
    </Modal>
  );
}
