import { Flame, Utensils, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import type { DailyTarget } from "@shared/lib/domain";
import { fmtNumber } from "@shared/lib/format";
import { balanceStatus, percentOf } from "@shared/lib/today";
import { AppText, Sheet, StatusPill } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { Gauge } from "./gauge";

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
  const percent = percentOf(consumed, goals.calories);
  const remaining = goals.calories === null ? null : goals.calories - consumed;
  const status = balanceStatus(consumed, goals.calories);
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
      <View style={styles.stats}>
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
    </Sheet>
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
}));
