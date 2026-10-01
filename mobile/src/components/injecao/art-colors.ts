import { useTheme } from "@/theme/theme";
import { themeColors, themeDomainTone, type ColorScheme, type ThemeColors } from "@/theme/tokens";

/**
 * Arte da medicação (decisão 8.9 do tema escuro): a seringa, os desenhos dos modos de aplicação e o mapa
 * do corpo usam as cores do tema claro nos dois temas, sobre a placa clara, para graduações, unidades e
 * pontos se lerem sempre iguais. Os traços usam os papéis art* do web (artInk, artLine, artMid, artSoft,
 * artFaint, artMuted), iguais nos dois temas; só o papel (artPaper) fica um pouco mais escuro no escuro.
 */
export const ART = themeColors("light");
const DARK_ART: ThemeColors = { ...ART, artPaper: themeColors("dark").artPaper };

/** Cores da arte num tema (as mesmas instâncias sempre): as do claro, com o papel do tema. */
export function artColors(scheme: ColorScheme): ThemeColors {
  return scheme === "dark" ? DARK_ART : ART;
}

/** Cores da arte no tema atual (para o papel, artPaper, que muda no escuro). */
export function useArtColors(): ThemeColors {
  return artColors(useTheme().scheme);
}

/** Tons de domínio da arte (medicação e o cinza dos pontos livres), também fixos no claro. */
export const ART_TONE = themeDomainTone("light");
