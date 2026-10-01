/**
 * Caixa de marcar da lista de compras: o input nativo cobre a área de toque de 44 px (invisível)
 * e o visto é desenhado por cima, com o traço animado (sem animação com movimento reduzido).
 */
export function ShopCheck({
  id,
  label,
  checked,
  describedBy,
  onChange,
}: {
  id: string;
  /** Nome acessível próprio ("Incluir Tomate"); sem ele, vale o <label htmlFor> da linha. */
  label?: string;
  checked: boolean;
  describedBy?: string;
  onChange: () => void;
}) {
  return (
    <span className="shop-check">
      <input
        id={id}
        type="checkbox"
        aria-label={label}
        aria-describedby={describedBy}
        checked={checked}
        onChange={onChange}
      />
      <span className="shop-check-box" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M6 12.5l4 4 8-9" />
        </svg>
      </span>
    </span>
  );
}
