/** Aviso quando os stories não abrem (arquivo de uma versão anterior, conexão caída). */
export const STORIES_LOAD_ERROR =
  "Não foi possível abrir o resumo da semana. Recarregue o app para tentar de novo.";

/**
 * Barreira só dos stories (carregados sob demanda): se o arquivo não chega ou o desenho falha, os
 * stories fecham com um aviso e o resto da tela segue de pé (sem "Esta tela não abriu" no Hoje).
 * É a barreira genérica das partes sob demanda (a mesma da folha do relatório).
 */
export { PartBoundary as StoriesBoundary } from "../LazyScreen";
