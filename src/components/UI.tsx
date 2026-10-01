import React, { useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Logo } from "./Logo";
import { EmptyArt, type EmptyArtKind } from "./EmptyArt";
import { HeaderPortal, useHeaderOptions, type HeaderOptions } from "./HeaderPortal";
import "./States.css";
export function Brand() {
  return <Logo />;
}
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}
/** Extras da tela no cabeçalho do app (HeaderPortal): avatar, pílula central, ações e opções. */
export interface PageHeader extends HeaderOptions {
  lead?: React.ReactNode;
  center?: React.ReactNode;
  actions?: React.ReactNode;
}
/**
 * Corpo de uma tela. O título aparece no cabeçalho fixo do app (App.tsx) e na aba
 * do navegador; aqui ficam as ações da tela, o conteúdo e, em `header`, o que vai
 * para o cabeçalho (ações no lugar do sino, avatar, subtítulo).
 */
export function Page({
  title,
  action,
  header,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  header?: PageHeader;
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · WebFit`;
  }, [title]);
  useHeaderOptions({
    subtitle: header?.subtitle,
    hideBell: header?.hideBell,
    align: header?.align,
  });
  return (
    <>
      {header?.lead && <HeaderPortal slot="lead">{header.lead}</HeaderPortal>}
      {header?.center && <HeaderPortal slot="center">{header.center}</HeaderPortal>}
      {header?.actions && <HeaderPortal slot="actions">{header.actions}</HeaderPortal>}
      {action && <div className="page-actions">{action}</div>}
      <div className="page-content">{children}</div>
    </>
  );
}
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactElement;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {React.cloneElement(
        children as React.ReactElement<Record<string, unknown>>,
        {
          id,
          "aria-invalid": !!error,
          "aria-describedby": hint || error ? `${id}-help` : undefined,
        },
      )}
      {(hint || error) && (
        <p
          id={`${id}-help`}
          className={error ? "field-error" : "hint"}
          role={error ? "alert" : undefined}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}
/**
 * Estado vazio (SIS-06): ilustração duotone do domínio, título curto, texto e uma ação opcional.
 * Sem `art`, continua o texto centralizado de antes.
 */
export function Empty({
  children,
  art,
  title,
  action,
}: {
  children: React.ReactNode;
  art?: EmptyArtKind;
  title?: string;
  action?: { label: string; onClick: () => void };
}) {
  if (!art) return <div className="empty">{children}</div>;
  return (
    <div className="empty empty-state">
      <EmptyArt kind={art} />
      {title && <h3>{title}</h3>}
      <p>{children}</p>
      {action && (
        <button type="button" className="btn-secondary btn-sm" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
/** Modais abertos, do mais antigo ao do topo (ids de useId). */
const openModals: string[] = [];
export function Modal({
  title,
  onClose,
  children,
  className,
  overlayClassName,
  style,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Variações de apresentação (ex.: folha inferior no celular, popover no desktop). */
  className?: string;
  overlayClassName?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  // Com modais empilhados (ex.: confirmação sobre um formulário), só o do topo responde ao teclado.
  useEffect(() => {
    openModals.push(id);
    return () => {
      const index = openModals.lastIndexOf(id);
      if (index >= 0) openModals.splice(index, 1);
    };
  }, [id]);
  // onClose costuma ser uma função nova a cada render (ex.: a cada tecla num campo do modal);
  // guardá-la numa ref evita refazer o efeito abaixo, que devolveria o foco ao "Fechar".
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const elements = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select,textarea,a[href],[tabindex="0"]',
        ) ?? [],
      );
    // Um campo marcado com data-autofocus (ex.: a busca do diário) recebe o foco no lugar do "Fechar".
    (ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? elements()[0])?.focus();
    const handle = (e: KeyboardEvent) => {
      if (openModals[openModals.length - 1] !== id) return;
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab") {
        const items = elements();
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", handle);
      before?.focus();
    };
  }, [id]);
  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- tocar fora fecha só no mouse e toque; no teclado, Esc e o botão Fechar
    <div
      className={overlayClassName ? `modal-overlay ${overlayClassName}` : "modal-overlay"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={className ? `modal ${className}` : "modal"}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <div className="row-between">
          <h2 id={id}>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
