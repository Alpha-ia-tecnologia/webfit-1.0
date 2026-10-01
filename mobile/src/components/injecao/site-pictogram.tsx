import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { FIGURE_VIEWBOX, SPOT_POINTS } from "@shared/components/injecao/bodyViews";
import { SIDES } from "@shared/lib/injection";
import { SITE_FACE } from "@shared/lib/rotation";
import type { InjectionSide, InjectionSite } from "@shared/types";
import { ART, ART_TONE } from "./art-colors";
import { FigureOutline } from "./body-map";

const WIDTH = 28;
const HEIGHT = 40;
/** Raio do ponto no desenho (sistema 0 0 180 230): legível mesmo na figura de 28 px. */
const DOT_RADIUS = 5;

/**
 * Pictograma decorativo do ponto (28 × 40): a face do local e o ponto em violeta; sem lado conhecido,
 * os dois pontos do local vazados. Nunca usa o cinza dos pontos do mapa de rodízio.
 */
export function SitePictogram({ site, side }: { site: InjectionSite; side: InjectionSide | null }) {
  return (
    <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg viewBox={FIGURE_VIEWBOX} width={WIDTH} height={HEIGHT}>
        <FigureOutline face={SITE_FACE[site]} />
        {side ? (
          <Circle cx={SPOT_POINTS[site][side].cx} cy={SPOT_POINTS[site][side].cy} r={DOT_RADIUS} fill={ART.violet600} />
        ) : (
          SIDES.map(({ key }) => (
            <Circle
              key={key}
              cx={SPOT_POINTS[site][key].cx}
              cy={SPOT_POINTS[site][key].cy}
              r={DOT_RADIUS}
              fill={ART_TONE.medication.border}
              stroke={ART.violet600}
              strokeWidth={1.5}
            />
          ))
        )}
      </Svg>
    </View>
  );
}
