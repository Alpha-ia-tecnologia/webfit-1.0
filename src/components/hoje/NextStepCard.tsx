import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
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
} from "lucide-react";
import {
  insightTitle,
  titleTier,
  type DayInsight,
  type InsightChip,
  type InsightSheetAction,
  type InsightSheetModel,
} from "../../lib/day";
import { InsightSheet } from "../signals/InsightSheet";
import { habitIcon } from "./habitIcon";

type Props = {
  insight: DayInsight;
  onAction: () => void;
  onAsk: () => void;
  /** Ação escolhida numa folha (pergunta pronta, abrir a conversa, "Como calculamos"). */
  onSheetAction: (action: InsightSheetAction) => void;
  /** Dispensar um sinal por 3 dias ou o recado de hoje (chave de signalDismissals). */
  onDismiss: (key: string) => void;
};

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

/**
 * Cartão "Resumo" do dia, a única voz proativa do Hoje: ícone à esquerda, o kicker (período ou
 * "Seu agente · 07:10"), um título de até duas linhas, até três chips e uma ação, mais o atalho
 * para o agente. O título e os chips com folha abrem a InsightSheet (detalhe, ação, dispensar).
 * O conteúdo entra com fade + 8 px e os chips em cascata; tudo calculado localmente (lib/day.ts).
 */
export function NextStepCard({ insight, onAction, onAsk, onSheetAction, onDismiss }: Props) {
  const [open, setOpen] = useState<InsightSheetModel | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const title = insightTitle(insight);
  // A entrada roda de novo quando o título muda (o corpo remonta); o foco volta ao botão de ação.
  const contentKey = `${insight.source}|${title}`;
  useLayoutEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    body.current?.querySelector<HTMLElement>(".next-step-cta, .next-step-ask")?.focus();
  }, [contentKey]);
  const act = () => {
    refocus.current = body.current?.contains(document.activeElement) ?? false;
    onAction();
  };
  const openSheet = (sheet: InsightSheetModel) => setOpen(sheet);
  return (
    <section
      className={`next-step ${insight.domain} stagger-2`}
      data-testid="next-step"
      data-source={insight.source}
      aria-labelledby="next-step-title"
    >
      <span className="next-step-icon" aria-hidden="true">
        <Sparkles size={20} />
      </span>
      <div key={contentKey} ref={body} className="next-step-body is-entering">
        <p className="next-step-kicker">{insight.kicker}</p>
        {/* data-length: títulos longos (recado, alerta) descem um degrau para caber em duas linhas. */}
        <h2 id="next-step-title" data-length={titleTier(title)}>
          {insight.sheet ? (
            <button
              type="button"
              className="next-step-title-btn"
              aria-haspopup="dialog"
              onClick={() => openSheet(insight.sheet!)}
            >
              {title}
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ) : (
            title
          )}
        </h2>
        {insight.chipItems.length > 0 && (
          <ul className="next-step-chips">
            {insight.chipItems.map((chip, index) => {
              const Icon = chipIcon(chip);
              const isShort = chip.text !== chip.full;
              const content = (
                <>
                  <Icon size={16} aria-hidden="true" />
                  <span aria-hidden={isShort || undefined}>{chip.text}</span>
                  {isShort && <span className="sr-only">{chip.full}</span>}
                </>
              );
              return (
                <li
                  key={`${chip.kind}:${chip.full}`}
                  className={`is-${chip.kind} tone-${chip.sheet?.tone ?? "neutral"}`}
                  style={{ "--i": index } as CSSProperties}
                >
                  {chip.sheet ? (
                    <button
                      type="button"
                      className="next-step-chip"
                      data-chip={chip.sheet.id}
                      aria-haspopup="dialog"
                      title={isShort ? chip.full : undefined}
                      onClick={() => openSheet(chip.sheet!)}
                    >
                      {content}
                    </button>
                  ) : (
                    <span className="next-step-chip" title={isShort ? chip.full : undefined}>
                      {content}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="next-step-actions">
          {insight.action && (
            <button type="button" className="next-step-cta" onClick={act}>
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
      {open && (
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
      )}
    </section>
  );
}
