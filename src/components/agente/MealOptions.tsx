import { useId, useMemo, useRef, useState } from "react";
import { Bookmark, Clock, Plus, TriangleAlert } from "lucide-react";
import {
  consideredChips,
  mealPrep,
  optionSummary,
  optionsTitle,
  safeEmoji,
  type ChatBlock,
  type MealOption,
} from "../../lib/agent-blocks";
import { useApp } from "../../lib/context";
import { localDate } from "../../lib/dates";
import { isCalmOn } from "../../lib/day";
import { dailyTargets, uid } from "../../lib/domain";
import { glyphForFood } from "../../lib/food-glyph";
import { fmtNumber } from "../../lib/format";
import { saveMealFavorite } from "../../lib/meals";
import {
  macroEstimate,
  plannedPreset,
  plateGroups,
  plateLabel,
  resolvePlanned,
  type ResolvedItem,
} from "../../lib/taco-match";
import { FoodGlyph } from "../meal/FoodGlyph";
import { Pill } from "../Pill";
import { RadioCard } from "../RadioCard";
import { usePlannedMealRegister } from "../usePlannedMeal";
import { ConsideredChips } from "./ConsideredChips";

type OptionsBlock = Extract<ChatBlock, { tipo: "opcoes_refeicao" }>;

const FALLBACK_EMOJI = "🍽️";

/** Pílulas da opção: kcal e proteína da TACO (ou o prato, no perfil sensível), tempo e alérgeno. */
function OptionPills({
  option,
  resolved,
  sensitive,
  hideCalories,
}: {
  option: MealOption;
  resolved: readonly ResolvedItem[];
  sensitive: boolean;
  hideCalories: boolean;
}) {
  const estimate = sensitive ? null : macroEstimate(resolved);
  const approx = estimate?.isPartial ? "≈ " : "";
  const kcal = hideCalories ? null : (estimate?.kcal ?? null);
  const protein = estimate?.protein ?? null;
  const hasEstimate = kcal !== null || protein !== null;
  const groups = sensitive ? plateGroups(resolved) : [];
  const hasAllergen = resolved.some((entry) => entry.status === "allergen");
  return (
    <span
      className="meal-choice-pills"
      data-testid={hasEstimate ? "macro-estimate" : undefined}
    >
      {hasEstimate && <span className="sr-only">Estimativa TACO: </span>}
      {kcal !== null && (
        <Pill tone="neutral">
          {approx}
          {fmtNumber(kcal)} kcal
        </Pill>
      )}
      {protein !== null && (
        <Pill tone="food" srText="de proteína">
          {approx}
          {fmtNumber(protein)} g prot.
        </Pill>
      )}
      {groups.length > 0 && <Pill tone="neutral">{plateLabel(groups)}</Pill>}
      {option.minutos !== null && (
        <Pill tone="water" icon={Clock} srText={`Preparo de cerca de ${option.minutos} min`}>
          <span aria-hidden="true">{option.minutos} min</span>
        </Pill>
      )}
      {hasAllergen && (
        <Pill tone="warn" icon={TriangleAlert}>
          Possível alérgeno
        </Pill>
      )}
    </span>
  );
}

/**
 * Opções de refeição do agente como cartões selecionáveis (a primeira já marcada), com "O que
 * considerei" em cima e um só "Registrar no jantar" embaixo, que abre o prato pré-preenchido
 * para a pessoa conferir e salvar. O marcador guarda a opção em Seus pratos (com Desfazer).
 * Números só da TACO; sem kcal com calorias ocultas; perfil sensível vê o prato, não números.
 */
export function MealChoice({
  block,
  sensitive,
  messageId,
}: {
  block: OptionsBlock;
  sensitive: boolean;
  messageId: string;
}) {
  const { state, commit, notify } = useApp();
  const register = usePlannedMealRegister();
  const [selected, setSelected] = useState(0);
  const [isSaving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const legendId = useId();
  const profile = state.profile!;
  const today = localDate();
  const hideCalories = profile.hideCalories;
  const calm = isCalmOn(profile, today);
  const allergyDetails = profile.allergyDetails;
  const resolved = useMemo(
    () => block.opcoes.map((option) => resolvePlanned(option.itens, { allergyDetails })),
    [block.opcoes, allergyDetails],
  );
  const kcalGoal = hideCalories || calm ? null : dailyTargets(state, today).calories;
  const chips = consideredChips({ allergyDetails, kcalGoal });
  const title = optionsTitle(block);
  const index = Math.min(selected, block.opcoes.length - 1);
  const option = block.opcoes[index]!;
  const prep = mealPrep(block.refeicao);
  const saveItems = plannedPreset(block.refeicao, resolved[index] ?? []).items;
  const save = async () => {
    if (savingRef.current || !saveItems.length) return;
    const input = {
      id: uid(),
      name: option.nome,
      categoryTag: block.refeicao,
      items: saveItems,
    };
    try {
      saveMealFavorite(state, input);
    } catch (error) {
      notify((error as Error).message, "warning");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    await commit((s) => saveMealFavorite(s, input), "Salvo em Seus pratos.", {
      label: "Desfazer",
      onAction: () =>
        void commit(
          (s) => ({ ...s, savedMeals: s.savedMeals.filter((meal) => meal.id !== input.id) }),
          "Removido de Seus pratos.",
        ),
    }).finally(() => {
      savingRef.current = false;
      setSaving(false);
    });
  };
  return (
    <div className="meal-choice">
      <ConsideredChips chips={chips} />
      <fieldset className="meal-choice-list" data-testid="meal-options" aria-labelledby={legendId}>
        <legend id={legendId} className="sr-only">
          {title}
        </legend>
        {block.opcoes.map((item, i) => {
          const entries = resolved[i] ?? [];
          const firstFood = entries.find((entry) => entry.status === "ok")?.food ?? null;
          const emoji =
            safeEmoji(item.emoji) ?? (firstFood ? glyphForFood(firstFood) : null) ?? FALLBACK_EMOJI;
          return (
            <RadioCard
              key={`${item.nome}-${i}`}
              name={`meal-${messageId}`}
              value={String(i)}
              checked={i === index}
              onChange={() => setSelected(i)}
              layout="row"
              indicator="check"
              media={<FoodGlyph glyph={emoji} size={56} tone="mint" className="meal-choice-glyph" />}
              title={item.nome}
              subtitle={optionSummary(item)}
              footer={
                <OptionPills
                  option={item}
                  resolved={entries}
                  sensitive={sensitive}
                  hideCalories={hideCalories}
                />
              }
            />
          );
        })}
      </fieldset>
      <div className="meal-choice-actions">
        <button
          type="button"
          className="btn meal-choice-register"
          aria-label={`Registrar ${prep}: ${option.nome}`}
          onClick={() => register(block.refeicao, option.itens)}
        >
          <Plus size={20} aria-hidden="true" />
          Registrar {prep}
        </button>
        {saveItems.length > 0 && (
          <button
            type="button"
            className="icon-btn meal-choice-save"
            aria-label={`Salvar ${option.nome} em Seus pratos`}
            disabled={isSaving}
            aria-busy={isSaving}
            onClick={() => void save()}
          >
            <Bookmark size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
