import { Bookmark, Clock, NutOff, Plus, Target, TriangleAlert } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  consideredChips,
  mealPrep,
  optionSummary,
  optionsTitle,
  safeEmoji,
  type ChatBlock,
  type ConsideredChip,
  type MealOption,
} from "@shared/lib/agent-blocks";
import { isCalmOn } from "@shared/lib/day";
import { dailyTargets, localDate, uid } from "@shared/lib/domain";
import { glyphForFood } from "@shared/lib/food-glyph";
import { fmtNumber } from "@shared/lib/format";
import { saveMealFavorite } from "@shared/lib/meals";
import { macroEstimate, plannedPreset, plateGroups, plateLabel, resolvePlanned, type ResolvedItem } from "@shared/lib/taco-match";
import { usePlannedMealRegister } from "@/components/dieta/use-planned-meal";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, FoodGlyph, Pill, RadioCard } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useTheme } from "@/theme/theme";
import { fontSize, gradients, horizontal, shadows, themeDomainTone } from "@/theme/tokens";

type OptionsBlock = Extract<ChatBlock, { tipo: "opcoes_refeicao" }>;

const FALLBACK_EMOJI = "🍽️";

/** "O que considerei" (ConsideredChips do web): chips de contorno acima das opções (alergias e a meta, só dados locais). */
function ConsideredChips({ chips }: { chips: readonly ConsideredChip[] }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const tones = themeDomainTone(scheme);
  if (!chips.length) return null;
  return (
    <View role="list" aria-label="O que considerei" style={styles.considered}>
      {chips.map((chip) => {
        const Icon = chip.kind === "allergen" ? NutOff : Target;
        return (
          <View key={chip.text} role="listitem" style={styles.consideredChip}>
            <Icon size={14} color={chip.kind === "allergen" ? tones.warn.fg : colors.green700} />
            <AppText size={fontSize.sm} weight={600}>
              {chip.text}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

/** Pílulas da opção: kcal e proteína da TACO (ou o prato, no perfil sensível), tempo e alérgeno. */
function OptionPills({ option, resolved, sensitive, hideCalories }: { option: MealOption; resolved: readonly ResolvedItem[]; sensitive: boolean; hideCalories: boolean }) {
  const styles = useStyles();
  const estimate = sensitive ? null : macroEstimate(resolved);
  const approx = estimate?.isPartial ? "≈ " : "";
  const kcal = hideCalories ? null : (estimate?.kcal ?? null);
  const protein = estimate?.protein ?? null;
  const hasEstimate = kcal !== null || protein !== null;
  const groups = sensitive ? plateGroups(resolved) : [];
  const hasAllergen = resolved.some((entry) => entry.status === "allergen");
  return (
    <View style={styles.pills} testID={hasEstimate ? "macro-estimate" : undefined}>
      {hasEstimate ? <AppText style={srOnly}>Estimativa TACO: </AppText> : null}
      {kcal !== null ? (
        <Pill tone="neutral" style={styles.pill}>
          {`${approx}${fmtNumber(kcal)} kcal`}
        </Pill>
      ) : null}
      {protein !== null ? (
        <Pill tone="food" srText="de proteína" style={styles.pill}>
          {`${approx}${fmtNumber(protein)} g prot.`}
        </Pill>
      ) : null}
      {groups.length ? (
        <Pill tone="neutral" style={styles.pill}>
          {plateLabel(groups)}
        </Pill>
      ) : null}
      {option.minutos !== null ? (
        <Pill tone="water" icon={Clock} srText={`Preparo de cerca de ${option.minutos} min`} style={styles.pill}>
          <AppText aria-hidden size={fontSize.sm} weight={700}>{`${option.minutos} min`}</AppText>
        </Pill>
      ) : null}
      {hasAllergen ? (
        <Pill tone="warn" icon={TriangleAlert} style={styles.pill}>
          Possível alérgeno
        </Pill>
      ) : null}
    </View>
  );
}

/**
 * Opções de refeição do agente como cartões selecionáveis (MealChoice do web, conceito 05): a primeira já marcada, "O que
 * considerei" em cima e um só "Registrar no jantar" embaixo, que abre o prato pré-preenchido para a pessoa conferir e
 * salvar. O marcador guarda a opção em Seus pratos (com Desfazer). Números só da TACO; sem kcal com calorias ocultas;
 * perfil sensível vê o prato, não números.
 */
export function MealChoice({ block, sensitive, messageId }: { block: OptionsBlock; sensitive: boolean; messageId: string }) {
  const styles = useStyles();
  const { scheme, colors } = useTheme();
  const foodBg = themeDomainTone(scheme).food.bg;
  const { state, commit, notify } = useApp();
  const register = usePlannedMealRegister();
  const [selected, setSelected] = useState(0);
  const [isSaving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const profile = state.profile;
  const today = localDate();
  const hideCalories = profile?.hideCalories ?? false;
  const calm = profile ? isCalmOn(profile, today) : false;
  const allergyDetails = profile?.allergyDetails ?? "";
  const resolved = useMemo(() => block.opcoes.map((option) => resolvePlanned(option.itens, { allergyDetails })), [block.opcoes, allergyDetails]);
  const kcalGoal = hideCalories || calm ? null : dailyTargets(state, today).calories;
  const chips = consideredChips({ allergyDetails, kcalGoal });
  const title = optionsTitle(block);
  const index = Math.min(selected, block.opcoes.length - 1);
  const option = block.opcoes[index]!;
  const prep = mealPrep(block.refeicao);
  const saveItems = plannedPreset(block.refeicao, resolved[index] ?? []).items;
  const save = async () => {
    if (savingRef.current || !saveItems.length) return;
    const input = { id: uid(), name: option.nome, categoryTag: block.refeicao, items: saveItems };
    try {
      saveMealFavorite(state, input);
    } catch (error) {
      notify((error as Error).message, "warning");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await commit((s) => saveMealFavorite(s, input), "Salvo em Seus pratos.", {
        label: "Desfazer",
        onAction: () => void commit((s) => ({ ...s, savedMeals: s.savedMeals.filter((meal) => meal.id !== input.id) }), "Removido de Seus pratos."),
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <View style={styles.root}>
      <ConsideredChips chips={chips} />
      <View role="radiogroup" aria-label={title} testID="meal-options" style={styles.list}>
        {block.opcoes.map((item, i) => {
          const entries = resolved[i] ?? [];
          const firstFood = entries.find((entry) => entry.status === "ok")?.food ?? null;
          const emoji = safeEmoji(item.emoji) ?? (firstFood ? glyphForFood(firstFood) : null) ?? FALLBACK_EMOJI;
          return (
            <RadioCard
              key={`${item.nome}-${i}`}
              name={`meal-${messageId}`}
              value={String(i)}
              checked={i === index}
              onChange={() => setSelected(i)}
              layout="row"
              indicator="check"
              accessibilityLabel={item.nome}
              media={
                <View style={styles.glyph}>
                  <LinearGradient colors={[foodBg, colors.sky50]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.glyphFill]} />
                  <FoodGlyph glyph={emoji} size={56} tone="surface" style={styles.glyphInner} />
                </View>
              }
              title={
                <AppText heading size={fontSize.md} weight={800} lineHeight={20}>
                  {item.nome}
                </AppText>
              }
              subtitle={
                <AppText size={fontSize.sm} color={colors.muted} numberOfLines={1}>
                  {optionSummary(item)}
                </AppText>
              }
              footer={<OptionPills option={item} resolved={entries} sensitive={sensitive} hideCalories={hideCalories} />}
            />
          );
        })}
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Registrar ${prep}: ${option.nome}`}
          onPress={() => register(block.refeicao, option.itens)}
          style={styles.grow}
        >
          {({ pressed }) => (
            <View style={[styles.register, pressed && styles.pressed]}>
              <LinearGradient colors={gradients.button} start={horizontal.start} end={horizontal.end} style={[StyleSheet.absoluteFill, styles.registerFill]} />
              <View>
                <Plus size={20} color={colors.white} />
              </View>
              <AppText size={fontSize.md} weight={700} color={colors.white}>{`Registrar ${prep}`}</AppText>
            </View>
          )}
        </Pressable>
        {saveItems.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Salvar ${option.nome} em Seus pratos`}
            accessibilityState={{ disabled: isSaving, busy: isSaving }}
            disabled={isSaving}
            onPress={() => void save()}
            style={({ pressed }) => [styles.save, pressed && styles.pressed, isSaving && styles.busy]}
          >
            <Bookmark size={20} color={colors.text2} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { gap: 12, minWidth: 0 },
  considered: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  consideredChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  list: { gap: 10 },
  glyph: { width: 56, height: 56, borderRadius: 16, overflow: "hidden" },
  glyphFill: { borderRadius: 16 },
  glyphInner: { backgroundColor: "transparent" },
  /** O rodapé do RadioCard é uma linha: sem flex 1, as pílulas não quebravam e passavam da borda a 320 px. */
  pills: { flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  /** 24 px em 13 px: "420 kcal · 35 g prot. · 15 min" numa linha, como no conceito. */
  pill: { minHeight: 24, paddingHorizontal: 7, gap: 3 },
  actions: { flexDirection: "row", alignItems: "stretch", gap: 10, marginTop: 2 },
  grow: { flex: 1, minWidth: 0 },
  register: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: shadows.card,
  },
  registerFill: { borderRadius: 16 },
  save: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadows.card,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  busy: { opacity: 0.6 },
}));
