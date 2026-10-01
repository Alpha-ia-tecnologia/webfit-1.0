import { LinearGradient } from "expo-linear-gradient";
import { RotateCcw, ShieldCheck, Sparkles } from "lucide-react-native";
import { Fragment, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { chatDayLabel, describeAgentMetaFull, describeAgentMetaShort, messageViews } from "@shared/lib/agent-presentation";
import { AGENT_STAGES, stageLabel, type AgentProgress } from "@shared/lib/agent-stream";
import { visiblePlainText } from "@shared/lib/text";
import type { AgentMeta, ChatMessage } from "@shared/types";
import { srOnly } from "@/components/refeicao/web-a11y";
import { AppText, Button, LiveAnnouncement, Notice, RichText } from "@/components/ui";
import { makeStyles, useThemeColors } from "@/theme/theme";
import { diagonalDown, fontSize, gradients, radius, shadows } from "@/theme/tokens";
import { ChatBlocks } from "./chat-blocks";
import { DietSummaryCard } from "./diet-summary-card";

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Bolinha do agente (24 px, gradiente) antes do nome, na linha de autor. */
function AgentDot() {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.dot} aria-hidden importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={gradients.fab} start={diagonalDown.start} end={diagonalDown.end} style={[StyleSheet.absoluteFill, styles.dotFill]} />
      <View>
        <Sparkles size={13} color={colors.white} />
      </View>
    </View>
  );
}

/** "✦ Seu agente · 21:40" (AiHead do web): autor e hora de cada resposta; o conteúdo vem embaixo, na largura toda. */
function AiHead({ time }: { time?: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.aiHead}>
      <AgentDot />
      <AppText size={fontSize.base} weight={700} color={colors.text2}>
        Seu agente
      </AppText>
      {time ? (
        <AppText size={fontSize.base} color={colors.muted} style={styles.tabular}>
          {`· ${time}`}
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * "Revisada automaticamente · apoio educativo" sob a última resposta (ReviewLine do web); nas anteriores a mesma
 * informação fica só para leitores de tela. A frase inteira (sem revisão humana) é o que o leitor de tela ouve.
 */
function ReviewLine({ meta, isVisible }: { meta: AgentMeta; isVisible: boolean }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const full = describeAgentMetaFull(meta);
  if (!isVisible) return <AppText style={srOnly}>{full}</AppText>;
  return (
    <View style={styles.review} accessible accessibilityLabel={full}>
      <ShieldCheck size={14} color={colors.green700} />
      <AppText size={fontSize.xs} color={colors.muted} style={styles.reviewText}>
        {describeAgentMetaShort(meta)}
      </AppText>
    </View>
  );
}

/** Aviso compacto e centralizado no meio da conversa (pedido de dieta sem o plano logo depois, geração em curso). */
export function SystemChip({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.system}>
      <Sparkles size={13} color={colors.green700} />
      {children}
    </View>
  );
}

function DaySeparator({ label }: { label: string }) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.day} accessibilityRole="header">
      <View style={styles.dayLine} />
      <AppText size={fontSize.sm} weight={700} upper tracking={0.08} color={colors.muted}>
        {label}
      </AppText>
      <View style={styles.dayLine} />
    </View>
  );
}

/** Resposta em preparo: etapa real do grafo (quando disponível) e cancelar. */
function Typing({ progress, onCancel }: { progress: AgentProgress | null; onCancel: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const active = progress ? AGENT_STAGES.indexOf(progress.stage) : 0;
  const label = progress ? stageLabel(progress.stage, "chat", progress.attempt) : "Preparando a resposta";
  return (
    <View style={styles.aiRow}>
      <AiHead />
      <View style={styles.typing} aria-busy>
        <AppText size={fontSize.sm} weight={600} color={colors.text2}>
          {label}…
        </AppText>
        <View style={styles.steps} aria-hidden>
          {AGENT_STAGES.map((stage, index) => (
            <View key={stage} style={[styles.stepBar, index <= active && styles.stepBarOn]} />
          ))}
        </View>
        <Button label="Cancelar" variant="text" onPress={onCancel} />
        <LiveAnnouncement message={label} />
      </View>
    </View>
  );
}

type Props = {
  messages: ChatMessage[];
  today: string;
  hideCalories: boolean;
  hideBodyNumbers: boolean;
  currentPlanText: string | null;
  canRetry: boolean;
  isTyping: boolean;
  progress: AgentProgress | null;
  onRetry: (message: ChatMessage) => void;
  onCancel: () => void;
  onOpenDiet: () => void;
  /** Sugestão de próxima pergunta tocada numa resposta em blocos. */
  onBlockSuggestion: (text: string) => void;
  empty: ReactNode;
};

/**
 * Conversa na própria página (ChatThread do web, conceito 05): separadores de data; a pessoa em bolha verde (hora só
 * para o leitor de tela); o agente com a linha de autor e o conteúdo na largura toda, sem bolha; a dieta pedida como um
 * cartão compacto; a revisão numa linha sob a última resposta.
 */
export function ChatThread({
  messages,
  today,
  hideCalories,
  hideBodyNumbers,
  currentPlanText,
  canRetry,
  isTyping,
  progress,
  onRetry,
  onCancel,
  onOpenDiet,
  onBlockSuggestion,
  empty,
}: Props) {
  const styles = useStyles();
  const colors = useThemeColors();
  const views = messageViews(messages);
  const days = messages.map((m) => chatDayLabel(m.timestamp, today));
  const lastAi = messages.reduce((last, m, i) => (m.sender === "ai" ? i : last), -1);
  return (
    <View style={styles.thread} accessibilityRole="list" accessibilityLabel="Conversa com o agente">
      {!messages.length && empty}
      {messages.map((m, index) => {
        const view = views.get(m.id) ?? "text";
        const day = days[index];
        const separator = day && day !== days[index - 1] ? <DaySeparator label={day} /> : null;
        const time = timeOf(m.timestamp);
        let body: ReactNode;
        if (view === "diet-request") {
          // Com o plano logo depois, o pedido vira a segunda linha do cartão da dieta.
          const next = messages[index + 1];
          body =
            next && views.get(next.id) === "diet-plan" ? null : (
              <SystemChip>
                <AppText size={fontSize.xs} weight={600} color={colors.text2}>
                  {`Você pediu uma nova dieta · ${time}`}
                </AppText>
              </SystemChip>
            );
        } else if (view === "diet-plan") {
          const request = messages[index - 1];
          body = (
            <View style={styles.aiRow}>
              <DietSummaryCard
                message={m}
                isCurrent={m.text === currentPlanText}
                hideCalories={hideCalories}
                hideBodyNumbers={hideBodyNumbers}
                onOpen={onOpenDiet}
                requestedAt={request && views.get(request.id) === "diet-request" ? timeOf(request.timestamp) : null}
                isCompact
              />
            </View>
          );
        } else if (m.sender === "ai") {
          const review = m.meta ? <ReviewLine meta={m.meta} isVisible={index === lastAi} /> : null;
          const notes = m.meta?.notes.map((note) => <Notice key={note}>{visiblePlainText(note, hideCalories, hideBodyNumbers)}</Notice>);
          const text = <RichText text={m.text} hideCalories={hideCalories} hideBodyNumbers={hideBodyNumbers} size={fontSize.md} />;
          body = (
            <View style={styles.aiRow} testID={view === "blocks" ? "chat-blocks" : undefined}>
              <AiHead time={time} />
              {view === "blocks" ? (
                <ChatBlocks
                  message={m}
                  isLatest={index === messages.length - 1}
                  onSuggestion={onBlockSuggestion}
                  fallback={text}
                  footer={
                    <>
                      {review}
                      {notes}
                    </>
                  }
                />
              ) : (
                <>
                  {text}
                  {review}
                  {notes}
                </>
              )}
            </View>
          );
        } else {
          const hasFailed = m.status === "error";
          body = (
            <View style={styles.userRow}>
              <View style={styles.bubble}>
                <LinearGradient colors={gradients.user} start={diagonalDown.start} end={diagonalDown.end} style={[StyleSheet.absoluteFill, styles.bubbleFill]} />
                <AppText style={srOnly}>Você</AppText>
                <RichText text={m.text} hideCalories={hideCalories} hideBodyNumbers={hideBodyNumbers} size={fontSize.md} color={colors.white} />
                <AppText style={srOnly}>{`, às ${time}${hasFailed ? "" : ", enviada"}`}</AppText>
              </View>
              {hasFailed ? (
                <View style={styles.retry}>
                  <AppText size={fontSize.xs} color={colors.rose700}>
                    A resposta não foi recebida.
                  </AppText>
                  <Button label="Tentar novamente" variant="text" icon={RotateCcw} disabled={!canRetry} onPress={() => onRetry(m)} />
                </View>
              ) : null}
            </View>
          );
        }
        return (
          <Fragment key={m.id}>
            {separator}
            {body}
          </Fragment>
        );
      })}
      {isTyping ? <Typing progress={progress} onCancel={onCancel} /> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  thread: { gap: 16, paddingTop: 4, paddingBottom: 8 },
  day: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 6, marginBottom: -2 },
  dayLine: { flex: 1, height: 1, backgroundColor: colors.border },
  system: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    maxWidth: "100%",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  /** Resposta do agente: autor numa linha e o conteúdo embaixo, na largura toda. */
  aiRow: { alignSelf: "stretch", gap: 10, minWidth: 0 },
  aiHead: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  dotFill: { borderRadius: 12 },
  tabular: { fontVariant: ["tabular-nums"] },
  review: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: -2 },
  reviewText: { flexShrink: 1 },
  /** A pessoa: bolha verde à direita, até 82% da largura, canto de baixo à direita de 6 px. */
  userRow: { alignSelf: "flex-end", alignItems: "flex-end", maxWidth: "82%", gap: 8 },
  bubble: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    overflow: "hidden",
    boxShadow: shadows.card,
  },
  bubbleFill: { borderRadius: 20, borderBottomRightRadius: 6 },
  retry: { gap: 2, alignItems: "flex-end" },
  typing: {
    alignSelf: "flex-start",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  steps: { flexDirection: "row", gap: 3 },
  stepBar: { width: 14, height: 4, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  stepBarOn: { backgroundColor: colors.green500 },
}));
