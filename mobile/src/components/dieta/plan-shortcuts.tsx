import { useRouter } from "expo-router";
import { ChefHat, Droplets, Lightbulb, Refrigerator, ScanText, ShoppingBasket, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { pantryTileText, shoppingTileText, tipKind, type TipKind } from "@shared/lib/diet-week";
import { localDate } from "@shared/lib/domain";
import { plural } from "@shared/lib/format";
import { SHOPPING_COPY } from "@shared/lib/shopping-list";
import { ShoppingSuggestSheet } from "@/components/despensa/shopping-suggest-sheet";
import { AppText, IconTile, ShortcutTile } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, shadows, type Domain } from "@/theme/tokens";

const TIP_ICON: Record<TipKind, { icon: LucideIcon; tone: Domain }> = {
  water: { icon: Droplets, tone: "water" },
  pantry: { icon: Refrigerator, tone: "neutral" },
  label: { icon: ScanText, tone: "attention" },
  shopping: { icon: ShoppingBasket, tone: "neutral" },
  cooking: { icon: ChefHat, tone: "food" },
  other: { icon: Lightbulb, tone: "attention" },
};
/** Largura de cada dica na faixa rolável (min(252 px, 74%) do web). */
const TIP_WIDTH = 252;
/** Abaixo desta largura (o @media 359px do web) Despensa e Compras ficam em uma coluna. */
const ONE_COLUMN_BELOW_WIDTH = 360;

/** Primeira parte da dica (até ";" ou ":") em destaque; o resto em cinza. O texto inteiro aparece. */
function splitTip(tip: string): [string, string] {
  const match = /^(.{8,90}?[;:])\s+(.+)$/.exec(tip.trim());
  return match ? [match[1]!.replace(/[;:]$/, ""), match[2]!] : [tip.trim(), ""];
}

/**
 * "Para facilitar" (PlanShortcuts do web, conceito 04): as dicas do agente em atalhos com ícone por assunto (faixa
 * rolável, o texto inteiro, sem números do modelo) e os atalhos do app para a Despensa e as Compras. As dicas são
 * texto livre do plano: sem ação própria.
 */
export function PlanShortcuts({ tips }: { tips: readonly string[] }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const router = useRouter();
  const [isShopOpen, setShopOpen] = useState(false);
  const pantry = pantryTileText(state.pantry, localDate());
  const shopCount = state.shoppingList.length;
  const isOneColumn = useWindowDimensions().width < ONE_COLUMN_BELOW_WIDTH;
  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <AppText heading size={fontSize.lg} weight={800} accessibilityRole="header" style={styles.title}>
          Para facilitar
        </AppText>
        {tips.length ? (
          <AppText size={fontSize.base} color={colors.muted}>
            {plural(tips.length, "dica do agente", "dicas do agente")}
          </AppText>
        ) : null}
      </View>
      {tips.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={TIP_WIDTH + 12}
          decelerationRate="fast"
          style={styles.tipsScroller}
          contentContainerStyle={styles.tips}
          role="list"
          aria-label="Dicas do agente"
        >
          {tips.map((tip, index) => {
            const { icon, tone } = TIP_ICON[tipKind(tip)];
            const [lead, rest] = splitTip(tip);
            return (
              <View key={`${index}-${tip}`} role="listitem" style={styles.tip}>
                <IconTile icon={icon} tone={tone} size="md" />
                <AppText size={fontSize.sm} lineHeight={18} color={colors.muted} style={styles.tipText}>
                  <AppText size={fontSize.sm} weight={700} color={colors.text}>
                    {lead}
                  </AppText>
                  {rest ? ` ${rest}` : ""}
                </AppText>
              </View>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={[styles.tiles, isOneColumn && styles.tilesColumn]}>
        <View style={styles.cell}>
          <ShortcutTile
            icon={Refrigerator}
            tone="neutral"
            title="Despensa"
            text={pantry.text}
            dot={pantry.isSoon ? "attention" : undefined}
            accessibilityLabel="Abrir despensa e receitas"
            onPress={() => router.push("/despensa")}
            isDense
            testID="plan-pantry"
          />
        </View>
        <View style={styles.cell}>
          <ShortcutTile
            icon={ShoppingBasket}
            tone="neutral"
            title="Compras"
            text={shoppingTileText(shopCount)}
            accessibilityLabel={SHOPPING_COPY.build}
            onPress={() => setShopOpen(true)}
            secondary={
              shopCount > 0
                ? {
                    label: shoppingTileText(shopCount),
                    // Contém o rótulo visível ("3 itens na lista").
                    accessibilityLabel: `Ver lista: ${shoppingTileText(shopCount)}`,
                    onPress: () => router.push({ pathname: "/despensa", params: { secao: "compras" } }),
                  }
                : undefined
            }
            isDense
            testID="shopping-entry"
          />
        </View>
      </View>
      <ShoppingSuggestSheet visible={isShopOpen} onClose={() => setShopOpen(false)} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 12, minWidth: 0, marginTop: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { flex: 1, minWidth: 0 },
  /** A faixa encosta nas bordas da tela (−16 px), como o web; o respiro de baixo deixa a sombra aparecer. */
  tipsScroller: { marginHorizontal: -16 },
  tips: { gap: 12, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8 },
  tip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: TIP_WIDTH,
    minHeight: 72,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  tipText: { flex: 1, minWidth: 0 },
  tiles: { flexDirection: "row", gap: 12 },
  tilesColumn: { flexDirection: "column" },
  cell: { flex: 1, minWidth: 0 },
}));
