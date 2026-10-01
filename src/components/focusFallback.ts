/** Ancestrais de um nó, do mais próximo ao <html> (guardados antes de ele sair da tela). */
export function ancestorsOf(node: Element | null): Element[] {
  const chain: Element[] = [];
  for (let el = node?.parentElement ?? null; el; el = el.parentElement) chain.push(el);
  return chain;
}

/**
 * Título da seção mais próxima (aria-labelledby → h1–h6) que continua na tela; sem nenhum, o
 * título da página no cabeçalho.
 */
export function headingNear(chain: readonly Element[]): HTMLElement | null {
  for (const el of chain) {
    if (!el.isConnected) continue;
    const id = el.getAttribute("aria-labelledby");
    const heading = id ? document.getElementById(id) : null;
    if (heading && /^H[1-6]$/.test(heading.tagName)) return heading;
  }
  return document.querySelector<HTMLElement>("header h1");
}

/** Se o foco caiu no <body> (o elemento focado saiu da tela), leva-o ao título dado. */
export function refocusIfLost(heading: HTMLElement | null) {
  const active = document.activeElement;
  if (!heading || (active && active !== document.body)) return;
  if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  heading.focus();
}
