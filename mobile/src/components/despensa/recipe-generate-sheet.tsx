import { Sparkles } from "lucide-react-native";
import { View } from "react-native";
import { recipeGeneratedLabel } from "@shared/lib/recipe-set";
import type { AppState, KitchenBasicKey } from "@shared/types";
import { AppText, Button, Notice, Sheet } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { KitchenBasics } from "./kitchen-basics";

type Props = {
  visible: boolean;
  state: AppState;
  /** Por que as receitas não podem ser geradas agora (dieta, anamnese, estoque); "" quando podem. */
  reason: string;
  canGenerate: boolean;
  isReviewing: boolean;
  isBusy: boolean;
  onToggleBasic: (key: KitchenBasicKey) => void;
  onGenerate: () => void;
  onDiet: () => void;
  onClose: () => void;
};

/**
 * Folha "Novas receitas" (conceito 06): o que antes ocupava a tela — básicos da cozinha, o motivo quando não dá para
 * gerar, a autorização do agente — e "Criar receitas com meus alimentos". Gerar fecha a folha; o andamento aparece
 * sob "Receitas para sua dieta".
 */
export function RecipeGenerateSheet({ visible, state, reason, canGenerate, isReviewing, isBusy, onToggleBasic, onGenerate, onDiet, onClose }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const latest = state.recipes.at(-1);
  return (
    <Sheet visible={visible} title="Novas receitas" onClose={onClose}>
      <AppText size={fontSize.sm} color={colors.muted}>
        Receitas com os alimentos que você cadastrou, de acordo com o seu plano.
      </AppText>
      {reason ? <Notice>{reason}</Notice> : null}
      <KitchenBasics selected={state.kitchenBasics} disabled={isBusy} onToggle={onToggleBasic} />
      {!state.profile?.consentAi ? (
        <AppText size={fontSize.xs} color={colors.muted}>
          Para criar receitas, autorize o agente em Meu espaço.
        </AppText>
      ) : null}
      {isReviewing ? (
        <AppText size={fontSize.xs} color={colors.muted}>
          Confirme ou descarte a revisão antes de gerar receitas.
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <Button label="Criar receitas com meus alimentos" icon={Sparkles} disabled={!canGenerate} onPress={onGenerate} />
        <Button label="Ver minha dieta" variant="secondary" onPress={onDiet} />
      </View>
      {latest ? (
        <AppText size={fontSize.xs} color={colors.muted}>
          {`Últimas: ${recipeGeneratedLabel(latest.createdAt)}`}
        </AppText>
      ) : null}
    </Sheet>
  );
}

const useStyles = makeStyles(() => ({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
}));
