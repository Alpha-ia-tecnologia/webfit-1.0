import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeftRight, MessageCircle, Plus, SlidersHorizontal } from "lucide-react-native";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import type { DietSlot } from "@shared/lib/diet-plan";
import { PLAN_DAY_COPY } from "@shared/lib/diet-week";
import { AppText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, gradients, horizontal, shadows } from "@/theme/tokens";

/** Abaixo desta largura (o @media 359px do web) os dois botões ficam um sobre o outro. */
const STACK_BELOW_WIDTH = 360;

/** Ações de uma refeição de hoje (AGENTE-09), sem IA: registrar do plano, trocar e ajustar (PlanMealHandlers do web). */
export interface PlanMealHandlers {
  /** Algum item tem troca revisada e segura (sem alérgeno declarado). */
  canSwap: boolean;
  /** "Pedir outra opção" só com o agente autorizado. */
  canAsk: boolean;
  isBusy: boolean;
  onEat: () => void;
  onAdjust: () => void;
  onSwap: () => void;
  onAsk: () => void;
}

/**
 * "+ Registrar": registra do plano com Desfazer (itens na TACO, sem alérgeno) ou abre a revisão. primary = a
 * próxima refeição (preenchido); outline = futura ou passada (sem cobrança). compact = a passada recolhida,
 * 34 px no cabeçalho do cartão (44 px de toque), sem o "+".
 */
export function MealRegisterButton({
  slot,
  handlers,
  tone,
  compact = false,
}: {
  slot: DietSlot;
  handlers: PlanMealHandlers;
  tone: "primary" | "outline";
  compact?: boolean;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isStacked = useWindowDimensions().width < STACK_BELOW_WIDTH;
  const isPrimary = tone === "primary";
  const ink = isPrimary ? colors.white : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={PLAN_DAY_COPY.eatLabel(slot)}
      accessibilityState={{ disabled: handlers.isBusy }}
      disabled={handlers.isBusy}
      onPress={handlers.onEat}
      style={compact ? styles.compactHit : isStacked ? undefined : styles.grow}
    >
      {({ pressed }) => (
        <View
          style={[
            compact ? styles.compact : styles.button,
            isPrimary ? styles.primary : styles.outline,
            pressed && styles.pressed,
            handlers.isBusy && styles.busy,
          ]}
        >
          {isPrimary ? (
            <LinearGradient colors={gradients.button} start={horizontal.start} end={horizontal.end} style={[StyleSheet.absoluteFill, styles.fill]} />
          ) : null}
          {/* Numa View: no web o gradiente absoluto cobriria o <svg> solto. */}
          {compact ? null : (
            <View>
              <Plus size={18} strokeWidth={2.5} color={ink} />
            </View>
          )}
          <AppText size={fontSize.sm} weight={compact ? 700 : 800} color={ink}>
            {PLAN_DAY_COPY.eat}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

/** "Ajustar e registrar": abre o prato para conferir antes de salvar (botão de texto sob as ações, como o web). */
export function MealAdjustButton({ slot, handlers }: { slot: DietSlot; handlers: PlanMealHandlers }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={PLAN_DAY_COPY.adjustLabel(slot)}
      accessibilityState={{ disabled: handlers.isBusy }}
      disabled={handlers.isBusy}
      onPress={handlers.onAdjust}
      style={({ pressed }) => [styles.adjust, pressed && styles.pressedText, handlers.isBusy && styles.busy]}
    >
      <SlidersHorizontal size={14} color={colors.text2} />
      <AppText size={fontSize.sm} weight={700} color={colors.text2}>
        {PLAN_DAY_COPY.adjust}
      </AppText>
    </Pressable>
  );
}

/**
 * Rodapé da refeição aberta (MealActions do web): "⇄ Trocar refeição" (gira as trocas revisadas) ou "Pedir outra
 * opção" (só preenche o chat), "+ Registrar" (fora da passada, que o tem no cabeçalho) e "Ajustar e registrar".
 */
export function MealActions({
  slot,
  handlers,
  register,
}: {
  slot: DietSlot;
  handlers: PlanMealHandlers;
  /** null = sem "Registrar" aqui (passada: ele fica no cabeçalho do cartão). */
  register: "primary" | "outline" | null;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isStacked = useWindowDimensions().width < STACK_BELOW_WIDTH;
  const second = handlers.canSwap
    ? { label: PLAN_DAY_COPY.swap, name: PLAN_DAY_COPY.swapLabel(slot), icon: ArrowLeftRight, onPress: handlers.onSwap }
    : handlers.canAsk
      ? { label: PLAN_DAY_COPY.ask, name: PLAN_DAY_COPY.askLabel(slot), icon: MessageCircle, onPress: handlers.onAsk }
      : null;
  return (
    <View style={styles.root}>
      {second || register ? (
        <View style={[styles.row, isStacked && styles.stacked]}>
          {second ? (
            <Pressable accessibilityRole="button" accessibilityLabel={second.name} onPress={second.onPress} style={isStacked ? undefined : styles.grow}>
              {({ pressed }) => (
                <View style={[styles.button, styles.swap, pressed && styles.pressed]}>
                  <second.icon size={16} color={colors.text} />
                  <AppText size={fontSize.sm} weight={800} numberOfLines={1}>
                    {second.label}
                  </AppText>
                </View>
              )}
            </Pressable>
          ) : null}
          {register ? <MealRegisterButton slot={slot} handlers={handlers} tone={register} /> : null}
        </View>
      ) : null}
      <MealAdjustButton slot={slot} handlers={handlers} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, minWidth: 0, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  stacked: { flexDirection: "column", alignItems: "stretch" },
  grow: { flex: 1, minWidth: 0 },
  /** 44 px de altura, raio 14, texto de 13 px (os dois cabem lado a lado a 390 px). */
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 6,
    borderRadius: 14,
    overflow: "hidden",
  },
  swap: { backgroundColor: colors.surface2 },
  primary: { boxShadow: shadows.card },
  outline: { borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  fill: { borderRadius: 14 },
  /** Passada recolhida: 34 px visíveis dentro de 44 de toque. */
  compactHit: { minHeight: 44, justifyContent: "center" },
  compact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  adjust: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, minHeight: 44, paddingHorizontal: 2, marginVertical: -6 },
  pressed: { transform: [{ scale: 0.97 }] },
  pressedText: { opacity: 0.7 },
  busy: { opacity: 0.6 },
}));
