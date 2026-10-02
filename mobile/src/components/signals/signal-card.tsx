import type { ReactNode } from "react";
import { Lightbulb, MessageCircle, Sparkles, ThumbsUp, X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, radius, shadows, themePillTones } from "@/theme/tokens";

export type SignalTone = "info" | "positive" | "agent";

type Props = {
  tone: SignalTone;
  /** Linha pequena acima do título ("Observado nos seus registros", "Seu agente comentou"). */
  kicker: string;
  title?: string;
  children: ReactNode;
  action?: { label: string; onPress: () => void };
  /** Nome acessível do X ("Dispensar por 3 dias"). */
  dismissLabel: string;
  onDismiss: () => void;
  footnote?: string;
  testID: string;
};

const ICONS = { info: Lightbulb, positive: ThumbsUp, agent: Sparkles } as const;
/** Tons calmos das pílulas (nunca o rosa): céu para cuidado, verde-água para reforço, esmeralda para o agente. */
const PILL_TONE = { info: "sky", positive: "teal", agent: "emerald" } as const;
const ICON_BOX = 36;

/**
 * Cartão pequeno da IA proativa (SignalCard do web): ícone, linha pequena, título, texto curto, uma ação
 * e o X para dispensar. Sem vermelho; cores das pílulas do tema.
 */
export function SignalCard({ tone, kicker, title, children, action, dismissLabel, onDismiss, footnote, testID }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const palette = themePillTones(scheme)[PILL_TONE[tone]];
  const Icon = ICONS[tone];
  return (
    <View style={[styles.card, { borderColor: palette.border === "transparent" ? colors.borderSoft : palette.border }]} testID={testID}>
      <View style={[styles.icon, { backgroundColor: palette.bg }]}>
        <Icon size={18} color={palette.fg} />
      </View>
      <View style={styles.body}>
        <AppText size={fontSize.xs} weight={800} upper tracking={0.06} color={palette.fg} lineHeight={16}>
          {kicker}
        </AppText>
        {title ? (
          <AppText heading size={fontSize.md} weight={800} lineHeight={20} accessibilityRole="header">
            {title}
          </AppText>
        ) : null}
        <View style={styles.text}>{children}</View>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            style={({ pressed }) => [styles.action, { backgroundColor: palette.bg, borderColor: palette.border }, pressed && styles.pressed]}
          >
            <MessageCircle size={16} color={palette.fg} />
            <AppText size={fontSize.sm} weight={700} color={palette.fg} style={styles.shrink}>
              {action.label}
            </AppText>
          </Pressable>
        ) : null}
        {footnote ? (
          <AppText size={fontSize.xs} color={colors.muted}>
            {footnote}
          </AppText>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        onPress={onDismiss}
        hitSlop={6}
        style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
      >
        <X size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}

/** Parágrafo do cartão (texto corrido, 13 px). */
export function SignalText({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <AppText size={fontSize.sm} lineHeight={20} color={colors.text2}>
      {children}
    </AppText>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  icon: { width: ICON_BOX, height: ICON_BOX, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0, gap: 6 },
  text: { gap: 6 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 40,
    marginTop: 2,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  /* Rótulo em duas linhas (telas estreitas) centrado, como .signal-action do web. */
  shrink: { flexShrink: 1, textAlign: "center" },
  dismiss: { width: ICON_BOX, height: ICON_BOX, borderRadius: ICON_BOX / 2, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
}));
