import { ChefHat, RotateCcw } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { AppState, KitchenBasicKey } from "@shared/types";
import { AppText, Button } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows } from "@/theme/tokens";
import { AreaAlert, AreaStatus } from "./area-status";
import { RecipeGenerateSheet } from "./recipe-generate-sheet";
import { RecipeList } from "./recipe-list";
import { BUSY_TEXT, type PantryBusy } from "./types";

type Props = {
  state: AppState;
  hide: boolean;
  today: string;
  busy: PantryBusy;
  /** Motivo que impede gerar (sem dieta, dieta desatualizada, sem alimentos). */
  reason: string;
  canAi: boolean;
  isReviewing: boolean;
  error: string | null;
  onToggleBasic: (key: KitchenBasicKey) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onOpenDiet: () => void;
};

/**
 * Receitas para a dieta (AGENTE-04, conceito 06): título com "Novas" e o carrossel de receitas. Os básicos da cozinha
 * (IA-X4) e "Criar receitas com meus alimentos" ficam na folha de "Novas"; o andamento e o erro aparecem aqui, sob o
 * título.
 */
export function RecipesSection({ state, hide, today, busy, reason, canAi, isReviewing, error, ...actions }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isGenerating, setGenerating] = useState(false);
  const status = busy === "recipe" || busy === "saving_recipe" ? busy : null;
  const open = () => setGenerating(true);
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <AppText heading size={fontSize.lg} weight={800} accessibilityRole="header" style={styles.title}>
          Receitas para sua dieta
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Criar novas receitas"
          onPress={open}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        >
          <View>
            <RotateCcw size={18} color={colors.green700} />
          </View>
          <AppText heading size={fontSize.base} weight={700} color={colors.green700}>
            Novas
          </AppText>
        </Pressable>
      </View>
      {status ? <AreaStatus text={BUSY_TEXT[status]} onCancel={status === "recipe" ? actions.onCancel : undefined} /> : null}
      {error ? <AreaAlert text={error} /> : null}
      {state.recipes.length ? (
        <RecipeList state={state} hide={hide} today={today} />
      ) : (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <ChefHat size={24} color={colors.green700} />
          </View>
          <AppText size={fontSize.base} color={colors.text2}>
            Receitas com o que você tem em casa, no ritmo da sua dieta.
          </AppText>
          <Button label="Criar receitas" onPress={open} />
        </View>
      )}
      <RecipeGenerateSheet
        visible={isGenerating}
        state={state}
        reason={reason}
        canGenerate={canAi && !reason && !isReviewing}
        isReviewing={isReviewing}
        isBusy={!!busy}
        onToggleBasic={actions.onToggleBasic}
        onGenerate={() => {
          setGenerating(false);
          actions.onGenerate();
        }}
        onDiet={() => {
          setGenerating(false);
          actions.onOpenDiet();
        }}
        onClose={() => setGenerating(false)}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: 10 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  title: { flexShrink: 1 },
  /** Alvo de 44 px sem aumentar a linha do título (margens negativas). */
  link: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, marginVertical: -8, paddingHorizontal: 4 },
  pressed: { opacity: 0.7 },
  empty: {
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.mint50,
  },
}));
