import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  Check,
  Droplets,
  ListChecks,
  Ruler,
  Syringe,
  UtensilsCrossed,
} from "lucide-react";
import {
  REMINDER_COPY,
  type ReminderCard as ReminderCardData,
  type ReminderType,
} from "../../lib/reminder-center";
import { IconTile } from "../IconTile";

/** Um ícone por tipo de lembrete; o tom vem de REMINDER_TONE (card.tone). */
export const REMINDER_ICON: Record<ReminderType, LucideIcon> = {
  agua: Droplets,
  refeicao: UtensilsCrossed,
  habito: ListChecks,
  medicao: Ruler,
  injecao: Syringe,
  despensa: CalendarClock,
};

interface ReminderCardProps {
  card: ReminderCardData;
  onQuick: (card: ReminderCardData) => void;
  onOpen: (card: ReminderCardData) => void;
  onRead: (card: ReminderCardData) => void;
}

/**
 * Lembrete devido (Agora) ou já lido (Hoje): título, quando, texto, o atalho do tipo, "Abrir
 * registro" e, se ainda não lido, "Marcar como lido". Continua um section.card com um h3 e um único
 * "Abrir registro" (pin de injecao.spec). A aplicação nunca tem atalho: só abre Seringa e dose.
 */
export function ReminderCard({ card, onQuick, onOpen, onRead }: ReminderCardProps) {
  const isDue = card.status === "due";
  return (
    <li className="reminder-item">
      <section
        className={`card reminder-card is-${card.status}`}
        data-testid="reminder-card"
        data-type={card.type}
      >
        <IconTile tone={card.tone} size="lg" icon={REMINDER_ICON[card.type]} />
        <div className="reminder-main">
          <div className="reminder-head">
            {isDue && (
              <span
                className="reminder-dot"
                data-testid="reminder-unread-dot"
                aria-hidden="true"
              />
            )}
            <h3>{card.title}</h3>
            <span className="reminder-when">
              {isDue && <span className="sr-only">{REMINDER_COPY.unread}. </span>}
              {card.when}
            </span>
          </div>
          <p className="reminder-text">{card.description}</p>
          {card.meta && <p className="reminder-meta">{card.meta}</p>}
          {card.progress !== null && (
            <span
              className="reminder-bar"
              data-testid="reminder-progress"
              aria-hidden="true"
            >
              <span style={{ width: `${card.progress}%` }} />
            </span>
          )}
          <div className="reminder-actions">
            {card.quick && (
              <button
                type="button"
                className="reminder-chip"
                aria-label={card.quick.aria}
                onClick={() => onQuick(card)}
              >
                {card.quick.label}
              </button>
            )}
            <button
              type="button"
              className="text-btn reminder-open"
              onClick={() => onOpen(card)}
            >
              {REMINDER_COPY.open}
            </button>
            {isDue && (
              <button
                type="button"
                className="icon-btn reminder-read"
                aria-label={REMINDER_COPY.markRead(card.title)}
                onClick={() => onRead(card)}
              >
                <Check size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </section>
    </li>
  );
}
