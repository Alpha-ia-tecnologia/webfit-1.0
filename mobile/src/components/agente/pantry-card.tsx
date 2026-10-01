import { useRouter } from "expo-router";
import { Package } from "lucide-react-native";
import { localDate } from "@shared/lib/domain";
import { pantryCardText } from "@shared/lib/pantry-view";
import { dismissUseFirst, firstUseModel, isUseFirstDismissed, restoreUseFirst, USE_FIRST_COPY } from "@shared/lib/use-first";
import { UseFirstStrip } from "@/components/despensa/use-first-card";
import { AppText, Button, Card, SectionHead } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

/**
 * Cartão da despensa no Hoje e na Dieta: quantos alimentos entram nas receitas (vencidos ficam de fora).
 * No Hoje (`showUseFirst`), o "Use primeiro" (AGENTE-13) aparece dentro do cartão até "Agora não".
 */
export function PantryCard({ showUseFirst = false }: { showUseFirst?: boolean }) {
  const colors = useThemeColors();
  const { state, clock, commit } = useApp();
  const router = useRouter();
  const today = localDate(clock);
  const hide = state.profile?.hideCalories ?? true;
  const model =
    showUseFirst && !isUseFirstDismissed(state, today) ? firstUseModel(state.pantry, today, hide) : null;
  // "Agora não" usa o mesmo id do lembrete das 10:00: dispensado aqui, o lembrete do dia fica lido.
  const dismiss = () =>
    void commit((s) => dismissUseFirst(s, today), USE_FIRST_COPY.dismissed, {
      label: "Desfazer",
      onAction: () => void commit((s) => restoreUseFirst(s, today), USE_FIRST_COPY.restored),
    });
  return (
    <Card>
      <SectionHead title="Despensa e geladeira" />
      <AppText color={colors.muted} size={fontSize.sm}>
        {pantryCardText(state.pantry)}
      </AppText>
      <Button
        label="Abrir despensa e receitas"
        icon={Package}
        variant="secondary"
        onPress={() => router.push("/despensa")}
      />
      {model ? (
        <UseFirstStrip
          model={model}
          onRecipes={() => router.push({ pathname: "/despensa", params: { secao: "usar-primeiro" } })}
          onDismiss={dismiss}
        />
      ) : null}
    </Card>
  );
}
