import { useId } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from "react-native-svg";
import type { Shape } from "@shared/components/injecao/bodySilhouette";
import {
  BACK_DETAILS,
  FACE_SIDE_ORDER,
  FIGURE_VIEWBOX,
  FRONT_DETAILS,
  OUTLINE,
  SPOT_POINTS,
  badgeGroups,
} from "@shared/components/injecao/bodyViews";
import { SIDES, spotLabel } from "@shared/lib/injection";
import { FACE_LABEL, SITE_FACE, type BodyFace, type RotationModel, type Spot } from "@shared/lib/rotation";
import { INJECTION_SITES, type InjectionSide, type InjectionSite } from "@shared/types";
import { AppText } from "@/components/ui";
import { makeStyles } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { ART, ART_TONE, artColors } from "./art-colors";

const POINT = ART.green700;
/** Pontos não escolhidos: cinza legível (slate-500), sem apagar a zona inteira com opacidade (como o web). */
const POINT_IDLE = ART_TONE.neutral.fg;
/** Largura de cada figura (frente e costas); a altura segue a proporção do recorte 100 × 224. */
export const FIGURE_WIDTH = 72;
const FIGURE_ASPECT = 100 / 224;
const FACES: readonly BodyFace[] = ["frente", "costas"];
const HIDDEN = { "aria-hidden": true, importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true } as const;

/** Um traço da silhueta gerada; `fallback` completa o que a forma não traz (os detalhes das costas não têm cor). */
export function ShapeElement({ shape, fallback }: { shape: Shape; fallback?: { stroke: string; strokeWidth: number } }) {
  const style = {
    fill: shape.fill ?? (fallback ? "none" : undefined),
    stroke: shape.stroke ?? fallback?.stroke,
    strokeWidth: shape.strokeWidth ?? fallback?.strokeWidth,
    strokeLinejoin: shape.strokeLinejoin,
    strokeLinecap: shape.strokeLinecap ?? (fallback ? "round" : undefined),
    opacity: shape.opacity,
    fillOpacity: shape.fillOpacity,
    strokeOpacity: shape.strokeOpacity,
    strokeDasharray: shape.strokeDasharray,
  } as const;
  if (shape.type === "ellipse") return <Ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...style} />;
  if (shape.type === "circle") return <Circle cx={shape.cx} cy={shape.cy} r={shape.r} {...style} />;
  return <Path d={shape.d} {...style} />;
}

/** Contorno de frente ou de costas, com os detalhes da face (costas em slate-300). */
export function FigureOutline({ face }: { face: BodyFace }) {
  const details = face === "frente" ? FRONT_DETAILS : BACK_DETAILS;
  return (
    <>
      {OUTLINE.map((shape, index) => (
        <ShapeElement key={`o${index}`} shape={shape} />
      ))}
      {details.map((shape, index) => (
        <ShapeElement key={`d${index}`} shape={shape} fallback={{ stroke: ART.artLine, strokeWidth: 1 }} />
      ))}
    </>
  );
}

const matches = (spot: Spot, site: InjectionSite, side: InjectionSide) => spot.site === site && (spot.side === null || spot.side === side);

type Props = {
  site: InjectionSite;
  side: InjectionSide | null;
  model: RotationModel;
};

/** Uma figura (frente ou costas): pontos de cada lado, halo do escolhido, anel do sugerido, selos e letras E/D. */
function Figure({ face, choice, model, haloId }: { face: BodyFace; choice: Spot; model: RotationModel; haloId: string }) {
  const styles = useStyles();
  const sites = INJECTION_SITES.filter((key) => SITE_FACE[key] === face);
  const badges = badgeGroups(model.marks).filter((g) => g.face === face);
  const [leftSide, rightSide] = FACE_SIDE_ORDER[face];
  return (
    <View style={styles.figure}>
      <View style={styles.canvas}>
        <Svg viewBox={FIGURE_VIEWBOX} width="100%" height="100%">
          <Defs>
            <RadialGradient id={haloId} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={ART.green500} stopOpacity={0.55} />
              <Stop offset="100%" stopColor={ART.green500} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <FigureOutline face={face} />
          {sites.flatMap((key) =>
            SIDES.map(({ key: sideKey }) => {
              const point = SPOT_POINTS[key][sideKey];
              const isOn = matches(choice, key, sideKey);
              return (
                <G key={`${key}-${sideKey}`}>
                  <Circle cx={point.cx} cy={point.cy} r={11} fill={`url(#${haloId})`} opacity={isOn ? 1 : 0} />
                  {matches(model.suggested, key, sideKey) && (
                    <Circle cx={point.cx} cy={point.cy} r={7} fill="none" stroke={ART.sky500} strokeWidth={1.2} strokeDasharray="2 2" />
                  )}
                  <Circle cx={point.cx} cy={point.cy} r={isOn ? 4.5 : 3.5} fill={isOn ? POINT : POINT_IDLE} stroke={ART.white} strokeWidth={1.5} />
                </G>
              );
            }),
          )}
        </Svg>
        {badges.map((g) => (
          <View key={`${g.site}-${g.side}`} testID="rotation-badge" pointerEvents="none" style={[styles.badge, { left: `${g.left}%`, top: `${g.top}%` }]} {...HIDDEN}>
            <AppText size={fontSize.xs} weight={700} color={ART.white} lineHeight={16}>
              {g.text}
            </AppText>
          </View>
        ))}
        <View pointerEvents="none" style={[styles.letter, styles.letterLeft]} {...HIDDEN}>
          <AppText size={fontSize.xs} weight={800} color={ART.muted}>
            {leftSide === "esquerdo" ? "E" : "D"}
          </AppText>
        </View>
        <View pointerEvents="none" style={[styles.letter, styles.letterRight]} {...HIDDEN}>
          <AppText size={fontSize.xs} weight={800} color={ART.muted}>
            {rightSide === "esquerdo" ? "E" : "D"}
          </AppText>
        </View>
      </View>
      <View {...HIDDEN}>
        <AppText size={fontSize.xs} weight={700} color={ART.muted} align="center">
          {FACE_LABEL[face]}
        </AppText>
      </View>
    </View>
  );
}

/**
 * Mapa de rodízio (SERINGA-04): frente (abdômen e coxa) e costas (braço), um ponto por lado da pessoa,
 * selos navy com as 3 últimas aplicações e o anel tracejado no ponto sugerido. É um resumo visual, sem
 * alvos de toque (local e lado não caberiam em 44 px sem se sobrepor nesta largura): a escolha fica nos
 * rádios "Local de aplicação" e "Lado do corpo". Sugere, nunca bloqueia. O lado é sempre o da pessoa
 * (de frente, o esquerdo fica à direita).
 */
export function BodyMap({ site, side, model }: Props) {
  const styles = useStyles();
  const base = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <View style={styles.body} testID="injection-body-map">
      {/* "Local: Coxa esquerda" evita erro de concordância (coxa selecionada, braço selecionado). */}
      <View style={styles.indicator} accessibilityLiveRegion="polite" aria-live="polite">
        <AppText size={fontSize.xs} weight={700} color={ART.green700} testID="injection-site-indicator">
          Local: {spotLabel(site, side)}
        </AppText>
      </View>
      <View style={styles.figures} accessible accessibilityRole="image" accessibilityLabel={model.aria}>
        {FACES.map((face) => (
          <Figure key={face} face={face} choice={{ site, side }} model={model} haloId={`${base}${face}-halo`} />
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors, scheme) => ({
  body: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    // Placa da arte (decisão 8.9): clara nos dois temas; só a borda acompanha o tema.
    borderColor: colors.border,
    backgroundColor: ART.artFaint,
  },
  indicator: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: artColors(scheme).artPaper,
    borderWidth: 1,
    borderColor: ART.artSoft,
  },
  figures: { flexDirection: "row", justifyContent: "center", gap: 12 },
  figure: { alignItems: "center", gap: 2 },
  canvas: { width: FIGURE_WIDTH, aspectRatio: FIGURE_ASPECT },
  badge: {
    position: "absolute",
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    marginLeft: 2,
    marginTop: -22,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ART.navy,
  },
  letter: { position: "absolute", top: 0 },
  letterLeft: { left: 0 },
  letterRight: { right: 0 },
}));
