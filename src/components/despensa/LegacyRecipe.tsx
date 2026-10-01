import { RichText } from "../RichText";

/** Receita salva só como texto (versões anteriores ou resposta sem estrutura): blocos do RichText. */
export function LegacyRecipe({ text, hide }: { text: string; hide: boolean }) {
  return (
    <div data-testid="recipe-legacy">
      <RichText text={text} hideCalories={hide} variant="cards" className="pantry-recipe-text" />
    </div>
  );
}
