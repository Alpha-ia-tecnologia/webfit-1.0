import { LinearGradient } from "expo-linear-gradient";
import { Check, Pencil, Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { HABIT_SUGGESTIONS } from "@shared/data/habit-suggestions";
import { circumference, ringSegments } from "@shared/lib/charts";
import { habitWeek, habitWeekLabel } from "@shared/lib/habit-week";
import type { HabitItem } from "@shared/types";
import {
  AppText,
  Button,
  Card,
  ChipRow,
  Empty,
  Field,
  OverflowMenu,
  QuickChip,
  TextField,
  TimeField,
  WeekDots,
} from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { makeStyles, useTheme } from "@/theme/theme";
import { diagonalDown, fontSize, gradients, motion, radius, shadows, themeDomainTone, type ThemeColors } from "@/theme/tokens";
import { CelebrationGlow, useCelebration } from "./celebration";
import { habitIcon, type HabitTone } from "./habit-icon";
import { circlePath } from "./ring-path";

type Props = {
  habits: HabitItem[];
  today: string;
  onToggle: (id: string) => void;
  onRemove: (habit: HabitItem) => void;
  onCreate: (title: string, time: string) => Promise<boolean>;
  /** Brilho ao fechar os combinados do dia; desligado para perfis sensíveis. */
  canCelebrate?: boolean;
  /** Perfil calmo (sensível ou menor): sem os pontos da semana. */
  isCalm?: boolean;
};

/** Anel de 24 px do cabeçalho, um segmento por combinado (raio 9,5, traço 3,5). */
const RING = 24;
const RING_RADIUS = 9.5;
const RING_STROKE = 3.5;
const RING_GAP = 3;
const CHECK = 34;
const ICON = 36;
/** O check "salta" com a mola rápida (SIS-09); com movimento reduzido o reanimated só mostra. */
const CHECK_POP = ZoomIn.springify()
  .stiffness(motion.spring.snappy.stiffness)
  .damping(motion.spring.snappy.damping)
  .mass(motion.spring.snappy.mass);

/** Fundo e cor do ícone redondo pelo tom do combinado (pendente); feito = superfície com o verde. */
function toneColors(tone: HabitTone, colors: ThemeColors, habit: { bg: string; fg: string }) {
  if (tone === "mint") return { bg: colors.mint50, fg: colors.green700 };
  if (tone === "sky") return { bg: colors.sky50, fg: colors.sky700 };
  if (tone === "indigo") return { bg: colors.indigo50, fg: colors.indigo700 };
  if (tone === "amber") return { bg: colors.amber50, fg: colors.amber700 };
  return habit;
}

function SegmentRing({ done, total }: { done: number; total: number }) {
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  const d = circlePath(RING / 2, RING_RADIUS);
  const length = circumference(RING_RADIUS);
  return (
    <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
      {ringSegments(RING_RADIUS, Math.max(total, 1), RING_GAP).map((segment, i) => (
        <Path
          key={i}
          d={d}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          stroke={i < done ? domainTone.habit.fg : colors.surface2}
          strokeDasharray={`${Math.max(0.5, segment.length)} ${length}`}
          strokeDashoffset={segment.offset}
        />
      ))}
    </Svg>
  );
}

/** Uma linha: ícone redondo, título, "Feito" ou o horário, os 7 pontos da semana e o check redondo de 34 px. */
function HabitRow({
  habit,
  today,
  isCalm,
  isEditing,
  onToggle,
  onRemove,
}: {
  habit: HabitItem;
  today: string;
  isCalm: boolean;
  isEditing: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const isDone = habit.completedDates.includes(today);
  const { icon: Icon, tone } = habitIcon(habit.title);
  const iconColors = isDone ? { bg: colors.surface, fg: colors.green700 } : toneColors(tone, colors, themeDomainTone(scheme).habit);
  const week = isCalm ? null : habitWeek(habit, today);
  const status = isDone ? "feito hoje" : `às ${habit.timeOfDay}`;
  const name = [habit.title, status, week ? habitWeekLabel(week) : null].filter(Boolean).join(", ");
  return (
    <View style={[styles.row, isDone && styles.rowDone]}>
      <Pressable
        accessibilityRole="checkbox"
        aria-checked={isDone}
        accessibilityState={{ checked: isDone }}
        accessibilityLabel={name}
        onPress={onToggle}
        style={styles.rowBody}
      >
        <View style={[styles.icon, { backgroundColor: iconColors.bg }]}>
          <Icon size={18} color={iconColors.fg} />
        </View>
        <View style={styles.text}>
          <AppText size={fontSize.base} weight={700} tracking={-0.01} lineHeight={18} color={isDone ? colors.green800 : colors.text}>
            {habit.title}
          </AppText>
          <View style={styles.sub}>
            <AppText size={fontSize.sm} weight={isDone ? 700 : 600} color={isDone ? colors.green700 : colors.muted} style={styles.tabular}>
              {isDone ? "Feito" : habit.timeOfDay}
            </AppText>
            {week && <WeekDots states={week} label={habitWeekLabel(week)} />}
          </View>
        </View>
        <View style={[styles.check, isDone && styles.checkDone]}>
          {isDone && (
            <Animated.View entering={CHECK_POP} style={styles.checkFill}>
              <LinearGradient colors={gradients.button} start={diagonalDown.start} end={diagonalDown.end} style={StyleSheet.absoluteFill} />
              {/* O ícone numa View própria: no web, a camada absoluta do gradiente pintaria por cima de um svg solto. */}
              <View>
                <Check size={20} color={colors.white} strokeWidth={3} />
              </View>
            </Animated.View>
          )}
        </View>
      </Pressable>
      {isEditing && (
        <OverflowMenu label={`Opções de ${habit.title}`} variant="ghost" items={[{ label: "Excluir combinado", onSelect: onRemove }]} />
      )}
    </View>
  );
}

/** Combinados do dia (Combinados do web): marcar é um toque; criar e excluir ficam no ⋯ (excluir pode ser desfeito). */
export function Combinados({ habits, today, onToggle, onRemove, onCreate, canCelebrate = false, isCalm = false }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  const [isAdding, setAdding] = useState(false);
  const [isEditing, setEditing] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [isExpanded, setExpanded] = useState(false);
  const done = habits.filter((h) => h.completedDates.includes(today)).length;
  const allDone = habits.length > 0 && done === habits.length;
  const showList = !allDone || isExpanded || isEditing;
  // Só celebra quando mais combinados foram feitos: excluir um pendente também fecha a conta.
  const isCelebrating = useCelebration(allDone, canCelebrate, done);

  const save = async () => {
    if (isSaving) return;
    setSaving(true);
    try {
      if (await onCreate(title, time)) {
        setTitle("");
        setAdding(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card testID="habits-card" style={styles.card}>
      <View style={styles.head}>
        <AppText heading size={fontSize.xl} weight={800} tracking={-0.01} accessibilityRole="header" style={styles.headTitle}>
          Combinados
        </AppText>
        {habits.length > 0 && (
          <View style={styles.count} accessible accessibilityRole="image" accessibilityLabel={`${done} de ${habits.length} feitos`}>
            <SegmentRing done={done} total={habits.length} />
            <AppText heading size={fontSize.lg} weight={800} style={styles.tabular}>
              {done}
              <AppText size={fontSize.md} weight={600} color={colors.muted}>
                {`/${habits.length}`}
              </AppText>
            </AppText>
          </View>
        )}
        {isEditing ? (
          <Button label="Concluir" variant="text" onPress={() => setEditing(false)} />
        ) : (
          <OverflowMenu
            label="Opções dos combinados"
            variant="soft"
            items={[
              { label: "Novo combinado", icon: Plus, onSelect: () => setAdding(true) },
              ...(habits.length ? [{ label: "Editar combinados", icon: Pencil, onSelect: () => setEditing(true) }] : []),
            ]}
          />
        )}
      </View>
      {isAdding && (
        <View style={styles.form}>
          <Field label="Nome do combinado">
            <TextField
              value={title}
              onChangeText={setTitle}
              maxLength={150}
              placeholder="Ex.: fazer uma pausa para caminhar"
              accessibilityLabel="Nome do combinado"
            />
          </Field>
          <TimeField label="Horário" value={time} onChange={setTime} />
          <View style={styles.formActions}>
            <Button label="Cancelar" variant="secondary" onPress={() => setAdding(false)} />
            <Button label="Salvar combinado" disabled={isSaving} onPress={() => void save()} />
          </View>
        </View>
      )}
      {!habits.length ? (
        <View>
          <Empty art="habits">Escolha um pequeno passo para começar.</Empty>
          {!isAdding && (
            <ChipRow>
              {HABIT_SUGGESTIONS.map((suggestion) => (
                <QuickChip
                  key={suggestion.title}
                  label={suggestion.title}
                  onPress={() => {
                    setTitle(suggestion.title);
                    setTime(suggestion.timeOfDay);
                    setAdding(true);
                  }}
                />
              ))}
            </ChipRow>
          )}
        </View>
      ) : (
        <>
          {allDone && !isEditing && (
            <Pressable
              accessibilityRole="button"
              aria-expanded={isExpanded}
              accessibilityLabel={`Tudo feito hoje. ${isExpanded ? "Ocultar" : "Ver"} combinados`}
              onPress={() => setExpanded(!isExpanded)}
              style={({ pressed }) => [styles.allDone, pressed && styles.allDonePressed]}
            >
              <Check size={16} strokeWidth={3} color={colors.green700} />
              <AppText size={fontSize.sm} weight={700} color={colors.green700} style={styles.grow}>
                Tudo feito hoje
              </AppText>
              <AppText heading size={fontSize.sm} weight={700} color={colors.green700}>
                {isExpanded ? "Ocultar" : "Ver"}
              </AppText>
            </Pressable>
          )}
          {showList && (
            <View style={styles.list}>
              {habits.map((h) => (
                <HabitRow
                  key={h.id}
                  habit={h}
                  today={today}
                  isCalm={isCalm}
                  isEditing={isEditing}
                  onToggle={() => {
                    selectionHaptic();
                    onToggle(h.id);
                  }}
                  onRemove={() => onRemove(h)}
                />
              ))}
            </View>
          )}
        </>
      )}
      {isCelebrating && <CelebrationGlow color={domainTone.habit.fg} borderRadius={28} />}
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { paddingTop: 16, paddingHorizontal: 14, paddingBottom: 18, borderRadius: 28, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 6 },
  headTitle: { flex: 1, minWidth: 0 },
  count: { flexDirection: "row", alignItems: "center", gap: 6, marginRight: 2 },
  tabular: { fontVariant: ["tabular-nums"] },
  form: { gap: 12 },
  formActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 },
  list: { gap: 8 },
  grow: { flex: 1 },
  allDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.mint50,
  },
  allDonePressed: { opacity: 0.85 },
  /** Linha cinza-clara (surface-3) de 56 px; feita = menta. */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 56,
    paddingVertical: 8,
    paddingRight: 8,
    paddingLeft: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface3,
  },
  rowDone: { backgroundColor: colors.mint50, borderColor: colors.mint200 },
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  icon: { width: ICON, height: ICON, borderRadius: ICON / 2, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0, gap: 3 },
  sub: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  check: {
    width: CHECK,
    height: CHECK,
    borderRadius: CHECK / 2,
    borderWidth: 2,
    borderColor: colors.slate300,
    alignItems: "center",
    justifyContent: "center",
  },
  checkDone: { borderWidth: 0, boxShadow: shadows.float },
  checkFill: {
    width: CHECK,
    height: CHECK,
    borderRadius: CHECK / 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
}));
