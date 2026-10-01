import { useRef } from "react";
import { Package } from "lucide-react";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/dates";
import { pantryCardText } from "../../lib/pantry-view";
import {
  dismissUseFirst,
  isUseFirstDismissed,
  restoreUseFirst,
  USE_FIRST_COPY,
} from "../../lib/use-first";
import { Card } from "../UI";
import { UseFirstCard } from "./UseFirstCard";
import "../Despensa.css";

/**
 * Cartão de entrada da despensa (Hoje e Dieta). No Hoje (`showUseFirst`), traz o bloco
 * "Use primeiro" (AGENTE-13) até a pessoa tocar em "Agora não" (volta amanhã).
 */
export function PantryCard({ showUseFirst = false }: { showUseFirst?: boolean }) {
  const { state, navigate, commit, openDespensa } = useApp();
  const openButton = useRef<HTMLButtonElement>(null);
  const today = localDate();
  const hide = state.profile?.hideCalories ?? true;
  const withStrip = showUseFirst && !isUseFirstDismissed(state, today);
  const dismiss = () => {
    // O bloco sai da tela: o foco vai para o botão do cartão, não para o <body>.
    openButton.current?.focus();
    void commit((s) => dismissUseFirst(s, today), USE_FIRST_COPY.dismissed, {
      label: "Desfazer",
      onAction: () => void commit((s) => restoreUseFirst(s, today), USE_FIRST_COPY.restored),
    });
  };
  return (
    <Card className={`pantry-entry${withStrip ? " has-use-first" : ""}`}>
      <div>
        <h2>
          <Package size={19} aria-hidden="true" /> Despensa e geladeira
        </h2>
        <p className="muted">{pantryCardText(state.pantry)}</p>
      </div>
      <button
        ref={openButton}
        type="button"
        className="btn-secondary"
        onClick={() => navigate("despensa")}
      >
        Abrir despensa e receitas
      </button>
      {withStrip && (
        <UseFirstCard
          variant="strip"
          items={state.pantry}
          today={today}
          hide={hide}
          onRecipes={() => openDespensa("usar_primeiro")}
          onDismiss={dismiss}
        />
      )}
    </Card>
  );
}
