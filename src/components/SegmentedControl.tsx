import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

export interface Segment<T extends string> {
  value: T;
  /** Rótulo curto visível; o nome acessível completo vai em ariaLabel e deve contê-lo. */
  label: string;
  ariaLabel?: string;
  icon?: LucideIcon;
}

/** Controle segmentado (abas de uma tela) com indicador deslizante. */
export function SegmentedControl<T extends string>({
  label,
  segments,
  value,
  onChange,
  panelId,
  disabled = false,
  size = "md",
  showIcons = false,
}: {
  label: string;
  /** Id da região que o controle troca (aria-controls). */
  panelId?: string;
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Desliga todos os segmentos (ex.: durante uma solicitação em andamento). */
  disabled?: boolean;
  /** sm: pílula de 36 px com área de toque de 44 px (1M/3M/6M/Tudo, Frente/Costas) ao lado de um título. */
  size?: "md" | "sm";
  /** Mantém os ícones visíveis em qualquer largura (abas do Meu espaço, conceito 11). */
  showIcons?: boolean;
}) {
  const index = Math.max(
    0,
    segments.findIndex((segment) => segment.value === value),
  );
  const style = {
    "--segments": segments.length,
    "--index": index,
  } as CSSProperties;
  return (
    <div
      className={["segmented", size === "sm" ? "is-sm" : "", showIcons ? "has-icons" : ""].filter(Boolean).join(" ")}
      role="group"
      aria-label={label}
      style={style}
    >
      <span className="segmented-indicator" aria-hidden="true" />
      {segments.map(({ value: key, label: text, ariaLabel, icon: Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={key === value}
          aria-label={ariaLabel}
          aria-controls={panelId}
          disabled={disabled}
          className={key === value ? "active" : ""}
          onClick={() => onChange(key)}
        >
          {Icon && <Icon size={16} aria-hidden="true" />}
          {text}
        </button>
      ))}
    </div>
  );
}
