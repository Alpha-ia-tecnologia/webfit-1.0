import { Pencil, Trash2 } from "lucide-react";
import { expiryStatus } from "../../lib/pantry";
import { expiryPill, fmtPantryQuantity, pantryEmoji } from "../../lib/pantry-view";
import { visiblePlainText } from "../../lib/text";
import type { PantryItem } from "../../types";
import { OverflowMenu } from "../OverflowMenu";
import { ExpiryPill } from "./ExpiryPill";

interface Props {
  item: PantryItem;
  hide: boolean;
  /** Durante uma solicitação ou com a revisão aberta, editar e remover ficam desligados. */
  isLocked: boolean;
  onEdit: () => void;
  onRemove: () => void;
}

/**
 * Linha do inventário (conceito 06): emoji, nome, quantidade e a pílula da validade à direita; o
 * local vem do grupo. Vencido: pílula rosa (só aqui, é sobre o alimento) e "Ainda está bom?" com
 * Atualizar / Remover. Ações também no "⋯" (discreto).
 */
export function PantryRow({ item, hide, isLocked, onEdit, onRemove }: Props) {
  const name = visiblePlainText(item.name, hide);
  const pill = item.expiresOn ? expiryPill(item.expiresOn) : null;
  const isExpired = pill?.tone === "expired";
  return (
    <li className={isExpired ? "pantry-row is-expired" : "pantry-row"} data-testid="pantry-row">
      <span className="pantry-row-glyph" aria-hidden="true">
        {pantryEmoji(item.name)}
      </span>
      <div className="pantry-row-body">
        <h3>{name}</h3>
        {/* Quantidade e pílula num bloco: na tela estreita, lado a lado; daqui para cima, a pílula vai à direita. */}
        <div className="pantry-row-sub">
          <p className="pantry-row-qty">{fmtPantryQuantity(item.quantity, item.unit)}</p>
          {pill &&
            (isExpired ? (
              <span className="pantry-pill expired" data-testid="pantry-expired-pill">
                <span aria-hidden="true">{pill.compact}</span>
                {/* "Venceu ontem — não usado nas receitas": a frase inteira fica para o leitor de tela. */}
                <span className="sr-only">{expiryStatus(item.expiresOn!).label}</span>
              </span>
            ) : (
              <ExpiryPill pill={pill} />
            ))}
        </div>
      </div>
      <OverflowMenu
        label={`Mais ações: ${name}`}
        variant="ghost"
        items={[
          { label: "Editar", icon: Pencil, disabled: isLocked, onSelect: onEdit },
          { label: "Remover", icon: Trash2, disabled: isLocked, onSelect: onRemove },
        ]}
      />
      {isExpired && (
        <div className="pantry-row-check" data-testid="pantry-expired-meta">
          <span className="pantry-row-ask">Ainda está bom?</span>
          <button
            type="button"
            className="pantry-row-action"
            aria-label={`Atualizar ${name}`}
            disabled={isLocked}
            onClick={onEdit}
          >
            Atualizar
          </button>
          <button
            type="button"
            className="pantry-row-action"
            aria-label={`Remover ${name}`}
            disabled={isLocked}
            onClick={onRemove}
          >
            Remover
          </button>
        </div>
      )}
    </li>
  );
}
