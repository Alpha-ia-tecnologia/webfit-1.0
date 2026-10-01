import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { makeStyles, useThemeColors } from "@/theme/theme";
import {
  fontSize,
  gradients,
  horizontal,
  radius,
  shadows,
} from "@/theme/tokens";
import { AppText } from "./text";

export type ButtonVariant = "primary" | "secondary" | "danger" | "text" | "link";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: "md" | "sm" | "lg";
  /** Cantos totalmente arredondados (rodapé da anamnese). */
  pill?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  /** Texto e link vermelhos para ações destrutivas (.text-btn.danger). */
  tone?: "default" | "danger";
  disabled?: boolean;
  /**
   * Ação em andamento (ex.: "Salvando…"): ignora toques e é anunciado como ocupado e
   * indisponível, mas continua focável, para o foco não se perder enquanto grava.
   */
  busy?: boolean;
  /** Estado de um painel controlado pelo botão (anunciado como expandido/recolhido). */
  expanded?: boolean;
  /** id (nativeID) do painel que o botão abre e fecha: aria-controls no export web. */
  controls?: string;
  /** O toque abre uma folha: aria-haspopup="dialog" no export web (o aparelho ignora). */
  hasPopup?: "dialog";
  /** Ocupa toda a largura disponível. */
  wide?: boolean;
  /** Área de toque extra só no aparelho (o react-native-web ignora hitSlop no Pressable). */
  hitSlop?: PressableProps["hitSlop"];
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
  /** Texto maior e mais forte num CTA de destaque ("Registrar aplicação" da Seringa: 17 pt, 800). */
  labelSize?: number;
  labelWeight?: 600 | 700 | 800;
};

/** Altura mínima de toque (pt) e altura visual de cada formato sem minHeight. */
const MIN_TOUCH = 44;
const VISUAL_HEIGHT = { text: 32, link: 30, sm: 34, md: 41, lg: 52 };
/** Borda transparente do botão: a camada do desenho a cobre (o absoluto começa dentro da borda). */
const BORDER = 1;

/**
 * Faixa transparente acima e abaixo do desenho para o toque chegar a 44 px. O react-native-web ignora
 * hitSlop no Pressable: a área é real (altura mínima) e a margem negativa devolve o espaço, sem mudar
 * o layout. Estilos do chamador que mudam a altura por padding ou height ficam como estão.
 */
function touchPad(size: "md" | "sm" | "lg", variant: ButtonVariant, custom: ViewStyle): number {
  if (
    custom.height !== undefined ||
    custom.padding !== undefined ||
    custom.paddingVertical !== undefined ||
    custom.paddingTop !== undefined ||
    custom.paddingBottom !== undefined
  )
    return 0;
  // O link usa a fonte de título (linha menor): 30pt de altura, não 32.
  const base =
    size === "lg"
      ? VISUAL_HEIGHT.lg
      : variant === "text" || variant === "link"
        ? VISUAL_HEIGHT[variant]
        : VISUAL_HEIGHT[size];
  const height = Math.max(base, typeof custom.minHeight === "number" ? custom.minHeight : 0);
  return Math.max(0, MIN_TOUCH - height) / 2;
}

/** Margem vertical do chamador (topo e base) para somar à margem negativa da faixa de toque. */
function marginOf(custom: ViewStyle, side: "marginTop" | "marginBottom"): number {
  const value = custom[side] ?? custom.marginVertical ?? custom.margin ?? 0;
  return typeof value === "number" ? value : 0;
}

/** Botões .btn (gradiente), .btn-secondary, .btn-danger, .text-btn e .link-btn. */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  pill = false,
  icon: Icon,
  iconRight: IconRight,
  tone = "default",
  disabled = false,
  busy = false,
  expanded,
  controls,
  hasPopup,
  wide = false,
  hitSlop,
  style,
  accessibilityLabel,
  testID,
  labelSize,
  labelWeight,
}: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  // Ocupado bloqueia o toque como o desativado, mas mantém o botão na ordem de foco
  // (no export web, desativado sai do Tab e o foco se perde no meio da gravação).
  const isInactive = disabled || busy;
  const isBusyOnly = busy && !disabled;
  const isFilled = variant === "primary" || variant === "danger";
  const isPlain = variant === "text" || variant === "link";
  // Texto e link em verde 700 (5,5:1 no branco); o azul da marca não passa AA como texto (2,7:1).
  const foreground = isFilled
    ? colors.white
    : variant === "secondary"
      ? colors.text2
      : tone === "danger"
        ? colors.errorText
        : colors.green700;
  const iconSize = size === "lg" ? 18 : size === "sm" || isPlain ? 15 : 17;
  const custom = StyleSheet.flatten(style) ?? {};
  const corner =
    typeof custom.borderRadius === "number" ? custom.borderRadius : pill ? radius.pill : size === "sm" ? radius.sm : radius.md;
  const pad = touchPad(size, variant, custom);
  const touch = pad
    ? {
        minHeight: MIN_TOUCH,
        marginTop: marginOf(custom, "marginTop") - pad,
        marginBottom: marginOf(custom, "marginBottom") - pad,
      }
    : null;
  // Fundo, borda e sombra ficam numa camada recuada pela faixa de toque: o desenho não cresce.
  const surface = !isPlain && (
    <View
      pointerEvents="none"
      style={[
        styles.surface,
        { top: pad - BORDER, bottom: pad - BORDER, borderRadius: corner },
        variant === "secondary" && styles.secondary,
        variant === "primary" && { boxShadow: shadows.button },
        variant === "danger" && { boxShadow: shadows.danger },
      ]}
    >
      {isFilled && (
        <LinearGradient
          colors={variant === "danger" ? gradients.danger : gradients.button}
          start={horizontal.start}
          end={horizontal.end}
          style={[StyleSheet.absoluteFill, { borderRadius: corner }]}
        />
      )}
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isInactive, busy, expanded }}
      aria-expanded={expanded}
      aria-busy={busy || undefined}
      {...webAttrs({ "aria-controls": controls, "aria-haspopup": hasPopup })}
      disabled={isInactive}
      tabIndex={isBusyOnly ? 0 : undefined}
      onPress={onPress}
      hitSlop={hitSlop}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { borderRadius: corner },
        size === "sm" && styles.small,
        size === "lg" && styles.large,
        isPlain && styles.plain,
        wide && styles.wide,
        pressed && !isInactive && styles.pressed,
        disabled && styles.disabled,
        isBusyOnly && styles.busy,
        style,
        touch,
      ]}
    >
      {surface}
      {/* No export web, um <svg> solto ficaria sob o gradiente absoluto; a View o mantém por cima. */}
      {Icon && (
        <View>
          <Icon size={iconSize} color={foreground} />
        </View>
      )}
      <AppText
        heading={!isPlain || variant === "link"}
        weight={labelWeight ?? (variant === "link" ? 700 : 600)}
        size={labelSize ?? (size === "lg" ? fontSize.md : size === "sm" || isPlain ? fontSize.xs : fontSize.sm)}
        color={foreground}
        align="center"
      >
        {label}
      </AppText>
      {IconRight && (
        <View>
          <IconRight size={iconSize - 2} color={foreground} />
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderWidth: BORDER,
    borderColor: "transparent",
  },
  small: { paddingVertical: 8, paddingHorizontal: 12, gap: 6 },
  large: { minHeight: 52, paddingVertical: 14, paddingHorizontal: 24 },
  surface: { position: "absolute", left: -BORDER, right: -BORDER, borderWidth: BORDER, borderColor: "transparent" },
  secondary: {
    backgroundColor: colors.buttonSheen,
    borderColor: colors.border,
    boxShadow: shadows.soft,
  },
  plain: { paddingVertical: 6, paddingHorizontal: 0, gap: 5 },
  wide: { alignSelf: "stretch" },
  pressed: { transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.45 },
  /** [aria-disabled] da tela de refeição no web: esmaecido, mas ainda legível. */
  busy: { opacity: 0.6 },
}));
