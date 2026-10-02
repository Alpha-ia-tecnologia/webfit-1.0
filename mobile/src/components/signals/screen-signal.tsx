import { AGENT_REVIEW_NOTE } from "@shared/lib/agent-presentation";
import { DAILY_COMMENT_KEY, latestDailyComment } from "@shared/lib/daily-comment";
import { localDate } from "@shared/lib/domain";
import { dismissSignal, signalFor, type SignalScreen } from "@shared/lib/signals";
import { useRouter } from "expo-router";
import { useApp } from "@/state/app-context";
import { SignalCard, SignalText } from "./signal-card";

/**
 * Sinal do app na tela (ScreenSignal do web): no máximo um, com a pergunta pronta para o agente.
 * Dispensar pausa o sinal por 3 dias; perfis calmos nunca veem nada (signals.ts).
 */
export function ScreenSignal({ screen }: { screen: SignalScreen }) {
  const { state, commit, askAgent } = useApp();
  const today = localDate();
  const signal = signalFor(state, today, screen);
  if (!signal) return null;
  const action = signal.action;
  return (
    <SignalCard
      tone={signal.tone}
      kicker="Observado nos seus registros"
      title={signal.title}
      testID={`signal-${signal.id}`}
      dismissLabel="Dispensar por 3 dias"
      onDismiss={() => void commit((s) => dismissSignal(s, signal.id, today))}
      action={action ? { label: action.label, onPress: () => askAgent(action.prompt) } : undefined}
    >
      <SignalText>{signal.body}</SignalText>
    </SignalCard>
  );
}

/** "Seu agente comentou" no Hoje (DailyCommentCard do web): a resposta de hoje até ser dispensada. */
export function DailyCommentCard() {
  const { state, commit } = useApp();
  const router = useRouter();
  const today = localDate();
  const comment = latestDailyComment(state, today);
  if (!comment) return null;
  return (
    <SignalCard
      tone="agent"
      kicker="Seu agente comentou"
      testID="daily-comment"
      dismissLabel="Dispensar o comentário de hoje"
      onDismiss={() => void commit((s) => dismissSignal(s, DAILY_COMMENT_KEY, today))}
      action={{ label: "Abrir a conversa", onPress: () => router.push("/agente") }}
      footnote={`Resposta de IA · ${AGENT_REVIEW_NOTE}`}
    >
      {comment.text.split(/\n+/).map((line, index) => (
        <SignalText key={index}>{line}</SignalText>
      ))}
    </SignalCard>
  );
}
