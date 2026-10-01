import { useRef } from "react";
import { Package } from "lucide-react";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/dates";
import { pantryCardText } from "../../lib/pantry-view";
import { dismissUseFirst, isUseFirstDismissed, restoreUseFirst, USE_FIRST_COPY } from "../../lib/use-first";
import { ShortcutTile } from "../ShortcutTile";
import { UseFirstCard } from "../despensa/UseFirstCard";

/**
 * Despensa no Hoje em linha compacta de 72 px ("Abrir despensa e receitas"). Quando algo vence
 * logo, o "Use primeiro" vem logo abaixo até a pessoa tocar em "Agora não" (volta amanhã).
 */
export function PantryRow() {
  const { state, navigate, commit, openDespensa } = useApp();
  const root = useRef<HTMLDivElement>(null);
  const today = localDate();
  const hide = state.profile?.hideCalories ?? true;
  const withStrip = !isUseFirstDismissed(state, today);
  const dismiss = () => {
    // O bloco sai da tela: o foco vai para a linha da despensa, não para o <body>.
    root.current?.querySelector<HTMLButtonElement>(".shortcut-tile-hit")?.focus();
    void commit((s) => dismissUseFirst(s, today), USE_FIRST_COPY.dismissed, {
      label: "Desfazer",
      onAction: () => void commit((s) => restoreUseFirst(s, today), USE_FIRST_COPY.restored),
    });
  };
  return (
    <div className="hoje-pantry-row" ref={root}>
      <ShortcutTile
        layout="row"
        headingLevel={2}
        icon={Package}
        tone="attention"
        title="Despensa e geladeira"
        text={pantryCardText(state.pantry)}
        lines={2}
        onClick={() => navigate("despensa")}
        ariaLabel="Abrir despensa e receitas"
      />
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
    </div>
  );
}
