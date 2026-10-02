import { useApp } from "../../lib/context";
import { AGENT_REVIEW_NOTE } from "../../lib/agent-presentation";
import { DAILY_COMMENT_KEY, latestDailyComment } from "../../lib/daily-comment";
import { localDate } from "../../lib/domain";
import { dismissSignal } from "../../lib/signals";
import { SignalCard } from "./SignalCard";

/**
 * "Seu agente comentou" no Hoje: a resposta do comentário automático de hoje (daily-comment.ts),
 * até a pessoa dispensar. A conversa completa fica em Meu agente.
 */
export function DailyCommentCard() {
  const { state, commit, navigate } = useApp();
  const today = localDate();
  const comment = latestDailyComment(state, today);
  if (!comment) return null;
  return (
    <SignalCard
      tone="agent"
      kicker="Seu agente comentou"
      testId="daily-comment"
      dismissLabel="Dispensar o comentário de hoje"
      onDismiss={() => void commit((s) => dismissSignal(s, DAILY_COMMENT_KEY, today))}
      action={{ label: "Abrir a conversa", onPress: () => navigate("agente") }}
      footnote={`Resposta de IA · ${AGENT_REVIEW_NOTE}`}
    >
      {comment.text.split(/\n+/).map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </SignalCard>
  );
}
