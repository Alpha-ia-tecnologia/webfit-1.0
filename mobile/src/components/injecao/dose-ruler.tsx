import { TriangleAlert } from "lucide-react-native";
import { useId, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Path, Pattern, Rect } from "react-native-svg";
import type { DoseRuler as Ruler } from "@shared/lib/injection";
import { AppText } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";

/** Abaixo desta largura da trilha os rótulos alternam acima e abaixo (como o @container do web). */
const NARROW_TRACK = 300;
const TRACK_VIEW_W = 400;
const TRACK_H = 14;
const BAND_GAP = 4;
const MARKER = 10;

/** Rótulo centrado no meio da faixa (âncora de largura zero, sem numberOfLines: "Manutenção" nunca é cortado). */
function BandLabel({ left, label, isActive }: { left: number; label: string; isActive: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={[styles.anchor, { left }]}>
      <AppText size={fontSize.xs} weight={isActive ? 800 : 600} color={isActive ? colors.text : colors.muted} lineHeight={16}>
        {label}
      </AppText>
    </View>
  );
}

/**
 * Régua da bula (SERINGA-05): quatro faixas iguais, "Acima" hachurada, e o marcador na dose. Só a trilha
 * tem o nome acessível; o aviso "Acima das doses habituais" é irmão dela e nunca bloqueia o registro.
 */
export function DoseRuler({ ruler, aboveText }: { ruler: Ruler; aboveText: string }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme).medication;
  const hatch = `${useId().replace(/[^a-zA-Z0-9]/g, "")}-hatch`;
  const [width, setWidth] = useState(0);
  const isNarrow = width > 0 && width < NARROW_TRACK;
  const bandW = TRACK_VIEW_W / ruler.bands.length;
  const centers = ruler.bands.map((_, i) => ((i + 0.5) / ruler.bands.length) * width);
  const labelRow = (keep: (index: number) => boolean) => (
    <View style={styles.labels} {...HIDDEN}>
      {width > 0 &&
        ruler.bands.map((b, i) =>
          keep(i) ? <BandLabel key={b.key} left={centers[i]!} label={b.label} isActive={b.key === ruler.active} /> : null,
        )}
    </View>
  );
  return (
    <View style={styles.wrap} testID="injection-ruler">
      {/* Rótulos alternados na largura estreita: 1º e 3º acima da trilha, 2º e 4º abaixo. */}
      {isNarrow && labelRow((i) => i % 2 === 0)}
      <View
        accessibilityRole="image"
        accessibilityLabel={ruler.ariaLabel}
        style={styles.track}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      >
        <Svg viewBox={`0 0 ${TRACK_VIEW_W} ${TRACK_H}`} width="100%" height={TRACK_H} preserveAspectRatio="none">
          <Pattern id={hatch} patternUnits="userSpaceOnUse" width={8} height={8}>
            <Rect x={0} y={0} width={8} height={8} fill={colors.rose50} />
            <Path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" stroke={colors.rose200} strokeWidth={2.8} />
          </Pattern>
          {ruler.bands.map((b, i) => {
            const isActive = b.key === ruler.active;
            return (
              <Rect
                key={b.key}
                x={i * bandW + (i ? BAND_GAP / 2 : 0)}
                y={0}
                width={bandW - (i ? BAND_GAP / 2 : 0) - (i < ruler.bands.length - 1 ? BAND_GAP / 2 : 0)}
                height={TRACK_H}
                rx={4}
                fill={b.isHatched ? `url(#${hatch})` : isActive ? tone.border : colors.surface2}
                stroke={isActive ? tone.fg : "none"}
                strokeWidth={isActive ? 1.5 : 0}
              />
            );
          })}
        </Svg>
        <View style={styles.markerRow}>
          {width > 0 && (
            <View style={[styles.anchor, { left: (ruler.markerPercent / 100) * width }]}>
              <Svg width={MARKER + 4} height={MARKER} viewBox="0 0 14 10">
                <Path d="M7 0 L14 10 L0 10 Z" fill={tone.fg} />
              </Svg>
            </View>
          )}
        </View>
      </View>
      {labelRow((i) => !isNarrow || i % 2 === 1)}
      {ruler.active === "acima" && (
        <View role="status" style={styles.alert}>
          <TriangleAlert size={18} color={colors.rose700} />
          <AppText size={fontSize.sm} color={colors.text2} lineHeight={19} style={styles.grow}>
            <AppText size={fontSize.sm} weight={700} color={colors.rose800}>
              Acima das doses habituais.
            </AppText>{" "}
            {aboveText}
          </AppText>
        </View>
      )}
    </View>
  );
}

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
  "aria-hidden": true,
} as const;

const useStyles = makeStyles((colors) => ({
  wrap: { gap: 4 },
  track: { width: "100%" },
  markerRow: { height: MARKER + 2, marginTop: 2 },
  anchor: { position: "absolute", top: 0, width: 0, alignItems: "center" },
  labels: { height: 18, width: "100%" },
  alert: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.rose50,
    borderColor: colors.rose200,
  },
  grow: { flex: 1, minWidth: 0 },
}));
