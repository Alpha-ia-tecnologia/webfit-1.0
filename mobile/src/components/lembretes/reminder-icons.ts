import {
  CalendarClock,
  Droplets,
  ListChecks,
  Ruler,
  Syringe,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react-native";
import type { ReminderType } from "@shared/lib/reminder-center";

/** Um ícone por tipo de lembrete (NOTIF-01), os mesmos do REMINDER_ICON do web. */
export const REMINDER_ICON: Record<ReminderType, LucideIcon> = {
  agua: Droplets,
  refeicao: UtensilsCrossed,
  habito: ListChecks,
  medicao: Ruler,
  injecao: Syringe,
  despensa: CalendarClock,
};
