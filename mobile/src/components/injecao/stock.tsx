import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import {
  NOTICE_USE_BY_PAST,
  PEN_STOCK_VIEW,
  VIAL_VIEW,
  penFill,
  vialLiquid,
  type StockModel,
} from "@shared/lib/treatment-stock";
import type { InjectionMethod } from "@shared/types";
import { AppText, Button } from "@/components/ui";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";

/** Opacidade do líquido e do preenchimento da caneta (o tom da medicação, suave). */
const FILL_OPACITY = 0.35;
const PEN_WIDTH_FACTOR = 2;

/** Frasco (48 × 96) ou caneta deitada (120 × 28), parados; sem nível (canetas em gestação), só o contorno. */
export function StockArt({ method, level, aria, size }: { method: InjectionMethod; level: number | null; aria: string; size: number }) {
  const { scheme, colors } = useTheme();
  const tone = themeDomainTone(scheme).medication;
  if (method === "frasco") {
    const liquid = vialLiquid(level ?? 0);
    const width = (size * VIAL_VIEW.width) / VIAL_VIEW.height;
    return (
      <View accessibilityRole="image" accessibilityLabel={aria} testID="stock-art">
        <Svg width={width} height={size} viewBox={`0 0 ${VIAL_VIEW.width} ${VIAL_VIEW.height}`}>
          <Rect x={13} y={2} width={22} height={10} rx={2} fill={colors.slate400} />
          <Rect x={17} y={12} width={14} height={8} fill={colors.slate300} />
          <Rect x={6} y={20} width={36} height={70} rx={8} fill={colors.surface} stroke={colors.slate300} strokeWidth={2} />
          {level !== null && liquid.height > 0 ? (
            <Rect x={9} y={liquid.y} width={30} height={liquid.height} rx={4} fill={tone.fg} fillOpacity={FILL_OPACITY} />
          ) : null}
        </Svg>
      </View>
    );
  }
  // A caneta é deitada: `size` vale para a altura do frasco; aqui a largura é o dobro dela.
  const width = size * PEN_WIDTH_FACTOR;
  const height = (width * PEN_STOCK_VIEW.height) / PEN_STOCK_VIEW.width;
  const fill = level === null ? 0 : penFill(level);
  return (
    <View accessibilityRole="image" accessibilityLabel={aria} testID="stock-art">
      <Svg width={width} height={height} viewBox={`0 0 ${PEN_STOCK_VIEW.width} ${PEN_STOCK_VIEW.height}`}>
        <Rect x={2} y={5} width={96} height={18} rx={9} fill={colors.surface} stroke={colors.slate300} strokeWidth={2} />
        {fill > 0 ? (
          <Rect x={PEN_STOCK_VIEW.fillX} y={9} width={fill} height={10} rx={5} fill={tone.fg} fillOpacity={FILL_OPACITY} />
        ) : null}
        <Rect x={98} y={8} width={20} height={12} rx={3} fill={colors.slate300} />
      </Svg>
    </View>
  );
}

/** Chip neutro; a data de uso vencida é o único em âmbar (a única cor de atenção aqui). */
function StockChip({ label, isAttention = false }: { label: string; isAttention?: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={[styles.chip, isAttention && styles.chipAttention]}>
      <AppText size={fontSize.xs} weight={700} color={isAttention ? colors.amber700 : colors.text2}>
        {label}
      </AppText>
    </View>
  );
}

/** Avisos do estoque (role note): neutros, com o de "usar até" vencido em âmbar. */
export function StockNotices({ notices }: { notices: readonly string[] }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <>
      {notices.map((notice) => {
        const isAttention = notice === NOTICE_USE_BY_PAST;
        return (
          <View key={notice} role="note" style={[styles.note, isAttention && styles.noteAttention]}>
            <AppText size={fontSize.sm} lineHeight={20} color={isAttention ? colors.amber700 : colors.text2}>
              {notice}
            </AppText>
          </View>
        );
      })}
    </>
  );
}

/** Chips do resumo: "≈ 1 dose" (frasco) e a data de uso. */
export function StockChips({ model }: { model: StockModel }) {
  const styles = useStyles();
  if (!model.dosesChip && !model.useByChip) return null;
  return (
    <View style={styles.chips}>
      {model.dosesChip ? <StockChip label={model.dosesChip} /> : null}
      {model.useByChip ? <StockChip label={model.useByChip} isAttention={model.isUseByPast} /> : null}
    </View>
  );
}

/** "Meu tratamento" › Estoque (SERINGA-12): desenho, quantidade, chips, avisos e as ações. */
export function StockSummary({ model, onEdit, onNew }: { model: StockModel; onEdit: () => void; onNew: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const showsNew = model.dosesLeft !== null && model.dosesLeft <= 1;
  return (
    <View style={styles.summary} testID="stock-summary">
      <View style={styles.summaryRow}>
        <StockArt method={model.method} level={model.level} aria={model.aria} size={64} />
        <View style={styles.grow}>
          <AppText size={fontSize.xs} weight={700} color={colors.muted}>
            {model.title}
          </AppText>
          <AppText heading size={fontSize.md} weight={800}>
            {model.amount}
          </AppText>
          <StockChips model={model} />
        </View>
      </View>
      <StockNotices notices={model.notices} />
      <View style={styles.actions}>
        <Button label="Atualizar estoque" variant="secondary" size="sm" onPress={onEdit} />
        {showsNew ? (
          <Button label={model.method === "frasco" ? "Novo frasco" : "Nova caneta"} variant="secondary" size="sm" onPress={onNew} />
        ) : null}
      </View>
    </View>
  );
}

/** Linha compacta da Seringa (56 px): desenho de 32 px, quantidade, o primeiro chip e "Atualizar". */
export function StockRow({ model, onEdit }: { model: StockModel; onEdit: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const chip = model.dosesChip ?? model.useByChip;
  return (
    <View style={styles.row} testID="stock-row">
      <StockArt method={model.method} level={model.level} aria={model.aria} size={32} />
      <View style={styles.grow}>
        <AppText size={fontSize.xs} weight={700} color={colors.muted}>
          Estoque
        </AppText>
        <AppText size={fontSize.sm} weight={700}>
          {model.amount}
        </AppText>
      </View>
      {chip ? <StockChip label={chip} isAttention={chip === model.useByChip && model.isUseByPast} /> : null}
      <Button label="Atualizar" variant="link" accessibilityLabel="Atualizar estoque" onPress={onEdit} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  grow: { flex: 1, minWidth: 0, gap: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  chipAttention: { borderColor: colors.amberBorder, backgroundColor: colors.amber50 },
  note: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface3,
  },
  noteAttention: { borderColor: colors.amberBorder, backgroundColor: colors.amber50 },
  summary: { gap: 10 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
}));
