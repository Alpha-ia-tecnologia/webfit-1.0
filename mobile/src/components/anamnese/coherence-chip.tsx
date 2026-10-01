import { Info } from "lucide-react-native";
import { View } from "react-native";
import { AppText, Button } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, themeDomainTone } from "@/theme/tokens";

type Props = {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
};

/**
 * Aviso de coerência entre respostas (.coherence-chip): tom neutro, nunca bloqueia e, quando há
 * correção simples, oferece o botão ("Usar 8 h", "Incluir nos medicamentos", "Ajustar à meta").
 */
export function CoherenceChip({ text, actionLabel, onAction, testID }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  return (
    <View testID={testID} role="status" accessibilityLiveRegion="polite" style={[styles.chip, !(actionLabel && onAction) && styles.chipPlain]}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Info size={16} color={domainTone.neutral.fg} />
        </View>
        <AppText size={fontSize.sm} lineHeight={19} color={colors.text2} style={styles.text}>
          {text}
        </AppText>
      </View>
      {actionLabel && onAction ? <Button label={actionLabel} variant="text" onPress={onAction} style={styles.action} /> : null}
    </View>
  );
}

const useStyles = makeStyles((_colors, scheme) => ({
  chip: { gap: 2, paddingTop: 10, paddingBottom: 4, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: themeDomainTone(scheme).neutral.border, backgroundColor: themeDomainTone(scheme).neutral.bg },
  chipPlain: { paddingBottom: 10 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  icon: { marginTop: 1 },
  text: { flex: 1, minWidth: 0 },
  action: { marginLeft: 24 },
}));
