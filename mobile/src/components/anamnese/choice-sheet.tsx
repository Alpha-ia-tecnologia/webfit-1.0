import { useEffect, useState, type ReactNode } from "react";
import { Search } from "lucide-react-native";
import { TextInput, View } from "react-native";
import { AppText, Button, Sheet } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontFamily, fontSize, radius, shadows } from "@/theme/tokens";
import { useChoiceGrid } from "./choice-chip";

type Props = {
  visible: boolean;
  /** Rótulo da pergunta: título da folha e nome da busca. */
  label: string;
  /** Nome da pílula de texto livre ("Outros", "Outra"), citado quando a busca não acha nada. */
  otherLabel?: string;
  query: string;
  onQuery: (query: string) => void;
  /** Pílulas já filtradas pela busca. */
  children: ReactNode;
  isEmpty: boolean;
  onClose: () => void;
};

/** Folha "Ver mais": busca (.choice-search), todas as opções em pílulas e "Concluir". */
export function ChoiceSheet({ visible, label, otherLabel = "Outros", query, onQuery, children, isEmpty, onClose }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isFocused, setFocused] = useState(false);
  // A folha (Modal) desmonta o campo sem onBlur: ao fechar, o anel de foco não pode voltar aceso.
  useEffect(() => {
    if (!visible) setFocused(false);
  }, [visible]);
  const choiceGrid = useChoiceGrid();
  return (
    <Sheet
      visible={visible}
      title={label}
      onClose={onClose}
      footer={<Button label="Concluir" wide onPress={onClose} />}
    >
      <View style={[styles.search, isFocused && styles.searchFocused]}>
        <Search size={16} color={colors.muted} />
        <TextInput
          value={query}
          placeholder="Buscar opção"
          placeholderTextColor={colors.muted}
          accessibilityLabel={`Buscar em ${label}`}
          inputMode="search"
          enterKeyHint="search"
          autoCorrect={false}
          onChangeText={onQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.input}
        />
      </View>
      <View style={choiceGrid}>{children}</View>
      {isEmpty ? (
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={18}>
          {`Nenhuma opção encontrada. Use "${otherLabel}".`}
        </AppText>
      ) : null}
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchFocused: { borderColor: colors.green600, boxShadow: shadows.focus },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    color: colors.text,
    fontFamily: fontFamily(400),
    fontSize: fontSize.base,
    // O anel de foco fica no contorno inteiro (.choice-search:focus-within), não no campo.
    outlineWidth: 0,
  },
}));
