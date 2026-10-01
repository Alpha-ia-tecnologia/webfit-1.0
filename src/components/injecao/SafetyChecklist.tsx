import { useState } from "react";
import { Check, FlaskConical, Info, PenLine, RefreshCw, Syringe, type LucideIcon } from "lucide-react";
import type { SafetyItem, SafetyKey } from "../../lib/injection";
import "./Recipe.css";

const ICONS: Record<SafetyKey, LucideIcon> = {
  conc: FlaskConical,
  syringe: Syringe,
  needle: RefreshCw,
  pen: PenLine,
};

/**
 * "Antes de aplicar" (conceito 10): conferências com ícone e marcação. Só informativo: tudo começa
 * desmarcado a cada visita, nada fica salvo e nada bloqueia o registro.
 */
export function SafetyChecklist({ items }: { items: readonly SafetyItem[] }) {
  const [checked, setChecked] = useState<ReadonlySet<SafetyKey>>(() => new Set());
  const toggle = (key: SafetyKey) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <section className="card inj-card inj-safety" aria-labelledby="inj-safety-title">
      <h2 id="inj-safety-title">Antes de aplicar</h2>
      <div className="inj-safety-grid" role="group" aria-labelledby="inj-safety-title">
        {items.map((item) => {
          const Icon = ICONS[item.key];
          const isOn = checked.has(item.key);
          return (
            <button
              key={item.key}
              type="button"
              role="checkbox"
              aria-checked={isOn}
              className={`inj-safety-tile${isOn ? " is-on" : ""}`}
              onClick={() => toggle(item.key)}
            >
              <span className="inj-safety-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <span className="inj-safety-box" aria-hidden="true">
                {isOn && <Check size={16} strokeWidth={3} />}
              </span>
              <strong>{item.title}</strong>
              <small>{item.sub}</small>
            </button>
          );
        })}
      </div>
      <p className="inj-safety-note">
        <Info size={18} aria-hidden="true" />
        Informativo · siga a prescrição médica
      </p>
    </section>
  );
}
