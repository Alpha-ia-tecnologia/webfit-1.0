import {
  Activity,
  Droplet,
  Gauge,
  HeartPulse,
  Scale,
  ShieldCheck,
  Stethoscope,
  Syringe,
  TestTube,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import {
  CARE_BUTTON_LABEL,
  CARE_NOTES_CLOSING,
  CARE_SHEET_TITLE,
  careItemsOf,
  type CareIconKey,
  type CareItem,
} from "../lib/conditions";
import { Modal } from "./UI";
import "./CareChips.css";

/** Ícones dos cuidados (os nomes vêm de lib/conditions, compartilhados com o app nativo). */
export const CARE_ICON: Record<CareIconKey, LucideIcon> = {
  heartPulse: HeartPulse,
  droplet: Droplet,
  testTube: TestTube,
  activity: Activity,
  gauge: Gauge,
  scale: Scale,
  syringe: Syringe,
  shieldCheck: ShieldCheck,
  stethoscope: Stethoscope,
};

const keyOf = (item: CareItem) => (item.key === "outro" ? item.text : item.key);

/**
 * Cuidados do perfil junto das metas (GoalsCard, "Como calculamos", PlanReveal): um chip neutro por
 * cuidado ("Pressão alta", "Glicose", "Caneta"…) e o botão-texto "Cuidados"; qualquer um abre a folha
 * "Cuidados do seu perfil". Só texto: sem números, dados do corpo ou dose; aparece também com
 * "Ocultar calorias" e fica vazio quando as respostas pedem avaliação individual.
 */
export function CareChips({
  notes,
  className,
}: {
  notes: readonly string[];
  className?: string;
}) {
  const [isOpen, setOpen] = useState(false);
  const items = careItemsOf(notes);
  if (!items.length) return null;
  const open = () => setOpen(true);
  return (
    <div
      className={className ? `care-chips ${className}` : "care-chips"}
      role="group"
      aria-label={CARE_SHEET_TITLE}
      data-testid="care-chips"
    >
      {items.map((item) => {
        const Icon = CARE_ICON[item.icon];
        return (
          <button
            key={keyOf(item)}
            type="button"
            className="care-chip"
            aria-haspopup="dialog"
            onClick={open}
          >
            <Icon size={16} aria-hidden="true" />
            {item.label}
          </button>
        );
      })}
      <button
        type="button"
        className="text-btn care-chips-btn"
        aria-haspopup="dialog"
        onClick={open}
      >
        <Stethoscope size={16} aria-hidden="true" />
        {CARE_BUTTON_LABEL}
      </button>
      {isOpen && <CareSheet items={items} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Folha "Cuidados do seu perfil": ícone, rótulo e frase curta por cuidado; o fechamento como rodapé. */
function CareSheet({
  items,
  onClose,
}: {
  items: readonly CareItem[];
  onClose: () => void;
}) {
  return (
    <Modal title={CARE_SHEET_TITLE} className="care-sheet" onClose={onClose}>
      <ul className="care-sheet-list">
        {items.map((item) => {
          const Icon = CARE_ICON[item.icon];
          return (
            <li key={keyOf(item)}>
              <span className="care-sheet-icon" aria-hidden="true">
                <Icon size={16} />
              </span>
              <p>
                <strong>{item.label}</strong> {item.body}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="care-sheet-closing">{CARE_NOTES_CLOSING}</p>
    </Modal>
  );
}
