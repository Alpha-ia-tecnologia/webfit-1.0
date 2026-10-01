import { useId, useState, type Ref } from "react";
import { View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from "react-native-svg";
import { PLAN_TITLES, type PlanVariant } from "@shared/lib/plan-reveal";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontFamily, fontSize } from "@/theme/tokens";

/** .plan-title do web: 28 px, 800, entrelinha 1,05. */
const TITLE_SIZE = fontSize["3xl"];
const TITLE_LINE = Math.round(TITLE_SIZE * 1.05);
const TRACKING = -0.02;
/** Métricas verticais da Plus Jakarta Sans (em): a linha de base do SVG cai onde cai a do texto. */
const ASCENT = 1.038;
const DESCENT = 0.222;
/** Teto da fonte ampliada pelo sistema em textos ≥ 28 px (o mesmo do AppText). */
const MAX_FONT_SCALE = 1.3;
/** Folga do desenho: acentos em cima, descendentes embaixo e a última letra à direita. */
const BLEED = 8;
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

type Box = { width: number; height: number };

/**
 * "Seu plano inicial," com o primeiro nome na linha de baixo em degradê verde → azul (.plan-name do web).
 * O título é um cabeçalho focável (tabIndex -1: o foco vai para ele ao pular o carregamento) com o nome
 * acessível "Seu plano inicial, Nome".
 */
export function PlanTitle({ variant, firstName, titleRef }: { variant: PlanVariant; firstName: string; titleRef: Ref<View> }) {
  const styles = useStyles();
  const title = PLAN_TITLES[variant];
  return (
    <View
      ref={titleRef}
      accessible
      accessibilityRole="header"
      accessibilityLabel={firstName ? `${title}, ${firstName}` : title}
      tabIndex={-1}
      style={styles.title}
    >
      <AppText heading size={TITLE_SIZE} weight={800} lineHeight={TITLE_LINE} tracking={TRACKING}>
        {firstName ? `${title},` : title}
      </AppText>
      {firstName ? <GradientName name={firstName} /> : null}
    </View>
  );
}

/**
 * Sem máscara de texto no app: o nome real fica transparente (dá a medida e segue no leitor de tela) e o
 * SVG desenha o mesmo texto com o degradê por cima. Se o nome quebrar em duas linhas, verde sólido.
 */
function GradientName({ name }: { name: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { fontScale } = useWindowDimensions();
  const gradientId = `plan-name-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [box, setBox] = useState<Box | null>(null);
  const scale = Math.min(fontScale, MAX_FONT_SCALE);
  const size = TITLE_SIZE * scale;
  const line = TITLE_LINE * scale;
  const isOneLine = box !== null && box.height < line * 1.5;
  // Como no CSS: a área do texto (ascendente + descendente) fica centrada na linha.
  const baseline = (line - (ASCENT + DESCENT) * size) / 2 + ASCENT * size;
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };
  return (
    <View style={styles.nameRow}>
      <AppText
        heading
        size={TITLE_SIZE}
        weight={800}
        lineHeight={TITLE_LINE}
        tracking={TRACKING}
        color={box && !isOneLine ? colors.green700 : "transparent"}
        onLayout={onLayout}
        style={styles.name}
      >
        {name}
      </AppText>
      {box && isOneLine ? (
        <View {...HIDDEN} pointerEvents="none" style={styles.nameArt}>
          <Svg width={box.width + BLEED} height={box.height + 2 * BLEED}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.green600} />
                <Stop offset="1" stopColor={colors.sky600} />
              </LinearGradient>
            </Defs>
            <SvgText
              x={0}
              y={BLEED + baseline}
              fill={`url(#${gradientId})`}
              fontFamily={fontFamily(800, true)}
              fontSize={size}
              letterSpacing={TRACKING * size}
            >
              {name}
            </SvgText>
          </Svg>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  title: { alignSelf: "stretch" },
  nameRow: { alignItems: "flex-start" },
  name: { alignSelf: "flex-start", maxWidth: "100%" },
  nameArt: { position: "absolute", left: 0, top: -BLEED },
}));
