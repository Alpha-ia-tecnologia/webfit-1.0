import { Fragment, useMemo, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  layoutSections,
  renderBlock,
  SECTION_LABEL,
  suggestionEmoji,
  weekCardLayout,
  type ChatBlock,
  type MealOption,
  type WeekCardView,
} from "@shared/lib/agent-blocks";
import { isSensitive } from "@shared/lib/day";
import { localDate } from "@shared/lib/domain";
import { bodyNumbers } from "@shared/lib/space";
import { maskStructured } from "@shared/lib/structured";
import type { ChatMessage } from "@shared/types";
import { AppText, RichText } from "@/components/ui";
import { useApp } from "@/state/app-context";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { fontSize, radius } from "@/theme/tokens";
import { ActionCard } from "./action-card";
import { BlockChart } from "./block-chart";
import { MealChoice } from "./meal-choice";
import { WeekSummaryCard } from "./week-summary-card";

type Run = { kind: "text"; key: number; blocks: ChatBlock[] } | { kind: "card"; key: number; block: ChatBlock };

/** Texto e listas seguidos dividem um parágrafo (blocos crus: o RichText desenha a pílula das calorias ocultas); cartões usam a cópia já mascarada. */
function groupBlocks(raw: readonly ChatBlock[], plain: readonly ChatBlock[]): Run[] {
  return raw.reduce<Run[]>((runs, block, index) => {
    if (block.tipo !== "texto" && block.tipo !== "lista") return [...runs, { kind: "card", key: index, block: plain[index] ?? block }];
    const last = runs[runs.length - 1];
    if (last?.kind === "text") return [...runs.slice(0, -1), { ...last, blocks: [...last.blocks, block] }];
    return [...runs, { kind: "text", key: index, blocks: [block] }];
  }, []);
}

/** Resposta rápida (36 px à vista, 44 de toque), com o emoji da opção ou do alimento citado. */
function ReplyPill({ text, emoji, onPress }: { text: string; emoji: string | null; onPress: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={text} onPress={onPress} style={styles.replyHit}>
      {({ pressed }) => (
        <View style={[styles.reply, pressed && styles.replyPressed]}>
          {emoji ? (
            <AppText size={fontSize.md} aria-hidden maxFontSizeMultiplier={1}>
              {emoji}
            </AppText>
          ) : null}
          <AppText size={fontSize.base} weight={700} color={colors.green800} numberOfLines={1}>
            {text}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

/**
 * Resposta do agente desenhada por blocos (ChatBlocks do web, SIS-02, conceito 05). Os dados são mascarados uma vez na
 * entrada (hideCalories): rótulos, nomes acessíveis e avisos derivados já nascem sem calorias. Com o resumo da semana, o
 * texto curto vira o título do cartão e os combinados e sugestões viram os chips dele. Sem blocos válidos para este
 * perfil, o texto de sempre (`fallback`).
 */
export function ChatBlocks({
  message,
  isLatest,
  onSuggestion,
  footer,
  fallback,
}: {
  message: ChatMessage;
  isLatest: boolean;
  onSuggestion: (text: string) => void;
  /** Linha de revisão e avisos, entre os blocos e as respostas rápidas. */
  footer?: ReactNode;
  /** O texto de sempre, quando nenhum bloco pode ser desenhado. */
  fallback: ReactNode;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const { state } = useApp();
  const profile = state.profile;
  const sensitive = profile ? isSensitive(profile) : false;
  const hide = profile?.hideCalories ?? false;
  const allergyDetails = profile?.allergyDetails ?? "";
  // Números do corpo ocultos: também nas respostas salvas antes da preferência.
  const hideBody = profile ? bodyNumbers(profile, localDate()) === "hidden" : false;
  const layout = useMemo(
    () => weekCardLayout(layoutSections(message.blocks ?? [], { sensitive, allergyDetails })),
    [message.blocks, sensitive, allergyDetails],
  );
  const plain = useMemo(() => maskStructured(layout, hide, { plain: true, hideBodyNumbers: hideBody }), [layout, hide, hideBody]);
  const endDate = localDate(new Date(message.timestamp));
  const options = plain.sections.flatMap((s) => s.blocos.flatMap((b) => (b.tipo === "opcoes_refeicao" ? b.opcoes : [])));
  if (!layout.sections.length)
    return (
      <>
        {fallback}
        {footer}
      </>
    );
  const renderCard = (block: ChatBlock, week: WeekCardView | null) => {
    switch (block.tipo) {
      case "opcoes_refeicao":
        return <MealChoice block={block} sensitive={sensitive} messageId={message.id} />;
      case "grafico":
        if (block.metrica === "semana_7d")
          return week ? (
            <WeekSummaryCard endDate={endDate} title={week.title} habits={week.habits} suggestions={week.suggestions} onSuggestion={onSuggestion} />
          ) : null;
        return <BlockChart metric={block.metrica} />;
      case "acao":
        return <ActionCard block={block} allergyDetails={allergyDetails} />;
      default:
        return null;
    }
  };
  return (
    <>
      {layout.sections.map((section, index) => {
        const isWeek = plain.week?.section === index;
        return (
          <View key={`${index}-${section.papel ?? "geral"}`} style={styles.section}>
            {section.papel && !isWeek ? (
              <AppText size={fontSize.xs} weight={700} color={colors.muted} accessibilityRole="header">
                {SECTION_LABEL[section.papel]}
              </AppText>
            ) : null}
            {groupBlocks(section.blocos, plain.sections[index]?.blocos ?? section.blocos).map((run) =>
              run.kind === "text" ? (
                <RichText
                  key={run.key}
                  text={run.blocks.map(renderBlock).join("\n\n")}
                  hideCalories={hide}
                  hideBodyNumbers={hideBody}
                  size={fontSize.md}
                />
              ) : (
                <Fragment key={run.key}>{renderCard(run.block, isWeek ? plain.week : null)}</Fragment>
              ),
            )}
          </View>
        );
      })}
      {footer}
      {isLatest ? <QuickReplies suggestions={plain.suggestions} options={options} onSuggestion={onSuggestion} /> : null}
    </>
  );
}

/**
 * Respostas rápidas no fim da última resposta (blocos e cartão-relatório): uma fila que rola até a borda da tela, com
 * o emoji da opção ou do alimento citado. Nada quando não há sugestões.
 */
export function QuickReplies({
  suggestions,
  options,
  onSuggestion,
}: {
  suggestions: readonly string[];
  options: readonly MealOption[];
  onSuggestion: (text: string) => void;
}) {
  const styles = useStyles();
  if (!suggestions.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.repliesScroller}
      contentContainerStyle={styles.replies}
      role="group"
      aria-label="Sugestões do agente"
    >
      {suggestions.map((suggestion) => (
        <ReplyPill key={suggestion} text={suggestion} emoji={suggestionEmoji(suggestion, options)} onPress={() => onSuggestion(suggestion)} />
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: 12, minWidth: 0 },
  /** A fila rola até a borda da tela (−16 px), como o web. */
  repliesScroller: { marginHorizontal: -16, flexGrow: 0 },
  replies: { gap: 8, paddingHorizontal: 16 },
  replyHit: { minHeight: 44, justifyContent: "center", flexShrink: 0 },
  reply: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.mint200,
    backgroundColor: colors.surface,
  },
  replyPressed: { transform: [{ scale: 0.97 }] },
}));
