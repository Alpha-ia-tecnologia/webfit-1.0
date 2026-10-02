import { LinearGradient } from "expo-linear-gradient";
import {
  CalendarClock,
  ChevronRight,
  Clock,
  Droplet,
  Egg,
  Flame,
  Lightbulb,
  MessageCircle,
  Sparkles,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import {
  insightTitle,
  titleTier,
  type DayInsight,
  type InsightChip,
  type InsightSheetAction,
  type InsightSheetModel,
} from "@shared/lib/day";
import { webAttrs } from "@/components/refeicao/web-a11y";
import { InsightSheet } from "@/components/signals/insight-sheet";
import { AppText, EnterView } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { diagonal, fontSize, gradients, radius, shadows, type ThemeColors } from "@/theme/tokens";
import { habitIcon } from "./habit-icon";

type Props = {
  insight: DayInsight;
  onAction: () => void;
  onAsk: () => void;
  /** Ação escolhida numa folha (pergunta pronta, abrir a conversa, "Como calculamos"). */
  onSheetAction: (action: InsightSheetAction) => void;
  /** Dispensar um sinal por 3 dias ou o recado de hoje (chave de signalDismissals). */
  onDismiss: (key: string) => void;
};

const ICON_BOX = 40;
/** Chips em cascata de 40 ms (a entrada de 240 ms + 8 px é a do EnterView, como next-step-in no web). */
const STAGGER_MS = 40;
/** O título mostra no máximo duas linhas (o texto inteiro fica na folha), como o line-clamp do web. */
const TITLE_LINES = 2;
/**
 * Tamanho do título por degrau (titleTier) e largura da tela, como o clamp() do web: cheio até 36
 * caracteres; "long" entre 15 e 20 px (4,9% da largura); "xlong" entre 14 e 17 px (4,4%).
 */
function titleFont(title: string, width: number): { size: number; lineHeight: number } {
  const tier = titleTier(title);
  const clamp = (min: number, value: number, max: number) => Math.min(max, Math.max(min, value));
  if (tier === "long") {
    const size = clamp(fontSize.md, width * 0.049, fontSize.xl);
    return { size, lineHeight: Math.round(size * 1.25) };
  }
  if (tier === "xlong") {
    const size = clamp(fontSize.base, width * 0.044, fontSize.lg);
    return { size, lineHeight: Math.round(size * 1.3) };
  }
  return { size: fontSize["2xl"], lineHeight: 29 };
}

/** Ícone do chip: gota, relógio-calendário, chama (meta), ovo (proteína), lâmpada/joinha (sinais), ícone do combinado. */
function chipIcon(chip: InsightChip): LucideIcon {
  if (chip.kind === "water") return Droplet;
  if (chip.kind === "pantry") return CalendarClock;
  if (chip.kind === "adjust") return Flame;
  if (chip.kind === "protein") return Egg;
  if (chip.kind === "comment") return Sparkles;
  if (chip.kind === "alert" || chip.kind === "signal") return chip.sheet?.tone === "positive" ? ThumbsUp : Lightbulb;
  const { icon } = habitIcon(chip.full);
  return icon === Sparkles ? Clock : icon;
}

/** Cor do ícone sobre o navy: água em céu claro, despensa em âmbar, cuidado em céu, o resto em menta. */
function chipIconColor(chip: InsightChip, colors: ThemeColors): string {
  if (chip.kind === "water") return colors.sky400;
  if (chip.kind === "pantry") return colors.onFillAmber;
  if (chip.kind === "habit") return colors.onFillSky;
  if (chip.sheet?.tone === "info") return colors.onFillSky;
  return colors.onFillMint;
}

/**
 * Cartão "Resumo" do dia (NextStepCard do web), a única voz proativa do Hoje: ícone à esquerda, o
 * kicker (período ou "Seu agente · 07:10"), um título de até duas linhas, até três chips e uma ação,
 * mais o atalho para o agente. O título e os chips com folha abrem a InsightSheet (detalhe, ação,
 * dispensar). O conteúdo entra com fade + 8 px e os chips em cascata; nada com "reduzir movimento".
 */
export function NextStepCard({ insight, onAction, onAsk, onSheetAction, onDismiss }: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isReduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<InsightSheetModel | null>(null);
  const title = insightTitle(insight);
  const font = titleFont(title, width);
  const titleText = (
    <AppText heading size={font.size} weight={800} tracking={-0.02} lineHeight={font.lineHeight} color={colors.white} numberOfLines={TITLE_LINES} style={styles.title}>
      {title}
      {insight.sheet ? <ChevronRight size={18} color={colors.onFillMint} /> : null}
    </AppText>
  );
  return (
    <View style={styles.card} testID="next-step">
      {/* Brilhos do web: esmeralda no canto de cima à direita, azul no de baixo à esquerda. */}
      <LinearGradient colors={gradients.nextStepGlowEmerald} start={{ x: 1, y: 0 }} end={{ x: 0.3, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={gradients.nextStepGlow} start={{ x: 0, y: 1 }} end={{ x: 0.7, y: 0.2 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={gradients.fab} start={diagonal.start} end={diagonal.end} style={styles.icon}>
        <Sparkles size={20} color={colors.white} />
      </LinearGradient>
      {/* A chave segue o título: um título novo remonta o corpo e a entrada roda de novo. */}
      <EnterView key={`${insight.source}|${title}`} isReduced={isReduced} style={styles.body}>
        <AppText size={fontSize.xs} weight={800} upper tracking={0.08} color={colors.onFillMint} lineHeight={16} testID="next-step-kicker">
          {insight.kicker}
        </AppText>
        {insight.sheet ? (
          /* Como o <h2><button> do web: o título continua cabeçalho e o toque é um botão que abre a folha. */
          <View accessibilityRole="header">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={title}
              accessibilityHint="Abre o detalhe"
              {...webAttrs({ "aria-haspopup": "dialog" })}
              onPress={() => setOpen(insight.sheet!)}
              testID="next-step-title"
              style={({ pressed }) => [pressed && styles.pressedText]}
            >
              {titleText}
            </Pressable>
          </View>
        ) : (
          <View accessibilityRole="header" testID="next-step-title">
            {titleText}
          </View>
        )}
        {insight.chipItems.length > 0 && (
          <View style={styles.chips}>
            {insight.chipItems.map((chip, index) => {
              const Icon = chipIcon(chip);
              const content = (
                <>
                  <Icon size={16} color={chipIconColor(chip, colors)} />
                  <AppText size={fontSize.sm} weight={700} color={colors.onFillSlate} numberOfLines={1} style={styles.chipText}>
                    {chip.text}
                  </AppText>
                </>
              );
              return (
                <EnterView key={`${chip.kind}:${chip.full}`} isReduced={isReduced} delay={60 + index * STAGGER_MS} style={styles.chipWrap}>
                  {chip.sheet ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={chip.full}
                      {...webAttrs({ "aria-haspopup": "dialog" })}
                      onPress={() => setOpen(chip.sheet!)}
                      testID={`next-step-chip-${chip.sheet.id}`}
                      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                    >
                      {content}
                    </Pressable>
                  ) : (
                    <View style={styles.chip} accessible accessibilityLabel={chip.full}>
                      {content}
                    </View>
                  )}
                </EnterView>
              );
            })}
          </View>
        )}
        <EnterView isReduced={isReduced} delay={100} style={styles.actions}>
          {insight.action && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={insight.action.label}
              onPress={onAction}
              style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            >
              <Sparkles size={18} color={colors.accentFill} />
              <AppText heading size={fontSize.md} weight={800} color={colors.navy} style={styles.shrink}>
                {insight.action.label}
              </AppText>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Perguntar ao agente"
            onPress={onAsk}
            style={({ pressed }) => [styles.ask, pressed && styles.pressed]}
          >
            <MessageCircle size={20} color={colors.white} />
          </Pressable>
        </EnterView>
      </EnterView>
      <InsightSheet
        sheet={open}
        onAction={(action) => {
          setOpen(null);
          onSheetAction(action);
        }}
        onDismiss={(key) => {
          setOpen(null);
          onDismiss(key);
        }}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: 28,
    backgroundColor: colors.navy,
    overflow: "hidden",
    boxShadow: shadows.float,
  },
  icon: { width: ICON_BOX, height: ICON_BOX, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0, gap: 10 },
  title: { marginTop: -4 },
  pressedText: { opacity: 0.8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  chipWrap: { maxWidth: "100%" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.onFillOverlay,
    backgroundColor: colors.onFillChip,
  },
  chipText: { flexShrink: 1, minWidth: 0 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    flexShrink: 1,
  },
  /* Rótulo em duas linhas (ex.: "Pedir ideias ao agente") centrado, como o botão do web. */
  shrink: { flexShrink: 1, textAlign: "center" },
  ask: {
    width: 48,
    height: 48,
    marginLeft: "auto",
    borderRadius: radius.md,
    backgroundColor: colors.onFillOverlayFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { transform: [{ scale: 0.97 }] },
}));
