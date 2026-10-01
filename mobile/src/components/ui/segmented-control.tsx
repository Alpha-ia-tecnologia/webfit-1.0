import type { LucideIcon } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius, shadows } from "@/theme/tokens";
import { AppText } from "./text";

export type Segment<T extends string> = {
  value: T;
  /** Rótulo curto visível; o nome acessível completo vai em accessibilityLabel e deve contê-lo. */
  label: string;
  accessibilityLabel?: string;
  icon?: LucideIcon;
};

type Props<T extends string> = {
  /** Nome do grupo para o leitor de tela (ex.: "Seções do Meu espaço"). */
  label: string;
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * md = abas de uma tela (42 px); sm = seletor compacto de 36 px, com toque real de 44 px; xs = na linha de um título
   * (1M · 3M · 6M · Tudo do Peso, conceito 09): segmentos de 26 px e 40 de largura, texto de 12, toque de 44.
   */
  size?: "md" | "sm" | "xs";
  /** Mostra os ícones em qualquer largura (Saúde · Exames · Ajustes do Meu espaço); sem isso, só acima de 420 pt. */
  showIcons?: boolean;
  /** Só no xs: largura de cada segmento (padrão 40, o 1M · 3M · 6M · Tudo; "Frente | Costas" da Seringa usa 56). */
  segmentWidth?: number;
};

const PADDING = { md: 4, sm: 3, xs: 3 } as const;
const BORDER = 1;
/** Altura visível de cada segmento; o toque do sm vai a 44 px com margem negativa (o web usa ::after). */
const SEGMENT_HEIGHT = { md: 42, sm: 30, xs: 26 } as const;
/** Largura de cada segmento no xs (o controle fica na largura do conteúdo, não da linha). */
const XS_SEGMENT_WIDTH = 40;
const MIN_TOUCH = 44;
const SLIDE_MS = 300;
/** Mesma curva do web (--wf-ease). */
const EASE = Easing.bezier(0.16, 1, 0.3, 1);
/** Como no web, os ícones só aparecem acima de 420 pt de largura. */
const ICONS_ABOVE = 420;

/** Abas de uma tela (.segmented) com indicador deslizante; sem animação com movimento reduzido. */
export function SegmentedControl<T extends string>({
  label,
  segments,
  value,
  onChange,
  size = "md",
  showIcons = false,
  segmentWidth: tinyWidth = XS_SEGMENT_WIDTH,
}: Props<T>) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const isReduced = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const offset = useSharedValue(0);
  const isPlaced = useRef(false);
  const index = Math.max(
    0,
    segments.findIndex((segment) => segment.value === value),
  );
  const segmentWidth =
    trackWidth > 0
      ? (trackWidth - (PADDING[size] + BORDER) * 2) / segments.length
      : 0;
  useEffect(() => {
    if (segmentWidth <= 0) return;
    const target = index * segmentWidth;
    // A primeira posição (ex.: aberta direto em "Dados") não desliza a partir da primeira aba.
    offset.value =
      isReduced || !isPlaced.current
        ? target
        : withTiming(target, { duration: SLIDE_MS, easing: EASE });
    isPlaced.current = true;
  }, [index, segmentWidth, isReduced, offset]);
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));
  const hasIcons = showIcons || screenWidth > ICONS_ABOVE;
  const isSmall = size === "sm";
  const isTiny = size === "xs";
  const touchInset = size === "md" ? 0 : (MIN_TOUCH - SEGMENT_HEIGHT[size]) / 2;
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      onLayout={(event: LayoutChangeEvent) =>
        setTrackWidth(event.nativeEvent.layout.width)
      }
      style={[styles.track, isSmall && styles.trackSmall, isTiny && styles.trackTiny]}
    >
      {segmentWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, (isSmall || isTiny) && styles.indicatorSmall, isTiny && styles.indicatorTiny, { width: segmentWidth }, indicatorStyle]}
        />
      )}
      {segments.map(
        ({ value: key, label: text, accessibilityLabel, icon: Icon }) => {
          const isActive = key === value;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityLabel={accessibilityLabel ?? text}
              accessibilityState={{ selected: isActive }}
              aria-selected={isActive}
              onPress={() => onChange(key)}
              style={({ pressed }) => [
                styles.segment,
                isSmall && { minHeight: MIN_TOUCH, marginVertical: -touchInset, paddingVertical: 0, paddingHorizontal: 10 },
                // flex: 0 vira "0 1 0%" no export web (largura zero): base automática com a largura fixa.
                isTiny && { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: tinyWidth, minHeight: MIN_TOUCH, marginVertical: -touchInset, paddingVertical: 0, paddingHorizontal: 0 },
                pressed && !isActive && styles.pressed,
              ]}
            >
              {Icon && hasIcons ? (
                <Icon
                  size={16}
                  color={isActive ? colors.green700 : colors.muted}
                />
              ) : null}
              <AppText
                size={isTiny ? fontSize.xs : isSmall ? fontSize.base : fontSize.sm}
                weight={isActive ? 700 : 600}
                color={isActive ? colors.text : colors.muted}
                numberOfLines={1}
              >
                {text}
              </AppText>
            </Pressable>
          );
        },
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  track: {
    flexDirection: "row",
    padding: PADDING.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface3,
    borderWidth: BORDER,
    borderColor: colors.borderSoft,
  },
  indicator: {
    position: "absolute",
    top: PADDING.md,
    bottom: PADDING.md,
    left: PADDING.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  /** Pequeno (ao lado de um título): 36 px no total, segmentos de 30 e toque de 44 (como o .segmented.is-sm). */
  trackSmall: { padding: PADDING.sm, borderRadius: 14 },
  indicatorSmall: { top: PADDING.sm, bottom: PADDING.sm, left: PADDING.sm, borderRadius: 11 },
  /** Na linha de um título: na largura do conteúdo (4 × 40 + respiro), 32 px de altura. */
  trackTiny: { alignSelf: "flex-start", padding: PADDING.xs, borderRadius: 12, backgroundColor: colors.slate100 },
  indicatorTiny: { borderRadius: 9 },
  segment: {
    flex: 1,
    minWidth: 0,
    minHeight: SEGMENT_HEIGHT.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  pressed: { opacity: 0.7 },
}));
