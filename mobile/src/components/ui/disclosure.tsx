import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { AppText } from "./text";

/** Área de toque mínima do resumo (pt). */
const MIN_TOUCH = 44;

/** Bloco recolhível com resumo verde (<details> do web: "Como calculamos?", "Saiba mais…"). */
export function Disclosure({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: ReactNode;
  /** Começa aberto (ex.: "Avançado: servidor do agente" quando o agente está sem conexão). */
  defaultOpen?: boolean;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isOpen, setOpen] = useState(defaultOpen ?? false);
  const Icon = isOpen ? ChevronDown : ChevronRight;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        aria-expanded={isOpen}
        onPress={() => setOpen(!isOpen)}
        style={({ pressed }) => [styles.summary, pressed && styles.pressed]}
      >
        <Icon size={16} color={colors.green700} />
        <AppText size={fontSize.sm} weight={700} color={colors.green700}>
          {title}
        </AppText>
      </Pressable>
      {isOpen && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  summary: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: MIN_TOUCH,
  },
  pressed: { opacity: 0.7 },
  body: { gap: 10, paddingBottom: 2 },
}));
