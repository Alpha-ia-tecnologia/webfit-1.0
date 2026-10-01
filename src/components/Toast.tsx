import { useEffect, useRef, useState } from "react";
import { X, CheckCircle2, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { arcDash } from "../lib/charts";
import { headingNear, refocusIfLost } from "./focusFallback";
import type { ToastMessage, ToastProgress } from "../types";

const ICONS = { success: CheckCircle2, info: Info, warning: TriangleAlert, error: CircleAlert };
const RING_RADIUS = 9;

/** Mini anel do toast v2: quanto do dia de água ou dos combinados já foi. */
function ProgressRing({ progress }: { progress: ToastProgress }) {
  return (
    <svg className={`toast-ring ${progress.tone}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r={RING_RADIUS} className="toast-ring-track" />
      {progress.percent > 0 && (
        <circle
          cx="12"
          cy="12"
          r={RING_RADIUS}
          className="toast-ring-value"
          strokeDasharray={arcDash(RING_RADIUS, progress.percent)}
          transform="rotate(-90 12 12)"
        />
      )}
    </svg>
  );
}

/**
 * "Desfazer" e "Fechar" tiram o aviso da tela junto com o botão focado; o item restaurado é outro
 * elemento. Depois que a tela se atualiza, se o foco caiu no <body>, ele vai para o título da página.
 */
function keepFocusOnPage() {
  requestAnimationFrame(() => requestAnimationFrame(() => refocusIfLost(headingNear([]))));
}

const DEFAULT_MS = 6000;
/** Avisos com "Desfazer" ficam mais tempo: é a única volta de uma exclusão. */
const ACTION_MS = 12000;

export function Toast({
  message,
  onClose,
}: {
  message: ToastMessage;
  onClose: () => void;
}) {
  const [isPaused, setPaused] = useState(false);
  const actionRef = useRef<HTMLButtonElement>(null);
  const hasAction = Boolean(message.action);
  // onClose chega novo a cada render do App (ex.: etapas da IA): numa ref, ele não reinicia o tempo.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  // O tempo para enquanto o ponteiro ou o foco estão no aviso (WCAG 2.2.1).
  useEffect(() => {
    if (isPaused) return;
    const timer = setTimeout(() => onCloseRef.current(), hasAction ? ACTION_MS : DEFAULT_MS);
    return () => clearTimeout(timer);
  }, [message.id, isPaused, hasAction]);
  // Quem excluiu pelo teclado perde o foco junto com o item: ele vai para "Desfazer".
  useEffect(() => {
    if (!hasAction) return;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected)
        actionRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [message.id, hasAction]);
  const Icon = ICONS[message.type];
  const isUrgent = message.type === "warning" || message.type === "error";
  return (
    <div
      className={`toast ${message.type}`}
      role={isUrgent ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setPaused(false);
      }}
    >
      {message.progress ? <ProgressRing progress={message.progress} /> : <Icon size={20} aria-hidden="true" />}
      <p>{message.message}</p>
      {message.action && (
        <button
          ref={actionRef}
          type="button"
          className="toast-action"
          onClick={() => {
            message.action?.onAction();
            onClose();
            keepFocusOnPage();
          }}
        >
          {message.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Fechar mensagem"
        onClick={() => {
          onClose();
          keepFocusOnPage();
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}
