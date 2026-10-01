import type { ReminderCard as ReminderCardData } from "../../lib/reminder-center";
import { IconTile } from "../IconTile";
import { REMINDER_ICON } from "./ReminderCard";

/** Lembrete planejado (Hoje mais tarde ou Próximos): só título e quando, sem ações nem foco. */
export function ReminderRow({ card }: { card: ReminderCardData }) {
  return (
    <li className="reminder-row" data-testid="reminder-row" data-type={card.type}>
      <IconTile tone={card.tone} size="md" icon={REMINDER_ICON[card.type]} />
      <span className="reminder-row-title">{card.title}</span>
      <span className="reminder-row-when">{card.when}</span>
    </li>
  );
}
