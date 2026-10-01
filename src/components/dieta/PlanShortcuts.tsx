import { useState } from "react";
import {
  ChefHat,
  Droplets,
  Lightbulb,
  Refrigerator,
  ScanText,
  ShoppingBasket,
  type LucideIcon,
} from "lucide-react";
import type { Domain } from "../../design/tokens";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/dates";
import { pantryTileText, shoppingTileText, tipKind, type TipKind } from "../../lib/diet-week";
import { plural } from "../../lib/format";
import { SHOPPING_COPY } from "../../lib/shopping-list";
import { ShoppingSuggest } from "../despensa/ShoppingSuggestSheet";
import { IconTile } from "../IconTile";
import { SectionHeader } from "../meal/SectionHeader";
import { ShortcutTile } from "../ShortcutTile";

const TIP_ICON: Record<TipKind, { icon: LucideIcon; tone: Domain }> = {
  water: { icon: Droplets, tone: "water" },
  pantry: { icon: Refrigerator, tone: "neutral" },
  label: { icon: ScanText, tone: "attention" },
  shopping: { icon: ShoppingBasket, tone: "neutral" },
  cooking: { icon: ChefHat, tone: "food" },
  other: { icon: Lightbulb, tone: "attention" },
};

/** Primeira parte da dica (até ";" ou ":") em destaque; o resto em cinza. O texto inteiro aparece. */
function splitTip(tip: string): [string, string] {
  const match = /^(.{8,90}?[;:])\s+(.+)$/.exec(tip.trim());
  return match ? [match[1]!.replace(/[;:]$/, ""), match[2]!] : [tip.trim(), ""];
}

/**
 * "Para facilitar" (fidelidade "Minha dieta"): as dicas do agente em atalhos com ícone por assunto
 * (faixa rolável, o texto inteiro, sem números do modelo) e os atalhos do app para a Despensa e as
 * Compras. As dicas são texto livre do plano: sem ação própria.
 */
export function PlanShortcuts({ tips }: { tips: readonly string[] }) {
  const { state, navigate, openDespensa } = useApp();
  const [isShopOpen, setShopOpen] = useState(false);
  const pantry = pantryTileText(state.pantry, localDate());
  const shopCount = state.shoppingList.length;
  return (
    <section className="plan-shortcuts" aria-labelledby="plan-shortcuts-title">
      <SectionHeader
        id="plan-shortcuts-title"
        title="Para facilitar"
        count={tips.length ? plural(tips.length, "dica do agente", "dicas do agente") : undefined}
      />
      {tips.length > 0 && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- faixa rolável: o teclado precisa alcançá-la para rolar
        <ul className="plan-tips" aria-label="Dicas do agente" tabIndex={0}>
          {tips.map((tip, index) => {
            const { icon, tone } = TIP_ICON[tipKind(tip)];
            const [lead, rest] = splitTip(tip);
            return (
              <li key={`${index}-${tip}`} className="plan-tip">
                <IconTile icon={icon} tone={tone} size="md" className="plan-tip-icon" />
                <p>
                  <strong>{lead}</strong>
                  {rest && <span> {rest}</span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <div className="plan-app-tiles">
        <ShortcutTile
          icon={Refrigerator}
          tone="neutral"
          title="Despensa"
          text={pantry.text}
          dot={pantry.isSoon ? "attention" : undefined}
          ariaLabel="Abrir despensa e receitas"
          onClick={() => navigate("despensa")}
          testId="plan-pantry"
        />
        <ShortcutTile
          icon={ShoppingBasket}
          tone="neutral"
          title="Compras"
          text={shoppingTileText(shopCount)}
          ariaLabel={SHOPPING_COPY.build}
          onClick={() => setShopOpen(true)}
          secondary={
            shopCount > 0
              ? {
                  label: shoppingTileText(shopCount),
                  // Contém o rótulo visível ("3 itens na lista").
                  ariaLabel: `Ver lista: ${shoppingTileText(shopCount)}`,
                  onClick: () => openDespensa("compras"),
                }
              : undefined
          }
          testId="shopping-entry"
        />
      </div>
      {isShopOpen && <ShoppingSuggest onClose={() => setShopOpen(false)} />}
    </section>
  );
}
