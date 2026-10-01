import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { Button } from "./button";
import { EmptyArt, type EmptyArtKind } from "./empty-art";
import { AppText } from "./text";

/** Largura do texto do estado ilustrado (max-width: 34ch do web). */
const EMPTY_TEXT_WIDTH = 280;

/**
 * Estado vazio (SIS-06): ilustração duotone do domínio, título curto, texto e uma ação opcional.
 * Sem `art`, continua o texto centralizado de antes (.empty).
 */
export function Empty({
  children,
  style,
  art,
  title,
  action,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  art?: EmptyArtKind;
  title?: string;
  action?: { label: string; onPress: () => void };
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const text =
    typeof children === "string" ? (
      <AppText size={fontSize.sm} color={colors.muted} align="center" lineHeight={20} style={art && styles.text}>
        {children}
      </AppText>
    ) : (
      children
    );
  if (!art) return <View style={[styles.empty, style]}>{text}</View>;
  return (
    <View style={[styles.empty, styles.illustrated, style]}>
      <View style={styles.art}>
        <EmptyArt kind={art} />
      </View>
      {title ? (
        <AppText heading size={fontSize.md} weight={700} align="center" accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      {text}
      {action ? <Button label={action.label} variant="secondary" size="sm" onPress={action.onPress} style={styles.action} /> : null}
    </View>
  );
}

/** Aviso em caixa esmeralda, âmbar (atenção, sem julgamento) ou vermelha (.notice, .notice.error). */
export function Notice({
  children,
  tone = "info",
  style,
}: {
  children: ReactNode;
  tone?: "info" | "attention" | "error";
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isError = tone === "error";
  const isAttention = tone === "attention";
  const textColor = isError ? colors.errorTextStrong : isAttention ? colors.amber700 : colors.green800;
  return (
    <View
      style={[styles.notice, isError && styles.error, isAttention && styles.attention, style]}
      accessibilityRole={isError || isAttention ? "alert" : undefined}
    >
      {typeof children === "string" ? (
        <AppText size={fontSize.sm} lineHeight={22} color={textColor}>
          {children}
        </AppText>
      ) : (
        children
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  empty: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 16, gap: 10 },
  illustrated: { paddingVertical: 24, gap: 8 },
  art: { marginBottom: 4 },
  text: { maxWidth: EMPTY_TEXT_WIDTH },
  action: { alignSelf: "center", marginTop: 6 },
  notice: {
    borderWidth: 1,
    borderColor: colors.mintBorder,
    backgroundColor: colors.mint50,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.md,
  },
  error: { backgroundColor: colors.rose50, borderColor: colors.rose200 },
  attention: { backgroundColor: colors.amber50, borderColor: colors.amberBorder },
}));
