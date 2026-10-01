/** Abas do Meu espaço que outras telas abrem por atalho ("Ajustar em Preferências", "+ → Exame"). */
export type EspacoLinkTab = "preferencias" | "documentos";

export const isEspacoLinkTab = (value: string | undefined): value is EspacoLinkTab =>
  value === "preferencias" || value === "documentos";

/**
 * Rota para uma aba do Meu espaço. O Meu espaço é uma aba que continua montada: se a pessoa trocou de
 * aba à mão, o mesmo `?tab=preferencias` de antes não mudaria nada. `pedido` muda a cada toque, então
 * a tela sempre recebe o pedido novo e troca de aba (como o openEspaco do web).
 */
export function espacoHref(tab: EspacoLinkTab) {
  return { pathname: "/espaco", params: { tab, pedido: Date.now().toString(36) } } as const;
}
