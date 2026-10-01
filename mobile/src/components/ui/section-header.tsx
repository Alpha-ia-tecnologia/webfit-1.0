import { ChevronRight, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { AppText } from "./text";

export type SectionAction = {
  label: string;
  /** Nome acessível quando o rótulo visível é curto ("Diário" → "Ver todas no Diário"); deve contê-lo. */
  accessibilityLabel?: string;
  onPress: () => void;
  /** Seta › depois do rótulo (padrão: sim). */
  chevron?: boolean;
};

type Props = {
  title: string;
  /** title: "Refeições" fs-xl 800 · eyebrow: "SEUS FREQUENTES" fs-xs 800 caixa alta, cinza. */
  variant?: "title" | "eyebrow";
  icon?: LucideIcon;
  /** Contagem ou apoio à direita ("9 resultados", "4 dicas do agente"). */
  count?: string;
  action?: SectionAction;
  /** Outro conteúdo à direita (contador de combinados, menu ⋯). */
  extra?: ReactNode;
  testID?: string;
};

/** Cabeçalho de seção fora de cartão (SectionHeader do web): título à esquerda e uma ação ou contagem à direita. */
export function SectionHeader({ title, variant = "title", icon: Icon, count, action, extra, testID }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isEyebrow = variant === "eyebrow";
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.titleRow}>
        {Icon ? <Icon size={isEyebrow ? 14 : 20} color={isEyebrow ? colors.muted : colors.text} /> : null}
        {isEyebrow ? (
          <AppText size={fontSize.xs} weight={800} upper tracking={0.08} color={colors.muted} accessibilityRole="header" numberOfLines={1}>
            {title}
          </AppText>
        ) : (
          <AppText heading size={fontSize.xl} weight={800} tracking={-0.01} accessibilityRole="header" numberOfLines={1} lineHeight={26}>
            {title}
          </AppText>
        )}
      </View>
      {count ? (
        <AppText size={fontSize.sm} weight={700} color={colors.muted} numberOfLines={1}>
          {count}
        </AppText>
      ) : null}
      {extra}
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          onPress={action.onPress}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <AppText heading size={fontSize.md} weight={800} color={colors.green700} numberOfLines={1}>
            {action.label}
          </AppText>
          {action.chevron !== false ? <ChevronRight size={16} color={colors.green700} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0, minHeight: 32 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, minWidth: 0, marginRight: "auto" },
  /** Alvo de 44 px de altura; a margem negativa devolve o espaço para a linha continuar baixa. */
  action: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, marginVertical: -6, paddingHorizontal: 4 },
  pressed: { opacity: 0.7 },
}));
