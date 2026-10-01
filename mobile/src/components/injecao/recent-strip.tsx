import { useState, type Ref } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { fmtDayMonth } from "@shared/lib/format";
import { recentSummary, shortSpotLabel } from "@shared/lib/injection";
import type { Spot } from "@shared/lib/rotation";
import type { InjectionEntry } from "@shared/types";
import { srOnly, webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Card } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontFamily, fontSize } from "@/theme/tokens";
import { BodyMapMini } from "./body-map-mini";

/** Tracejado entre as molduras: a 71 pt do topo da coluna (20 + 16 + 6 + 58/2) e a 32 pt de cada centro. */
const DASH_TOP = 71;
const DASH_INSET = 32;
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;

type Props = {
  injections: readonly InjectionEntry[];
  today: string;
  /** Frequência informada (aplicações por mês): "semanais" no subtítulo. */
  perMonth: number | null | undefined;
  /** Próxima aplicação estimada (só quando a pessoa acompanha a frequência) e o local sugerido. */
  next: { date: string; spot: Spot } | null;
  onSeeAll: () => void;
  /** Título "Últimas aplicações": recebe o foco quando a folha "Aplicação registrada" fecha. */
  headingRef?: Ref<Text>;
};

/**
 * "Últimas aplicações" (conceito 10; RecentStrip do web): faixa com as três últimas (data, há quanto tempo,
 * miniatura do local e o nome curto) e, para quem acompanha a frequência, a próxima estimada em verde
 * tracejado. Registros sem lado acendem a zona inteira: nada inventado.
 */
export function RecentStrip({ injections, today, perMonth, next, onSeeAll, headingRef }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [width, setWidth] = useState(0);
  const { items, subtitle } = recentSummary(injections, today, perMonth);
  if (!items.length) return null;
  const columns = items.length + (next ? 1 : 0);
  const column = width / columns;
  // Do centro da coluna anterior + 32 ao centro desta − 32 (o li + li::before do web).
  const dash = column > 2 * DASH_INSET ? { left: -column / 2 + DASH_INSET, width: column - 2 * DASH_INSET } : null;
  return (
    <Card style={styles.card} testID="recent-strip">
      <View style={styles.head}>
        <View style={styles.grow}>
          <Text ref={headingRef} accessibilityRole="header" {...webAttrs({ tabIndex: -1 })} style={styles.heading}>
            Últimas aplicações
          </Text>
          <AppText size={fontSize.sm} color={colors.muted}>
            {subtitle}
          </AppText>
        </View>
        <Pressable accessibilityRole="button" onPress={onSeeAll} style={({ pressed }) => [styles.all, pressed && styles.pressed]}>
          <AppText heading size={fontSize.base} weight={700} color={colors.sky700}>
            Ver todas
          </AppText>
        </Pressable>
      </View>
      <View
        role="list"
        aria-label="Últimas aplicações"
        style={styles.strip}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      >
        {items.map((item, i) => (
          <View key={item.entry.id} role="listitem" style={styles.column} testID="recent-injection">
            {i > 0 && dash ? <View style={[styles.dash, dash]} {...HIDDEN} /> : null}
            <AppText heading size={fontSize.md} weight={800} lineHeight={20}>
              {item.dateLabel}
            </AppText>
            <AppText size={fontSize.xs} color={colors.muted} lineHeight={16}>
              {item.agoLabel}
            </AppText>
            <BodyMapMini framed tone={i === items.length - 1 ? "last" : "past"} site={item.entry.site} side={item.entry.side ?? null} prefix="Local" />
            <AppText size={fontSize.sm} weight={700} color={colors.text2} lineHeight={16} style={styles.site} {...HIDDEN}>
              {item.shortLabel}
            </AppText>
          </View>
        ))}
        {next ? (
          <View role="listitem" style={styles.column} testID="recent-injection-next">
            {dash ? <View style={[styles.dash, dash]} {...HIDDEN} /> : null}
            <AppText heading size={fontSize.md} weight={800} lineHeight={20} color={colors.green700}>
              {fmtDayMonth(next.date)}
            </AppText>
            <AppText size={fontSize.xs} color={colors.muted} lineHeight={16}>
              próxima
              <AppText style={srOnly}> estimada</AppText>
            </AppText>
            <BodyMapMini framed tone="next" site={next.spot.site} side={next.spot.side} prefix="Local sugerido" />
            <AppText size={fontSize.sm} weight={700} color={colors.text2} lineHeight={16} style={styles.site} {...HIDDEN}>
              {shortSpotLabel(next.spot.site, next.spot.side)}
            </AppText>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 10, paddingVertical: 16, paddingHorizontal: 14 },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  heading: { fontFamily: fontFamily(800, true), fontSize: fontSize.lg, lineHeight: 22, letterSpacing: -0.17, color: colors.text },
  // "Ver todas": alvo de 44 pt que sobe para a linha do título (o margin-top −8 do web).
  all: { minHeight: 44, marginTop: -8, paddingHorizontal: 2, justifyContent: "center" },
  pressed: { opacity: 0.7 },
  strip: { flexDirection: "row" },
  column: { flex: 1, minWidth: 0, alignItems: "center" },
  dash: { position: "absolute", top: DASH_TOP, height: 0, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: colors.border },
  site: { textAlign: "center" },
}));
