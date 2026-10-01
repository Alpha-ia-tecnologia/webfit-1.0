import { useId, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { friendlyName } from "../../lib/food-search";
import { CONFIDENCE_LABEL, type PlatePhoto } from "../../lib/plate-photo";
import { linkPhotoItems } from "../../lib/taco-match";
import type { FoodItem } from "../../types";
import "../Plate.css";
import "./PhotoDraft.css";

/**
 * Rascunho da foto do prato (DIARIO-04): cada item visto pelo agente com a confiança, o alimento
 * da TACO para escolher e o aviso de alergia. Nada entra no prato sem a pessoa marcar e tocar em
 * "Adicionar"; porções entram na medida caseira padrão e são ajustadas no prato.
 * `draft` já chega mascarado (hideCalories).
 */
export function PhotoDraft({
  draft,
  allergyDetails,
  onAddFoods,
  onSearch,
}: {
  draft: PlatePhoto;
  allergyDetails: string;
  onAddFoods: (foods: FoodItem[]) => void;
  onSearch: (name: string) => void;
}) {
  const linked = useMemo(() => linkPhotoItems(draft, allergyDetails), [draft, allergyDetails]);
  const [checked, setChecked] = useState<boolean[]>(() =>
    linked.map((entry) => entry.defaultChecked),
  );
  const [choice, setChoice] = useState<(string | null)[]>(() =>
    linked.map((entry) => entry.candidates[0]?.id ?? null),
  );
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const baseId = useId();
  const selected = linked.flatMap((entry, index) => {
    if (!checked[index]) return [];
    const food =
      entry.candidates.find((candidate) => candidate.id === choice[index]) ??
      entry.candidates[0];
    return food ? [food] : [];
  });
  const setAt = <T,>(list: readonly T[], index: number, value: T) =>
    list.map((current, i) => (i === index ? value : current));
  const add = () => {
    if (!selected.length) return;
    onAddFoods(selected);
    setAddedCount(selected.length);
  };

  if (addedCount !== null)
    return (
      <section className="photo-draft is-done" data-testid="photo-draft">
        <p className="notice">
          {addedCount === 1
            ? "1 item da foto foi adicionado ao prato."
            : `${addedCount} itens da foto foram adicionados ao prato.`}
        </p>
      </section>
    );
  return (
    <section
      className="photo-draft"
      data-testid="photo-draft"
      aria-labelledby={`${baseId}-title`}
    >
      <h3 id={`${baseId}-title`}>Itens na foto</h3>
      {linked.length ? (
        <p className="hint">
          Confira cada item. Eles entram na medida caseira padrão e você ajusta as porções no
          prato.
        </p>
      ) : (
        <p className="notice">
          Nenhum alimento identificado com segurança. Busque os itens abaixo.
        </p>
      )}
      {linked.length > 0 && (
        <ul className="photo-items">
          {linked.map((entry, index) => {
            const name = entry.item.name;
            const hasCandidates = entry.candidates.length > 0;
            return (
              <li key={`${index}-${name}`} className="photo-item">
                <div className="photo-item-head">
                  <input
                    type="checkbox"
                    aria-label={`Incluir ${name}`}
                    checked={checked[index] ?? false}
                    disabled={!hasCandidates}
                    onChange={(e) => setChecked((current) => setAt(current, index, e.target.checked))}
                  />
                  <span className="photo-item-name">{name}</span>
                  <span className={`photo-confidence is-${entry.item.confidence}`}>
                    <i aria-hidden="true" />
                    {CONFIDENCE_LABEL[entry.item.confidence]}
                  </span>
                  {entry.allergy && <span className="allergen-badge">Possível alérgeno</span>}
                </div>
                {hasCandidates ? (
                  <fieldset className="photo-candidates">
                    <legend className="sr-only">Alimento da TACO para {name}</legend>
                    {entry.candidates.map((food) => {
                      const friendly = friendlyName(food.name);
                      return (
                        <label key={food.id} className="photo-candidate">
                          <input
                            type="radio"
                            name={`${baseId}-item-${index}`}
                            value={food.id}
                            checked={choice[index] === food.id}
                            onChange={() => setChoice((current) => setAt(current, index, food.id))}
                          />
                          <span>
                            {friendly.label}
                            {friendly.prep && (
                              <small className="photo-candidate-prep"> · {friendly.prep}</small>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </fieldset>
                ) : (
                  <div className="photo-missing">
                    <span>Sem correspondência na TACO.</span>
                    <button type="button" className="text-btn" onClick={() => onSearch(name)}>
                      <Search size={14} aria-hidden="true" />
                      Buscar {name}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {draft.uncertainties.length > 0 && (
        <div className="notice photo-uncertain">
          <p className="photo-uncertain-title">Incertezas</p>
          <ul>
            {draft.uncertainties.map((doubt, index) => (
              <li key={`${index}-${doubt}`}>{doubt}</li>
            ))}
          </ul>
        </div>
      )}
      {linked.length > 0 && (
        <button
          type="button"
          className="btn photo-draft-add"
          disabled={!selected.length}
          onClick={add}
        >
          Adicionar {selected.length} à refeição
        </button>
      )}
    </section>
  );
}
