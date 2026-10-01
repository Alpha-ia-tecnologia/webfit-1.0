import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, vertical } from "@/theme/tokens";
import { AppText } from "./text";

export const WHEEL_ITEM_HEIGHT = 40;
const SETTLE_MS = 140;

export type WheelItem<T extends string | number> = { value: T; label: string };

type Props<T extends string | number> = {
  items: readonly WheelItem<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Roda rolável com encaixe (.wheel): três linhas visíveis, faixa esmeralda no centro.
 * Funciona com arraste, toque em um item e ações de acessibilidade (aumentar/diminuir).
 */
export function Wheel<T extends string | number>({ items, value, onChange, accessibilityLabel, style }: Props<T>) {
  const styles = useStyles();
  const colors = useThemeColors();
  const scroller = useRef<ScrollView>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ items, value, onChange });
  latest.current = { items, value, onChange };
  const index = Math.max(0, items.findIndex((item) => item.value === value));

  useEffect(() => {
    const timer = setTimeout(() => {
      scroller.current?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [index]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  const settle = (offsetY: number) => {
    const current = latest.current;
    const next = Math.min(current.items.length - 1, Math.max(0, Math.round(offsetY / WHEEL_ITEM_HEIGHT)));
    const item = current.items[next];
    if (item && item.value !== current.value) current.onChange(item.value);
    else scroller.current?.scrollTo({ y: next * WHEEL_ITEM_HEIGHT, animated: true });
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => settle(offsetY), SETTLE_MS);
  };

  return (
    <View
      style={[styles.wheel, style]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: items[index]?.label ?? "" }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => {
        const step = event.nativeEvent.actionName === "increment" ? 1 : -1;
        const item = items[index + step];
        if (item) onChange(item.value);
      }}
    >
      <View pointerEvents="none" style={styles.band} />
      <ScrollView
        ref={scroller}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        nestedScrollEnabled
        scrollEventThrottle={16}
        onScroll={handleScroll}
        contentContainerStyle={styles.content}
      >
        {items.map((item, i) => {
          const isCurrent = i === index;
          return (
            <Pressable
              key={String(item.value)}
              style={styles.item}
              onPress={() => onChange(item.value)}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <AppText
                heading
                size={isCurrent ? fontSize.lg : fontSize.base}
                weight={isCurrent ? 800 : 600}
                color={isCurrent ? colors.text : colors.muted}
                numberOfLines={1}
              >
                {item.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
      {/* O degradê some na superfície do painel (branca no claro). */}
      <View pointerEvents="none" style={[styles.fade, styles.fadeTop]}>
        <LinearGradient colors={[colors.surface, colors.wheelFade]} start={vertical.start} end={vertical.end} style={StyleSheet.absoluteFill} />
      </View>
      <View pointerEvents="none" style={[styles.fade, styles.fadeBottom]}>
        <LinearGradient colors={[colors.wheelFade, colors.surface]} start={vertical.start} end={vertical.end} style={StyleSheet.absoluteFill} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wheel: { height: WHEEL_ITEM_HEIGHT * 3, flex: 1, borderRadius: 14, overflow: "hidden" },
  band: {
    position: "absolute",
    left: 4,
    right: 4,
    top: WHEEL_ITEM_HEIGHT,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 12,
    backgroundColor: colors.wheelWash,
    borderWidth: 1,
    borderColor: colors.wheelEdge,
  },
  content: { paddingVertical: WHEEL_ITEM_HEIGHT },
  item: { height: WHEEL_ITEM_HEIGHT, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  fade: { position: "absolute", left: 0, right: 0, height: WHEEL_ITEM_HEIGHT * 0.9 },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
}));
