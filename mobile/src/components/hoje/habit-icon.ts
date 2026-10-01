import { Droplets, Footprints, Moon, Sparkles, Utensils, type LucideIcon } from "lucide-react-native";

/** Tom do ícone do combinado (fundo tonal da linha pendente), como o habitIcon do web. */
export type HabitTone = "mint" | "sky" | "indigo" | "amber" | "habit";

/** Ícone e tom pelo assunto do combinado; sem correspondência, um brilho neutro (mesmas regras do web). */
export function habitIcon(title: string): { icon: LucideIcon; tone: HabitTone } {
  if (/camin|corr|pedal|trein|exerc|academ|along|dan[cç]/i.test(title)) return { icon: Footprints, tone: "mint" };
  if (/[áa]gua|beber|hidrat/i.test(title)) return { icon: Droplets, tone: "sky" };
  if (/sono|dorm|ch[áa]\b|ch[áa] |noite|medit|respir/i.test(title)) return { icon: Moon, tone: "indigo" };
  if (/almo|jant|caf[ée]|lanche|refei|comer|fruta|salad|prote/i.test(title)) return { icon: Utensils, tone: "amber" };
  return { icon: Sparkles, tone: "habit" };
}
