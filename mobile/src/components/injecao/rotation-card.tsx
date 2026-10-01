import { MapPin, Sparkles } from "lucide-react-native";
import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Ellipse, G, Line } from "react-native-svg";
import type { Shape } from "@shared/components/injecao/bodySilhouette";
import {
  BACK_DETAILS,
  CARD_VIEW,
  FACE_SIDE_ORDER,
  FRONT_DETAILS,
  OUTLINE,
  rotationFace,
  type CardMarker,
} from "@shared/components/injecao/bodyViews";
import { FACE_LABEL, type BodyFace, type RotationCallouts } from "@shared/lib/rotation";
import { AppText, Card, SegmentedControl } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { ShapeElement } from "./body-map";

const FACES: readonly BodyFace[] = ["frente", "costas"];
const FACE_SEGMENTS = FACES.map((f) => ({ value: f, label: FACE_LABEL[f] }));
/** "Frente | Costas" na largura do conteúdo (texto de 12 pt), sem cortar "Costas" a 320 pt. */
const FACE_SEGMENT_WIDTH = 56;
const SIDE_LETTER = { esquerdo: "E", direito: "D" } as const;
/** Coluna vazia entre a figura e as legendas (pt = unidades do desenho, que fica em 1:1). */
const LEADER_GAP = 8;
const HALO = 6;
const SPARKLE = 11;
/** Palco: a figura de 90 × 224 e as letras dos pés embaixo (o .rot-stage do web). */
const STAGE_HEIGHT = 244;
const FIGURE_HEIGHT = CARD_VIEW.height;
const DRAWING_WIDTH = CARD_VIEW.width + LEADER_GAP;
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;

/** Um ponto do desenho: livre (tracejado), recente, última (anel com halo) ou sugestão (verde; o ✦ vai por cima). */
function Marker({ m }: { m: CardMarker }) {
  const colors = useThemeColors();
  const shape = { cx: m.cx, cy: m.cy, rx: m.rx, ry: m.ry };
  if (m.kind === "sugestao")
    return (
      <G>
        <Ellipse {...shape} rx={m.rx + HALO} ry={m.ry + HALO} fill={colors.green500} fillOpacity={0.16} stroke={colors.mint200} strokeWidth={1} />
        <Ellipse {...shape} fill={colors.green600} stroke={colors.surface} strokeWidth={1.5} />
      </G>
    );
  if (m.kind === "ultima")
    return (
      <G>
        <Ellipse {...shape} rx={m.rx + HALO} ry={m.ry + HALO} fill={colors.amber500} fillOpacity={0.2} />
        <Ellipse {...shape} fill={colors.amber200} stroke={colors.amber500} strokeWidth={3} />
        <Circle cx={m.cx} cy={m.cy} r={Math.min(m.rx, m.ry) * 0.36} fill="none" stroke={colors.white} strokeWidth={1.2} strokeDasharray="1.6 1.4" />
      </G>
    );
  if (m.kind === "recente") return <Ellipse {...shape} fill={colors.amber200} stroke={colors.amber500} strokeOpacity={0.75} strokeWidth={1.6} />;
  return <Ellipse {...shape} fill={colors.mint50} fillOpacity={0.7} stroke={colors.green600} strokeWidth={1.4} strokeDasharray="3 2.4" />;
}

/** Caixa centrada no y dado (o translateY(-50%) do web): mede a própria altura. */
function CenteredAt({ y, style, children }: { y: number; style?: object; children: React.ReactNode }) {
  const [height, setHeight] = useState(0);
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}
      style={[{ position: "absolute", top: y - height / 2, opacity: height ? 1 : 0 }, style]}
    >
      {children}
    </View>
  );
}

const LEGEND = [
  { kind: "ultima", label: "Última" },
  { kind: "recente", label: "Recente" },
  { kind: "livre", label: "Livre" },
  { kind: "sugestao", label: "Sugestão" },
] as const;

/**
 * "Rodízio de locais" (conceito 10; RotationCard do web): a figura com as últimas aplicações por cor (última,
 * recente, livre), a sugestão do próximo ponto e legendas ao lado. Só leitura: sugere, nunca bloqueia; a escolha
 * do local fica na folha de confirmação. O desenho é uma imagem com o texto alternativo completo.
 */
export function RotationCard({ view }: { view: RotationCallouts }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [face, setFace] = useState<BodyFace>("frente");
  const layout = rotationFace(face, view);
  const [leftSide, rightSide] = FACE_SIDE_ORDER[face];
  const right = CARD_VIEW.x + CARD_VIEW.width + LEADER_GAP - 1;
  const subtitle = view.count === 1 ? "Última aplicação" : `Últimas ${view.count} aplicações`;
  const details: readonly Shape[] = face === "frente" ? FRONT_DETAILS : BACK_DETAILS;
  const suggestion = layout.markers.find((m) => m.kind === "sugestao");
  return (
    <Card testID="rotation-card" style={styles.card}>
      <View style={styles.head}>
        <View style={styles.tile} {...HIDDEN}>
          <MapPin size={22} color={colors.green700} />
        </View>
        <View style={styles.titles}>
          <AppText heading size={fontSize.lg} weight={800} tracking={-0.01} lineHeight={20} accessibilityRole="header">
            Rodízio de locais
          </AppText>
          <AppText size={fontSize.sm} color={colors.muted}>
            {subtitle}
          </AppText>
        </View>
        <SegmentedControl label="Face do corpo no mapa" size="xs" segmentWidth={FACE_SEGMENT_WIDTH} segments={FACE_SEGMENTS} value={face} onChange={setFace} />
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel={view.aria} style={styles.stage}>
        <View style={styles.left}>
          {layout.suggestion ? (
            <CenteredAt y={layout.suggestion.labelY} style={styles.suggestBox}>
              <View style={styles.suggestKicker}>
                <Sparkles size={14} color={colors.green700} />
                <AppText size={fontSize.xs} weight={700} color={colors.green700}>
                  Sugestão
                </AppText>
              </View>
              <AppText heading size={fontSize.base} weight={800} lineHeight={17}>
                {view.suggestedLabel}
              </AppText>
            </CenteredAt>
          ) : null}
        </View>
        <View style={styles.figure} {...HIDDEN}>
          <Svg
            width={DRAWING_WIDTH}
            height={FIGURE_HEIGHT}
            viewBox={`${CARD_VIEW.x} ${CARD_VIEW.y} ${DRAWING_WIDTH} ${CARD_VIEW.height}`}
          >
            {OUTLINE.map((shape, i) =>
              shape.type === "path" ? (
                <ShapeElement key={`o${i}`} shape={{ ...shape, fill: colors.slate100, stroke: colors.slate300, strokeWidth: 1.5 }} />
              ) : null,
            )}
            {details.map((shape, i) => (
              <ShapeElement
                key={`d${i}`}
                shape={shape.type === "circle" ? { ...shape, fill: colors.slate400, stroke: undefined } : { ...shape, fill: "none", stroke: colors.slate300, strokeWidth: 1 }}
              />
            ))}
            {layout.markers.map((m) => (
              <Marker key={m.key} m={m} />
            ))}
            {layout.callouts.map((c) => (
              <G key={`${c.callout.site}-${c.callout.side ?? "x"}`}>
                <Line x1={c.x + 1} y1={c.y} x2={right} y2={c.labelY + CARD_VIEW.y - 8} stroke={colors.slate400} strokeWidth={1} />
                <Circle cx={c.x + 1} cy={c.y} r={1.6} fill={colors.muted} />
              </G>
            ))}
            {layout.suggestion ? (
              <Line
                x1={CARD_VIEW.x}
                y1={layout.suggestion.labelY + CARD_VIEW.y}
                x2={layout.suggestion.x - 2}
                y2={layout.suggestion.y}
                stroke={colors.slate400}
                strokeWidth={1}
              />
            ) : null}
          </Svg>
          {suggestion ? (
            <View style={[styles.sparkle, { left: suggestion.cx - CARD_VIEW.x - SPARKLE / 2, top: suggestion.cy - CARD_VIEW.y - SPARKLE / 2 }]}>
              <Sparkles size={SPARKLE} strokeWidth={2.4} color={colors.white} />
            </View>
          ) : null}
          <AppText size={fontSize.xs} weight={800} color={colors.muted} lineHeight={16} style={[styles.foot, styles.footLeft]}>
            {SIDE_LETTER[leftSide]}
          </AppText>
          <AppText size={fontSize.xs} weight={800} color={colors.muted} lineHeight={16} style={[styles.foot, styles.footRight]}>
            {SIDE_LETTER[rightSide]}
          </AppText>
        </View>
        <View style={styles.right}>
          {layout.callouts.map((c) => (
            <CenteredAt key={`${c.callout.site}-${c.callout.side ?? "x"}`} y={c.labelY} style={styles.callout}>
              <AppText heading size={fontSize.sm} weight={800} lineHeight={17}>
                {c.callout.label}
              </AppText>
              <AppText size={fontSize.xs} weight={700} lineHeight={16} color={c.callout.status === "livre" ? colors.green700 : colors.amber700}>
                {c.callout.detail}
              </AppText>
            </CenteredAt>
          ))}
        </View>
      </View>
      <View style={styles.legend} {...HIDDEN}>
        {LEGEND.map((item) => (
          <View key={item.kind} style={styles.legendItem}>
            <View style={[styles.dot, styles[item.kind]]} />
            <AppText size={fontSize.xs} color={colors.muted}>
              {item.label}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 8, paddingTop: 16, paddingHorizontal: 14, paddingBottom: 14 },
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  tile: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.mint100 },
  titles: { flexGrow: 1, flexShrink: 1, flexBasis: 110, minWidth: 0 },
  // Legenda à esquerda (116), figura + folga das linhas (98) e legendas à direita (114), como o grid do web.
  stage: { flexDirection: "row", height: STAGE_HEIGHT, marginTop: 2 },
  left: { flexGrow: 116, flexShrink: 1, flexBasis: 0, minWidth: 0, height: FIGURE_HEIGHT },
  figure: { width: DRAWING_WIDTH, height: STAGE_HEIGHT },
  right: { flexGrow: 114, flexShrink: 1, flexBasis: 0, minWidth: 0, height: FIGURE_HEIGHT, marginRight: -8 },
  sparkle: { position: "absolute", width: SPARKLE, height: SPARKLE },
  foot: { position: "absolute", bottom: 0, width: 16, marginLeft: -8, textAlign: "center" },
  footLeft: { left: CARD_VIEW.width * 0.39 },
  footRight: { left: CARD_VIEW.width * 0.61 },
  suggestBox: {
    right: 0,
    maxWidth: "100%",
    paddingTop: 7,
    paddingBottom: 8,
    paddingHorizontal: 9,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.mint300,
    backgroundColor: colors.mint50,
  },
  suggestKicker: { flexDirection: "row", alignItems: "center", gap: 5 },
  callout: { left: 0, right: 0 },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
    columnGap: 12,
    paddingTop: 12,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 11, height: 11, borderRadius: radius.pill },
  ultima: { backgroundColor: colors.amber500 },
  recente: { borderWidth: 1.5, borderColor: colors.amber500, backgroundColor: colors.amber200 },
  livre: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.green600 },
  sugestao: { backgroundColor: colors.green600, boxShadow: `0px 0px 0px 3px ${colors.mint100}` },
}));
