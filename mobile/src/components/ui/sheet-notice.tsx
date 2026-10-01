import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, View } from "react-native";
import type { ToastAction, ToastMessage } from "@shared/types";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { AppText } from "./text";

type NoticeType = ToastMessage["type"];
export type SheetNoticeValue = {
  text: string;
  type: NoticeType;
  /** "Desfazer" dentro da folha (o do aviso da janela principal fica coberto por ela). */
  action?: ToastAction;
  /** Só dentro da folha (sem o aviso da janela principal): a própria linha é anunciada, também no web. */
  isLocal?: boolean;
};
type Notify = (message: string, type?: NoticeType) => void;

/**
 * O aviso (Toast) fica na janela principal. Uma folha aberta o cobre: no aparelho ela é outra janela
 * (Modal) e no export web o painel fica por cima dele. Por isso a frase de uma folha aberta aparece
 * dentro dela. `show`: no web o Toast continua anunciando (região viva) e esta cópia é aria-hidden, sem
 * repetir; no aparelho esta linha é o aviso e o leitor de tela a ouve uma vez. `showLocal`: só aqui, com
 * o "Desfazer" (lista de compras na folha), e a linha é a região viva em todas as plataformas.
 */
export function useSheetNotice(notify: Notify): {
  notice: SheetNoticeValue | null;
  show: (text: string, type?: NoticeType) => void;
  showLocal: (text: string, type?: NoticeType, action?: ToastAction) => void;
  clear: () => void;
} {
  const [notice, setNotice] = useState<SheetNoticeValue | null>(null);
  const show = useCallback(
    (text: string, type: NoticeType = "warning") => {
      setNotice({ text, type });
      if (Platform.OS === "web") notify(text, type);
    },
    [notify],
  );
  const showLocal = useCallback(
    (text: string, type: NoticeType = "success", action?: ToastAction) => setNotice({ text, type, action, isLocal: true }),
    [],
  );
  const clear = useCallback(() => setNotice(null), []);
  return { notice, show, showLocal, clear };
}

/**
 * A linha do aviso dentro da folha: âmbar para atenção, verde para sucesso (vermelho só em falha real), com o
 * "Desfazer" quando houver. `onDismiss` limpa a linha depois do "Desfazer".
 */
export function SheetNotice({ notice, onDismiss }: { notice: SheetNoticeValue | null; onDismiss?: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const text = notice?.text ?? "";
  const isLive = !!notice?.isLocal;
  useEffect(() => {
    if (text && Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(text);
  }, [notice, text]);
  if (!notice) return null;
  const isAttention = notice.type === "warning";
  const isError = notice.type === "error";
  const color = isError ? colors.errorTextStrong : isAttention ? colors.amber900 : notice.type === "success" ? colors.green800 : colors.text2;
  const action = notice.action;
  // No web, a cópia de um aviso que o Toast já anuncia fica fora da leitura; a linha local é a região viva.
  const a11y = Platform.OS === "web" ? (isLive ? { role: "status" as const, "aria-live": "polite" as const } : { "aria-hidden": true }) : {};
  return (
    <View style={[styles.box, isAttention && styles.attention, isError && styles.error]} testID="sheet-notice" {...a11y}>
      <AppText size={fontSize.sm} weight={600} lineHeight={20} color={color} style={styles.text}>
        {notice.text}
      </AppText>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={() => {
            onDismiss?.();
            action.onAction();
          }}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <AppText size={fontSize.sm} weight={800} color={colors.green700}>
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface3,
  },
  text: { flex: 1, minWidth: 0 },
  /** Alvo de 44 px sem crescer a linha (margens negativas). */
  action: { minHeight: 44, marginVertical: -10, paddingHorizontal: 8, justifyContent: "center" },
  pressed: { opacity: 0.7 },
  attention: { borderColor: colors.amberBorder, backgroundColor: colors.amber50 },
  error: { borderColor: colors.rose200, backgroundColor: colors.rose50 },
}));
