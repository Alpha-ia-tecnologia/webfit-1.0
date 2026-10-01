import type { ReactNode } from "react";
import { macroEstimate, plateGroups, type ResolvedItem } from "../lib/taco-match";
import { MacroSplitBar } from "./MacroSplitBar";
import { MiniPlate } from "./MiniPlate";
import "./Plate.css";

type Props = {
  resolved: readonly ResolvedItem[];
  /** Conteúdo extra no fim de cada linha (ex.: as trocas de um item do plano). */
  renderExtra?: (entry: ResolvedItem, index: number) => ReactNode;
};

/**
 * Itens sugeridos pelo agente em medida caseira (chat, dieta e Hoje). As gramas nunca aparecem:
 * servem só à estimativa e ao prato pré-preenchido. Alérgeno declarado ganha o selo âmbar.
 */
export function PlannedItems({ resolved, renderExtra }: Props) {
  return (
    <ul className="planned-items">
      {resolved.map((entry, index) => (
        <li key={`${entry.item.alimento}-${index}`}>
          <span className="planned-item-text">
            <span className="planned-item-name">{entry.item.alimento}</span>
            {entry.item.medidaCaseira && ` · ${entry.item.medidaCaseira}`}
          </span>
          {entry.status === "allergen" && (
            <span className="allergen-badge">Possível alérgeno</span>
          )}
          {renderExtra?.(entry, index)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Estimativa de uma sugestão: barra de macros pela TACO (com cobertura suficiente) ou, em perfil
 * sensível, o prato com os grupos presentes. Sem dados suficientes, nada aparece.
 */
export function PlannedEstimate({
  resolved,
  sensitive,
}: {
  resolved: readonly ResolvedItem[];
  sensitive: boolean;
}) {
  if (sensitive) {
    const groups = plateGroups(resolved);
    return groups.length ? <MiniPlate groups={groups} /> : null;
  }
  const { share } = macroEstimate(resolved);
  return share ? <MacroSplitBar share={share} /> : null;
}
