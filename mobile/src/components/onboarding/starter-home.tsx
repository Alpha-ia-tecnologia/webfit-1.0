import {
  Bell,
  Check,
  ClipboardList,
  Droplets,
  LineChart,
  Sprout,
  Trash2,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { HABIT_SUGGESTIONS } from "@shared/data/habit-suggestions";
import { localDate, localTime, uid } from "@shared/lib/domain";
import { fmtMl } from "@shared/lib/format";
import {
  addStarterHabit,
  recordStarterWater,
  removeStarterWater,
  restoreStarterWater,
  STARTER_UNLOCKS,
  toggleStarterHabit,
} from "@shared/lib/starter";
import type { DiaryEntry } from "@shared/types";
import { Logo } from "@/components/brand/logo";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button, Card, Empty, OverflowMenu } from "@/components/ui";
import { selectionHaptic } from "@/lib/haptics";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, motion, radius, themeDomainTone } from "@/theme/tokens";
import { StarterDataSheet } from "./starter-data-sheet";
import { WaterCups } from "./water-cups";

/** O check "salta" com a mola rápida (a mesma dos combinados de Hoje); com movimento reduzido só aparece. */
const CHECK_POP = ZoomIn.springify()
  .stiffness(motion.spring.snappy.stiffness)
  .damping(motion.spring.snappy.damping)
  .mass(motion.spring.snappy.mass);
const CHECK_SIZE = 32;
const RECENT_LIMIT = 10;
const UNLOCK_ICONS: LucideIcon[] = [ClipboardList, UtensilsCrossed, Bell, LineChart];

type Props = {
  onPersonalize: () => void;
  busy: boolean;
  /** Depois de apagar tudo: a tela volta ao primeiro acesso com os campos vazios. */
  onReset: () => void;
};

/**
 * Início visual do primeiro acesso (ESPACO-12): combinados com check grande, água em copos (só o
 * que foi bebido), registros recentes com "⋯ → Remover" e "Desfazer", o que a anamnese libera e
 * "Seus dados" com a folha "Backup e dados".
 */
export function StarterHome({ onPersonalize, busy, onReset }: Props) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  const { state, commit } = useApp();
  const [isDataOpen, setDataOpen] = useState(false);
  const today = localDate();
  const habits = state.habits.filter((habit) => habit.createdDate <= today);
  const water = state.diary
    .filter((entry) => entry.type === "agua" && entry.date === today)
    .reduce((sum, entry) => sum + (entry.amountMl ?? 0), 0);
  const recent = state.diary
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
    .slice(0, RECENT_LIMIT);
  const firstName = String(state.draft?.name ?? "").trim().split(/\s+/)[0];

  const recordWater = () => {
    const id = uid();
    const timestamp = new Date().toISOString();
    void commit((current) => recordStarterWater(current, today, localTime(), timestamp, id), "250 ml registrados.", {
      label: "Desfazer",
      onAction: () => void commit((current) => removeStarterWater(current, id), "Registro desfeito."),
    });
  };
  const removeWater = (entry: DiaryEntry) =>
    void commit((current) => removeStarterWater(current, entry.id), "Registro removido.", {
      label: "Desfazer",
      onAction: () => void commit((current) => restoreStarterWater(current, entry), "Registro restaurado."),
    });

  return (
    <>
      <View style={styles.intro}>
        <Logo size={30} wordSize={24} />
        <View style={styles.mark}>
          <Sprout size={28} color={colors.green700} />
        </View>
        <AppText heading size={fontSize["2xl"]} weight={800} align="center" accessibilityRole="header">
          {`Olá, ${firstName}.`}
        </AppText>
        <AppText size={fontSize.base} lineHeight={22} color={colors.muted} align="center">
          Registre o que você fez hoje. Amanhã é uma nova oportunidade de continuar.
        </AppText>
      </View>
      <Card>
        <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header">
          Seu combinado de hoje
        </AppText>
        {habits.length ? (
          habits.map((habit) => {
            const isDone = habit.completedDates.includes(today);
            return (
              <Pressable
                key={habit.id}
                accessibilityRole="checkbox"
                accessibilityLabel={habit.title}
                accessibilityState={{ checked: isDone }}
                {...webAttrs({ "aria-checked": isDone })}
                onPress={() => {
                  selectionHaptic();
                  void commit((current) => toggleStarterHabit(current, habit.id, today));
                }}
                style={({ pressed }) => [styles.habit, isDone && styles.habitDone, pressed && styles.pressed]}
              >
                <View style={[styles.check, isDone && styles.checkOn]} testID="starter-check">
                  {isDone ? (
                    <Animated.View entering={CHECK_POP}>
                      <Check size={18} color={colors.white} strokeWidth={3} />
                    </Animated.View>
                  ) : null}
                </View>
                <View style={styles.grow}>
                  <AppText weight={600}>{habit.title}</AppText>
                  <AppText size={fontSize.xs} color={colors.muted}>
                    {isDone ? "Feito hoje" : habit.timeOfDay}
                  </AppText>
                </View>
              </Pressable>
            );
          })
        ) : (
          <>
            <Empty art="habits">Escolha algo simples para experimentar hoje.</Empty>
            {HABIT_SUGGESTIONS.map((suggestion, index) => (
              <Button
                key={suggestion.title}
                label={suggestion.title}
                variant="secondary"
                onPress={() => {
                  const id = uid();
                  void commit((current) => addStarterHabit(current, index, today, id));
                }}
              />
            ))}
          </>
        )}
      </Card>
      <Card>
        <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header">
          Água registrada hoje
        </AppText>
        <AppText heading size={fontSize["3xl"]} weight={800} color={colors.sky600} testID="starter-water-total">
          {water.toLocaleString("pt-BR")} ml
        </AppText>
        <WaterCups ml={water} />
        <AppText size={fontSize.xs} lineHeight={18} color={colors.muted}>
          Registre apenas o que você bebeu. Nenhuma meta de água foi definida.
        </AppText>
        <Button label="Registrar 250 ml" icon={Droplets} variant="secondary" onPress={recordWater} />
      </Card>
      <Card>
        <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header">
          Seus registros recentes
        </AppText>
        {recent.length ? (
          recent.map((entry) => (
            <View key={entry.id} style={styles.record}>
              <View style={styles.grow}>
                <AppText>{entry.type === "agua" ? `${fmtMl(entry.amountMl ?? 0)} de água` : entry.title}</AppText>
                <AppText size={fontSize.xs} color={colors.muted}>
                  {entry.date.split("-").reverse().join("/")} · {entry.time}
                </AppText>
              </View>
              {entry.type === "agua" && (
                <OverflowMenu
                  label={`Mais ações: água de ${entry.time}`}
                  items={[{ label: "Remover", icon: Trash2, onSelect: () => removeWater(entry) }]}
                />
              )}
            </View>
          ))
        ) : (
          <Empty art="diary">Os registros que você fizer aparecerão aqui.</Empty>
        )}
        {state.diary.length > RECENT_LIMIT && (
          <AppText size={fontSize.xs} color={colors.muted}>
            Mostrando os 10 mais recentes. O backup inclui todo o histórico.
          </AppText>
        )}
      </Card>
      <Card>
        <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header">
          O próximo passo, no seu tempo
        </AppText>
        <AppText lineHeight={22} color={colors.text2}>
          Para personalizar sua alimentação, complete suas informações de rotina e saúde. Seus
          combinados e registros serão mantidos.
        </AppText>
        <View style={styles.unlocks} role="list" aria-label="O que você libera">
          {STARTER_UNLOCKS.map((text, i) => {
            const Icon = UNLOCK_ICONS[i] ?? ClipboardList;
            return (
              <View key={text} role="listitem" style={styles.unlock}>
                <Icon size={15} color={domainTone.neutral.fg} />
                <AppText size={fontSize.xs} weight={600} color={colors.text2}>
                  {text}
                </AppText>
              </View>
            );
          })}
        </View>
        <Button label="Personalizar alimentação" busy={busy} onPress={onPersonalize} />
      </Card>
      <Card>
        <AppText heading size={fontSize.lg} weight={700} accessibilityRole="header">
          Seus dados
        </AppText>
        <AppText size={fontSize.sm} lineHeight={20} color={colors.text2}>
          Tudo fica neste aparelho. Exporte um backup para não perder o histórico.
        </AppText>
        <Button label="Backup e dados" variant="secondary" onPress={() => setDataOpen(true)} />
      </Card>
      {isDataOpen && <StarterDataSheet onClose={() => setDataOpen(false)} onReset={onReset} />}
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  intro: { alignItems: "center", gap: 12, paddingBottom: 8 },
  mark: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.mint50,
    alignItems: "center",
    justifyContent: "center",
  },
  grow: { flex: 1, minWidth: 0 },
  habit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  habitDone: { borderColor: colors.mint200, backgroundColor: colors.mint50 },
  pressed: { opacity: 0.8 },
  // Círculo de 32 que fica verde ao marcar (o check entra com a mola rápida).
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.slate300,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { borderColor: colors.green600, backgroundColor: colors.green600 },
  record: { flexDirection: "row", alignItems: "center", gap: 12 },
  unlocks: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  unlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
}));
