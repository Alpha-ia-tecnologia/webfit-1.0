import { useEffect } from "react";
import { AccessibilityInfo, Platform, View, type LayoutChangeEvent } from "react-native";
import { AppText, LiveAnnouncement, SearchField } from "@/components/ui";
import { makeStyles } from "@/theme/theme";
import { srOnly } from "./web-a11y";

/** Frase para o leitor de tela; o contador faz a mesma frase ser anunciada de novo. */
export type Announcement = { text: string; count: number };

type Props = {
  query: string;
  onChange: (query: string) => void;
  /** Contagem anunciada ("12 resultados"), já com o atraso da digitação. */
  announcement: string;
  /** Avisos da tela (ex.: prato carregado), anunciados a cada vez, mesmo repetidos. */
  status: Announcement;
  onLayout?: (event: LayoutChangeEvent) => void;
};

/**
 * role="status" do web: no export web, a região sempre montada troca o texto (e um espaço
 * alternado) para repetir a frase; no aparelho, o anúncio direto do leitor de tela.
 */
function StatusAnnouncement({ status }: { status: Announcement }) {
  useEffect(() => {
    if (Platform.OS === "web" || !status.count || !status.text) return;
    AccessibilityInfo.announceForAccessibility(status.text);
  }, [status]);
  if (Platform.OS !== "web") return null;
  return (
    <AppText role="status" style={srOnly}>
      {status.text}
      {status.count % 2 ? " " : ""}
    </AppText>
  );
}

/** Busca fixa no topo da lista (.meal-search): o fundo esconde o que rola por trás. */
export function MealSearch({ query, onChange, announcement, status, onLayout }: Props) {
  const styles = useStyles();
  return (
    <View style={styles.bar} onLayout={onLayout}>
      <SearchField
        size="lg"
        label="Buscar alimento"
        placeholder="Buscar alimento: arroz, frango…"
        value={query}
        onChange={onChange}
        maxLength={80}
      />
      <LiveAnnouncement message={announcement} />
      <StatusAnnouncement status={status} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: { marginVertical: -8, paddingVertical: 8, backgroundColor: colors.bg },
}));
