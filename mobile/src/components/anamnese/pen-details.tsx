import { ChevronDown, Syringe } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { PEN_DETAILS_EMPTY, PEN_DETAILS_TITLE } from "@shared/components/anamnese/pen-details";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows } from "@/theme/tokens";
import { QuestionScaleProvider } from "./q-block";

type Props = {
  summary: string | null;
  isComplete: boolean;
  hasError: boolean;
  /** Abre mesmo completo (editor de seção: a pessoa veio para mudar a resposta). */
  isInitiallyOpen?: boolean;
  children: ReactNode;
};

/**
 * "Caneta e dose" (PenDetails do web): qual caneta, a quantidade por aplicação e a frequência num bloco
 * que abre e fecha. Abre sozinho enquanto falta resposta (ao montar) ou quando há erro; completo,
 * recolhe e mostra o resumo do que a pessoa informou. Nunca sugere dose.
 */
export function PenDetails({ summary, isComplete, hasError, isInitiallyOpen = false, children }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isOpen, setOpen] = useState(!isComplete || isInitiallyOpen);
  const open = isOpen || hasError;
  return (
    <View style={styles.card} testID="pen-details" role="region" aria-label={PEN_DETAILS_TITLE}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
      >
        <View style={styles.icon}>
          <Syringe size={20} color={colors.green700} />
        </View>
        <View style={styles.text}>
          <AppText heading size={fontSize.md} weight={800} lineHeight={20}>
            {PEN_DETAILS_TITLE}
          </AppText>
          <AppText size={fontSize.sm} color={colors.muted} numberOfLines={1}>
            {summary ?? PEN_DETAILS_EMPTY}
          </AppText>
        </View>
        <View style={open ? styles.chevronOpen : undefined}>
          <ChevronDown size={20} color={colors.muted} />
        </View>
      </Pressable>
      {open ? (
        <QuestionScaleProvider value="compact">
          <View style={styles.body}>{children}</View>
        </QuestionScaleProvider>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  // .pen-details: superfície com fio suave e sombra leve, cantos de 20 px.
  card: { borderRadius: 20, backgroundColor: colors.surface, boxShadow: `inset 0px 0px 0px 1px ${colors.borderSoft}, ${shadows.card}` },
  head: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 20 },
  pressed: { opacity: 0.8 },
  icon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.mint100 },
  text: { flex: 1, minWidth: 0 },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  body: { gap: 24, paddingTop: 4, paddingHorizontal: 14, paddingBottom: 18 },
}));
