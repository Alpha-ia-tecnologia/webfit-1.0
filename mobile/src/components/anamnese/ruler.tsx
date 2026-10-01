import { LinearGradient } from "expo-linear-gradient";
import { Minus, Plus } from "lucide-react-native";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import {
  formatValue,
  offsetFromValue,
  PX_PER_TICK,
  rulerTicks,
  snapToStep,
  toNumber,
  valueFromOffset,
  type RulerConfig,
  type RulerTick,
} from "@shared/components/anamnese/inputs";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, horizontal, shadows } from "@/theme/tokens";
import { QBlock, QHelp, QLabel } from "./q-block";

type Props = {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  value: string | number | null;
  config: RulerConfig;
  /** Texto auxiliar sob o valor (ex.: IMC estimado). */
  helper?: string;
  onChange: (value: string) => void;
};

// Medidas de .ruler / .tick em AnamneseInputs.css.
const TRACK_HEIGHT = 84;
const TRACK_PADDING_BOTTOM = 10;
const TICK_HEIGHT = { major: 28, mid: 20, minor: 14 } as const;
const LABEL_WIDTH = 48;
const LABEL_GAP = 6;
const FADE_WIDTH = "22%";
const SYNC_MS = 150;
const SYNC_ANIMATED_MS = 400;
const FINE_BUTTON_SIZE = 44;

/** Leva o foco (teclado no web, leitor de tela no aparelho) ao controle que acabou de aparecer. */
function focusNode(node: View | null) {
  if (!node) return;
  if (Platform.OS === "web") (node as unknown as { focus?: () => void }).focus?.();
  else AccessibilityInfo.sendAccessibilityEvent(node, "focus");
}

/**
 * Régua horizontal rolável com marcador central e −/+ ao lado do número, igual à do app web.
 * Opcional sem valor fica recolhida numa linha com "Informar".
 * Durante o arrasto só o número exibido muda (estado local); o valor sobe para a tela
 * quando a rolagem para. Reenviar cada evento de rolagem à anamnese inteira deixava o
 * número segundos atrasado no aparelho.
 */
export function Ruler({ label, hint, error, optional, value, config, helper, onChange }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const numeric = toNumber(value);
  const current = numeric ?? config.initial;
  const [isOpen, setOpen] = useState(false);
  const isCollapsed = !!optional && numeric === null && !isOpen;
  const scroller = useRef<ScrollView>(null);
  const slider = useRef<View>(null);
  const addButton = useRef<View>(null);
  const pendingFocus = useRef<"slider" | "add" | null>(null);
  // Valor que veio do próprio arrasto: evita reposicionar a régua sob o dedo do usuário.
  const fromScroll = useRef<number | null>(null);
  // Rolagens programáticas também disparam onScroll; até este instante elas são ignoradas.
  const syncUntil = useRef(0);
  const latest = useRef({ numeric, onChange });
  latest.current = { numeric, onChange };
  // Valor exibido enquanto o dedo está na régua; null quando o valor da tela prevalece.
  const [live, setLive] = useState<number | null>(null);
  const liveRef = useRef<number | null>(null);
  // Largura visível da trilha, medida no aparelho: o recuo lateral é metade dela para que
  // o traço sob o marcador central represente o valor (padding: 0 50% no web).
  const [viewport, setViewport] = useState(0);
  const ticks = useMemo(() => rulerTicks(config), [config]);
  const pad = viewport / 2;
  // Rótulos inteiros quando o espaçamento entre traços maiores é inteiro (ex.: 0,2 × 5 = 1).
  const labelDecimals = Number((config.tickStep * config.majorEvery).toFixed(6)) % 1 ? 1 : 0;

  const scrollToValue = (target: number, animated: boolean) => {
    syncUntil.current = Date.now() + (animated ? SYNC_ANIMATED_MS : SYNC_MS);
    scroller.current?.scrollTo({ x: offsetFromValue(target, config), animated });
  };
  const showLive = (next: number | null) => {
    liveRef.current = next;
    setLive(next);
  };

  // Valor vindo da tela (botões, preenchimento externo) prevalece e reposiciona a régua.
  useEffect(() => {
    if (!viewport || isCollapsed) return;
    showLive(null);
    if (fromScroll.current === current) return;
    scrollToValue(current, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, config, viewport, isCollapsed]);
  // Ao abrir ou recolher pela ação da pessoa, o foco segue para o controle que apareceu.
  useEffect(() => {
    const target = pendingFocus.current === "slider" ? slider.current : pendingFocus.current === "add" ? addButton.current : null;
    pendingFocus.current = null;
    focusNode(target);
  }, [isCollapsed]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    if (width === viewport) return;
    fromScroll.current = null;
    setViewport(width);
  };
  const handleContentSizeChange = () => {
    if (viewport && fromScroll.current === null) scrollToValue(current, false);
  };
  const commit = (next: number) => {
    fromScroll.current = null;
    showLive(null);
    onChange(String(snapToStep(next, config)));
  };
  const clear = () => {
    fromScroll.current = null;
    showLive(null);
    pendingFocus.current = optional ? "add" : null;
    setOpen(false);
    onChange("");
  };
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!viewport || Date.now() < syncUntil.current) return;
    const next = valueFromOffset(event.nativeEvent.contentOffset.x, config);
    if (next !== liveRef.current) showLive(next);
  };
  // Ao soltar ou terminar a inércia: garante o traço sob o marcador e entrega o valor à tela.
  const handleSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!viewport) return;
    const x = event.nativeEvent.contentOffset.x;
    const next = valueFromOffset(x, config);
    if (Math.abs(x - offsetFromValue(next, config)) > 0.5) scrollToValue(next, true);
    if (next !== latest.current.numeric) {
      fromScroll.current = next;
      latest.current.onChange(String(next));
    }
  };

  if (isCollapsed)
    return (
      <View style={styles.collapsed}>
        <View style={styles.collapsedLabel}>
          <QLabel label={label} optional isCollapsed />
        </View>
        <Pressable
          ref={addButton}
          accessibilityRole="button"
          accessibilityLabel={`Informar ${label}`}
          onPress={() => {
            pendingFocus.current = "slider";
            setOpen(true);
          }}
          style={({ pressed }) => [styles.add, pressed && styles.pressed]}
        >
          <Plus size={16} color={colors.green700} />
          <AppText size={fontSize.sm} weight={700} color={colors.green700}>
            Informar
          </AppText>
        </Pressable>
        {hint || error ? (
          <View style={styles.collapsedHelp}>
            <QHelp hint={hint} error={error} />
          </View>
        ) : null}
      </View>
    );

  const shownValue = live ?? numeric;
  const isEmpty = shownValue === null;
  const shown = isEmpty ? "—" : formatValue(shownValue, config.decimals);
  const fine = formatValue(config.fineStep, config.fineStep % 1 ? 1 : 0);
  return (
    <QBlock
      label={label}
      optional={optional}
      hint={hint}
      error={error}
      right={
        config.allowNone ? (
          <Pressable accessibilityRole="button" onPress={clear} style={styles.noneHit}>
            {({ pressed }) => (
              <View style={[styles.none, pressed && styles.pressed]}>
                <AppText size={fontSize.xs} weight={600} color={colors.muted}>
                  Não informar
                </AppText>
              </View>
            )}
          </Pressable>
        ) : undefined
      }
    >
      <View style={styles.card}>
        <View style={styles.valueRow}>
          <FineButton icon={Minus} label={`Diminuir ${fine} ${config.unit}`} onPress={() => commit(current - config.fineStep)} />
          <View style={styles.value}>
            <AppText heading size={fontSize["6xl"]} weight={800} tracking={-0.04} lineHeight={44} color={isEmpty ? colors.muted : colors.text}>
              {shown}
            </AppText>
            <AppText heading size={fontSize.lg} weight={700} color={colors.green700}>
              {config.unit}
            </AppText>
          </View>
          <FineButton icon={Plus} label={`Aumentar ${fine} ${config.unit}`} onPress={() => commit(current + config.fineStep)} />
        </View>
        {helper ? (
          <AppText size={fontSize.xs} color={colors.muted} align="center" style={styles.helper}>
            {helper}
          </AppText>
        ) : null}
        <View
          ref={slider}
          style={styles.track}
          accessible
          focusable
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min: config.min, max: config.max, now: numeric ?? undefined, text: isEmpty ? "não informado" : `${shown} ${config.unit}` }}
          // O react-native-web não gera aria-valuetext a partir do accessibilityValue: o leitor de tela do web lia o controle sem valor.
          aria-valuemin={config.min}
          aria-valuemax={config.max}
          aria-valuenow={numeric ?? undefined}
          aria-valuetext={isEmpty ? "não informado" : `${shown} ${config.unit}`}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => commit(current + (event.nativeEvent.actionName === "increment" ? config.fineStep : -config.fineStep))}
        >
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            scrollEventThrottle={16}
            decelerationRate="fast"
            snapToInterval={PX_PER_TICK}
            snapToAlignment="start"
            onLayout={handleLayout}
            onContentSizeChange={handleContentSizeChange}
            onScroll={handleScroll}
            onScrollEndDrag={handleSettle}
            onMomentumScrollEnd={handleSettle}
            contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: TRACK_PADDING_BOTTOM, alignItems: "flex-end", height: TRACK_HEIGHT - 2 }}
          >
            {/* O rótulo sob o ponteiro some: o número grande já mostra o valor (usa o valor gravado,
                não o do arrasto, para a trilha não ser redesenhada a cada quadro). */}
            <Track ticks={ticks} labelDecimals={labelDecimals} hidden={current} />
          </ScrollView>
          {/* Equivalente ao mask-image do web: as pontas da régua somem no fundo do cartão. */}
          <LinearGradient pointerEvents="none" colors={[colors.surface, colors.wheelFade]} start={horizontal.start} end={horizontal.end} style={[styles.fade, styles.fadeLeft]} />
          <LinearGradient pointerEvents="none" colors={[colors.wheelFade, colors.surface]} start={horizontal.start} end={horizontal.end} style={[styles.fade, styles.fadeRight]} />
          <View pointerEvents="none" style={styles.marker}>
            <View style={styles.markerDot} />
          </View>
        </View>
      </View>
    </QBlock>
  );
}

/** Trilha estática (memo): só é redesenhada quando o valor gravado muda, nunca durante o arrasto. */
const Track = memo(function Track({ ticks, labelDecimals, hidden }: { ticks: RulerTick[]; labelDecimals: number; hidden: number }) {
  return (
    <>
      {ticks.map((tick) => (
        <Tick key={tick.value} tick={tick} labelDecimals={labelDecimals} showLabel={tick.major && tick.value !== hidden} />
      ))}
    </>
  );
});

/** Um traço; memo para que mudar o rótulo oculto redesenhe só os dois traços afetados. */
const Tick = memo(function Tick({ tick, labelDecimals, showLabel }: { tick: RulerTick; labelDecimals: number; showLabel: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const kind = tick.major ? "major" : tick.mid ? "mid" : "minor";
  return (
    <View style={[styles.tick, { height: TICK_HEIGHT[kind] }]}>
      <View style={[styles.tickLine, kind === "major" && styles.tickLineMajor]} />
      {showLabel && (
        <AppText size={fontSize["2xs"]} weight={600} color={colors.muted} align="center" lineHeight={12} style={styles.tickLabel}>
          {formatValue(tick.value, labelDecimals)}
        </AppText>
      )}
    </View>
  );
});

/** −/+ só com ícone, redondos, ao lado do número (o nome acessível diz o passo: "Aumentar 0,5 kg"). */
function FineButton({ icon: Icon, label, onPress }: { icon: typeof Minus; label: string; onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.fineButton, pressed && styles.finePressed]}>
      <Icon size={18} color={colors.text2} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  // .q-none
  // Toque de 44 px em volta da pílula (sem hitSlop, que o web ignora), sem mudar o layout.
  noneHit: { minHeight: 44, marginVertical: -8, justifyContent: "center" },
  none: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  // .q-collapsed: uma linha de ~56 px com "Informar" no lugar da régua
  collapsed: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12, rowGap: 8, minHeight: 56, paddingVertical: 8, paddingLeft: 16, paddingRight: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  collapsedLabel: { flex: 1, minWidth: 0 },
  collapsedHelp: { flexBasis: "100%" },
  // .q-add
  add: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.mint50 },
  pressed: { transform: [{ scale: 0.96 }] },
  // .ruler-card
  card: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, boxShadow: shadows.card },
  // .ruler-value-row
  valueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  value: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 6, flexShrink: 1, minWidth: 0 },
  helper: { marginTop: 4 },
  // .fine-btn
  fineButton: { width: FINE_BUTTON_SIZE, height: FINE_BUTTON_SIZE, borderRadius: FINE_BUTTON_SIZE / 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  finePressed: { transform: [{ scale: 0.92 }], backgroundColor: colors.mint100 },
  // .ruler
  track: { height: TRACK_HEIGHT, marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface3, overflow: "hidden" },
  fade: { position: "absolute", top: -1, bottom: -1, width: FADE_WIDTH },
  fadeLeft: { left: -1 },
  fadeRight: { right: -1 },
  // .ruler-marker e o ponto no topo
  marker: { position: "absolute", top: 6, bottom: 8, left: "50%", width: 3, marginLeft: -1.5, borderRadius: 999, backgroundColor: colors.green500 },
  markerDot: { position: "absolute", top: -3, left: "50%", width: 10, height: 10, marginLeft: -5, borderRadius: 5, backgroundColor: colors.green500, boxShadow: shadows.markerDot },
  // .tick: slot de 12 px com o traço encostado à esquerda; o valor do traço fica sob o marcador em x = 0 do slot.
  tick: { width: PX_PER_TICK, justifyContent: "flex-end" },
  tickLine: { position: "absolute", left: 0, bottom: 0, width: 2, height: "100%", borderRadius: 999, backgroundColor: colors.slate300 },
  tickLineMajor: { backgroundColor: colors.faint },
  tickLabel: { position: "absolute", left: 1 - LABEL_WIDTH / 2, bottom: TICK_HEIGHT.major + LABEL_GAP, width: LABEL_WIDTH },
}));
