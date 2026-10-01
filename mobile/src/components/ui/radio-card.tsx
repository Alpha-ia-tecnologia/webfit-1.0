import { LinearGradient } from "expo-linear-gradient";
import { Check } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { spaceKey, webAttrs } from "@/components/refeicao/web-a11y";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, shadows } from "@/theme/tokens";
import { AppText } from "./text";

type Props<T extends string> = {
  /** name do grupo (no web, o input[name]); aqui vira o id "{name}-{value}". O grupo é um View com accessibilityRole="radiogroup". */
  name: string;
  value: T;
  checked: boolean;
  onChange: (value: T) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Bloco à esquerda (row) ou em cima (tile): emoji, ícone. */
  media?: ReactNode;
  /** Pílulas ou dica abaixo do texto. */
  footer?: ReactNode;
  /** radio: bolinha vazia/cheia · check: círculo com ✓ quando marcado. */
  indicator?: "radio" | "check";
  /** row: cartão largo (opções de refeição) · tile: bloco grande lado a lado (Sim/Não). */
  layout?: "row" | "tile";
  /** Nome acessível quando o título é um nó (padrão: o título em texto). */
  accessibilityLabel?: string;
  isInvalid?: boolean;
  disabled?: boolean;
  testID?: string;
};

const MARK = 24;

/**
 * Cartão selecionável (RadioCard do web): marcado = borda verde de 2 px com halo menta e o indicador cheio.
 * Para o leitor de tela é um rádio com o estado marcado (no export web, aria-checked).
 */
export function RadioCard<T extends string>({
  name,
  value,
  checked,
  onChange,
  title,
  subtitle,
  media,
  footer,
  indicator = "check",
  layout = "row",
  accessibilityLabel,
  isInvalid = false,
  disabled = false,
  testID,
}: Props<T>) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isTile = layout === "tile";
  const mark = (
    <View
      style={[
        styles.mark,
        isTile && styles.markTile,
        checked && (indicator === "check" ? styles.checkOn : styles.radioOn),
      ]}
    >
      {checked && indicator === "check" ? <Check size={14} strokeWidth={3} color={colors.white} /> : null}
      {checked && indicator === "radio" ? <View style={styles.radioDot} /> : null}
    </View>
  );
  const titleNode =
    typeof title === "string" ? (
      <AppText heading size={isTile ? fontSize["2xl"] : fontSize.lg} weight={800} lineHeight={isTile ? 30 : 22}>
        {title}
      </AppText>
    ) : (
      title
    );
  const subtitleNode =
    typeof subtitle === "string" ? (
      <AppText size={fontSize.base} color={colors.muted} numberOfLines={1}>
        {subtitle}
      </AppText>
    ) : (
      subtitle
    );
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? (typeof title === "string" ? title : undefined)}
      accessibilityState={{ checked, disabled }}
      {...webAttrs({ "aria-checked": checked, "aria-invalid": isInvalid || undefined })}
      nativeID={`${name}-${value}`}
      disabled={disabled}
      {...(disabled ? {} : spaceKey(() => onChange(value)))}
      onPress={() => onChange(value)}
      testID={testID}
      style={({ pressed }) => [
        styles.card,
        isTile ? styles.tile : styles.row,
        checked && styles.cardOn,
        isInvalid && !checked && styles.cardInvalid,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {isTile && checked ? (
        <LinearGradient colors={[colors.mint50, colors.surface]} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={[StyleSheet.absoluteFill, styles.tileFill]} />
      ) : null}
      {media ? <View style={styles.media}>{media}</View> : null}
      <View style={[styles.body, isTile && styles.bodyTile]}>
        {titleNode}
        {subtitle ? subtitleNode : null}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
      {mark}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    minHeight: 44,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.borderSoft,
    boxShadow: shadows.card,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  /** Bloco grande lado a lado (Sim/Não da caneta): mídia no topo, indicador no canto. */
  tile: { flex: 1, minWidth: 0, minHeight: 118, alignItems: "flex-start", gap: 12, padding: 14 },
  /** Marcado: borda verde de 2 px e halo menta de 4 px (como o .radio-card.is-checked do web). */
  cardOn: { borderColor: colors.green500, boxShadow: `0px 0px 0px 4px ${colors.mint50}, ${shadows.card}` },
  cardInvalid: { borderColor: colors.errorText },
  disabled: { opacity: 0.55 },
  pressed: { transform: [{ scale: 0.99 }] },
  tileFill: { borderRadius: 18 },
  media: { flexShrink: 0 },
  body: { flex: 1, minWidth: 0, gap: 4 },
  /** No bloco, o indicador fica no canto de cima (sobre a mídia); o texto usa a largura toda. */
  bodyTile: { flex: 0, alignSelf: "stretch" },
  footer: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    borderWidth: 2,
    borderColor: colors.slate300,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  markTile: { position: "absolute", top: 12, right: 12 },
  checkOn: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  radioOn: { borderColor: colors.green600 },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.green600 },
}));
