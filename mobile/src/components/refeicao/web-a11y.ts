import { Platform, type TextStyle } from "react-native";

/**
 * aria-pressed, aria-haspopup, aria-controls, aria-invalid e tabIndex não estão nos tipos do React Native (ou
 * não em todos os componentes), mas o react-native-web os repassa ao DOM (no aparelho são
 * ignorados): o estado de alternância dos botões do web, o campo de gramas inválido e o foco
 * programático dos títulos.
 */
export const webAttrs = (props: {
  "aria-pressed"?: boolean;
  /** Rádios e caixas de marcação desenhados com Pressable. */
  "aria-checked"?: boolean;
  /** Botões que abrem e fecham um trecho (o accessibilityState.expanded não chega ao DOM). */
  "aria-expanded"?: boolean;
  /** id (nativeID) do trecho que o botão abre e fecha. */
  "aria-controls"?: string;
  "aria-haspopup"?: "dialog";
  "aria-invalid"?: boolean;
  /** Dia de hoje na faixa da semana (aria-current="date" do web). */
  "aria-current"?: "date";
  tabIndex?: -1 | 0;
}): object => props;

/**
 * Espaço também ativa rádios e interruptores desenhados com Pressable no export web (o react-native-web só
 * liga o Espaço a role=button; Enter já funciona). No aparelho não há teclado: nada é adicionado.
 */
export const spaceKey = (onPress: () => void): object =>
  Platform.OS === "web"
    ? {
        onKeyDown: (event: { key: string; preventDefault: () => void }) => {
          if (event.key !== " ") return;
          event.preventDefault();
          onPress();
        },
      }
    : {};

/**
 * Texto só para leitores de tela (.sr-only do web): invisível, fora do fluxo e ainda lido. No aparelho,
 * caixa de 1 × 1 recortada com o texto transparente, nunca opacidade 0: o TalkBack (e o VoiceOver)
 * pulam views com alfa 0, e o texto (e as regiões vivas) sumiria para quem usa leitor de tela. No
 * export web fica como sempre foi (o leitor de tela do navegador lê o nó com opacidade 0).
 */
export const srOnly: TextStyle = Platform.select<TextStyle>({
  web: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 },
  default: { position: "absolute", width: 1, height: 1, overflow: "hidden", color: "transparent" },
});
