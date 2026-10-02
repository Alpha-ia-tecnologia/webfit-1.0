import { useId, type ReactNode } from "react";
import { Lightbulb, MessageCircle, Sparkles, ThumbsUp, X } from "lucide-react";
import "./Signals.css";

export type SignalTone = "info" | "positive" | "agent";

type Props = {
  tone: SignalTone;
  /** Linha pequena acima do título ("Observado nos seus registros", "Seu agente comentou"). */
  kicker: string;
  title?: string;
  children: ReactNode;
  /** Ação única do cartão (ex.: abrir o agente com uma pergunta pronta). */
  action?: { label: string; onPress: () => void };
  /** Nome acessível do X ("Dispensar por 3 dias"). */
  dismissLabel: string;
  onDismiss: () => void;
  footnote?: string;
  testId: string;
  dataId?: string;
};

const ICONS = { info: Lightbulb, positive: ThumbsUp, agent: Sparkles } as const;

/**
 * Cartão pequeno da IA proativa (sinais do app e comentário do dia): ícone, linha pequena, título,
 * texto curto, uma ação e o X para dispensar. Tons calmos (nunca vermelho), só tokens --wf-*.
 */
export function SignalCard({
  tone,
  kicker,
  title,
  children,
  action,
  dismissLabel,
  onDismiss,
  footnote,
  testId,
  dataId,
}: Props) {
  const titleId = useId();
  const Icon = ICONS[tone];
  return (
    <section
      className={`signal-card is-${tone}`}
      data-testid={testId}
      data-signal={dataId}
      aria-labelledby={titleId}
    >
      <span className="signal-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className="signal-body">
        <p className="signal-kicker" id={title ? undefined : titleId}>
          {kicker}
        </p>
        {title && <h2 id={titleId}>{title}</h2>}
        <div className="signal-text">{children}</div>
        {action && (
          <button type="button" className="signal-action" onClick={action.onPress}>
            <MessageCircle size={16} aria-hidden="true" />
            {action.label}
          </button>
        )}
        {footnote && <p className="signal-footnote">{footnote}</p>}
      </div>
      <button
        type="button"
        className="signal-dismiss"
        aria-label={dismissLabel}
        title={dismissLabel}
        onClick={onDismiss}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  );
}
