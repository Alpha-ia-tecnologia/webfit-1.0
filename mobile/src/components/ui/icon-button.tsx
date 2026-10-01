import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import type { Ref } from "react";
import {
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { gradients, horizontal, radius, shadows } from "@/theme/tokens";

/** Toque mínimo: 44 px em volta do desenho de 40 (ou 30, no pequeno), sem mudar o layout; os do cabeçalho já têm 44. */
const MIN_TOUCH = 44;
const SIZE = { default: 40, small: 30, header: 44, headerRound: 44, ghost: 44, soft: 36 } as const;

type Props = {
  icon: LucideIcon;
  accessibilityLabel: string;
  onPress?: () => void;
  /**
   * default = .icon-btn, small = .icon-btn-sm, header = ações do cabeçalho
   * (.header-actions .icon-btn: 44 × 44, raio 16, superfície sem borda, sombra de cartão); headerRound = o
   * sino redondo de 44 do Hoje (sombra flutuante); ghost = só o ícone cinza, sem fundo nem borda (o ⋯ das linhas
   * do Diário e da Despensa), com o fundo cinza-claro quando aberto; soft = círculo cinza de 36 px (o ⋯ do
   * cabeçalho dos combinados no Hoje), alvo de 44.
   */
  variant?: "default" | "small" | "header" | "headerRound" | "ghost" | "soft";
  /** inverse = sobre o azul-marinho (painel em tela cheia do modo preparo); primary = preenchido com o verde do botão e ícone branco (.icon-btn.is-primary, o "+" da Despensa). */
  tone?: "default" | "danger" | "inverse" | "primary";
  active?: boolean;
  /** Estado de um painel ou menu controlado pelo botão (anunciado como expandido/recolhido). */
  expanded?: boolean;
  disabled?: boolean;
  /** Ponto de aviso (notificações não lidas): esmeralda de 8 px nos botões do cabeçalho, azul nos demais. */
  badge?: boolean;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
  /** Permite devolver o foco do leitor de tela ao próprio botão (ex.: ao fechar um menu). */
  ref?: Ref<View>;
};

export function IconButton({
  icon: Icon,
  accessibilityLabel,
  onPress,
  variant = "default",
  tone = "default",
  active = false,
  expanded,
  disabled = false,
  badge = false,
  iconSize,
  style,
  ref,
}: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const color =
    tone === "danger"
      ? colors.rose600
      : tone === "inverse" || tone === "primary"
        ? colors.white
        : variant === "ghost"
          ? active
            ? colors.text
            : colors.muted
        : active
        ? colors.green700
        : variant === "small"
          ? colors.faint
          : colors.text2;
  const isHeader = variant === "header" || variant === "headerRound";
  const size = iconSize ?? (variant === "small" ? 15 : isHeader ? 22 : 20);
  // O react-native-web ignora hitSlop no Pressable: a área de 44 px é real e transparente, e a margem
  // negativa devolve o espaço; o quadro visível (e o estilo do chamador) fica na View de dentro.
  const inset = (MIN_TOUCH - SIZE[variant]) / 2;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active, expanded }}
      aria-expanded={expanded}
      disabled={disabled}
      onPress={onPress}
      style={[styles.hit, { margin: -inset }]}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.base,
            variant === "small" && styles.small,
            variant === "header" && styles.header,
            variant === "headerRound" && styles.headerRound,
            tone === "inverse" && styles.inverse,
            tone === "primary" && styles.primary,
            variant === "ghost" && styles.ghost,
            variant === "soft" && styles.soft,
            active && (variant === "ghost" ? styles.ghostActive : styles.active),
            pressed && !disabled && styles.pressed,
            disabled && styles.disabled,
            style,
          ]}
        >
          {tone === "primary" ? (
            <>
              <LinearGradient colors={gradients.button} start={horizontal.start} end={horizontal.end} style={styles.fill} />
              {/* O ícone numa View própria: no web, a camada absoluta do gradiente pintaria por cima de um svg solto. */}
              <View>
                <Icon size={size} color={color} />
              </View>
            </>
          ) : (
            <Icon size={size} color={color} />
          )}
          {badge && <View style={isHeader ? styles.headerBadge : styles.badge} />}
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  hit: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
  base: {
    width: SIZE.default,
    height: SIZE.default,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.pressedSurface,
    borderWidth: 1,
    borderColor: colors.pressedBorder,
  },
  small: {
    width: SIZE.small,
    height: SIZE.small,
    borderRadius: 15,
    backgroundColor: colors.surface3,
    borderColor: "transparent",
  },
  header: { width: SIZE.header, height: SIZE.header, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 0, boxShadow: shadows.card },
  headerRound: { width: SIZE.headerRound, height: SIZE.headerRound, borderRadius: SIZE.headerRound / 2, backgroundColor: colors.surface, borderWidth: 0, boxShadow: shadows.float },
  ghost: { width: SIZE.ghost, height: SIZE.ghost, borderRadius: radius.sm, backgroundColor: "transparent", borderWidth: 0 },
  ghostActive: { backgroundColor: colors.surface2 },
  soft: { width: SIZE.soft, height: SIZE.soft, borderRadius: SIZE.soft / 2, backgroundColor: colors.surface2, borderWidth: 0 },
  inverse: { backgroundColor: colors.onFillOverlayFaint, borderColor: colors.onFillBorder },
  primary: { overflow: "hidden", boxShadow: shadows.button },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  active: { backgroundColor: colors.mint50, borderColor: colors.mint200 },
  pressed: { transform: [{ scale: 0.9 }] },
  disabled: { opacity: 0.35 },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.blue,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  /** Ponto do sino no cabeçalho (.notification-dot): 8 px esmeralda com aro da superfície. */
  headerBadge: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.emerald,
    boxShadow: `0px 0px 0px 2px ${colors.surface}`,
  },
}));
