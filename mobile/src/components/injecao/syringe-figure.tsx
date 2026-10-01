import { useId, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, G, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { fmtMl, syringeTicks, volumeMl, type SyringeProfile } from "@shared/lib/injection";
import {
  lensView,
  pillPercent,
  scaleLabels,
  slimPercent,
  syringePercent,
  syringeX,
  SLIM_VIEW,
  SYRINGE_VIEW,
} from "@shared/lib/syringe-geometry";
import { AppText } from "@/components/ui";
import { makeStyles } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { ART, useArtColors } from "./art-colors";

const V = SYRINGE_VIEW;
const TICK_LENGTH = { major: 12, mid: 8, minor: 5 } as const;
const STOPPER_W = 12;
/**
 * Seringa fina da receita (conceito 10, recorte SLIM_VIEW; o SLIM do web): cilindro a 60% da altura e mais
 * arredondado, flange mais curta, traços só na borda de cima (cinza) e o líquido no verde da marca.
 */
const SLIM = { barrel: 0.6, flangeExtra: 20, thumb: 46, rx: 8 } as const;
const SLIM_TICK_LENGTH = { major: 13, mid: 8, minor: 5 } as const;
/** Largura do cilindro antes da primeira medição (px), como no web. */
const INITIAL_BARREL_PX = 200;
/** Largura estimada da pílula "Aspire até aqui" antes de medi-la. */
const PILL_ESTIMATE = 150;
/** Desenho decorativo para o leitor de tela: o nome da figura já diz o valor. */
const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
  "aria-hidden": true,
} as const;

const svgId = (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, "");

/** Gradientes do líquido, do vidro e da capa (cada <Svg> precisa das próprias definições). */
function SyringeDefs({ id, slim = false }: { id: string; slim?: boolean }) {
  const art = useArtColors();
  return (
    <Defs>
      <LinearGradient id={`${id}-liquid`} x1="0" x2="1" y1="0" y2="0">
        <Stop offset="0" stopColor={slim ? ART.green500 : ART.green600} stopOpacity={slim ? 1 : 0.78} />
        <Stop offset="1" stopColor={slim ? ART.emerald : ART.green500} />
      </LinearGradient>
      <LinearGradient id={`${id}-glass`} x1="0" x2="0" y1="0" y2="1">
        <Stop offset="0" stopColor={art.artPaper} stopOpacity={0.85} />
        <Stop offset="0.35" stopColor={art.artPaper} stopOpacity={0.12} />
        <Stop offset="1" stopColor={art.artInk} stopOpacity={0.06} />
      </LinearGradient>
      <LinearGradient id={`${id}-cap`} x1="0" x2="1" y1="0" y2="0">
        <Stop offset="0" stopColor={ART.orange600} />
        <Stop offset="0.6" stopColor={ART.orange500} />
        <Stop offset="1" stopColor={ART.amber500} />
      </LinearGradient>
    </Defs>
  );
}

/** Janela horizontal da lupa (unidades do viewBox). */
type Clip = { x0: number; x1: number };
type RectProps = React.ComponentProps<typeof Rect>;

/**
 * Retângulo recortado na janela da lupa: o que fica fora nem é desenhado, para nenhuma forma do desenho
 * ampliado passar das bordas da tela (o recorte do SVG esconderia, mas a caixa ainda contaria).
 */
function ClipRect({ x, width, clip, ...rest }: Omit<RectProps, "x" | "width"> & { x: number; width: number; clip?: Clip }) {
  const from = clip ? Math.max(x, clip.x0) : x;
  const to = clip ? Math.min(x + width, clip.x1) : x + width;
  if (to <= from) return null;
  return <Rect {...rest} x={from} width={to - from} />;
}

/**
 * A seringa inteira no viewBox 400×120 (geometria compartilhada com o web). A borda do êmbolo do lado
 * da agulha fica sobre o valor. Sem <text>: a escala é texto de verdade, fora do desenho.
 * `isMain` marca o cilindro com o testID (só na figura principal, nunca na lupa); `clip` limita a lupa.
 */
/** Tampa laranja da calculadora (cortada pela janela da lupa). */
function Cap({ id, clip }: { id: string; clip?: Clip }) {
  const capLine = (y: number) => {
    const x1 = clip ? Math.max(26, clip.x0) : 26;
    const x2 = clip ? Math.min(48, clip.x1) : 48;
    return x2 > x1 ? <Line key={y} x1={x1} x2={x2} y1={y} y2={y} /> : null;
  };
  return (
    <>
      <ClipRect clip={clip} x={14} y={V.midY - 16} width={46} height={32} rx={5} fill={`url(#${id}-cap)`} stroke={ART.orange700} />
      <G stroke={ART.orange200} strokeOpacity={0.7} strokeWidth={1.2}>
        {[V.midY - 8, V.midY, V.midY + 8].map(capLine)}
      </G>
      <ClipRect clip={clip} x={60} y={V.midY - 5} width={12} height={10} fill={ART.orange500} stroke={ART.orange600} />
    </>
  );
}

/** Agulha fina e canhão, no lugar da tampa (receita, conceito 10). */
function Needle() {
  const art = useArtColors();
  return (
    <>
      <Line x1={6} x2={56} y1={V.midY} y2={V.midY} stroke={art.artMuted} strokeWidth={2.4} strokeLinecap="round" />
      <Path
        d={`M54 ${V.midY - 7} L${V.barrelX} ${V.midY - 11} L${V.barrelX} ${V.midY + 11} L54 ${V.midY + 7} Z`}
        fill={art.artMid}
        stroke={art.artLine}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </>
  );
}

type BodyProps = {
  id: string;
  profile: SyringeProfile;
  units: number | null;
  isMain: boolean;
  clip?: Clip;
  tip?: "cap" | "needle";
  slim?: boolean;
};

function SyringeBody({ id, profile, units, isMain, clip, tip = "cap", slim = false }: BodyProps) {
  const h = slim ? Math.round(profile.barrel * SLIM.barrel) : profile.barrel;
  const top = V.midY - h / 2;
  const stopperX = syringeX(units ?? 0, profile);
  const fillW = stopperX - V.barrelX;
  const flangeH = h + (slim ? SLIM.flangeExtra : 32);
  const rodX = stopperX + STOPPER_W;
  const rodEnd = slim ? SLIM_VIEW.rodEnd : V.rodEnd;
  const thumbH = slim ? SLIM.thumb : 48;
  const rx = slim ? SLIM.rx : 4;
  const art = useArtColors();
  const isInside = (x: number) => !clip || (x >= clip.x0 && x <= clip.x1);
  const ticks = slim ? SLIM_TICK_LENGTH : TICK_LENGTH;
  return (
    <>
      {tip === "needle" ? <Needle /> : <Cap id={id} clip={clip} />}
      <ClipRect clip={clip} x={rodX} y={V.midY - 6} width={Math.max(0, rodEnd - rodX)} height={12} rx={2} fill={art.artSoft} stroke={art.artLine} />
      <ClipRect
        clip={clip}
        x={rodEnd - 12}
        y={V.midY - thumbH / 2}
        width={12}
        height={thumbH}
        rx={slim ? 6 : 3}
        fill={slim ? art.artMid : art.artFaint}
        stroke={slim ? art.artLine : art.artMuted}
      />
      <ClipRect
        clip={clip}
        x={V.barrelX}
        y={top}
        width={V.barrelW}
        height={h}
        rx={rx}
        fill={art.artPaper}
        stroke={slim ? art.artLine : art.artMuted}
        strokeWidth={2}
        {...(isMain ? { "data-testid": "syringe-barrel" } : null)}
      />
      {fillW > 0 && (
        <ClipRect clip={clip} x={V.barrelX} y={top + 2} width={fillW} height={h - 4} rx={slim ? rx - 2 : 0} fill={`url(#${id}-liquid)`} />
      )}
      <ClipRect clip={clip} x={stopperX} y={top + 4} width={STOPPER_W} height={h - 8} rx={slim ? 3 : 2} fill={art.artInk} />
      <ClipRect clip={clip} x={V.barrelX} y={top} width={V.barrelW} height={h} rx={rx} fill={`url(#${id}-glass)`} />
      <G stroke={slim ? art.artMuted : art.artInk}>
        {syringeTicks(profile)
          .filter((t) => isInside(syringeX(t.units, profile)))
          .map((t) => {
            const x = syringeX(t.units, profile);
            const len = ticks[t.kind];
            const width = t.kind === "major" ? 1.6 : slim ? 1.2 : 1;
            return (
              <G key={t.units}>
                <Line x1={x} x2={x} y1={top + 2} y2={top + 2 + len} strokeWidth={width} />
                {!slim && <Line x1={x} x2={x} y1={top + h - 2 - len} y2={top + h - 2} strokeWidth={width} />}
              </G>
            );
          })}
      </G>
      <ClipRect
        clip={clip}
        x={V.flangeX}
        y={V.midY - flangeH / 2}
        width={12}
        height={flangeH}
        rx={slim ? 6 : 3}
        fill={art.artMid}
        stroke={slim ? art.artLine : art.artMuted}
        strokeWidth={1.5}
      />
      {units !== null && isInside(stopperX) && (
        <Line x1={stopperX} x2={stopperX} y1={top - 6} y2={tip === "needle" ? V.height : top + h + 6} stroke={ART.accentFill} strokeWidth={2} />
      )}
    </>
  );
}

/**
 * Rótulo centrado num ponto x (px): âncora de largura zero, o texto transborda igual para os dois lados.
 * Sem numberOfLines: no react-native-web ele vira max-width: 100% (0 px aqui) e esconderia o número.
 */
function Anchored({ left, children }: { left: number; children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={[styles.anchor, { left }]}>{children}</View>;
}

type FigureProps = {
  profile: SyringeProfile;
  units: number | null;
  /** cap: tampa laranja (calculadora); needle: agulha fina (receita, conceito 10). */
  tip?: "cap" | "needle";
  /** Rótulo "0" no início da escala (receita). */
  showZero?: boolean;
  /** Seringa fina da receita: recorte SLIM_VIEW, rótulos e pílula maiores (os do .inj-recipe-syringe do web). */
  slim?: boolean;
};

/**
 * Seringa calibrada (SERINGA-03): escala em texto de 12 px acima do cilindro (densidade conforme a largura),
 * marcador "Aspire até aqui" dentro da figura e o nome acessível com o valor a aspirar.
 */
export function SyringeFigure({ profile, units, tip = "cap", showZero = false, slim = false }: FigureProps) {
  const styles = useStyles();
  const id = svgId(useId());
  const [width, setWidth] = useState(0);
  const [pillWidth, setPillWidth] = useState(PILL_ESTIMATE);
  const viewW = slim ? SLIM_VIEW.width : V.width;
  const percentOf = slim ? slimPercent : syringePercent;
  const barrelPx = width > 0 ? (width * V.barrelW) / viewW : INITIAL_BARREL_PX;
  const labels = scaleLabels(profile, barrelPx, percentOf);
  const scale = showZero ? [{ units: 0, percent: percentOf(0, profile) }, ...labels] : labels;
  const label =
    units !== null
      ? `Seringa de ${profile.title}: aspire até ${units} UI, ${fmtMl(volumeMl(units))}`
      : `Seringa de ${profile.title} vazia`;
  const center = units !== null ? (width * pillPercent(percentOf(units, profile))) / 100 : 0;
  const pillLeft = Math.min(Math.max(0, center - pillWidth / 2), Math.max(0, width - pillWidth));
  const viewBox = slim ? `${SLIM_VIEW.x} ${SLIM_VIEW.y} ${SLIM_VIEW.width} ${SLIM_VIEW.height}` : `0 0 ${V.width} ${V.height}`;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={styles.figure}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
    >
      <View style={[styles.scale, slim && styles.scaleSlim]} testID="syringe-scale" {...HIDDEN}>
        {width > 0 &&
          scale.map((l) => {
            const isCurrent = l.units === units;
            return (
              <Anchored key={l.units} left={(width * l.percent) / 100}>
                <AppText
                  size={slim && isCurrent ? fontSize.md : fontSize.xs}
                  weight={isCurrent ? 800 : 600}
                  color={isCurrent ? ART.accentFill : ART.muted}
                  lineHeight={slim ? 20 : 16}
                  style={styles.tabular}
                >
                  {l.units}
                </AppText>
              </Anchored>
            );
          })}
      </View>
      <View style={[styles.drawing, slim && styles.drawingSlim]} {...HIDDEN}>
        <Svg viewBox={viewBox} width="100%" height="100%">
          <SyringeDefs id={id} slim={slim} />
          <SyringeBody id={id} profile={profile} units={units} isMain tip={tip} slim={slim} />
        </Svg>
      </View>
      {units !== null && width > 0 && (
        <View style={[styles.markerRow, slim && styles.markerRowSlim]} {...HIDDEN}>
          <View
            testID="syringe-marker"
            style={[styles.pill, slim && styles.pillSlim, { left: pillLeft }]}
            onLayout={(event: LayoutChangeEvent) => setPillWidth(event.nativeEvent.layout.width)}
          >
            <AppText size={slim ? fontSize.sm : fontSize.xs} weight={slim ? 800 : 700} color={ART.white} numberOfLines={1} lineHeight={slim ? 20 : 16}>
              Aspire até aqui · {units} UI
            </AppText>
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * Lupa da seringa de 100 UI: um recorte ampliado (viewBox de lensView) com os traços em volta do valor
 * e os números grandes da escala logo abaixo. Decorativa: o valor já está no nome da figura.
 */
export function SyringeLens({ profile, units }: { profile: SyringeProfile; units: number }) {
  const styles = useStyles();
  const id = svgId(useId());
  const view = lensView(units, profile);
  return (
    <View testID="syringe-lens" style={styles.lens} {...HIDDEN}>
      <View style={styles.lensGlass}>
        <Svg viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
          <SyringeDefs id={id} />
          <SyringeBody id={id} profile={profile} units={units} isMain={false} clip={{ x0: view.x, x1: view.x + view.width }} />
        </Svg>
      </View>
      <LensScale labels={view.labels} current={units} />
    </View>
  );
}

function LensScale({ labels, current }: { labels: { units: number; percent: number }[]; current: number }) {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  return (
    <View style={styles.lensScale} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 &&
        labels.map((l) => {
          const isCurrent = l.units === current;
          return (
            <Anchored key={l.units} left={(width * l.percent) / 100}>
              <AppText size={fontSize.xs} weight={isCurrent ? 800 : 600} color={isCurrent ? ART.accentFill : ART.muted} lineHeight={16} style={styles.tabular}>
                {l.units}
              </AppText>
            </Anchored>
          );
        })}
    </View>
  );
}

/** Miniatura plana (receita e cartões): o líquido acompanha `units` quando informado. */
export function SyringeMini({ profile, units }: { profile: SyringeProfile; units?: number | null }) {
  const h = Math.round(profile.barrel * 0.42);
  const top = 20 - h / 2;
  const majors = syringeTicks(profile).filter((t) => t.kind === "major" && t.units > 0);
  const share = units === undefined || units === null ? 0.4 : Math.min(1, Math.max(0, units / profile.units));
  const fill = 60 * share;
  const art = useArtColors();
  return (
    <Svg viewBox="0 0 100 40" width={96} height={40} {...HIDDEN}>
      <Rect x={4} y={14} width={14} height={12} rx={2} fill={ART.orange500} />
      <Rect x={18} y={17} width={5} height={6} fill={ART.orange400} />
      <Rect x={23 + fill + 3} y={18} width={Math.max(0, 94 - (23 + fill + 3))} height={4} rx={1} fill={art.artMid} stroke={art.artLine} strokeWidth={0.8} />
      <Rect x={23} y={top} width={60} height={h} rx={2} fill={art.artPaper} stroke={art.artMuted} strokeWidth={1.2} />
      {fill > 0 && <Rect x={23} y={top + 1} width={fill} height={h - 2} fill={ART.green500} opacity={0.7} />}
      <Rect x={23 + fill} y={top + 2} width={3} height={h - 4} fill={art.artInk} />
      {majors.map((t) => {
        const x = 23 + (60 * t.units) / profile.units;
        return <Line key={t.units} x1={x} x2={x} y1={top + 1} y2={top + 5} stroke={art.artInk} strokeWidth={0.8} />;
      })}
      <Rect x={82} y={top - 6} width={3} height={h + 12} rx={1} fill={art.artLine} />
      <Rect x={94} y={12} width={3} height={16} rx={1} fill={art.artLine} />
    </Svg>
  );
}

/** Arte da medicação (decisão 8.9): a figura, a escala e a lupa ficam nas cores claras nos dois temas. */
const useStyles = makeStyles(() => ({
  figure: { width: "100%", gap: 2 },
  scale: { height: 18, width: "100%" },
  scaleSlim: { height: 20 },
  anchor: { position: "absolute", top: 0, width: 0, alignItems: "center" },
  tabular: { fontVariant: ["tabular-nums"] },
  drawing: { width: "100%", aspectRatio: V.width / V.height },
  drawingSlim: { aspectRatio: SLIM_VIEW.width / SLIM_VIEW.height },
  markerRow: { height: 26, width: "100%" },
  markerRowSlim: { height: 30 },
  pill: {
    position: "absolute",
    top: 2,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: ART.accentFill,
  },
  pillSlim: { paddingVertical: 4, paddingHorizontal: 12 },
  lens: { width: "100%", gap: 2 },
  lensGlass: {
    width: "100%",
    aspectRatio: 10 / 3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: ART.artMid,
    backgroundColor: ART.artFaint,
    overflow: "hidden",
  },
  lensScale: { height: 18, width: "100%" },
}));
