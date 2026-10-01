/**
 * O texto compartilhado do consentimento local fala do navegador (app web); no app nativo os
 * dados ficam no aparelho, como já dizem a entrada, Meu espaço e os exames.
 */
export function onDevice(text: string): string {
  return text
    .replace(/este perfil do navegador/g, "este aparelho")
    .replace(/(n?)este navegador/g, "$1este aparelho");
}
