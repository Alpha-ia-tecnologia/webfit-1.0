import { CalendarDays } from "lucide-react-native";
import { useEffect, useId, useRef, useState } from "react";
import { PanResponder, Pressable, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { arcDash } from "@shared/lib/charts";
import { presenceFraction, presenceLabel, weekPresence, type DayPresence } from "@shared/lib/diary-day";
import { localDate, shiftDate } from "@shared/lib/domain";
import { DATE_STRIP_SIZE, dateStrip, type StripDay, type StripRange } from "@shared/lib/today";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, DatePickerSheet, IconButton } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, shadows } from "@/theme/tokens";
import { circlePath } from "./ring-path";

type Variant = "rings" | "dots";

type Props = {
  value: string;
  onChange: (date: string) => void;
  /** Nome acessível do grupo de dias. */
  label?: string;
  /** Diário: deslizar troca a semana; no Hoje, só os 7 dias. */
  isBrowsable?: boolean;
  /**
   * rings = Hoje (anel contínuo de presença; o dia escolhido numa pílula branca); dots = Diário (número e um
   * ponto; o dia escolhido numa pílula azul-marinho). Padrão como no web: dots na faixa navegável, rings na outra.
   */
  variant?: Variant;
  /** trailing = 7 dias até hoje; week = segunda a domingo, com os dias que ainda não chegaram desabilitados. */
  range?: StripRange;
};

const WEEK_DAYS = 7;
/** Deslocamento horizontal mínimo, em px, para o gesto contar como troca de semana. */
const SWIPE_MIN_PX = 48;
/** A partir daqui o gesto horizontal deixa de ser um toque no dia. */
const SWIPE_START_PX = 12;
/** 2 px (não os 4 do web): a 360 px os 7 dias ainda têm alvo real de 44 px (os dias não têm caixa visível). */
const CHIP_GAP = 2;
/** Anel de presença do Hoje: 30 px, traço 3,5. */
const RING = 30;
const RING_STROKE = 3.5;
const RING_RADIUS = RING / 2 - RING_STROKE / 2;
const DOT = 6;

const capitalized = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

type RingProps = { presence: DayPresence; day: StripDay; gradientId: string };

/**
 * Anel do dia (Hoje): um arco contínuo = (água + refeição + combinado) / 3, sem marca de falta nem sequência.
 * Passado em verde, hoje no gradiente azul, futuro só um aro tracejado.
 */
function PresenceRing({ presence, day, gradientId }: RingProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const center = RING / 2;
  const percent = presenceFraction(presence) * 100;
  return (
    <View style={styles.ring}>
      <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} style={styles.ringSvg}>
        {day.isToday ? (
          <Defs>
            <SvgGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.sky500} />
              <Stop offset="1" stopColor={colors.blue} />
            </SvgGradient>
          </Defs>
        ) : null}
        {day.isFuture ? (
          <Circle cx={center} cy={center} r={RING_RADIUS} fill="none" stroke={colors.border} strokeWidth={1.5} strokeDasharray="2 3" />
        ) : (
          <>
            <Circle cx={center} cy={center} r={RING_RADIUS} fill="none" stroke={colors.surface2} strokeWidth={RING_STROKE} />
            {percent > 0 ? (
              <Path
                d={circlePath(center, RING_RADIUS)}
                fill="none"
                stroke={day.isToday ? `url(#${gradientId})` : colors.green500}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={arcDash(RING_RADIUS, percent)}
              />
            ) : null}
          </>
        )}
      </Svg>
      <AppText heading size={fontSize.md} weight={day.isFuture ? 600 : 800} color={day.isFuture ? colors.muted : colors.text} style={styles.tabular} lineHeight={18}>
        {Number(day.date.slice(8))}
      </AppText>
    </View>
  );
}

type ChipProps = {
  day: StripDay;
  presence: DayPresence;
  variant: Variant;
  isActive: boolean;
  isBrowsable: boolean;
  gradientId: string;
  onPress: () => void;
};

/** Um dia da faixa: botão com o nome completo (e o que foi registrado) para o leitor de tela. */
function DayChip({ day, presence, variant, isActive, isBrowsable, gradientId, onPress }: ChipProps) {
  const styles = useStyles();
  const colors = useThemeColors();
  const logged = presenceLabel(presence);
  const hasAny = presence.water || presence.meal || presence.habit;
  const isDots = variant === "dots";
  const labelColor = isDots
    ? isActive
      ? colors.onFillText
      : colors.muted
    : day.isToday
      ? colors.green700
      : colors.muted;
  // Hoje (rings): a pílula branca marca o dia de hoje; Diário (dots): a pílula azul-marinho marca o dia escolhido.
  const hasPill = isDots ? isActive : day.isToday;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={logged ? `${day.aria}, com ${logged}` : day.aria}
      accessibilityState={{ disabled: day.isFuture, ...(isBrowsable ? { selected: isActive } : {}) }}
      {...webAttrs({
        "aria-pressed": isBrowsable ? isActive : undefined,
        "aria-current": day.isToday ? "date" : undefined,
      })}
      disabled={day.isFuture}
      testID={`week-chip-${day.date}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        isDots ? styles.chipDots : styles.chipRings,
        hasPill && (isDots ? styles.activeDots : styles.activeRings),
        pressed && styles.pressed,
      ]}
    >
      {isDots ? (
        <>
          <AppText size={fontSize.xs} weight={700} upper tracking={0.04} color={labelColor} lineHeight={16}>
            {day.weekday}
          </AppText>
          <AppText heading size={fontSize.lg} weight={800} color={isActive ? colors.white : day.isFuture ? colors.muted : colors.text} style={styles.tabular} lineHeight={22}>
            {Number(day.date.slice(8))}
          </AppText>
          {day.isFuture ? (
            <View style={styles.dotSpace} />
          ) : (
            <View testID={`week-dot-${day.date}`} style={[styles.dot, hasAny ? styles.dotOn : styles.dotOff]} />
          )}
        </>
      ) : (
        <>
          <AppText size={fontSize.md} weight={day.isToday ? 800 : 600} color={labelColor} lineHeight={20}>
            {capitalized(day.weekday)}
          </AppText>
          <PresenceRing presence={presence} day={day} gradientId={gradientId} />
        </>
      )}
    </Pressable>
  );
}

/**
 * Faixa de 7 dias (WeekStrip do web, FIDELIDADE-A H2/D2). Sem marca de falta nem sequência: só mostra o que foi
 * registrado. No Diário, deslizar para a esquerda avança uma semana e para a direita volta (nunca além de hoje).
 */
export function WeekStrip({ value, onChange, label = "Escolher o dia", isBrowsable = false, variant, range = "trailing" }: Props) {
  const styles = useStyles();
  const { state } = useApp();
  const gradientId = `week-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const today = localDate();
  const kind: Variant = variant ?? (isBrowsable ? "dots" : "rings");
  const days = dateStrip(value, today, DATE_STRIP_SIZE, range);
  const presence = weekPresence(
    state.diary,
    state.habits,
    days.map((d) => d.date),
  );
  // O gesto é criado uma vez; ele lê o dia e o callback atuais por aqui.
  const latest = useRef({ value, today, onChange });
  useEffect(() => {
    latest.current = { value, today, onChange };
  });
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, g) =>
        Math.abs(g.dx) > SWIPE_START_PX && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (_event, g) => {
        if (Math.abs(g.dx) < SWIPE_MIN_PX || Math.abs(g.dx) <= Math.abs(g.dy) * 1.5) return;
        const current = latest.current;
        const target = shiftDate(current.value, g.dx < 0 ? WEEK_DAYS : -WEEK_DAYS);
        const next = target > current.today ? current.today : target;
        if (next !== current.value) current.onChange(next);
      },
    }),
  ).current;
  return (
    <View role="group" accessibilityLabel={label} style={styles.strip} {...(isBrowsable ? swipe.panHandlers : {})}>
      {days.map((d, i) => (
        <DayChip
          key={d.date}
          day={d}
          presence={presence[i]!}
          variant={kind}
          isActive={d.date === value}
          isBrowsable={isBrowsable}
          gradientId={gradientId}
          onPress={() => onChange(d.date)}
        />
      ))}
    </View>
  );
}

type DatePickerProps = {
  value: string;
  onChange: (date: string) => void;
  /** Título da folha de rodas: o inputLabel do web ("Data dos registros"). */
  inputLabel?: string;
  /** Nome antigo de `inputLabel` (o Diário ainda passa `title`). */
  title?: string;
  /** Último dia que dá para escolher; padrão, hoje. */
  max?: string;
  buttonLabel?: string;
};

/** Calendário do Diário no cabeçalho (DatePickerButton do web): escolhe qualquer dia até hoje nas rodas das datas. */
export function DatePickerButton({ value, onChange, inputLabel, title, max, buttonLabel = "Escolher data no calendário" }: DatePickerProps) {
  const [isOpen, setOpen] = useState(false);
  const limit = max ?? localDate();
  return (
    <>
      <IconButton icon={CalendarDays} variant="header" accessibilityLabel={buttonLabel} expanded={isOpen} onPress={() => setOpen(true)} />
      <DatePickerSheet
        visible={isOpen}
        title={inputLabel ?? title ?? "Escolher data"}
        value={value}
        max={limit}
        onClose={() => setOpen(false)}
        onConfirm={(next) => {
          setOpen(false);
          if (next <= limit) onChange(next);
        }}
      />
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  strip: { flexDirection: "row", gap: CHIP_GAP, alignSelf: "stretch", maxWidth: 440, width: "100%" },
  chip: { flex: 1, minWidth: 0, height: 68, alignItems: "center", justifyContent: "center" },
  chipRings: { gap: 6, borderRadius: 20 },
  chipDots: { gap: 4, borderRadius: 22 },
  /** Hoje (rings): o dia de hoje numa pílula branca elevada. */
  activeRings: { backgroundColor: colors.surface, boxShadow: shadows.card },
  /** Diário (dots): o dia escolhido numa pílula azul-marinho (--wf-inverse, também no escuro). */
  activeDots: { backgroundColor: colors.inverse, boxShadow: shadows.dateActive },
  pressed: { transform: [{ scale: 0.95 }] },
  ring: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  ringSvg: { position: "absolute", top: 0, left: 0 },
  tabular: { fontVariant: ["tabular-nums"] },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  dotOn: { backgroundColor: colors.green500 },
  dotOff: { borderWidth: 1.5, borderColor: colors.slate300 },
  dotSpace: { height: DOT },
}));
