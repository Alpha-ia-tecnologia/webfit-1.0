import { useWindowDimensions, View } from "react-native";
import type { macroBars } from "@shared/lib/today";
import { MacroStat } from "@/components/ui/macro-stat";
import { makeStyles } from "@/theme/theme";

export type MacroValue = ReturnType<typeof macroBars>[number];

/**
 * Proteína, carbos e gorduras do dia: o mesmo bloco no Hoje (DayHero) e no balanço do Diário
 * (com barras finas da meta), como o MacroSummary do web.
 */
/** Abaixo desta largura as colunas ficam com 6 px de respiro (o @media 379px do web). */
const NARROW_BELOW_WIDTH = 380;

export function MacroSummary({
  macros,
  showBars = false,
  isCompact = false,
}: {
  macros: MacroValue[];
  showBars?: boolean;
  /** Balanço do Diário: números um degrau menores (conceito 03). */
  isCompact?: boolean;
}) {
  const styles = useStyles();
  const isNarrow = useWindowDimensions().width < NARROW_BELOW_WIDTH;
  return (
    <View style={styles.macros}>
      {macros.map((m, i) => (
        <View
          key={m.key}
          style={[
            styles.cell,
            isNarrow && styles.cellNarrow,
            // Balanço do Diário (com as barras): sem divisórias, 12 px à direita (como o web).
            showBars ? styles.cellBars : i === 0 ? styles.first : styles.divider,
          ]}
        >
          <MacroStat
            macro={m.key}
            label={m.label}
            value={m.value}
            goal={m.goal}
            percent={m.percent}
            showBar={showBars}
            isCompact={isCompact}
          />
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  macros: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: 14,
  },
  cell: { flex: 1, minWidth: 0, paddingHorizontal: 10 },
  cellNarrow: { paddingHorizontal: 6 },
  first: { paddingLeft: 2 },
  cellBars: { paddingLeft: 0, paddingRight: 12 },
  divider: { borderLeftWidth: 1, borderLeftColor: colors.borderSoft },
}));
