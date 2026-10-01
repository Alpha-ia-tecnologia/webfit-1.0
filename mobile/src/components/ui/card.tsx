import { createContext, useContext, type ReactNode } from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { makeStyles } from "@/theme/theme";
import { radius, shadows } from "@/theme/tokens";

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
  /** Posição do cartão na tela (ex.: rolar até ele num atalho). */
  onLayout?: (event: LayoutChangeEvent) => void;
};

const FlatContext = createContext(false);

/**
 * Cartões dentro de uma folha (o `.evol-sheet .card` do web): o cartão de sempre (bem-estar, medicação,
 * medidas) sem borda, sombra nem recuo, porque a folha já é a superfície.
 */
export function FlatCards({ children }: { children: ReactNode }) {
  return <FlatContext.Provider value>{children}</FlatContext.Provider>;
}

/** Superfície branca com borda suave e sombra leve (.card). */
export function Card({ children, style, accessibilityLabel, testID, onLayout }: Props) {
  const styles = useStyles();
  const isFlat = useContext(FlatContext);
  return (
    <View style={[styles.card, style, isFlat && styles.flat]} accessibilityLabel={accessibilityLabel} testID={testID} onLayout={onLayout}>
      {children}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 16,
    gap: 12,
    boxShadow: shadows.card,
  },
  flat: { borderWidth: 0, padding: 0, boxShadow: [] },
}));
