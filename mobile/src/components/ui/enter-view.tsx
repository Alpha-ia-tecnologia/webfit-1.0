import { useEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

/** Entrada: fade + 8 px em 240 ms (web: next-step-in / insight-in), com a curva do --wf-ease. */
export const ENTER_MS = 240;
export const ENTER_OFFSET = 8;
const ENTER_EASE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * Entrada de um bloco (fade + 8 px, com atraso para cascatas) por valor compartilhado do Reanimated
 * (withTiming), não pela animação de layout `entering`: no export web, `entering` deixava o elemento
 * com position absolute (o cartão Resumo encolhia e os chips de insight sumiam). Com "reduzir
 * movimento" (`isReduced`), nada se move. Uma `key` nova remonta o bloco e a entrada roda de novo.
 */
export function EnterView({
  delay = 0,
  isReduced,
  style,
  children,
}: {
  delay?: number;
  isReduced: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const progress = useSharedValue(isReduced ? 1 : 0);
  useEffect(() => {
    if (isReduced) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(delay, withTiming(1, { duration: ENTER_MS, easing: ENTER_EASE }));
  }, [delay, isReduced, progress]);
  const motion = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * ENTER_OFFSET }],
  }));
  return <Animated.View style={[style, motion]}>{children}</Animated.View>;
}
