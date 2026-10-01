import { useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { ancestorsOf, headingNear, refocusIfLost } from "./focusFallback";
import "./OverflowMenu.css";

export interface MenuItem {
  label: string;
  icon?: typeof MoreHorizontal;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * Menu "⋯" de ações secundárias; fecha com Esc, ao escolher ou ao tocar fora. "top-start" abre
 * para cima, alinhado à esquerda (ex.: o "+" da barra do chat, no pé da tela).
 */
export function OverflowMenu({
  label,
  items,
  icon: TriggerIcon = MoreHorizontal,
  placement = "bottom-end",
  variant = "default",
  className,
}: {
  label: string;
  items: MenuItem[];
  icon?: LucideIcon;
  placement?: "bottom-end" | "top-start";
  /** ghost: só o ⋯ cinza, sem fundo nem borda (linhas do Diário e da Despensa); alvo continua 44 px. */
  variant?: "default" | "ghost";
  /** Classe extra do botão que abre o menu. */
  className?: string;
}) {
  const [isOpen, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  /** Ancestrais do "⋯" guardados ao escolher uma ação (ela pode tirar a linha da tela). */
  const pickedFrom = useRef<Element[] | null>(null);
  const id = useId();
  /** Fecha e devolve o foco ao "⋯" (teclado); tocar fora não rouba o foco do alvo tocado. */
  const closeToTrigger = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  // A ação escolhida tirou o "⋯" da tela (ex.: Excluir) e o foco caiu no <body>: primeiro vale o
  // efeito de quem usa o menu e o "Desfazer" do aviso (um quadro); depois, o título mais próximo.
  useEffect(
    () => () => {
      const chain = pickedFrom.current;
      if (!chain) return;
      requestAnimationFrame(() => requestAnimationFrame(() => refocusIfLost(headingNear(chain))));
    },
    [],
  );
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: MouseEvent | TouchEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", onKey);
    root.current
      ?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")
      ?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);
  return (
    <div className="overflow-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className={["icon-btn", variant === "ghost" ? "is-ghost" : "", className].filter(Boolean).join(" ")}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? id : undefined}
        onClick={() => setOpen(!isOpen)}
        onBlur={(event) => {
          // O foco foi para outro lugar por escolha da pessoa: a volta ao título não vale mais.
          if (event.relatedTarget && !root.current?.contains(event.relatedTarget as Node))
            pickedFrom.current = null;
        }}
      >
        <TriggerIcon size={19} />
      </button>
      {isOpen && (
        <div
          className={`overflow-menu-list${placement === "top-start" ? " is-top-start" : ""}`}
          role="menu"
          id={id}
        >
          {items.map(({ label: itemLabel, icon: Icon, disabled, onSelect }) => (
            <button
              key={itemLabel}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                pickedFrom.current = ancestorsOf(root.current);
                closeToTrigger();
                onSelect();
              }}
            >
              {Icon && <Icon size={16} aria-hidden="true" />}
              {itemLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
