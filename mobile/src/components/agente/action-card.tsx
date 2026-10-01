import { Check, Clock, ListChecks, Plus, Utensils } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Pressable, View } from "react-native";
import type { ChatBlock, HabitBlock } from "@shared/lib/agent-blocks";
import { localDate, uid } from "@shared/lib/domain";
import { resolvePlanned } from "@shared/lib/taco-match";
import { habitSchema } from "@shared/types";
import { PlannedItems } from "@/components/dieta/planned-items";
import { usePlannedMealRegister } from "@/components/dieta/use-planned-meal";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { AppText, Button } from "@/components/ui";
import { focusNode } from "@/lib/focus";
import { successHaptic } from "@/lib/haptics";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme, useThemeColors } from "@/theme/theme";
import { fontSize, radius, themeDomainTone } from "@/theme/tokens";

type ActionBlock = Extract<ChatBlock, { tipo: "acao" }>;
type RegisterBlock = Extract<ActionBlock, { acao: "registrar_refeicao" }>;

/** O mesmo combinado, ignorando espaços e maiúsculas. */
const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** "15:00" → "15h"; "07:30" → "7h30" (rótulo curto do chip, shortHour do web). */
export function shortHour(time: string): string {
  const [hour = "", minute = ""] = time.split(":");
  const h = String(Number(hour));
  return minute === "00" ? `${h}h` : `${h}h${minute}`;
}

/**
 * Criar o combinado proposto (useHabitCreate do web): só quando a pessoa confirma, com "Desfazer". O estado "já está"
 * vem dos combinados salvos (sobrevive à recarga); depois de criar, o foco vai para o aviso que substitui o botão.
 */
function useHabitCreate(block: HabitBlock, done: RefObject<View | null>) {
  const { state, commit, notify } = useApp();
  const [isBusy, setBusy] = useState(false);
  const busy = useRef(false);
  const shouldFocusDone = useRef(false);
  const exists = state.habits.some((h) => sameTitle(h.title, block.titulo));
  useEffect(() => {
    if (!exists || !shouldFocusDone.current) return;
    shouldFocusDone.current = false;
    requestAnimationFrame(() => focusNode(done.current));
  }, [exists, done]);
  const create = async () => {
    if (busy.current) return;
    const id = uid();
    const parsed = habitSchema.safeParse({ id, title: block.titulo, timeOfDay: block.horario, createdDate: localDate(), completedDates: [] });
    if (!parsed.success) {
      notify("Confira o nome e o horário do combinado.", "warning");
      return;
    }
    const habit = parsed.data;
    busy.current = true;
    setBusy(true);
    shouldFocusDone.current = true;
    try {
      const saved = await commit(
        (s) => (s.habits.some((h) => sameTitle(h.title, habit.title)) ? s : { ...s, habits: [...s.habits, habit] }),
        "Combinado criado.",
        {
          label: "Desfazer",
          onAction: () => void commit((s) => ({ ...s, habits: s.habits.filter((h) => h.id !== id) }), "Combinado desfeito."),
        },
      );
      if (saved) successHaptic();
      else shouldFocusDone.current = false;
    } finally {
      busy.current = false;
      setBusy(false);
    }
  };
  return { exists, isBusy, create };
}

function Eyebrow({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <AppText size={fontSize["2xs"]} weight={700} upper tracking={0.06} color={colors.muted}>
      {label}
    </AppText>
  );
}

/** Combinado proposto em cartão (mensagens sem o cartão da semana): só vira combinado quando a pessoa confirma. */
function HabitProposal({ block }: { block: HabitBlock }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const domainTone = themeDomainTone(scheme);
  const done = useRef<View>(null);
  const { exists, isBusy, create } = useHabitCreate(block, done);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: domainTone.habit.bg }]}>
          <ListChecks size={18} color={domainTone.habit.fg} />
        </View>
        <View style={styles.headCopy}>
          <Eyebrow label="Proposta de combinado" />
          <AppText heading size={fontSize.md} weight={700} accessibilityRole="header">
            {block.titulo}
          </AppText>
        </View>
      </View>
      <View style={styles.meta}>
        <Clock size={14} color={colors.muted} />
        <AppText size={fontSize.sm} color={colors.text2}>
          {`Todos os dias às ${block.horario}`}
        </AppText>
      </View>
      {exists ? (
        <View ref={done} style={styles.done} accessible {...webAttrs({ tabIndex: -1 })}>
          <Check size={16} color={colors.green700} />
          <AppText size={fontSize.sm} weight={600} color={colors.green800}>
            Já está nos seus combinados
          </AppText>
        </View>
      ) : (
        <Button label="Criar combinado" accessibilityLabel={`Criar combinado: ${block.titulo}`} size="sm" busy={isBusy} onPress={() => void create()} />
      )}
    </View>
  );
}

/**
 * Combinado proposto como chip do cartão da semana (HabitChip do web, conceito 05): "+ Garrafa de 1 L às 15h"; depois
 * de criar, "✓ Garrafa de 1 L · nos combinados" com o foco nele.
 */
export function HabitChip({ block }: { block: HabitBlock }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const done = useRef<View>(null);
  const { exists, isBusy, create } = useHabitCreate(block, done);
  if (exists)
    return (
      <View style={styles.chipHit}>
        <View ref={done} accessible {...webAttrs({ tabIndex: -1 })} style={[styles.chip, styles.chipDone]}>
          <Check size={15} color={colors.green800} />
          <AppText size={fontSize.sm} weight={700} color={colors.green800} numberOfLines={1}>
            {`${block.titulo} · nos combinados`}
          </AppText>
        </View>
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Criar combinado: ${block.titulo}`}
      accessibilityState={{ disabled: isBusy, busy: isBusy }}
      disabled={isBusy}
      onPress={() => void create()}
      style={styles.chipHit}
    >
      {({ pressed }) => (
        <View style={[styles.chip, styles.chipSky, pressed && styles.chipPressed, isBusy && styles.busy]}>
          <Plus size={16} color={colors.sky700} />
          <AppText size={fontSize.sm} weight={700} color={colors.sky700} numberOfLines={1}>
            {`${block.titulo} às ${shortHour(block.horario)}`}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

/** Registro proposto pela nutricionista: abre Registrar refeição preenchida para a pessoa conferir. */
function RegisterProposal({ block, allergyDetails }: { block: RegisterBlock; allergyDetails: string }) {
  const styles = useStyles();
  const domainTone = themeDomainTone(useTheme().scheme);
  const register = usePlannedMealRegister();
  const resolved = useMemo(() => resolvePlanned(block.itens, { allergyDetails }), [block.itens, allergyDetails]);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: domainTone.food.bg }]}>
          <Utensils size={18} color={domainTone.food.fg} />
        </View>
        <View style={styles.headCopy}>
          <Eyebrow label="Proposta de registro" />
          <AppText heading size={fontSize.md} weight={700} accessibilityRole="header">
            {block.refeicao}
          </AppText>
        </View>
      </View>
      <PlannedItems resolved={resolved} />
      <Button
        label="Conferir e registrar"
        accessibilityLabel={`Conferir e registrar: ${block.refeicao}`}
        size="sm"
        onPress={() => register(block.refeicao, block.itens)}
      />
    </View>
  );
}

/** Cartão de ação do chat: o agente só propõe; a pessoa confirma aqui. */
export function ActionCard({ block, allergyDetails }: { block: ActionBlock; allergyDetails: string }) {
  return block.acao === "criar_habito" ? <HabitProposal block={block} /> : <RegisterProposal block={block} allergyDetails={allergyDetails} />;
}

const useStyles = makeStyles((colors) => ({
  card: {
    alignSelf: "stretch",
    gap: 10,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  headCopy: { flex: 1, minWidth: 0, gap: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  done: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.mint50,
  },
  /** Chip de 36 px dentro de um alvo de 44. */
  chipHit: { minHeight: 44, justifyContent: "center", flexShrink: 0 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1 },
  chipSky: { backgroundColor: colors.sky50, borderColor: colors.sky100 },
  chipDone: { backgroundColor: colors.mint50, borderColor: colors.mint200 },
  chipPressed: { transform: [{ scale: 0.97 }] },
  busy: { opacity: 0.6 },
}));
