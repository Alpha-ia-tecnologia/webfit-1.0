import { Component, useEffect, useId, useRef, type ReactNode } from "react";
import { refocusIfLost } from "./focusFallback";
import { SkeletonCard } from "./Skeleton";

/* Telas sob demanda: o carregamento (lazyScreen, whenIdle) mora em lib/lazy-screen.ts; aqui ficam
   o esqueleto enquanto o arquivo chega e a barreira para quando ele não chega. */

/** Enquanto o arquivo da tela chega: o mesmo esqueleto da abertura do app, nunca uma tela branca. */
export function ScreenFallback() {
  return (
    <div className="page-content screen-fallback" aria-busy="true">
      <p role="status" className="sr-only">
        Abrindo a tela…
      </p>
      <SkeletonCard rows={1} />
      <SkeletonCard chart />
      <SkeletonCard rows={3} />
    </div>
  );
}

/** Aviso calmo quando a tela não abre (ex.: arquivo de uma versão anterior após atualizar o app). */
function ScreenLoadError({ onHome }: { onHome?: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  // O botão tocado pode ter saído da tela: o foco vai para o título do aviso.
  useEffect(() => refocusIfLost(heading.current), []);
  return (
    <div className="page-content screen-error-page">
      <section className="card" aria-labelledby={titleId}>
        <h2 id={titleId} ref={heading}>
          Esta tela não abriu
        </h2>
        <p role="alert">
          O app pode ter sido atualizado ou a conexão caiu. Seus registros continuam salvos neste
          aparelho; recarregue para continuar.
        </p>
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => location.reload()}>
            Recarregar
          </button>
          {onHome && (
            <button type="button" className="btn-secondary" onClick={onHome}>
              Voltar para Hoje
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * Barreira das telas sob demanda: um arquivo que não carrega (ou um erro ao desenhar a tela)
 * vira o aviso com "Recarregar" em vez de uma página branca. Quem a usa troca a `key` a cada tela.
 */
export class ScreenBoundary extends Component<
  { children: ReactNode; onHome?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <ScreenLoadError onHome={this.props.onHome} /> : this.props.children;
  }
}

/**
 * Barreira de uma parte sob demanda dentro de uma tela (stories, folha do relatório): se o arquivo
 * não chega ou o desenho falha, a parte some, `onError` fecha e avisa, e o resto da tela segue de pé
 * (sem "Esta tela não abriu").
 */
export class PartBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
