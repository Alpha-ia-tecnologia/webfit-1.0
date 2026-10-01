import { CircleCheck, Share2, UtensilsCrossed } from "lucide-react-native";
import { View, type DimensionValue } from "react-native";
import { dayBars } from "@shared/lib/evolution";
import { plural } from "@shared/lib/format";
import { slideTitles, type WeekRecap } from "@shared/lib/week-recap";
import { DayRing } from "@/components/evolucao/consistency-card";
import { InsightChips } from "@/components/evolucao/insight-chips";
import { CrossReadingView, WellbeingWeek } from "@/components/evolucao/wellbeing-card";
import { AppText, Button } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";

/** Um sétimo da largura: os 7 dias cabem a 320 px. */
const COLUMN = `${100 / 7}%` as const;
const RING = 36;
const BARS_HEIGHT = 96;
/** Barra mínima de um dia com registro (em % da altura), para não sumir. */
const MIN_FILL_PCT = 4;
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;
const pct = (value: number): DimensionValue => `${value}%`;

type SlideProps = { recap: WeekRecap };

/** 1 · Sua semana: o período, "6 de 7" dias com registro e os anéis de presença (água, refeição, combinado). */
function Cover({ recap }: SlideProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { cover } = recap.slides;
  return (
    <>
      <AppText size={fontSize.md} weight={600} color={colors.text2}>
        {cover.range}
      </AppText>
      <AppText size={fontSize.md} color={colors.text2}>
        <AppText heading size={fontSize["5xl"]} weight={800} style={styles.tabular}>
          {cover.lead}
        </AppText>{" "}
        dias com registro
      </AppText>
      <View role="list" aria-label={`Registros de ${recap.week.aria}`} style={styles.row}>
        {cover.days.map((day, i) => (
          <View key={day.date} accessible role="listitem" aria-label={day.aria} style={styles.cell}>
            <View style={styles.dayStack} {...HIDDEN}>
              <AppText size={fontSize.xs} weight={700} color={colors.muted}>
                {cover.weekdays[i]}
              </AppText>
              <View style={styles.ring}>
                <DayRing day={day} />
                <View style={styles.ringCenter}>
                  <AppText size={fontSize.xs} weight={600} color={colors.text2} style={styles.tabular}>
                    {day.day}
                  </AppText>
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

/** 2 · Água e refeições: média de água por dia com as 7 barras (sem linha de meta) e as refeições. */
function Routine({ recap }: SlideProps) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const { water, meals, empty } = recap.slides.routine;
  const bars = water ? dayBars(water.points, recap.week.end).bars : [];
  return (
    <>
      {water && (
        <View style={styles.block}>
          <AppText heading size={fontSize["4xl"]} weight={800} style={styles.tabular}>
            {water.average}
          </AppText>
          <AppText size={fontSize.sm} color={colors.text2}>
            {water.caption}
          </AppText>
          <View role="img" aria-label={water.aria} style={styles.bars}>
            {bars.map((bar) => (
              <View key={bar.date} style={styles.bar} {...HIDDEN}>
                {bar.hasRecord ? (
                  <View
                    style={[
                      styles.fill,
                      { height: pct(Math.max(MIN_FILL_PCT, bar.heightPct)), backgroundColor: themeDomainTone(scheme).water.fg },
                    ]}
                  />
                ) : (
                  <View style={styles.emptyBar} />
                )}
              </View>
            ))}
          </View>
          <View style={styles.row} {...HIDDEN}>
            {bars.map((bar) => (
              <View key={bar.date} style={styles.cell}>
                <AppText size={fontSize["2xs"]} weight={600} color={colors.muted}>
                  {bar.label}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      )}
      {meals && (
        <View style={styles.line}>
          <View {...HIDDEN}>
            <UtensilsCrossed size={18} color={themeDomainTone(scheme).food.fg} />
          </View>
          <AppText size={fontSize.md} weight={600} style={styles.grow}>
            {meals}
          </AppText>
        </View>
      )}
      {empty && (
        <AppText size={fontSize.md} color={colors.text2}>
          {empty}
        </AppText>
      )}
    </>
  );
}

/** 3 · Bem-estar e sono: as colunas da semana resumida e a leitura cruzada (descritiva). */
function Wellbeing({ recap }: SlideProps) {
  const colors = useThemeColors();
  const { trend, empty } = recap.slides.wellbeing;
  if (empty)
    return (
      <AppText size={fontSize.md} color={colors.text2}>
        {empty}
      </AppText>
    );
  return (
    <>
      <InsightChips chips={trend.stats} label="Destaques de bem-estar" />
      <WellbeingWeek days={trend.days} label={trend.aria} />
      <CrossReadingView cross={trend.cross} />
    </>
  );
}

/** 4 · Combinados (e peso fora do perfil calmo): quantos foram cumpridos e cada um na semana. */
function Habits({ recap }: SlideProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { summary, items, more, weight, empty } = recap.slides.habits;
  return (
    <>
      {summary && (
        <AppText heading size={fontSize.xl} weight={800}>
          {summary}
        </AppText>
      )}
      {items.length > 0 && (
        <View role="list" aria-label="Combinados da semana" style={styles.list}>
          {items.map((item) => (
            <View key={item.id} role="listitem" style={styles.item}>
              <AppText size={fontSize.md} weight={600} style={styles.grow}>
                {item.title}
              </AppText>
              <AppText size={fontSize.sm} color={colors.text2} style={styles.tabular}>
                {item.text}
              </AppText>
            </View>
          ))}
        </View>
      )}
      {more > 0 && (
        <AppText size={fontSize.sm} color={colors.text2}>
          e mais {plural(more, "combinado", "combinados")}
        </AppText>
      )}
      {empty && (
        <AppText size={fontSize.md} color={colors.text2}>
          {empty}
        </AppText>
      )}
      {weight && (
        <View style={styles.weight} testID="recap-weight">
          <AppText size={fontSize.sm} weight={600} color={colors.muted}>
            Peso de tendência
          </AppText>
          <AppText heading size={fontSize["3xl"]} weight={800} style={styles.tabular}>
            {weight.value}
          </AppText>
          {weight.delta && (
            <View style={styles.delta}>
              <AppText size={fontSize.xs} weight={700} color={colors.white} style={styles.tabular}>
                {weight.delta}
              </AppText>
            </View>
          )}
        </View>
      )}
    </>
  );
}

/** 5 · Conquistas gentis: comportamentos, sem peso, calorias, comparação ou dias seguidos; compartilhar é opcional. */
function Wins({ recap, onShare }: SlideProps & { onShare: () => void }) {
  const styles = useStyles();
  const { scheme } = useTheme();
  return (
    <>
      <View role="list" aria-label={recap.slides.wins.title} style={styles.list}>
        {recap.slides.wins.items.map((win) => (
          <View key={win.key} role="listitem" style={styles.line}>
            <View {...HIDDEN}>
              <CircleCheck size={22} color={themeDomainTone(scheme).food.fg} />
            </View>
            <AppText size={fontSize.md} weight={600} style={styles.grow}>
              {win.text}
            </AppText>
          </View>
        ))}
      </View>
      <Button label="Compartilhar resumo" variant="secondary" icon={Share2} onPress={onShare} />
    </>
  );
}

type Props = { recap: WeekRecap; index: number; onShare: () => void };

/** Corpo de cada parte dos stories (título visível + conteúdo); o grupo com o nome fica em WeekStories. */
export function RecapSlide({ recap, index, onShare }: Props) {
  const styles = useStyles();
  const title = slideTitles(recap)[index] ?? "";
  return (
    <View style={styles.slide}>
      <AppText heading size={fontSize["2xl"]} weight={800} tracking={-0.02}>
        {title}
      </AppText>
      {index === 0 && <Cover recap={recap} />}
      {index === 1 && <Routine recap={recap} />}
      {index === 2 && <Wellbeing recap={recap} />}
      {index === 3 && <Habits recap={recap} />}
      {index === 4 && <Wins recap={recap} onShare={onShare} />}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  slide: { gap: 16 },
  block: { gap: 6 },
  row: { flexDirection: "row" },
  cell: { width: COLUMN, alignItems: "center" },
  dayStack: { alignItems: "center", gap: 6 },
  ring: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  ringCenter: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: BARS_HEIGHT, marginTop: 10 },
  bar: { flex: 1, height: "100%", justifyContent: "flex-end" },
  fill: { width: "100%", borderRadius: radius.pill },
  emptyBar: { width: "100%", height: "14%", borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.pill },
  line: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 },
  grow: { flex: 1, minWidth: 0 },
  list: { gap: 10 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
  weight: { gap: 4, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: "flex-start" },
  delta: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.inverse },
  tabular: { fontVariant: ["tabular-nums"] },
}));
