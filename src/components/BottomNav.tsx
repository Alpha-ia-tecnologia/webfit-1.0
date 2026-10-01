import { Fragment, useRef } from "react";
import {
  House,
  BookOpen,
  Sparkles,
  ChartNoAxesCombined,
  UserRound,
  Plus,
  X,
} from "lucide-react";
import type { ScreenType } from "../types";
import { COPY } from "../lib/copy";
import { QUICK_LOG_SHORTCUT } from "../lib/shortcuts";
import { useQuickLogShortcut } from "./useQuickLogShortcut";
import "./BottomNav.css";

type Props = {
  currentScreen: ScreenType;
  onNavigate: (s: ScreenType) => void;
  /** Recebe o botão que abriu: no desktop, o registro rápido aparece como popover ao lado dele. */
  onToggleQuickMenu: (trigger: HTMLElement) => void;
  isQuickMenuOpen: boolean;
};

/** [tela, nome acessível e rótulo no desktop, rótulo curto na barra inferior, ícone] */
const TABS = [
  ["hoje", "Hoje", "Hoje", House],
  ["diario", "Diário", "Diário", BookOpen],
  ["agente", COPY.agent, "Agente", Sparkles],
  ["evolucao", "Evolução", "Evolução", ChartNoAxesCombined],
  ["espaco", "Meu espaço", "Espaço", UserRound],
] as const;

/** Posição do botão central de registro na barra inferior (depois de "Diário"). */
const FAB_SLOT_INDEX = 2;

export function BottomNav({
  currentScreen,
  onNavigate,
  onToggleQuickMenu,
  isQuickMenuOpen,
}: Props) {
  const fabRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  // Tecla N: abre pelo botão visível (barra lateral no desktop, "+" no celular com teclado).
  useQuickLogShortcut(() => {
    if (isQuickMenuOpen) return;
    const add = addRef.current;
    const trigger = add && add.offsetParent !== null ? add : fabRef.current;
    if (trigger) onToggleQuickMenu(trigger);
  });
  return (
    <nav className="navigation" aria-label="Navegação principal">
      <p className="nav-label">ACOMPANHAMENTO</p>
      {TABS.map(([screen, label, short, Icon], index) => (
        <Fragment key={screen}>
          {index === FAB_SLOT_INDEX && (
            <div className="nav-fab-slot">
              <button
                ref={fabRef}
                type="button"
                className={`quick-fab ${isQuickMenuOpen ? "open" : ""}`}
                aria-label={COPY.quickLog}
                aria-keyshortcuts={QUICK_LOG_SHORTCUT}
                aria-expanded={isQuickMenuOpen}
                aria-haspopup="dialog"
                onClick={(e) => onToggleQuickMenu(e.currentTarget)}
              >
                {isQuickMenuOpen ? <X size={24} /> : <Plus size={26} />}
              </button>
            </div>
          )}
          <button
            className={`nav-item ${currentScreen === screen ? "active" : ""}`}
            aria-label={label}
            aria-current={currentScreen === screen ? "page" : undefined}
            onClick={() => onNavigate(screen)}
          >
            {/* No celular, o item ativo ganha a pílula menta só atrás do ícone (barra inferior cheia). */}
            <span className="nav-icon" aria-hidden="true">
              <Icon size={21} />
            </span>
            <span className="nav-text-full">{label}</span>
            <span className="nav-text-short">{short}</span>
          </button>
        </Fragment>
      ))}
      {/* No desktop o "+" flutuante some: este botão abre o registro rápido como popover. */}
      <button
        ref={addRef}
        type="button"
        className="btn nav-add"
        aria-keyshortcuts={QUICK_LOG_SHORTCUT}
        aria-expanded={isQuickMenuOpen}
        aria-haspopup="dialog"
        onClick={(e) => onToggleQuickMenu(e.currentTarget)}
      >
        <Plus size={18} aria-hidden="true" />
        {COPY.quickLog}
        {/* Dica visual do atalho, fora do nome acessível (continua "Registro rápido"). */}
        <kbd className="nav-kbd" aria-hidden="true">
          {QUICK_LOG_SHORTCUT}
        </kbd>
      </button>
      <p className="nav-footer">
        Um passo de cada vez.
        <br />
        Uma rotina que faz sentido para você.
      </p>
    </nav>
  );
}
