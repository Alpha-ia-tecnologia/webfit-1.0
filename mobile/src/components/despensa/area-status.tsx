import { ActivityIndicator, View } from "react-native";
import { AppText, Button, Notice } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

/**
 * Andamento de uma ação da Despensa, no cartão da ação que o iniciou (role="status"), com
 * "Cancelar solicitação" só nos pedidos ao agente.
 */
export function AreaStatus({ text, onCancel }: { text: string; onCancel?: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.status}>
      <View style={styles.line}>
        <ActivityIndicator color={colors.green600} />
        <AppText role="status" accessibilityLiveRegion="polite" size={fontSize.sm} weight={600} color={colors.text2} style={styles.text}>
          {text}
        </AppText>
      </View>
      {onCancel ? <Button label="Cancelar solicitação" variant="secondary" size="sm" onPress={onCancel} /> : null}
    </View>
  );
}

/** Erro da área (um só role="alert" na tela, no cartão que falhou). */
export function AreaAlert({ text }: { text: string }) {
  return <Notice tone="error">{text}</Notice>;
}

const useStyles = makeStyles(() => ({
  status: { gap: 10, alignItems: "flex-start" },
  line: { flexDirection: "row", alignItems: "center", gap: 10 },
  text: { flexShrink: 1 },
}));
