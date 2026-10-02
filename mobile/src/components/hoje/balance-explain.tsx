import { ArrowRight, Flame, Utensils, type LucideIcon } from "lucide-react-native";
import { useWindowDimensions, View } from "react-native";
import { adjustmentView, type AdjustmentView } from "@shared/lib/balance-explain";
import { adjustmentExplain, type DailyTarget } from "@shared/lib/domain";
import { fmtNumber } from "@shared/lib/format";
import { balanceStatus, percentOf } from "@shared/lib/today";
import { CareChips } from "@/components/espaco/care-chips";
import { AppText, Sheet, StatusPill } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { Gauge } from "./gauge";

/** Largura até a qual "Consumidas" e "Gasto estimado" ficam empilhados (o mesmo corte do web). */
const NARROW_WIDTH = 360;

/**
 * "Como calculamos": o balanço energético do dia com o gasto estimado e a origem da meta.
 * Aberto pelo Hoje e pelo (i) do Diário; só existe com as calorias visíveis (BalanceExplain do web).
 */
export function BalanceExplain({
  visible,
  consumed,
  goals,
  onClose,
}: {
  visible: boolean;
  consumed: number;
  goals: DailyTarget;
  onClose: () => void;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  // Até 360 px as duas estatísticas ficam uma sob a outra (o rótulo não cabe ao lado do ícone), como no web.
  const isNarrow = useWindowDimensions().width <= NARROW_WIDTH;
  const percent = percentOf(consumed, goals.calories);
  const remaining = goals.calories === null ? null : goals.calories - consumed;
  const status = balanceStatus(consumed, goals.calories);
  const adjust = adjustmentView(goals);
  const label =
    goals.calories === null
      ? `${fmtNumber(consumed)} kcal consumidas, sem meta definida`
      : `${fmtNumber(consumed)} de ${fmtNumber(goals.calories)} kcal, ${percent}% da meta`;
  return (
    <Sheet visible={visible} title="Como calculamos" onClose={onClose}>
      <View style={styles.rowBetween}>
        <AppText heading size={fontSize.md} weight={800} accessibilityRole="header">
          Balanço energético
        </AppText>
        <StatusPill label={status.label} tone={status.tone} />
      </View>
      <Gauge percent={percent} label={label}>
        <AppText heading size={fontSize["4xl"]} weight={800} tracking={-0.03} lineHeight={32}>
          {fmtNumber(remaining === null ? consumed : Math.abs(remaining))}
        </AppText>
        <AppText size={fontSize["2xs"]} weight={600} upper tracking={0.06} color={colors.muted} lineHeight={14}>
          {remaining === null ? "kcal consumidas" : remaining >= 0 ? "kcal restantes" : "kcal acima do planejado"}
        </AppText>
      </Gauge>
      <View style={[styles.stats, isNarrow && styles.statsStacked]}>
        <Stat icon={Utensils} tone="sky" label="Consumidas" value={fmtNumber(consumed)} unit="kcal" />
        <Stat
          icon={Flame}
          tone="emerald"
          label={goals.expenditure !== null ? "Gasto estimado" : "Meta do dia"}
          value={
            goals.expenditure !== null
              ? fmtNumber(goals.expenditure)
              : goals.calories !== null
                ? fmtNumber(goals.calories)
                : "Não definida"
          }
          unit={goals.expenditure !== null || goals.calories !== null ? "kcal" : undefined}
        />
      </View>
      <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
        {goals.source}
        {goals.expenditure !== null ? " · gasto diário estimado pela fórmula de Mifflin-St Jeor." : "."}
      </AppText>
      {goals.note ? (
        <AppText size={fontSize.xs} color={colors.muted} lineHeight={19}>
          {goals.note}
        </AppText>
      ) : null}
      {adjust ? <AdjustmentRows view={adjust} label={adjustmentExplain(goals) ?? undefined} /> : null}
      <CareChips notes={goals.careNotes} />
    </Sheet>
  );
}

/**
 * Ajuste dinâmico do dia (AdjustmentRows do web): `Meta-base 1.806 → hoje 1.953`, o delta em pílula com o
 * motivo numa linha e, se houver, `Proteína +9 g`. Usado em "Como calculamos" e na folha do chip de ajuste do
 * Hoje; o leitor de tela recebe a frase inteira (`label`: adjustmentExplain ou a frase do ajuste).
 */
export function AdjustmentRows({ view, label: a11yLabel }: { view: AdjustmentView; label?: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const label = (text: string) => (
    <AppText size={fontSize.xs} weight={600} color={colors.muted}>
      {text}
    </AppText>
  );
  const number = (text: string) => (
    <AppText heading size={fontSize.md} weight={800} tracking={-0.02} style={styles.tabular}>
      {text}
    </AppText>
  );
  return (
    <View
      style={styles.adjust}
      testID="balance-adjust"
      accessible
      accessibilityLabel={a11yLabel}
    >
      {view.calories ? (
        <>
          <View style={styles.adjustRow}>
            {label("Meta-base")}
            {number(view.calories.base)}
            <ArrowRight size={14} color={colors.muted} />
            {label(view.dayLabel)}
            {number(view.calories.target)}
          </View>
          <View style={styles.adjustRow}>
            <View style={styles.delta}>
              <AppText size={fontSize.xs} weight={700} style={styles.tabular}>
                {`${view.calories.direction === "up" ? "↑" : "↓"} ${view.calories.delta}`}
              </AppText>
            </View>
            <AppText size={fontSize.xs} color={colors.muted} lineHeight={18} style={styles.shrink}>
              {view.calories.why}
            </AppText>
          </View>
        </>
      ) : null}
      {view.protein ? (
        <View style={styles.adjustRow}>
          {label("Proteína")}
          {number(view.protein.delta)}
          <AppText size={fontSize.xs} color={colors.muted} lineHeight={18} style={styles.shrink}>
            {view.protein.why}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  unit,
}: {
  icon: LucideIcon;
  tone: "sky" | "emerald";
  label: string;
  value: string;
  unit?: string;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const bg = tone === "sky" ? colors.skyTint : colors.chipOnTint;
  const fg = tone === "sky" ? colors.sky700 : colors.green700;
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Icon size={16} color={fg} />
      </View>
      <View style={styles.statCopy}>
        <AppText size={fontSize["2xs"]} weight={600} upper tracking={0.06} color={colors.muted} lineHeight={12}>
          {label}
        </AppText>
        <AppText heading size={fontSize.md} weight={800}>
          {value}
          {unit ? (
            <AppText size={fontSize["2xs"]} color={colors.muted}>
              {" "}
              {unit}
            </AppText>
          ) : null}
        </AppText>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  stats: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  statsStacked: { flexDirection: "column" },
  stat: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 16,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    minWidth: 0,
  },
  statIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statCopy: { flexShrink: 1 },
  // .balance-adjust: Meta-base → hoje, delta em pílula clara e o motivo embaixo.
  adjust: { gap: 4, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.surface2 },
  adjustRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 4 },
  delta: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  tabular: { fontVariant: ["tabular-nums"] },
  shrink: { flexShrink: 1, minWidth: 0 },
}));
