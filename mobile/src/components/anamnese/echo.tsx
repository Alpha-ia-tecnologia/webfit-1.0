import { HeartHandshake } from "lucide-react-native";
import { View } from "react-native";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

/**
 * Faixa de eco depois de uma resposta-chave (.anamnese-echo; ex.: "O agente vai deixar amendoim
 * fora das sugestões"). A região viva fica sempre montada para anunciar quando o texto muda;
 * sem texto, não há caixa. `isCompact` (caneta, conceito 07): só o ícone e a frase, sem caixa.
 */
export function Echo({ text, isCompact = false }: { text: string | null; isCompact?: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View accessibilityLiveRegion="polite" aria-live="polite">
      {text ? (
        <View style={[styles.strip, isCompact && styles.compact]}>
          <View style={styles.icon}>
            <HeartHandshake size={16} color={isCompact ? colors.muted : colors.green700} />
          </View>
          <AppText size={fontSize.sm} lineHeight={19} color={isCompact ? colors.muted : colors.green800} style={styles.text}>
            {text}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  strip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.mintBorder,
    backgroundColor: colors.mint50,
  },
  compact: { marginTop: 12, paddingVertical: 0, paddingHorizontal: 0, borderWidth: 0, backgroundColor: "transparent" },
  icon: { marginTop: 1 },
  text: { flex: 1, minWidth: 0 },
}));
