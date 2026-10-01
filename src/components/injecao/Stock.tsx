import { PEN_STOCK_VIEW, VIAL_VIEW, penFill, vialLiquid, type StockModel } from "../../lib/treatment-stock";
import type { InjectionMethod } from "../../types";
import "./Estoque.css";

type ArtProps = {
  method: InjectionMethod;
  /** 0–1; null desenha só o contorno (canetas em gestação). */
  level: number | null;
  /** Altura em px do desenho (o frasco é o dobro da largura; a caneta, deitada). */
  size: number;
  /** Com rótulo, o desenho é uma imagem; sem, é decorativo. */
  label?: string;
};

const imgProps = (label?: string) =>
  label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };

/** Frasco de pé ou caneta deitada, com o nível do que resta (estático, sem animação). */
export function StockArt({ method, level, size, label }: ArtProps) {
  if (method === "frasco") {
    const liquid = vialLiquid(level ?? 0);
    return (
      <svg className="stock-art is-vial" viewBox={`0 0 ${VIAL_VIEW.width} ${VIAL_VIEW.height}`}
        width={size / 2} height={size} focusable="false" {...imgProps(label)}>
        <rect className="stock-cap" x="14" y="2" width="20" height="10" rx="3" />
        <rect className="stock-glass" x="18" y="11" width="12" height="9" rx="2" />
        <rect className="stock-glass" x="6" y="19" width="36" height="72" rx="9" />
        {liquid.height > 0 && (
          <rect className="stock-liquid" data-testid="stock-liquid" x="9" y={liquid.y} width="30" height={liquid.height} rx="4" />
        )}
      </svg>
    );
  }
  const fill = level === null ? 0 : penFill(level);
  return (
    <svg className="stock-art is-pen" viewBox={`0 0 ${PEN_STOCK_VIEW.width} ${PEN_STOCK_VIEW.height}`}
      width={(size * PEN_STOCK_VIEW.width) / PEN_STOCK_VIEW.height} height={size} focusable="false" {...imgProps(label)}>
      <rect className="stock-glass" x="3" y="5" width="96" height="18" rx="9" />
      {fill > 0 && (
        <rect className="stock-liquid" data-testid="stock-liquid" x={PEN_STOCK_VIEW.fillX} y="8" width={fill} height="12" rx="6" />
      )}
      <rect className="stock-cap" x="100" y="7" width="17" height="14" rx="4" />
    </svg>
  );
}

function StockChips({ model, isFirstOnly = false }: { model: StockModel; isFirstOnly?: boolean }) {
  const chips = [
    model.dosesChip ? { key: "doses", text: model.dosesChip, isPast: false } : null,
    model.useByChip ? { key: "use-by", text: model.useByChip, isPast: model.isUseByPast } : null,
  ].filter((chip) => chip !== null);
  const shown = isFirstOnly ? chips.slice(0, 1) : chips;
  if (!shown.length) return null;
  return (
    <span className="stock-chips">
      {shown.map((chip) => (
        <span key={chip.key} className={`stock-chip ${chip.isPast ? "is-past" : ""}`}>
          {chip.text}
        </span>
      ))}
    </span>
  );
}

/** Avisos do estoque: "usar até" vencido em âmbar (a única cor de atenção), o resto neutro. */
export function StockNotices({ model }: { model: StockModel }) {
  if (!model.notices.length) return null;
  return (
    <div className="stock-notices">
      {model.notices.map((notice, i) => (
        <p key={notice} role="note" className={`stock-notice ${model.isUseByPast && i === 0 ? "is-past" : ""}`}>
          {notice}
        </p>
      ))}
    </div>
  );
}

/** Estoque em "Meu tratamento": desenho, quantidade, chips, avisos e as ações. */
export function StockSummary({ model, onEdit, onNew }: { model: StockModel; onEdit: () => void; onNew: () => void }) {
  const canRenew = model.dosesLeft !== null && model.dosesLeft <= 1;
  return (
    <div className="stock-summary" data-testid="stock-summary">
      <div className="stock-summary-main">
        <StockArt method={model.method} level={model.level} size={model.method === "frasco" ? 72 : 22} label={model.aria} />
        <div className="stock-summary-copy">
          <span className="stock-title">{model.title}</span>
          <strong className="stock-amount">{model.amount}</strong>
          <StockChips model={model} />
        </div>
      </div>
      <StockNotices model={model} />
      <div className="stock-actions">
        <button type="button" className="btn-secondary stock-btn" onClick={onEdit}>
          Atualizar estoque
        </button>
        {canRenew && (
          <button type="button" className="btn-secondary stock-btn" onClick={onNew}>
            {model.method === "frasco" ? "Novo frasco" : "Nova caneta"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Linha compacta na Seringa (56 px): só aparece quando a pessoa informou um estoque. */
export function StockRow({ model, onEdit }: { model: StockModel; onEdit: () => void }) {
  return (
    <section className="card stock-row" data-testid="stock-row" aria-label="Estoque">
      <StockArt method={model.method} level={model.level} size={model.method === "frasco" ? 32 : 14} />
      <span className="stock-row-copy">
        <span className="stock-row-title">Estoque</span>
        <span className="stock-row-amount">{model.amount}</span>
      </span>
      <StockChips model={model} isFirstOnly />
      <button type="button" className="link-btn stock-row-edit" aria-label="Atualizar estoque" onClick={onEdit}>
        Atualizar
      </button>
    </section>
  );
}
