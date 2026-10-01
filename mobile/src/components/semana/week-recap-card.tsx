import { CalendarCheck, CheckCircle2, ChevronRight, Droplets, Scale, Smile, UtensilsCrossed, X, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import type { RecapTile, RecapTileKey, WeekRecap } from "@shared/lib/week-recap";
import { EvolIcon } from "@/components/evolucao/evol-icon";
import { MoodFace } from "@/components/hoje/mood-card";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, Button, Card, IconButton } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";

const ICONS: Record<RecapTileKey, LucideIcon> = {
  registros: CalendarCheck,
  peso: Scale,
  agua: Droplets,
  bem_estar: Smile,
  combinados: CheckCircle2,
  refeicoes: UtensilsCrossed,
};
/** Cartão com 640 pt ou mais: os blocos ficam numa linha só (4 × 1), como o @container do web. */
const WIDE_CARD = 640;
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;

/** Um bloco: ícone (ou o rosto do humor), rótulo, valor e detalhe; a variação do peso vai no chip navy. */
function Tile({ tile, isWide }: { tile: RecapTile; isWide: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View role="listitem" style={[styles.tile, isWide && styles.tileWide]}>
      <View style={styles.tileVisual} {...HIDDEN}>
        {tile.face ? <MoodFace rating={tile.face} size={28} /> : <EvolIcon icon={ICONS[tile.key]} tone={tile.tone} small />}
        <AppText size={fontSize.xs} weight={600} color={colors.muted}>
          {tile.label}
        </AppText>
        <AppText heading size={fontSize.xl} weight={800} tracking={-0.02} style={styles.tabular}>
          {tile.value}
        </AppText>
        {tile.detail &&
          (tile.key === "peso" ? (
            <View style={styles.delta}>
              <AppText size={fontSize.xs} weight={700} color={colors.white} style={styles.tabular}>
                {tile.detail}
              </AppText>
            </View>
          ) : (
            <AppText size={fontSize.xs} color={colors.muted}>
              {tile.detail}
            </AppText>
          ))}
      </View>
      <AppText style={srOnly}>{tile.aria}</AppText>
    </View>
  );
}

type Props = {
  recap: WeekRecap;
  onOpen: () => void;
  /** Só no Hoje (a Evolução mantém o cartão como entrada permanente dos stories). */
  onDismiss?: () => void;
};

/** "Sua semana" (EVOL-05): 2 a 4 blocos da última semana completa e a entrada dos stories. */
export function WeekRecapCard({ recap, onOpen, onDismiss }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [width, setWidth] = useState(0);
  const isWide = width >= WIDE_CARD;
  return (
    <Card testID="week-recap" style={styles.card}>
      <View style={styles.head}>
        <AppText heading size={fontSize.lg} weight={800} accessibilityRole="header" style={styles.grow}>
          Sua semana{" "}
          <AppText size={fontSize.sm} weight={600} color={colors.muted}>
            {recap.week.label}
          </AppText>
        </AppText>
        {onDismiss && <IconButton icon={X} accessibilityLabel="Dispensar resumo da semana" onPress={onDismiss} />}
      </View>
      <View
        role="list"
        aria-label="Resumo da semana"
        style={styles.grid}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      >
        {recap.tiles.map((tile) => (
          <Tile key={tile.key} tile={tile} isWide={isWide} />
        ))}
      </View>
      <Button label="Ver sua semana" iconRight={ChevronRight} wide onPress={onOpen} />
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  grow: { flex: 1, minWidth: 0 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { flexBasis: "46%", flexGrow: 1, minWidth: 0, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
  tileWide: { flexBasis: "22%" },
  tileVisual: { gap: 4, alignItems: "flex-start" },
  delta: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.inverse },
  tabular: { fontVariant: ["tabular-nums"] },
}));
