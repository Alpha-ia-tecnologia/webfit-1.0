import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, gradients, horizontal, radius, themeDomainTone, type Domain, type DomainTones, type ThemeColors } from "@/theme/tokens";
import { IconTile } from "./icon-tile";
import { AppText } from "./text";

/** Cor do preenchimento: um domínio (comida verde, água azul, corpo índigo, mente…) ou o gradiente da marca. */
export type MeterTone = Domain | "gradient";

/** Acima disto, "segments" vira barra contínua (ex.: 95/115 g). */
export const MAX_SEGMENTS = 12;

const HEIGHT = { sm: 4, md: 6, lg: 8 } as const;
const HIDDEN = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

/** Preenchimento por tom (o FILL do SegmentMeter do web). */
function fillOf(tone: Domain, colors: ThemeColors, domain: DomainTones): string {
  switch (tone) {
    case "water":
      return colors.sky500;
    case "food":
      return colors.green500;
    case "body":
      return colors.indigo500;
    case "attention":
      return colors.amber500;
    case "neutral":
      return colors.slate400;
    default:
      return domain[tone].fg;
  }
}

type Props = {
  /** Segmentos cheios, ou o numerador da barra contínua. */
  value: number;
  /** Número de segmentos, ou o denominador da barra contínua (> 0). */
  total: number;
  /**
   * segments: um bloco por unidade (registros 6/7, humor 4/5, ingredientes 8/9); bar: barra contínua
   * value/total (proteína 95/115 g, gasto × meta). Padrão: segments quando total é inteiro até MAX_SEGMENTS.
   */
  mode?: "segments" | "bar";
  /** Segmentos do fim desenhados só com contorno âmbar (ingrediente que falta). */
  missing?: number;
  tone?: MeterTone;
  /** sm 4 px · md 6 px · lg 8 px (altura). */
  size?: keyof typeof HEIGHT;
  /** Nome acessível ("Humor 4 de 5, Bem"); sem ele a barra é decorativa (o texto ao lado diz o valor). */
  label?: string;
  testID?: string;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * A barra de progresso/segmentos do app (SegmentMeter do web; o SegmentBar/MeterBar do FIDELIDADE-B):
 * mesma altura, trilho e raio em todas as telas. Informativa: sem vermelho por passar da meta (enche até 100%).
 */
export function SegmentMeter({ value, total, mode, missing = 0, tone = "food", size = "md", label, testID }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const safeTotal = Math.max(0, total);
  const isSegments =
    (mode ?? (Number.isInteger(safeTotal) && safeTotal > 0 && safeTotal <= MAX_SEGMENTS ? "segments" : "bar")) === "segments";
  const fill = tone === "gradient" ? null : fillOf(tone, colors, themeDomainTone(scheme));
  const height = HEIGHT[size];
  const a11y = label ? ({ accessible: true, accessibilityRole: "image", accessibilityLabel: label } as const) : HIDDEN;
  if (!isSegments) {
    const ratio = safeTotal > 0 ? clamp(value / safeTotal, 0, 1) : 0;
    const width = `${ratio * 100}%` as const;
    return (
      <View {...a11y} testID={testID} style={[styles.track, { height }]}>
        {ratio > 0 ? (
          fill ? (
            <View style={[styles.fill, { width, backgroundColor: fill }]} />
          ) : (
            <LinearGradient colors={gradients.brand} start={horizontal.start} end={horizontal.end} style={[styles.fill, { width }]} />
          )
        ) : null}
      </View>
    );
  }
  const count = Math.round(safeTotal);
  const filled = clamp(Math.round(value), 0, count);
  const missed = clamp(Math.round(missing), 0, count - filled);
  return (
    <View {...a11y} testID={testID} style={styles.row}>
      {Array.from({ length: count }, (_, i) => {
        const isOn = i < filled;
        const isMissing = !isOn && i >= count - missed;
        return (
          <View key={i} style={[styles.segment, { height }, isMissing ? styles.missing : isOn ? (fill ? { backgroundColor: fill } : null) : styles.empty]}>
            {isOn && !fill ? <LinearGradient colors={gradients.brand} start={horizontal.start} end={horizontal.end} style={styles.fill} /> : null}
          </View>
        );
      })}
    </View>
  );
}

type RowProps = {
  icon?: LucideIcon;
  tone: Domain;
  label: string;
  /** Valor à direita ("6/7 dias", "95/115 g por dia"); em texto vira 14 px cinza, ou passe um nó com o número forte. */
  value: ReactNode;
  /** A barra (SegmentMeter) sob o rótulo. */
  children?: ReactNode;
  testID?: string;
};

/** Linha "ícone · rótulo … valor" com a barra embaixo (ProgressRow do web): resumo da semana, plano da anamnese. */
export function ProgressRow({ icon, tone, label, value, children, testID }: RowProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.progressRow} testID={testID}>
      {icon ? <IconTile tone={tone} size="md" icon={icon} /> : null}
      <View style={styles.progressBody}>
        <View style={styles.progressHead}>
          <AppText size={fontSize.md} weight={600} numberOfLines={1} style={styles.shrink}>
            {label}
          </AppText>
          {typeof value === "string" ? (
            <AppText size={fontSize.base} color={colors.muted} numberOfLines={1} style={styles.tabular}>
              {value}
            </AppText>
          ) : (
            value
          )}
        </View>
        {children}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  track: { width: "100%", minWidth: 0, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.surface2 },
  fill: { height: "100%", borderRadius: radius.pill },
  row: { flexDirection: "row", alignItems: "center", gap: 4, width: "100%", minWidth: 0 },
  segment: { flex: 1, minWidth: 4, borderRadius: radius.pill, overflow: "hidden" },
  empty: { backgroundColor: colors.surface2 },
  /** Ingrediente que falta: só o contorno âmbar (a pílula "Falta: …" diz o nome). */
  missing: { borderWidth: 1.5, borderColor: colors.amber500 },
  progressRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, minWidth: 0 },
  progressBody: { flex: 1, minWidth: 0, gap: 8 },
  progressHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, minWidth: 0 },
  shrink: { flexShrink: 1 },
  tabular: { fontVariant: ["tabular-nums"] },
}));
