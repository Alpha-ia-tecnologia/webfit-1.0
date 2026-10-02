import { CalendarClock, Clock, Droplet, MessageCircle, Sparkles, type LucideIcon } from "lucide-react";
import { insightTitle, type DayInsight, type InsightChip } from "../../lib/day";
import { habitIcon } from "./habitIcon";

type Props = {
  insight: DayInsight;
  onAction: () => void;
  onAsk: () => void;
};

/** Ícone do chip: gota (água), o ícone do combinado (lua para chá/sono) ou relógio. */
function chipIcon(chip: InsightChip): LucideIcon {
  if (chip.kind === "water") return Droplet;
  if (chip.kind === "pantry") return CalendarClock;
  const { icon } = habitIcon(chip.full);
  return icon === Sparkles ? Clock : icon;
}

/**
 * Cartão "Resumo" do dia: ícone à esquerda, o período, um título com a consequência, até dois
 * contextos e uma ação só, mais o atalho para o agente. Tudo calculado localmente (lib/day.ts).
 */
export function NextStepCard({ insight, onAction, onAsk }: Props) {
  return (
    <section className={`next-step ${insight.domain} stagger-2`} aria-labelledby="next-step-title">
      <span className="next-step-icon" aria-hidden="true">
        <Sparkles size={20} />
      </span>
      <div className="next-step-body">
        <p className="next-step-kicker">{insight.kicker}</p>
        <h2 id="next-step-title">{insightTitle(insight)}</h2>
        {insight.detail && <p className="next-step-detail">{insight.detail}</p>}
        {insight.chipItems.length > 0 && (
          <ul className="next-step-chips">
            {insight.chipItems.map((chip) => {
              const Icon = chipIcon(chip);
              const isShort = chip.text !== chip.full;
              return (
                <li key={chip.full} className={`is-${chip.kind}`} title={isShort ? chip.full : undefined}>
                  <Icon size={16} aria-hidden="true" />
                  <span aria-hidden={isShort || undefined}>{chip.text}</span>
                  {isShort && <span className="sr-only">{chip.full}</span>}
                </li>
              );
            })}
          </ul>
        )}
        <div className="next-step-actions">
          {insight.action && (
            <button type="button" className="next-step-cta" onClick={onAction}>
              <Sparkles size={18} aria-hidden="true" />
              {insight.action.label}
            </button>
          )}
          <button
            type="button"
            className="next-step-ask"
            aria-label="Perguntar ao agente"
            title="Perguntar ao agente"
            onClick={onAsk}
          >
            <MessageCircle size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
