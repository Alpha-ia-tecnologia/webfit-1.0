import { X } from "lucide-react-native";
import type { ReactNode, Ref } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, shadows } from "@/theme/tokens";
import { IconButton } from "./icon-button";
import { AppText } from "./text";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Conteúdo fixo abaixo da rolagem (ex.: botão de salvar). */
  footer?: ReactNode;
  /** Tela cheia em azul-marinho, sem alça (modo preparo); o título e o "Fechar" ficam claros. */
  immersive?: boolean;
  /**
   * Chamado quando a folha terminou de sair (Modal.onDismiss: no iOS depois da animação; o web também
   * chama; o Android nunca). Serve para abrir outra folha só depois desta, o que o iOS exige.
   */
  onDismiss?: () => void;
  /** Título focável (tabIndex -1): quem abre a folha pode levar o foco a ele ("Ver lista" da Dieta). */
  titleRef?: Ref<View>;
};

/**
 * Painel inferior que substitui o .modal do web: título, fechar e conteúdo rolável.
 *
 * Teclado: "padding" nas duas plataformas. No Android a folha é uma janela de diálogo de ponta a ponta
 * (navigationBarTranslucent), e nela o adjustResize não encolhe a janela: sem o padding, o teclado
 * cobriria o campo e o botão do rodapé (descrever refeição, perguntas do relatório, estoque, medidas).
 * Se a janela encolher mesmo assim, a sobreposição medida é 0 e nada muda.
 */
export function Sheet({ visible, title, onClose, children, footer, immersive = false, onDismiss, titleRef }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={onDismiss}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "web" ? undefined : "padding"}
        style={styles.fill}
      >
        <Pressable
          style={styles.overlay}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fechar painel"
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 12) + 8 },
            immersive && [styles.immersive, { paddingTop: insets.top + 12 }],
          ]}
          accessibilityViewIsModal
          testID={immersive ? "sheet-immersive" : undefined}
        >
          {immersive ? null : <View style={styles.grabber} />}
          <View style={styles.head}>
            {titleRef ? (
              <View ref={titleRef} accessible accessibilityRole="header" tabIndex={-1} style={styles.title}>
                <AppText heading size={fontSize.lg} weight={700} color={immersive ? colors.white : undefined}>
                  {title}
                </AppText>
              </View>
            ) : (
              <AppText
                heading
                size={fontSize.lg}
                weight={700}
                color={immersive ? colors.white : undefined}
                style={styles.title}
                accessibilityRole="header"
              >
                {title}
              </AppText>
            )}
            <IconButton
              icon={X}
              accessibilityLabel="Fechar"
              tone={immersive ? "inverse" : undefined}
              onPress={onClose}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  fill: { flex: 1, justifyContent: "flex-end" },
  overlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.scrim,
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    boxShadow: shadows.sheet,
  },
  immersive: {
    flex: 1,
    maxHeight: "100%",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    backgroundColor: colors.inverse,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: 10,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { flex: 1 },
  content: { paddingTop: 16, paddingBottom: 8, gap: 16 },
  footer: { paddingTop: 12 },
}));
