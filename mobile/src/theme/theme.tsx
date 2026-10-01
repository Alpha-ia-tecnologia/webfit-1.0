/**
 * Tema do app nativo (HOJE-X2): provedor, cores do tema e estilos por tema.
 *
 * Todo o app já lê as cores daqui (tests/mobile-theme.test.ts: 0 arquivos pendentes), mas o tema escuro
 * segue desligado: com RN_DARK_MODE_ENABLED = false o app é claro como sempre, a linha "Aparência" do
 * Meu espaço não aparece e o fundo nativo da janela não muda. Ligar é a lista logo abaixo.
 *
 * A preferência ("sistema" / "claro" / "escuro") é do aparelho, na chave-valor local (`webfit-theme`),
 * como no web: não entra no estado, no backup nem no "Excluir dados e recomeçar".
 */
import Storage from "expo-sqlite/kv-store";
import * as SystemUI from "expo-system-ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Appearance, StyleSheet } from "react-native";
import {
  DEFAULT_THEME_PREF,
  memoByScheme,
  parseThemePref,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePref,
} from "@shared/lib/theme";
import { colors, themeColors, type ColorScheme, type ThemeColors } from "./tokens";

/**
 * Chave do tema escuro no app nativo. Desligada, nada muda: tema claro, sem a linha "Aparência",
 * sem mexer no fundo nativo.
 *
 * TODO(HOJE-X2) para ligar:
 *  1. RN_DARK_MODE_ENABLED = true (esta linha).
 *  2. mobile/app.json: "userInterfaceStyle": "automatic" (a catraca de tests/mobile-theme.test.ts
 *     exige os dois juntos).
 *  3. Fundo nativo da janela (Android, atrás das telas, do teclado e das transições): o expo-system-ui
 *     já está em mobile/package.json e o provedor chama SystemUI.setBackgroundColorAsync com a chave
 *     ligada. Se ele sair das dependências, reinstale com `npx expo install expo-system-ui`.
 *  4. Rodar as verificações do RN (tsc, `npm test` na raiz, scripts/o3l4d-check.mjs e as das telas) e
 *     testar num aparelho: modo do sistema, as três opções da Aparência, fechar e reabrir o app.
 *     A abertura (expo-splash-screen) segue clara; um bloco `dark` no plugin evita o clarão.
 */
export const RN_DARK_MODE_ENABLED = false;

export type ThemeValue = {
  scheme: ColorScheme;
  pref: ThemePref;
  colors: ThemeColors;
  setPref: (pref: ThemePref) => void;
};

/** Fora do provedor (ou antes dele) tudo é claro, como sempre foi. */
const LIGHT: ThemeValue = { scheme: "light", pref: DEFAULT_THEME_PREF, colors, setPref: () => undefined };
const ThemeContext = createContext<ThemeValue>(LIGHT);

/**
 * Modo claro/escuro do aparelho, como o useColorScheme do React Native no aparelho (assinatura estável).
 * O useColorScheme do react-native-web reassina a cada render e, no export web, perde a primeira troca
 * do sistema quando outro ouvinte re-renderiza no meio do aviso.
 */
function subscribeSystemScheme(onChange: () => void): () => void {
  const subscription = Appearance.addChangeListener(onChange);
  return () => subscription.remove();
}
const systemScheme = () => Appearance.getColorScheme();

/**
 * Lê e aplica o tema. A preferência salva chega de forma assíncrona (a mesma chave-valor do resto
 * do app): uma leitura síncrona na abertura trava a tela no export web e pode abrir o banco em
 * paralelo com a leitura assíncrona do estado.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useSyncExternalStore(subscribeSystemScheme, systemScheme, systemScheme);
  const [pref, setPrefState] = useState<ThemePref>(DEFAULT_THEME_PREF);
  // Uma escolha feita antes de a leitura terminar vence o valor antigo.
  const hasChosen = useRef(false);
  useEffect(() => {
    let isActive = true;
    Storage.getItemAsync(THEME_STORAGE_KEY)
      .then((value) => {
        if (isActive && !hasChosen.current) setPrefState(parseThemePref(value));
      })
      // Sem leitura (banco indisponível), fica "sistema": só uma conveniência de exibição.
      .catch(() => undefined);
    return () => {
      isActive = false;
    };
  }, []);
  const setPref = useCallback((next: ThemePref) => {
    hasChosen.current = true;
    setPrefState(next);
    // A escolha já vale nesta sessão; se não gravar, a próxima abertura volta ao valor salvo.
    Storage.setItemAsync(THEME_STORAGE_KEY, next).catch(() => undefined);
  }, []);
  const scheme: ColorScheme = RN_DARK_MODE_ENABLED ? resolveTheme(pref, system === "dark") : "light";
  useEffect(() => {
    // Desligado, o fundo nativo fica o do app.json (claro), como sempre foi.
    if (!RN_DARK_MODE_ENABLED) return;
    // Fundo da janela nativa (no web, o <body>) no tema atual; se falhar, sobra só a cor do app.json.
    SystemUI.setBackgroundColorAsync(themeColors(scheme).bg).catch(() => undefined);
  }, [scheme]);
  const value = useMemo<ThemeValue>(
    () => ({ scheme, pref, colors: themeColors(scheme), setPref }),
    [scheme, pref, setPref],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Tema efetivo, preferência salva e o jeito de trocá-la. */
export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/** Cores do tema atual (as mesmas chaves de `colors`). */
export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

/**
 * Folha de estilos por tema, criada sob demanda e guardada (uma por tema, nunca a cada render):
 * `const useStyles = makeStyles((colors) => ({ card: { backgroundColor: colors.surface } }));`
 * e, no componente, `const styles = useStyles();`.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors, scheme: ColorScheme) => T & StyleSheet.NamedStyles<any>,
): () => T {
  const sheetFor = memoByScheme((scheme) => StyleSheet.create<T>(factory(themeColors(scheme), scheme)));
  return function useStyles() {
    return sheetFor(useContext(ThemeContext).scheme);
  };
}
