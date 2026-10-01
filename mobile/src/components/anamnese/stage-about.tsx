import { Info } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { ANAMNESE_ABOUT_TIPS } from "@shared/lib/copy";
import { AppText, Button } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

/** "Por quê?" da etapa: o botão entra na linha de ajuda da 1ª pergunta; o painel logo abaixo dela. */
export type AboutSlot = { button: ReactNode; panel: ReactNode };

type Options = {
  isOpen: boolean;
  onToggle: () => void;
  summary: string;
  description: string;
  /** "Continuar depois": sai salvando (primeiro acesso) ou volta ao Meu espaço. */
  onLeave?: () => void;
  isLeaveDisabled?: boolean;
};

/**
 * Monta o "ⓘ Por quê?" (nome acessível "Por quê? Mais sobre esta etapa") e o painel com o resumo, a
 * descrição completa da etapa, as dicas e "Continuar depois" (stageAbout do web). Sem estado: a tela
 * guarda o aberto.
 */
export function stageAbout({ isOpen, onToggle, summary, description, onLeave, isLeaveDisabled }: Options): AboutSlot {
  return {
    button: <AboutButton isOpen={isOpen} onToggle={onToggle} />,
    panel: isOpen ? (
      <AboutPanel summary={summary} description={description} onLeave={onLeave} isLeaveDisabled={isLeaveDisabled} />
    ) : null,
  };
}

function AboutButton({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Por quê? Mais sobre esta etapa"
      accessibilityState={{ expanded: isOpen }}
      aria-expanded={isOpen}
      onPress={onToggle}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Info size={16} color={colors.green700} />
      <AppText heading size={fontSize.base} weight={800} color={colors.green700}>
        Por quê?
      </AppText>
    </Pressable>
  );
}

function AboutPanel({ summary, description, onLeave, isLeaveDisabled }: Omit<Options, "isOpen" | "onToggle">) {
  const styles = useStyles();
  const colors = useThemeColors();
  const paragraph = (text: string) => (
    <AppText size={fontSize.sm} lineHeight={21} color={colors.text2}>
      {text}
    </AppText>
  );
  return (
    <View style={styles.panel} accessibilityLiveRegion="polite" aria-live="polite">
      {paragraph(summary)}
      {description !== summary ? paragraph(description) : null}
      {paragraph(ANAMNESE_ABOUT_TIPS)}
      {onLeave ? (
        <Button label="Continuar depois" variant="text" disabled={isLeaveDisabled} onPress={onLeave} style={styles.leave} />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  /** .q-about: 44 px de toque sem crescer a linha de ajuda (margem negativa, como no web). */
  button: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44, marginVertical: -12, paddingHorizontal: 2 },
  pressed: { opacity: 0.7 },
  // .anamnese-about
  panel: { gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface2 },
  leave: { alignSelf: "flex-start", minHeight: 40 },
}));
