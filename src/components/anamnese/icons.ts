import {
  Activity,
  Bean,
  Bell,
  Brain,
  CircleSlash,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CookingPot,
  Droplet,
  Droplets,
  Flame,
  Flower2,
  Frown,
  Gauge,
  HeartPulse,
  Leaf,
  Lock,
  Meh,
  Moon,
  Pill,
  Ruler,
  Settings2,
  ShieldCheck,
  Smile,
  Sparkles,
  Syringe,
  Target,
  TestTube,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import type { GroupIcon } from "../../data/anamneseOptions";
import type { ChoiceIconKey } from "./inputs";

/** Ícones das etapas e dos grupos da anamnese (os nomes vêm de anamneseOptions, compartilhado com o app). */
export const GROUP_ICON: Record<GroupIcon, LucideIcon> = {
  user: UserRound,
  sparkles: Sparkles,
  shield: ShieldCheck,
  ruler: Ruler,
  clipboard: ClipboardList,
  heart: HeartPulse,
  pill: Pill,
  leaf: Leaf,
  pot: CookingPot,
  moon: Moon,
  clock: Clock,
  target: Target,
  droplets: Droplets,
  bell: Bell,
  settings: Settings2,
  check: ClipboardCheck,
};

/** Rostos neutros das escolhas de sono e estresse. */
export const FACE_ICON: Record<"smile" | "meh" | "frown", LucideIcon> = {
  smile: Smile,
  meh: Meh,
  frown: Frown,
};

/** Ícones das opções (condições de saúde, excludentes "Nenhuma"/"Prefiro não informar", Sim/Não da caneta). */
export const CHOICE_ICON: Record<ChoiceIconKey, LucideIcon> = {
  heartPulse: HeartPulse,
  brain: Brain,
  droplet: Droplet,
  droplets: Droplets,
  flower: Flower2,
  testTube: TestTube,
  flame: Flame,
  gauge: Gauge,
  activity: Activity,
  bean: Bean,
  circleSlash: CircleSlash,
  lock: Lock,
  syringe: Syringe,
  x: X,
};
