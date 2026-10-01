import { Pause, Play, RotateCcw } from "lucide-react-native";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { arcDash } from "@shared/lib/charts";
import { COOK_COPY, timerView, type StepTimer as Timer } from "@shared/lib/cook-timer";
import { AppText, Button } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";

export type TimerAction = "start" | "pause" | "reset";

/** Anel de 120 px (raio 52), como o do web. */
const SIZE = 120;
const CENTER = SIZE / 2;
const RADIUS = 52;
const STROKE = 8;

type Props = {
  minutes: number;
  timer: Timer;
  /** Relógio (ms) do último redesenho; a contagem sai de Date.now(), nunca de um contador. */
  now: number;
  onAction: (action: TimerAction) => void;
};

/**
 * Timer de um passo (AGENTE-11): anel com o tempo que falta, relógio "25:00" e Iniciar / Pausar /
 * Continuar / Zerar. Sem som; o fim é anunciado uma vez pelo modo preparo (com uma vibração leve).
 */
export function StepTimer({ minutes, timer, now, onAction }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const view = timerView(timer, now);
  const primary =
    view.state === "idle"
      ? { label: COOK_COPY.start, aria: COOK_COPY.startLabel(minutes), icon: Play, action: "start" as const }
      : view.state === "running"
        ? { label: COOK_COPY.pause, aria: COOK_COPY.pauseLabel, icon: Pause, action: "pause" as const }
        : view.state === "paused"
          ? { label: COOK_COPY.resume, aria: COOK_COPY.resumeLabel, icon: Play, action: "start" as const }
          : null;
  return (
    <View testID="cook-timer" style={styles.root}>
      <View style={styles.ring}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={styles.svg} aria-hidden>
          <Circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke={colors.navySoft} strokeWidth={STROKE} />
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={colors.onFillMint}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={arcDash(RADIUS, view.fraction * 100)}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
          />
        </Svg>
        <AppText role="timer" heading size={fontSize["3xl"]} weight={800} color={colors.white} style={styles.clock}>
          {view.clock}
        </AppText>
      </View>
      <View style={styles.actions}>
        {primary ? (
          <Button
            label={primary.label}
            accessibilityLabel={primary.aria}
            icon={primary.icon}
            size="sm"
            onPress={() => onAction(primary.action)}
          />
        ) : null}
        {view.state !== "idle" ? (
          <Button
            label={COOK_COPY.reset}
            accessibilityLabel={COOK_COPY.resetLabel}
            icon={RotateCcw}
            variant="secondary"
            size="sm"
            onPress={() => onAction("reset")}
          />
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: { alignItems: "center", gap: 12 },
  ring: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  svg: { position: "absolute", top: 0, left: 0 },
  clock: { fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 },
}));
