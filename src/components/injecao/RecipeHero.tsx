import { Check, History, Info, SlidersHorizontal } from "lucide-react";
import {
  fmtConcentration,
  fmtNumber2,
  isPenMethod,
  methodInfo,
  recipeBadge,
  recipeCta,
  recipeHeading,
  syringeProfile,
  type DoseRecipe,
} from "../../lib/injection";
import { MethodArt } from "./MethodArt";
import { SyringeFigure } from "./SyringeFigure";
import "./Recipe.css";

type Props = {
  recipe: DoseRecipe;
  today: string;
  /** Dia estimado da aplicação (só quem acompanha a frequência): "Registrar aplicação de hoje". */
  isDue: boolean;
  onRegister: () => void;
  onOther: () => void;
};

/**
 * "Minha dose de sempre" (SERINGA-01, conceito 10): a última receita com a dose em destaque, UI e ml,
 * a linha da receita, a seringa com "Aspire até aqui" e o registro em dois toques (este botão →
 * confirmar). "Outra dose" abre a calculadora. Dose com 2 casas (convenção de segurança).
 */
export function RecipeHero({ recipe, today, isDue, onRegister, onOther }: Props) {
  const isPen = isPenMethod(recipe.method);
  const vial =
    !isPen && recipe.units !== null && recipe.volumeMl !== null && recipe.syringeUnits !== null
      ? { units: recipe.units, volumeMl: recipe.volumeMl, syringeUnits: recipe.syringeUnits }
      : null;
  const line = isPen
    ? [recipe.medication, methodInfo(recipe.method).label]
    : [
        recipe.medication,
        recipe.concentrationMgPerMl !== null ? fmtConcentration(recipe.concentrationMgPerMl) : "",
        recipe.syringeUnits !== null ? `Seringa de ${recipe.syringeUnits} UI` : "",
      ].filter(Boolean);
  return (
    <section className="card inj-card inj-recipe" data-testid="injection-recipe" aria-labelledby="inj-recipe-title">
      <div className="inj-recipe-head">
        <h2 id="inj-recipe-title" className="inj-recipe-kicker">
          {recipeHeading(recipe)}
        </h2>
        <span className="inj-badge">
          <History size={14} aria-hidden="true" />
          {recipeBadge(recipe, today)}
        </span>
      </div>
      <div className="inj-recipe-main">
        <p className="inj-recipe-dose">
          <strong data-testid="injection-recipe-dose">{fmtNumber2(recipe.doseMg)}</strong>
          <span>mg</span>
        </p>
        {vial ? (
          <>
            <span className="inj-recipe-divider" aria-hidden="true" />
            <dl className="inj-recipe-vial">
              <div>
                <dt>na seringa</dt>
                <dd>{vial.units} UI</dd>
              </div>
              <div>
                <dt>volume</dt>
                <dd>{fmtNumber2(vial.volumeMl)} ml</dd>
              </div>
            </dl>
          </>
        ) : (
          <MethodArt method={recipe.method} className="inj-recipe-art" />
        )}
      </div>
      <ul className="inj-recipe-line" aria-label="Receita">
        {line.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {vial && (
        <div className="inj-recipe-syringe">
          <SyringeFigure profile={syringeProfile(vial.syringeUnits)} units={vial.units} tip="needle" showZero slim />
          <p className="inj-recipe-caption">
            <Info size={14} aria-hidden="true" />
            Leia na borda do êmbolo · imagem ilustrativa
          </p>
        </div>
      )}
      <button type="button" className="btn btn-wide inj-recipe-cta" onClick={onRegister}>
        <Check size={22} strokeWidth={2.6} aria-hidden="true" />
        {recipeCta(isDue)}
      </button>
      <button
        type="button"
        className="text-btn inj-recipe-other"
        aria-label={isPen ? undefined : "Outra dose ou frasco novo"}
        onClick={onOther}
      >
        <SlidersHorizontal size={18} aria-hidden="true" />
        Outra dose
      </button>
    </section>
  );
}
