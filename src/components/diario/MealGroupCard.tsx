import { useId } from "react";
import {
  Apple,
  Coffee,
  CookingPot,
  Pencil,
  Plus,
  Repeat2,
  Sandwich,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { addToLabel, macroShare, mealCategoryOf, mealSummary, type MealGroup } from "../../lib/diary-day";
import { mealGlyph } from "../../lib/food-glyph";
import { fmtKcal, fmtNumber } from "../../lib/format";
import type { Tone } from "../../lib/today";
import type { DiaryEntry } from "../../types";
import { FoodGlyph } from "../meal/FoodGlyph";
import { MacroBar } from "../meal/MacroBar";
import { MealCard, mealCardTone } from "../meal/MealCard";
import { OverflowMenu } from "../OverflowMenu";
import { SatietyLine } from "../sintomas/SatietyLine";

/** Ícone de cada refeição (café, almoço, lanche, jantar/ceia), no tom dela. */
const MEAL_ICONS: Record<Tone, LucideIcon> = {
  amber: Coffee,
  emerald: Sandwich,
  sky: Apple,
  teal: CookingPot,
};
/** Largura da barra P/C/G sob o horário (conceito 03). */
const ROW_BAR_WIDTH = 112;

type RowActions = {
  hideCalories: boolean;
  /** "Repetir agora" no dia de hoje; "Repetir hoje" em dias anteriores. */
  repeatLabel: string;
  highlightId: string | null;
  onEdit: (entry: DiaryEntry) => void;
  onRepeat: (entry: DiaryEntry) => void;
  onRemove: (entry: DiaryEntry) => void;
};

/**
 * Registro dentro do grupo (conceito 03): foto ou emoji do prato, a refeição em frase ("Pão integral
 * com ovo e café"), o horário e a barra P/C/G. Tocar abre a edição; o "⋯" edita, repete ou exclui.
 * kcal na linha só quando o grupo tem 2 ou mais registros (com um, o subtotal já diz).
 */
function MealRow({
  entry,
  tone,
  showKcal,
  ...actions
}: RowActions & { entry: DiaryEntry; tone: Tone; showKcal: boolean }) {
  const descriptionId = useId();
  const summary = mealSummary(entry);
  const share = macroShare(entry.macros);
  const kcal = fmtKcal(entry.calories ?? 0);
  const title = summary.sentence || entry.title;
  return (
    <article
      className={`diary-entry diary-meal-row ${actions.highlightId === entry.id ? "is-highlight" : ""}`}
      data-entry-id={entry.id}
    >
      <button
        type="button"
        className="diary-row-hit"
        aria-label={`Editar ${entry.title}`}
        aria-describedby={descriptionId}
        onClick={() => actions.onEdit(entry)}
      />
      {entry.imageUrl ? (
        <img className="diary-thumb" src={entry.imageUrl} alt="" />
      ) : (
        <FoodGlyph glyph={mealGlyph(entry.items, mealCategoryOf(entry))} icon={MEAL_ICONS[tone]} size={40} />
      )}
      <div className="diary-row-copy">
        <p className="diary-row-title">{title}</p>
        <div className="diary-row-meta">
          <span className="diary-row-time">{entry.time}</span>
          <MacroBar share={share} size="sm" width={ROW_BAR_WIDTH} />
          <SatietyLine entry={entry} />
        </div>
      </div>
      {showKcal && !actions.hideCalories && <span className="entry-kcal">{kcal}</span>}
      <span id={descriptionId} className="sr-only">
        {`${entry.time}, ${summary.text}${actions.hideCalories ? "" : `, ${kcal}`}`}
      </span>
      <OverflowMenu
        variant="ghost"
        label={`Mais ações: ${entry.title} das ${entry.time}`}
        items={[
          { label: "Editar", icon: Pencil, onSelect: () => actions.onEdit(entry) },
          { label: actions.repeatLabel, icon: Repeat2, onSelect: () => actions.onRepeat(entry) },
          { label: "Excluir", icon: Trash2, onSelect: () => actions.onRemove(entry) },
        ]}
      />
    </article>
  );
}

/**
 * Grupo de um tipo de refeição (conceito 03): bloco com o ícone no tom da refeição, o subtotal sempre
 * (sem número com as calorias ocultas) e o "+" que adiciona outro registro ao grupo.
 */
export function MealGroupCard({
  group,
  onAdd,
  ...actions
}: RowActions & { group: MealGroup; onAdd: (category: string) => void }) {
  const trailing = (
    <>
      {group.showSubtotal && !actions.hideCalories && (
        <span className="diary-subtotal kcal-stat is-inline">
          <strong>{fmtNumber(group.calories)}</strong> <small>kcal</small>
        </span>
      )}
      <button
        type="button"
        className="diary-add"
        aria-label={addToLabel(group.category)}
        onClick={() => onAdd(group.category)}
      >
        <span aria-hidden="true">
          <Plus size={18} strokeWidth={2.5} />
        </span>
      </button>
    </>
  );
  return (
    <MealCard
      variant="group"
      className="diary-group"
      title={group.category}
      icon={MEAL_ICONS[group.tone]}
      tone={mealCardTone(group.tone)}
      trailing={trailing}
    >
      <ul className="diary-rows">
        {group.entries.map((entry) => (
          <li key={entry.id}>
            <MealRow entry={entry} tone={group.tone} showKcal={group.showRowKcal} {...actions} />
          </li>
        ))}
      </ul>
    </MealCard>
  );
}
