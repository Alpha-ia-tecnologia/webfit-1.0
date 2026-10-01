import { Search, X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontFamily, fontSize, radius, shadows } from "@/theme/tokens";

/** Botão "Limpar busca": 36 px visíveis dentro de 44 px de toque, sem mudar a altura do campo. */
const CLEAR_SIZE = 36;
const CLEAR_HIT = 44;

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Padrão: esvaziar o campo. Em ambos os casos o foco volta ao campo. */
  onClear?: () => void;
  placeholder?: string;
  /** "lg" é o da busca de alimentos (58 px); o padrão serve às buscas em folhas. */
  size?: "md" | "lg";
  autoFocus?: boolean;
  maxLength?: number;
};

/** Campo de busca único (SIS-08): lupa, texto e "Limpar busca" quando há algo digitado. */
export function SearchField({
  label,
  value,
  onChange,
  onClear,
  placeholder,
  size = "md",
  autoFocus = false,
  maxLength,
}: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [isFocused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  const isLarge = size === "lg";
  return (
    <View style={[styles.box, isLarge && styles.large, isFocused && styles.focused]}>
      <Search size={isLarge ? 20 : 16} color={colors.muted} />
      <TextInput
        ref={input}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect={false}
        enterKeyHint="search"
        returnKeyType="search"
        maxLength={maxLength}
        style={[styles.input, isLarge && styles.inputLarge]}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Limpar busca"
          onPress={() => {
            // O botão some com a busca vazia: o foco volta para o campo, pronto para digitar.
            (onClear ?? (() => onChange("")))();
            input.current?.focus();
          }}
          style={styles.clearHit}
        >
          {({ pressed }) => (
            <View style={[styles.clear, pressed && styles.clearPressed]}>
              <X size={16} color={colors.text2} />
            </View>
          )}
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
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  large: {
    gap: 10,
    minHeight: 58,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: 20,
    borderWidth: 2,
    boxShadow: shadows.searchField,
  },
  focused: { borderColor: colors.green600, boxShadow: shadows.searchFocus },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 0,
    color: colors.text,
    fontFamily: fontFamily(400),
    fontSize: fontSize.base,
    // O contorno de foco fica na caixa inteira, não no campo. "solid" com largura 0: o contorno
    // "auto" do Chrome ignora a largura e desenharia o anel dentro da caixa.
    outlineStyle: "solid",
    outlineWidth: 0,
  },
  inputLarge: { minHeight: 52, fontSize: fontSize.lg },
  clearHit: {
    width: CLEAR_HIT,
    height: CLEAR_HIT,
    margin: -(CLEAR_HIT - CLEAR_SIZE) / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  clear: {
    width: CLEAR_SIZE,
    height: CLEAR_SIZE,
    borderRadius: CLEAR_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  clearPressed: { backgroundColor: colors.border },
}));
