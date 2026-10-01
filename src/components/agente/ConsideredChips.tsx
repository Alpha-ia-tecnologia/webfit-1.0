import { NutOff, Target } from "lucide-react";
import type { ConsideredChip } from "../../lib/agent-blocks";

/** "O que considerei": chips de contorno acima das opções (alergias e a meta, só dados locais). */
export function ConsideredChips({ chips }: { chips: readonly ConsideredChip[] }) {
  if (!chips.length) return null;
  return (
    <ul className="considered-chips" aria-label="O que considerei">
      {chips.map((chip) => {
        const Icon = chip.kind === "allergen" ? NutOff : Target;
        return (
          <li key={chip.text} className={`considered-chip is-${chip.kind}`}>
            <Icon size={14} aria-hidden="true" />
            {chip.text}
          </li>
        );
      })}
    </ul>
  );
}
