import { createContext, useContext, useId, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Cabeçalho do app com espaços para a tela (fidelidade visual): o <header> e o <h1> continuam no
 * App (foco, título de cada tela e o aviso de tela que não abriu); a tela só coloca extras nele.
 * - lead: antes do título das abas (avatar do agente);
 * - center: no lugar do título visível das telas empilhadas (pílula do Registrar refeição) — o h1
 *   fica só para leitores de tela;
 * - actions: botões à direita, antes do sino (busca, calendário, ⋯, (i), exportar).
 */
export type HeaderSlot = "lead" | "center" | "actions";

export interface HeaderOptions {
  /** Linha sob o título (status do agente). */
  subtitle?: string;
  /** Tira o sino do cabeçalho (a tela põe as próprias ações no lugar). */
  hideBell?: boolean;
  /** Telas empilhadas: "start" = título grande à esquerda (Despensa). */
  align?: "center" | "start";
}

/** Opções já somadas de todas as partes montadas (o App desenha a partir disto). */
export interface HeaderState extends HeaderOptions {
  hasCenter: boolean;
}

export interface HeaderSlotsValue {
  nodes: Record<HeaderSlot, HTMLElement | null>;
  /** Registra (ou apaga, com null) as opções de uma parte da tela, identificada por `owner`. */
  setOptions: (owner: string, options: (HeaderOptions & { hasCenter?: boolean }) | null) => void;
}

export const HeaderSlotsContext = createContext<HeaderSlotsValue | null>(null);

type OwnedOptions = Record<string, HeaderOptions & { hasCenter?: boolean }>;

/** Soma das opções: o subtítulo mais recente vale; sino some e alinhamento "start" se alguém pedir. */
export function mergeHeaderOptions(owners: OwnedOptions): HeaderState {
  const list = Object.values(owners);
  return {
    subtitle: list.map((o) => o.subtitle).filter(Boolean).at(-1),
    hideBell: list.some((o) => o.hideBell),
    align: list.some((o) => o.align === "start") ? "start" : "center",
    hasCenter: list.some((o) => o.hasCenter),
  };
}

/** Mesmo conteúdo: evita render do App quando a tela reenvia as mesmas opções. */
export function sameOptions(
  a: (HeaderOptions & { hasCenter?: boolean }) | undefined,
  b: HeaderOptions & { hasCenter?: boolean },
): boolean {
  return (
    !!a &&
    a.subtitle === b.subtitle &&
    !!a.hideBell === !!b.hideBell &&
    (a.align ?? "center") === (b.align ?? "center") &&
    !!a.hasCenter === !!b.hasCenter
  );
}

/** Opções do cabeçalho enquanto o componente estiver montado (desfeitas ao sair da tela). */
export function useHeaderOptions({ subtitle, hideBell, align }: HeaderOptions): void {
  const slots = useContext(HeaderSlotsContext);
  const owner = useId();
  const setOptions = slots?.setOptions;
  useLayoutEffect(() => {
    if (!setOptions) return;
    setOptions(owner, { subtitle, hideBell, align });
    return () => setOptions(owner, null);
  }, [setOptions, owner, subtitle, hideBell, align]);
}

/** Leva `children` para um espaço do cabeçalho do App; fora do App (ou sem o espaço), não desenha. */
export function HeaderPortal({ slot, children }: { slot: HeaderSlot; children: ReactNode }) {
  const slots = useContext(HeaderSlotsContext);
  const owner = useId();
  const setOptions = slots?.setOptions;
  const isCenter = slot === "center";
  // Com a pílula no centro, o título visível sai (o h1 continua para leitores de tela).
  useLayoutEffect(() => {
    if (!setOptions || !isCenter) return;
    setOptions(owner, { hasCenter: true });
    return () => setOptions(owner, null);
  }, [setOptions, owner, isCenter]);
  const node = slots?.nodes[slot];
  return node ? createPortal(children, node) : null;
}
