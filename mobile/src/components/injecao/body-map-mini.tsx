import { View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { ABDOMEN_CENTER, FIGURE_VIEWBOX, MINI_VIEWBOX, OUTLINE, SPOT_POINTS, cardSpotPoint } from "@shared/components/injecao/bodyViews";
import { SIDES, spotLabel } from "@shared/lib/injection";
import { SITE_FACE } from "@shared/lib/rotation";
import { INJECTION_SITES, type InjectionSide, type InjectionSite } from "@shared/types";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { ART } from "./art-colors";
import { FigureOutline } from "./body-map";

const WIDTH = 56;
const HEIGHT = 72;
/** Moldura da faixa "Últimas aplicações" (52 × 58, como o .inj-body-mini.is-framed do web). */
const FRAME_W = 52;
const FRAME_H = 58;
/** Um ponto só, maior, no tom do momento (raio no desenho). */
const FRAMED_R = 9;

export type MiniTone = "past" | "last" | "next";

/** Pontos acesos na miniatura emoldurada: abdômen sem lado = o centro da zona (nada inventado). */
function framedPoints(site: InjectionSite, side: InjectionSide | null) {
  if (site === "abdomen" && side === null) return [ABDOMEN_CENTER];
  return SIDES.filter(({ key }) => side === null || side === key).map(({ key }) => cardSpotPoint("frente", site, key));
}

type Props = {
  site: InjectionSite;
  side?: InjectionSide | null;
  prefix?: string;
  /**
   * Moldura 52 × 58 com o tronco de frente (conceito 10): passado em cinza, a última em âmbar e a próxima
   * estimada em verde (moldura tracejada). Sem `framed`, a miniatura de sempre do Hoje.
   */
  framed?: boolean;
  tone?: MiniTone;
};

/** Miniatura emoldurada da faixa "Últimas aplicações" (BodyMapMini framed do web). */
function FramedMini({ site, side, label, tone }: { site: InjectionSite; side: InjectionSide | null; label: string; tone: MiniTone }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const dot = tone === "last" ? colors.amber500 : tone === "next" ? colors.green600 : colors.muted;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      testID="injection-site-mini"
      style={[styles.frame, tone === "next" && styles.frameNext]}
    >
      <Svg viewBox={MINI_VIEWBOX} width="100%" height="100%">
        {OUTLINE.map((shape, i) =>
          shape.type === "path" ? (
            <Path key={i} d={shape.d} fill={colors.slate100} stroke={colors.slate300} strokeWidth={2.4} strokeLinejoin="round" />
          ) : null,
        )}
        {framedPoints(site, side).map((p) => (
          <Circle key={`${p.cx}-${p.cy}`} cx={p.cx} cy={p.cy} r={FRAMED_R} fill={dot} stroke={colors.surface} strokeWidth={2.4} />
        ))}
      </Svg>
    </View>
  );
}

/**
 * Mapa do corpo em miniatura (56 × 72, só leitura): a face do local (braço nas costas), o ponto escolhido
 * em destaque (os dois do local quando o lado não é conhecido) e os outros em cinza-claro (slate-300).
 * `prefix` forma o nome acessível ("Local sugerido: Coxa esquerda" ou "Local: Coxa").
 */
export function BodyMapMini({ site, side = null, prefix = "Local sugerido", framed = false, tone = "past" }: Props) {
  const label = `${prefix}: ${spotLabel(site, side)}`;
  if (framed) return <FramedMini site={site} side={side} label={label} tone={tone} />;
  const face = SITE_FACE[site];
  const sites = INJECTION_SITES.filter((key) => SITE_FACE[key] === face);
  return (
    <View accessibilityRole="image" accessibilityLabel={label} testID="injection-site-mini">
      <Svg viewBox={FIGURE_VIEWBOX} width={WIDTH} height={HEIGHT}>
        <FigureOutline face={face} />
        {sites.map((key) => (
          <G key={key}>
            {SIDES.map(({ key: sideKey }) => {
              const point = SPOT_POINTS[key][sideKey];
              const isOn = key === site && (side === null || side === sideKey);
              return (
                <G key={sideKey}>
                  {isOn && <Circle cx={point.cx} cy={point.cy} r={point.r + 6} fill={ART.mint200} opacity={0.8} />}
                  <Circle cx={point.cx} cy={point.cy} r={point.r + (isOn ? 2.5 : 1)} fill={isOn ? ART.green600 : ART.artLine} />
                </G>
              );
            })}
          </G>
        ))}
      </Svg>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  frame: {
    width: FRAME_W,
    height: FRAME_H,
    marginVertical: 6,
    padding: 3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  frameNext: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.mint300 },
}));
