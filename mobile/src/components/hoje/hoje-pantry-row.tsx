import { useRouter } from "expo-router";
import { Package } from "lucide-react-native";
import { View } from "react-native";
import { localDate } from "@shared/lib/domain";
import { pantryCardText } from "@shared/lib/pantry-view";
import { dismissUseFirst, firstUseModel, isUseFirstDismissed, restoreUseFirst, USE_FIRST_COPY } from "@shared/lib/use-first";
import { UseFirstStrip } from "@/components/despensa/use-first-card";
import { ShortcutTile } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles } from "@/theme/theme";
import { radius, shadows } from "@/theme/tokens";

/**
 * Despensa no Hoje em linha compacta de 72 px (PantryRow do web: "Abrir despensa e receitas"). Quando algo vence
 * logo, o "Use primeiro" vem logo abaixo, no mesmo cartão, até a pessoa tocar em "Agora não" (volta amanhã).
 */
export function HojePantryRow() {
  const styles = useStyles();
  const { state, clock, commit } = useApp();
  const router = useRouter();
  const today = localDate(clock);
  const hide = state.profile?.hideCalories ?? true;
  const model = isUseFirstDismissed(state, today) ? null : firstUseModel(state.pantry, today, hide);
  // "Agora não" usa o mesmo id do lembrete das 10:00: dispensado aqui, o lembrete do dia fica lido.
  const dismiss = () =>
    void commit((s) => dismissUseFirst(s, today), USE_FIRST_COPY.dismissed, {
      label: "Desfazer",
      onAction: () => void commit((s) => restoreUseFirst(s, today), USE_FIRST_COPY.restored),
    });
  return (
    <View style={styles.card} testID="pantry-row">
      <ShortcutTile
        layout="row"
        isFlat
        icon={Package}
        tone="attention"
        title="Despensa e geladeira"
        text={pantryCardText(state.pantry)}
        lines={2}
        onPress={() => router.push("/despensa")}
        accessibilityLabel="Abrir despensa e receitas"
      />
      {model ? (
        <View style={styles.strip}>
          <UseFirstStrip
            model={model}
            onRecipes={() => router.push({ pathname: "/despensa", params: { secao: "usar-primeiro" } })}
            onDismiss={dismiss}
          />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { minWidth: 0, borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: shadows.card },
  strip: { marginHorizontal: 14, marginBottom: 14 },
}));
