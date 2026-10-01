import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { recipeStatus } from "@shared/lib/pantry";
import { RECIPE_QUESTIONS_HINT, RECIPE_STALE_NOTICE, recipeGeneratedLabel } from "@shared/lib/recipe-set";
import { bodyNumbers } from "@shared/lib/space";
import { visiblePlainText } from "@shared/lib/text";
import type { AppState, SavedRecipe } from "@shared/types";
import { AppText, Button, Notice, RichText, StatusPill } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { RecipeCard } from "./recipe-card";

/** Cartão do carrossel: 300 px, ou 78 % da tela quando ela é estreita (o web: min(300px, 78vw)). */
const CARD_MAX = 300;
const CARD_SHARE = 0.78;
const CARD_GAP = 12;
/** A faixa encosta na borda direita da tela (o padding da tela é de 16). */
const SCREEN_PADDING = 16;

type Props = { state: AppState; hide: boolean; today: string };

/**
 * Receitas geradas (conceito 06): a última geração em carrossel; as anteriores ficam recolhidas em "Receitas
 * anteriores (N)", cada uma com a data em que foi criada.
 */
export function RecipeList({ state, hide, today }: Props) {
  const styles = useStyles();
  const [isOlderOpen, setOlderOpen] = useState(false);
  const [latest, ...older] = state.recipes.slice().reverse();
  if (!latest) return null;
  return (
    <View style={styles.list}>
      <Generation recipe={latest} state={state} hide={hide} today={today} isLatest />
      {older.length > 0 && (
        <>
          <Toggle
            label={`Receitas anteriores (${older.length})`}
            isOpen={isOlderOpen}
            onPress={() => setOlderOpen((open) => !open)}
          />
          {isOlderOpen &&
            older.map((recipe) => <Generation key={recipe.id} recipe={recipe} state={state} hide={hide} today={today} />)}
        </>
      )}
    </View>
  );
}

type GenerationProps = {
  recipe: SavedRecipe;
  state: AppState;
  hide: boolean;
  today: string;
  /** A última geração não repete a data ("Últimas: criadas hoje às…" fica na folha "Novas receitas"). */
  isLatest?: boolean;
};

/** Uma geração: a data (nas anteriores), se a dieta ou o estoque mudaram, e as receitas (carrossel ou texto). */
function Generation({ recipe, state, hide, today, isLatest = false }: GenerationProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const status = recipeStatus(recipe, state);
  const isStale = status !== "current";
  const [isOpen, setOpen] = useState(false);
  return (
    <View style={styles.generation} testID="recipe-generation">
      {!isLatest || isStale ? (
        <View style={styles.head}>
          {!isLatest ? (
            <AppText size={fontSize.sm} weight={700} color={colors.text2}>
              {recipeGeneratedLabel(recipe.createdAt)}
            </AppText>
          ) : null}
          {isStale ? <StatusPill tone="neutral" label={status === "diet_changed" ? "Dieta alterada" : "Estoque alterado"} /> : null}
        </View>
      ) : null}
      {isStale && (
        <>
          <Notice>{RECIPE_STALE_NOTICE}</Notice>
          <Toggle label={isOpen ? "Ocultar receitas" : "Consultar receitas"} isOpen={isOpen} onPress={() => setOpen((open) => !open)} />
        </>
      )}
      {(!isStale || isOpen) && <GenerationBody recipe={recipe} state={state} hide={hide} today={today} />}
    </View>
  );
}

function GenerationBody({ recipe, state, hide, today }: Omit<GenerationProps, "isLatest">) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(CARD_MAX, Math.round(width * CARD_SHARE));
  const set = recipe.recipeSet;
  if (!set)
    return (
      <View testID="recipe-legacy">
        <RichText
          text={recipe.text}
          hideCalories={hide}
          hideBodyNumbers={state.profile ? bodyNumbers(state.profile, today) === "hidden" : false}
          variant="cards"
          selectable
        />
      </View>
    );
  return (
    <>
      {set.receitas.length > 0 && (
        <ScrollView
          horizontal
          testID="recipe-carousel"
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth + CARD_GAP}
          decelerationRate="fast"
          style={styles.carousel}
          contentContainerStyle={styles.carouselContent}
        >
          {set.receitas.map((card, i) => (
            <RecipeCard key={i} card={card} pantry={state.pantry} hide={hide} today={today} width={cardWidth} />
          ))}
        </ScrollView>
      )}
      {set.perguntas.length > 0 && (
        <View style={styles.questions}>
          <AppText heading size={fontSize.md} weight={700} accessibilityRole="header">
            Antes de sugerir receitas
          </AppText>
          <View role="list" style={styles.questionList}>
            {set.perguntas.map((question, i) => (
              <AppText key={i} role="listitem" size={fontSize.base}>
                {`• ${visiblePlainText(question, hide)}`}
              </AppText>
            ))}
          </View>
          <AppText size={fontSize.sm} color={colors.muted}>
            {RECIPE_QUESTIONS_HINT}
          </AppText>
        </View>
      )}
      {recipe.meta.notes.map((note, i) => (
        <AppText key={i} size={fontSize.xs} color={colors.muted}>
          {visiblePlainText(note, hide)}
        </AppText>
      ))}
    </>
  );
}

/** Mostra ou recolhe um trecho (aria-expanded no web e expanded no aparelho, pelo Button). */
function Toggle({ label, isOpen, onPress }: { label: string; isOpen: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Button
      label={label}
      variant="text"
      iconRight={isOpen ? ChevronUp : ChevronDown}
      expanded={isOpen}
      style={styles.toggle}
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  list: { gap: 12 },
  generation: { gap: 12 },
  head: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  /** O carrossel vai até a borda direita da tela; a sombra dos cartões não é cortada em cima nem embaixo. */
  carousel: { marginRight: -SCREEN_PADDING, flexGrow: 0 },
  carouselContent: { gap: CARD_GAP, paddingTop: 2, paddingBottom: 10, paddingRight: SCREEN_PADDING },
  questions: {
    gap: 8,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  questionList: { gap: 6 },
  toggle: { alignSelf: "flex-start" },
}));
