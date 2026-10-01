import { View } from "react-native";
import { makeStyles } from "@/theme/theme";

/** Estado de cada dia (seg → dom): feito, passou sem fazer, hoje pendente, ainda por vir ou antes de existir. */
export type WeekDotState = "done" | "missed" | "today" | "future" | "before";

const DOT = 6;

/**
 * Sete pontos da semana de um combinado (WeekDots do web). Sem contador de sequência e sem vermelho:
 * feito é verde, o dia que passou fica cinza cheio e o resto é só um aro. Quem chama não desenha em perfil calmo.
 */
export function WeekDots({ states, label }: { states: readonly WeekDotState[]; label: string }) {
  const styles = useStyles();
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.row}>
      {states.map((state, i) => (
        <View key={i} style={[styles.dot, styles[state]]} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  done: { backgroundColor: colors.green500 },
  missed: { backgroundColor: colors.slate300 },
  today: { borderWidth: 1.5, borderColor: colors.slate400 },
  future: { borderWidth: 1.5, borderColor: colors.border },
  before: { borderWidth: 1.5, borderColor: colors.border },
}));
