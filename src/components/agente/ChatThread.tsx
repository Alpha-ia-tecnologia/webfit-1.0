import type { ReactNode } from "react";
import { RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import {
  chatDayLabel,
  describeAgentMetaFull,
  describeAgentMetaShort,
  messageViews,
} from "../../lib/agent-presentation";
import {
  AGENT_STAGES,
  stageLabel,
  type AgentProgress,
} from "../../lib/agent-stream";
import { DAILY_COMMENT_CHIP } from "../../lib/daily-comment";
import { visiblePlainText } from "../../lib/text";
import type { AgentMeta, ChatMessage } from "../../types";
import { RichText } from "../RichText";
import { useBodyNumbersHidden } from "../useBodyNumbersHidden";
import { ChatBlocks } from "./ChatBlocks";
import { DietSummaryCard } from "./DietSummaryCard";

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

/** Bolinha do agente (24 px, gradiente) antes do nome, na linha de autor. */
function AgentDot() {
  return (
    <span className="chat-ai-dot" aria-hidden="true">
      <Sparkles size={13} />
    </span>
  );
}

/** "✦ Seu agente · 21:40": autor e hora de cada resposta; o conteúdo vem embaixo, na largura toda. */
function AiHead({ time }: { time?: string }) {
  return (
    <header className="chat-ai-head">
      <AgentDot />
      <span className="chat-ai-name">Seu agente</span>
      {time && <time className="chat-ai-time">· {time}</time>}
    </header>
  );
}

/**
 * "Revisada automaticamente · apoio educativo" sob a última resposta; nas anteriores a mesma
 * informação fica só para leitores de tela. A frase inteira (sem revisão humana) vai no title.
 */
function ReviewLine({ meta, isVisible }: { meta: AgentMeta; isVisible: boolean }) {
  const full = describeAgentMetaFull(meta);
  if (!isVisible) return <p className="sr-only">{full}</p>;
  return (
    <p className="chat-review-line" title={full}>
      <ShieldCheck size={14} aria-hidden="true" />
      <span aria-hidden="true">{describeAgentMetaShort(meta)}</span>
      <span className="sr-only">{full}</span>
    </p>
  );
}

/** Resposta em preparo: etapa real do grafo (quando disponível) e cancelar. */
function Typing({
  progress,
  onCancel,
}: {
  progress: AgentProgress | null;
  onCancel: () => void;
}) {
  const active = progress ? AGENT_STAGES.indexOf(progress.stage) : 0;
  const label = progress
    ? stageLabel(progress.stage, "chat", progress.attempt)
    : "Preparando a resposta";
  return (
    <div className="chat-row ai">
      <AiHead />
      <div className="chat-typing">
        <span className="chat-typing-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span role="status">{label}…</span>
        <span className="chat-typing-steps" aria-hidden="true">
          {AGENT_STAGES.map((stage, index) => (
            <i key={stage} className={index <= active ? "on" : ""} />
          ))}
        </span>
        <button type="button" className="text-btn" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function ChatThread({
  messages,
  today,
  hideCalories,
  currentPlanText,
  canRetry,
  isTyping,
  progress,
  onRetry,
  onCancel,
  onOpenDiet,
  onBlockSuggestion,
  empty,
}: {
  messages: ChatMessage[];
  today: string;
  hideCalories: boolean;
  currentPlanText: string | null;
  canRetry: boolean;
  isTyping: boolean;
  progress: AgentProgress | null;
  onRetry: (message: ChatMessage) => void;
  onCancel: () => void;
  onOpenDiet: () => void;
  /** Sugestão de próxima pergunta tocada numa resposta por blocos. */
  onBlockSuggestion: (text: string) => void;
  empty: ReactNode;
}) {
  const views = messageViews(messages);
  const days = messages.map((m) => chatDayLabel(m.timestamp, today));
  const hideBody = useBodyNumbersHidden();
  const lastAi = messages.reduce((last, m, i) => (m.sender === "ai" ? i : last), -1);
  return (
    <div
      className="chat-thread"
      role="log"
      aria-label="Conversa com o agente"
      aria-live="polite"
    >
      {!messages.length && empty}
      {messages.map((m, index) => {
        const view = views.get(m.id) ?? "text";
        const day = days[index];
        const separator =
          day && day !== days[index - 1] ? (
            <p className="chat-day" key={`day-${m.id}`}>
              <span>{day}</span>
            </p>
          ) : null;
        if (view === "diet-request") {
          // Com o plano logo depois, o pedido vira a segunda linha do cartão da dieta.
          const next = messages[index + 1];
          if (next && views.get(next.id) === "diet-plan") return [separator];
          return [
            separator,
            <p className="chat-system" key={m.id}>
              <Sparkles size={13} aria-hidden="true" />
              Você pediu uma nova dieta · {timeOf(m.timestamp)}
            </p>,
          ];
        }
        if (view === "profile-request")
          return [
            separator,
            <p className="chat-system" key={m.id} data-testid="profile-request">
              <Sparkles size={13} aria-hidden="true" />
              Você pediu uma análise do seu perfil · {timeOf(m.timestamp)}
            </p>,
          ];
        if (view === "daily-request")
          return [
            separator,
            <p className="chat-system" key={m.id} data-testid="daily-request">
              <Sparkles size={13} aria-hidden="true" />
              {DAILY_COMMENT_CHIP} · {timeOf(m.timestamp)}
            </p>,
          ];
        if (view === "diet-plan") {
          const request = messages[index - 1];
          return [
            separator,
            <article key={m.id} className="chat-row ai is-event">
              <DietSummaryCard
                message={m}
                isCurrent={m.text === currentPlanText}
                hideCalories={hideCalories}
                onOpen={onOpenDiet}
                requestedAt={request ? timeOf(request.timestamp) : null}
                isCompact
              />
            </article>,
          ];
        }
        const hasFailed = m.status === "error";
        const time = timeOf(m.timestamp);
        const review = m.meta ? (
          <ReviewLine meta={m.meta} isVisible={index === lastAi} />
        ) : null;
        const notes = m.meta?.notes.map((note) => (
          <p className="notice chat-note" key={note}>
            {visiblePlainText(note, hideCalories, hideBody)}
          </p>
        ));
        if (view === "blocks")
          return [
            separator,
            <article
              key={m.id}
              className="chat-row ai has-blocks"
              data-testid="chat-blocks"
            >
              <AiHead time={time} />
              <ChatBlocks
                message={m}
                isLatest={index === messages.length - 1}
                onSuggestion={onBlockSuggestion}
                footer={
                  <>
                    {review}
                    {notes}
                  </>
                }
              />
            </article>,
          ];
        if (m.sender === "ai")
          return [
            separator,
            <article key={m.id} className="chat-row ai">
              <AiHead time={time} />
              <div className="chat-bubble">
                <RichText text={m.text} hideCalories={hideCalories} />
              </div>
              {review}
              {notes}
            </article>,
          ];
        return [
          separator,
          <article key={m.id} className="chat-row user">
            <div className="chat-bubble-wrap">
              <div className="chat-bubble">
                <span className="chat-author">Você</span>
                <RichText text={m.text} hideCalories={hideCalories} />
                <span className="sr-only">
                  , às {time}
                  {hasFailed ? "" : ", enviada"}
                </span>
              </div>
              {hasFailed && (
                <div className="retry">
                  <span>A resposta não foi recebida.</span>
                  <button
                    type="button"
                    className="text-btn"
                    disabled={!canRetry}
                    onClick={() => onRetry(m)}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    Tentar novamente
                  </button>
                </div>
              )}
            </div>
          </article>,
        ];
      })}
      {isTyping && <Typing progress={progress} onCancel={onCancel} />}
    </div>
  );
}
