import { useEffect, useRef, useState, type ReactNode } from "react";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { makeStyles } from "@/theme/theme";
import { motion } from "@/theme/tokens";

/** Duração do brilho (a mesma janela do .is-celebrating do web). */
const CELEBRATION_MS = 1800;
/** Mesma curva do web (--wf-ease). */
const EASE = Easing.bezier(0.16, 1, 0.3, 1);
/** Opacidade máxima do anel (o web mistura 28% da cor do domínio). */
const GLOW_OPACITY = 0.28;
/** Largura do anel de brilho em volta do cartão (8 px no pico do web). */
const GLOW_SPREAD = 8;

/**
 * Celebração gentil (SIS-09): liga por um instante quando `isReached` passa de falso para verdadeiro
 * durante o uso E o `progress` cresceu (mais água, mais combinados feitos). Excluir um combinado
 * pendente também fecha a conta, mas não é conquista. Nunca na abertura da tela; desligada com
 * movimento reduzido ou `isEnabled` falso (como o useCelebration do web).
 */
export function useCelebration(isReached: boolean, isEnabled: boolean, progress: number): boolean {
  const isReduced = useReducedMotion();
  const previous = useRef({ isReached, progress });
  const [isOn, setOn] = useState(false);
  useEffect(() => {
    const was = previous.current;
    previous.current = { isReached, progress };
    if (isReached && !was.isReached && progress > was.progress && isEnabled && !isReduced) setOn(true);
  }, [isReached, progress, isEnabled, isReduced]);
  useEffect(() => {
    if (!isOn) return;
    const timer = setTimeout(() => setOn(false), CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [isOn]);
  return isOn;
}

/** Anel de brilho que pulsa em volta do cartão e some; montado só enquanto a celebração dura. */
export function CelebrationGlow({ color, borderRadius }: { color: string; borderRadius: number }) {
  const styles = useStyles();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: CELEBRATION_MS, easing: EASE });
  }, [progress]);
  const pulse = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35, 1], [0, GLOW_OPACITY, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.02]) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      testID="celebration-glow"
      style={[styles.glow, { borderRadius, boxShadow: `0px 0px 0px ${GLOW_SPREAD}px ${color}` }, pulse]}
    />
  );
}

/** Pulinho com a mola "gentle" (o copo de água ao bater a meta); parado com movimento reduzido. */
export function CelebrationLift({ isOn, children }: { isOn: boolean; children: ReactNode }) {
  const lift = useSharedValue(0);
  useEffect(() => {
    if (isOn) lift.value = withSequence(withSpring(1, motion.spring.gentle), withSpring(0, motion.spring.gentle));
  }, [isOn, lift]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * lift.value }, { scale: 1 + 0.06 * lift.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const useStyles = makeStyles(() => ({
  glow: { position: "absolute", top: -1, left: -1, right: -1, bottom: -1 },
}));
