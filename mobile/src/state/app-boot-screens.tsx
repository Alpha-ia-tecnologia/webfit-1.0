import { ActivityIndicator, Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Logo } from "@/components/brand/logo";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, Button, Card, SkeletonCard } from "@/components/ui";
import { confirmAsync } from "@/lib/confirm";
import { clearState, exportJson, readRaw } from "@/lib/storage";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

type LoadErrorProps = {
  message: string;
  /** Nova mensagem de falha (ex.: não deu para ler o armazenamento ao exportar). */
  onError: (message: string) => void;
  /** Chamado depois que os dados locais foram apagados: o app recomeça do zero. */
  onCleared: () => void;
};

/** Dados salvos ilegíveis: exportar uma cópia para recuperação ou apagar e recomeçar. */
export function LoadErrorScreen({ message, onError, onCleared }: LoadErrorProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.recovery}>
      <Logo />
      <Card>
        <AppText heading size={fontSize.xl} weight={800} accessibilityRole="header">
          Seus dados precisam de atenção
        </AppText>
        <AppText color={colors.text2} accessibilityRole="alert">
          {message}
        </AppText>
        <Button
          label="Exportar cópia para recuperação"
          wide
          onPress={async () => {
            try {
              await exportJson(await readRaw(), "webfit-recuperacao.json");
            } catch {
              onError(
                "Não foi possível ler o armazenamento. Tente reabrir o aplicativo.",
              );
            }
          }}
        />
        <Button
          label="Excluir dados e recomeçar"
          variant="danger"
          wide
          onPress={async () => {
            if (
              await confirmAsync(
                "Excluir dados deste aparelho?",
                "Os dados locais serão apagados e o app recomeça do zero. Esta ação não pode ser desfeita.",
                "Excluir e recomeçar",
                true,
              )
            ) {
              await clearState();
              onCleared();
            }
          }}
        />
      </Card>
    </View>
  );
}

/** Abertura: a forma das telas no lugar do texto solto; o status continua para o leitor de tela. */
export function BootSkeleton() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.boot, { paddingTop: insets.top + 24 }]} aria-busy testID="app-skeleton">
      <Logo />
      <AppText role="status" accessibilityLiveRegion="polite" style={srOnly}>
        Abrindo seu espaço…
      </AppText>
      <SkeletonCard rows={1} />
      <SkeletonCard chart />
      <SkeletonCard rows={3} />
    </View>
  );
}

/** Cobre o app enquanto os dados são substituídos; a pilha de navegação permanece montada por baixo. */
export function RestoringOverlay({ visible }: { visible: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Modal
      visible={visible}
      animationType="none"
      onRequestClose={() => undefined}
    >
      <View
        style={styles.recovery}
        accessibilityViewIsModal
        accessibilityState={{ busy: true }}
      >
        <Logo />
        <ActivityIndicator size="large" color={colors.primary} />
        <AppText accessibilityLiveRegion="polite">
          Atualizando seus dados…
        </AppText>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  boot: {
    flex: 1,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16,
  },
  recovery: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 24,
  },
}));
