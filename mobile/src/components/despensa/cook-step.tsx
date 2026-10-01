import { Sun } from "lucide-react-native";
import type { Ref } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { COOK_COPY, newTimer, type StepTimer as Timer } from "@shared/lib/cook-timer";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText } from "@/components/ui";
import { useIosAnnouncement } from "@/lib/announce";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { StepExtras } from "./recipe-chips";
import { StepTimer, type TimerAction } from "./step-timer";
import type { KeepAwakeState } from "./use-keep-awake";

/** Abaixo desta largura o texto do passo fica em 24 px; a partir dela, 28 px (D4: sem token de 26). */
const WIDE_STEP_TEXT = 390;
const MIN_TOUCH = 44;

type Props = {
  /** Índice do passo (0 = primeiro). */
  step: number;
  total: number;
  /** Texto do passo já mascarado. */
  text: string;
  extras: string[];
  timerMin: number | null;
  /** Timer do passo (null = ainda não tocado: mostra o tempo cheio). */
  timer: Timer | null;
  now: number;
  awake: KeepAwakeState;
  /** Último anúncio do timer ("Timer do passo 2 iniciado: 25 min."), lido pelo leitor de tela. */
  announcement: string;
  headingRef: Ref<View>;
  onTimer: (action: TimerAction) => void;
  onFullRecipe: () => void;
};

/**
 * Um passo do modo preparo em tela cheia (AGENTE-11): título que recebe o foco, segmentos do
 * progresso, texto grande, tempo e temperatura, o timer do passo e o aviso de tela acesa.
 */
export function CookStep({ step, total, text, extras, timerMin, timer, now, awake, announcement, headingRef, onTimer, onFullRecipe }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const textSize = width < WIDE_STEP_TEXT ? fontSize["2xl"] : fontSize["3xl"];
  // Timer iniciado, pausado ou no fim: região viva no Android e no web; no iOS, o leitor de tela fala.
  useIosAnnouncement(announcement);
  return (
    <View testID="recipe-step-mode" style={styles.root}>
      <View ref={headingRef} accessible accessibilityRole="header" tabIndex={-1} accessibilityLiveRegion="polite">
        <AppText heading size={fontSize.lg} weight={800} color={colors.white}>
          {`Passo ${step + 1} de ${total}`}
        </AppText>
      </View>
      <View style={styles.progress} aria-hidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.segment, i <= step && styles.segmentOn]} />
        ))}
      </View>
      <AppText size={textSize} weight={500} lineHeight={Math.round(textSize * 1.35)} color={colors.white} testID="recipe-step-text">
        {text}
      </AppText>
      <StepExtras extras={extras} />
      {timerMin !== null ? (
        <StepTimer minutes={timerMin} timer={timer ?? newTimer(timerMin)} now={now} onAction={onTimer} />
      ) : null}
      {awake === "on" ? (
        <View role="status" style={styles.awake}>
          <Sun size={13} color={colors.onFillMint} />
          <AppText size={fontSize.xs} weight={700} color={colors.onFillMint}>
            {COOK_COPY.awake}
          </AppText>
        </View>
      ) : awake === "unavailable" ? (
        <AppText size={fontSize.xs} color={colors.onFillText} testID="cook-awake-hint">
          {COOK_COPY.awakeHint}
        </AppText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ver receita completa"
        onPress={onFullRecipe}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      >
        <AppText size={fontSize.sm} weight={700} color={colors.onFillMint}>
          Ver receita completa
        </AppText>
      </Pressable>
      <AppText role="status" accessibilityLiveRegion="polite" style={srOnly}>
        {announcement}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 16 },
  progress: { flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.onFillOverlay },
  segmentOn: { backgroundColor: colors.onFillMint },
  awake: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.onFillChip,
    borderWidth: 1,
    borderColor: colors.onFillBorder,
  },
  link: { alignSelf: "flex-start", minHeight: MIN_TOUCH, justifyContent: "center" },
  pressed: { opacity: 0.7 },
}));
