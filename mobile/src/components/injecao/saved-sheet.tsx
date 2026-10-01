import { CalendarClock, Smile } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Easing, Platform, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { COPY } from "@shared/lib/copy";
import type { CycleCardModel } from "@shared/lib/cycle-tips";
import type { Spot } from "@shared/lib/rotation";
import type { SavedSheetModel } from "@shared/lib/treatment";
import type { StockModel } from "@shared/lib/treatment-stock";
import { AppText, Button, Sheet } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize } from "@/theme/tokens";
import { CycleSheet, CycleTipBlock } from "./cycle-tips";
import { SitePictogram } from "./site-pictogram";
import { StockArt, StockChips, StockNotices } from "./stock";

const CHECK_SIZE = 56;
/** Comprimento do traço do visto (≈ 33 no desenho), arredondado para cima. */
const CHECK_LENGTH = 40;
const DRAW_MS = 420;
/** Mesma curva do web (--wf-ease). */
const EASE = Easing.bezier(0.16, 1, 0.3, 1);
/** Espera o painel aparecer antes de levar o foco ao "Ver no diário". */
const FOCUS_DELAY_MS = 350;

/** Visto desenhado uma vez (confirmação, não celebração); parado com movimento reduzido. */
function DrawnCheck() {
  const styles = useStyles();
  const colors = useThemeColors();
  const isReduced = useReducedMotion();
  const [offset, setOffset] = useState(isReduced ? 0 : CHECK_LENGTH);
  useEffect(() => {
    if (isReduced) {
      setOffset(0);
      return;
    }
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / DRAW_MS);
      setOffset(CHECK_LENGTH * (1 - EASE(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isReduced]);
  return (
    <View testID="saved-check" style={styles.check} aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={CHECK_SIZE} height={CHECK_SIZE} viewBox="0 0 56 56">
        <Circle cx={28} cy={28} r={28} fill={colors.mint50} />
        <Path
          d="M17 29 L25 37 L40 21"
          fill="none"
          stroke={colors.green700}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${CHECK_LENGTH}`}
          strokeDashoffset={offset}
        />
      </Svg>
    </View>
  );
}

/** Foco no primeiro botão dentro de `node` (no export web a View é o próprio elemento do DOM). */
function focusFirstButton(node: View | null) {
  const element = node as unknown as { querySelector?: (selector: string) => { focus?: () => void } | null } | null;
  const button = Platform.OS === "web" ? element?.querySelector?.('[role="button"]') : null;
  if (button?.focus) button.focus();
  else focusNode(node);
}

type Props = {
  model: SavedSheetModel | null;
  /** Próximo ponto sugerido, para o pictograma. */
  nextSpot: Spot;
  /** "Para os próximos dias" (SERINGA-11); null em gestação, para menores ou fora do ciclo semanal. */
  cycle: CycleCardModel | null;
  /** Estoque informado (SERINGA-12), já com esta aplicação; null sem estoque. */
  stock: StockModel | null;
  onDiary: () => void;
  onMood: () => void;
  onMeasures: () => void;
  onUndo: () => void;
  onClose: () => void;
};

type BodyProps = { model: SavedSheetModel; nextSpot: Spot; cycle: CycleCardModel | null; stock: StockModel | null; onPhases: () => void };

function SavedBody({ model, nextSpot, cycle, stock, onPhases }: BodyProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.body}>
      <DrawnCheck />
      <View style={styles.copy}>
        <AppText heading size={fontSize.md} weight={800} align="center">
          {model.lead}
        </AppText>
        <AppText size={fontSize.sm} color={colors.muted} align="center">
          {model.when}
        </AppText>
      </View>
      {model.nextDose && (
        <View style={styles.row}>
          <CalendarClock size={20} color={colors.violet600} />
          <View style={styles.grow}>
            <AppText size={fontSize.base} weight={700}>
              {model.nextDose}
            </AppText>
            {model.nextDoseHint && (
              <AppText size={fontSize.xs} color={colors.muted}>
                {model.nextDoseHint}
              </AppText>
            )}
          </View>
        </View>
      )}
      <View style={styles.row}>
        <SitePictogram site={nextSpot.site} side={nextSpot.side} />
        <AppText size={fontSize.base} weight={700} style={styles.grow}>
          {model.nextSite}
        </AppText>
      </View>
      {stock && (
        <View style={styles.stock} testID="saved-stock">
          <View style={styles.stockHead}>
            <StockArt method={stock.method} level={stock.level} aria={stock.aria} size={32} />
            <View style={styles.grow}>
              <AppText size={fontSize.base} weight={700}>
                {`Estoque: ${stock.amount}`}
              </AppText>
              <StockChips model={stock} />
            </View>
          </View>
          <StockNotices notices={stock.notices} />
        </View>
      )}
      {cycle?.top && <CycleTipBlock model={cycle} heading="Para os próximos dias" onPhases={onPhases} />}
    </View>
  );
}

/**
 * "Aplicação registrada" (SERINGA-10): confirma o que foi gravado, a próxima dose estimada (só para quem
 * acompanha a frequência) e o próximo local, e leva ao diário, ao bem-estar ou às medidas. Sem conselho
 * de dose e sem celebração; "Desfazer" fica aqui (no caminho da Seringa não há aviso). Fechar fica na tela.
 */
export function SavedSheet({ model, nextSpot, cycle, stock, onDiary, onMood, onMeasures, onUndo, onClose }: Props) {
  const styles = useStyles();
  const actions = useRef<View>(null);
  const [isCycleOpen, setCycleOpen] = useState(false);
  const visible = model !== null;
  useEffect(() => {
    // Fechada, a folha das fases também fecha (a próxima "Aplicação registrada" começa sem ela).
    if (!visible) {
      setCycleOpen(false);
      return;
    }
    const focus = () => focusFirstButton(actions.current);
    const frame = requestAnimationFrame(focus);
    const timer = setTimeout(focus, FOCUS_DELAY_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [visible]);
  return (
    <Sheet
      visible={visible}
      title="Aplicação registrada"
      onClose={onClose}
      footer={
        model && (
          <View ref={actions} style={styles.footer}>
            <Button label="Ver no diário" size="lg" wide onPress={onDiary} />
            <View style={styles.secondary}>
              <Button
                label="Como você está?"
                accessibilityLabel="Como você está? Registrar bem-estar"
                icon={Smile}
                variant="secondary"
                onPress={onMood}
                style={styles.half}
              />
              {model.showMeasures && <Button label={COPY.measure} variant="secondary" onPress={onMeasures} style={styles.half} />}
            </View>
            <Button label="Desfazer" variant="text" onPress={onUndo} style={styles.center} />
          </View>
        )
      }
    >
      {model && <SavedBody model={model} nextSpot={nextSpot} cycle={cycle} stock={stock} onPhases={() => setCycleOpen(true)} />}
      <CycleSheet model={cycle} visible={visible && isCycleOpen} onClose={() => setCycleOpen(false)} />
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  body: { gap: 14 },
  check: { alignSelf: "center" },
  copy: { gap: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  grow: { flex: 1, minWidth: 0 },
  stock: {
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  stockHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  footer: { gap: 8 },
  secondary: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  half: { flexGrow: 1, flexBasis: 140 },
  center: { alignSelf: "center" },
}));
