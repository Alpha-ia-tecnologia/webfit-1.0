import { History, Info } from "lucide-react-native";
import type { ReactNode, Ref } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { webAttrs } from "./web-a11y";

type TitleProps = {
  children: string;
  /** Relógio de "Seus frequentes". */
  withHistory?: boolean;
  /** Título do prato: verde e com foco programático ("Ver prato"). */
  isPlate?: boolean;
  titleRef?: Ref<View>;
};

/** Título de seção em versalete (.food-section-title). */
export function SectionTitle({ children, withHistory = false, isPlate = false, titleRef }: TitleProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const color = isPlate ? colors.green800 : colors.muted;
  return (
    <View
      ref={titleRef}
      style={styles.title}
      accessible
      accessibilityRole="header"
      accessibilityLabel={children}
      {...(isPlate ? webAttrs({ tabIndex: -1 }) : null)}
    >
      {withHistory ? <History size={16} color={color} /> : null}
      <AppText size={fontSize.xs} weight={800} tracking={0.08} upper color={color} lineHeight={16}>
        {children}
      </AppText>
    </View>
  );
}

type SectionProps = {
  title: string;
  withHistory?: boolean;
  /** Cabeçalho próprio (ex.: "Tabela TACO" com informação e contagem). */
  head?: ReactNode;
  children: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
};

/** Seção com título e a lista de alimentos (.food-section + .food-list). */
export function FoodSection({ title, withHistory, head, children, onLayout }: SectionProps) {
  const styles = useStyles();
  return (
    <View style={styles.section} onLayout={onLayout}>
      {head ?? <SectionTitle withHistory={withHistory}>{title}</SectionTitle>}
      <View style={styles.list} role="list" aria-label={title}>
        {children}
      </View>
    </View>
  );
}

/** "Tabela TACO (i) · N resultados". */
export function TacoHead({ count, onInfo }: { count: string; onInfo: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.head}>
      <SectionTitle>Tabela TACO</SectionTitle>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sobre a Tabela TACO e as medidas caseiras"
        {...webAttrs({ "aria-haspopup": "dialog" })}
        onPress={onInfo}
        style={styles.infoHit}
      >
        {({ pressed }) => (
          <View style={[styles.info, pressed && styles.infoPressed]}>
            <Info size={16} color={colors.muted} />
          </View>
        )}
      </Pressable>
      <AppText size={fontSize.xs} weight={600} color={colors.muted} style={styles.count}>
        {count}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: 10 },
  list: { gap: 10 },
  title: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 4 },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  /** Toque de 44 px em volta do círculo de 32 (sem hitSlop, que o web ignora), sem mudar o layout. */
  infoHit: { width: 44, height: 44, margin: -6, alignItems: "center", justifyContent: "center" },
  info: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  infoPressed: { backgroundColor: colors.surface2 },
  count: { marginLeft: "auto" },
}));
