/**
 * Fonte única do padrão visual WebFit (web + app nativo).
 * O CSS (src/styles/tokens.css) é gerado por scripts/build-tokens.ts e o app nativo importa
 * este arquivo via @shared; nenhuma tela deve declarar cores ou escalas próprias.
 */

/** Primitivos: a paleta da marca e os neutros slate. */
export const palette = {
  emerald: "#00d084",
  blue: "#00a3ff",
  navy: "#0a192f",
  green500: "#10b981",
  green600: "#059669",
  green700: "#047857",
  green800: "#065f46",
  primary: "#006c49",
  mint50: "#ecfdf5",
  mint100: "#d1fae5",
  mint200: "#a7f3d0",
  /** Anel de foco claro sobre superfícies verdes. */
  mint300: "#6ee7b7",
  sky50: "#f0f9ff",
  sky100: "#e0f2fe",
  sky300: "#7dd3fc",
  sky400: "#38bdf8",
  sky500: "#0ea5e9",
  sky600: "#0284c7",
  sky700: "#0369a1",
  sky800: "#075985",
  /** Fundo escuro do cartão de captura (gradiente com navy). */
  navySoft: "#0f3b4c",
  /** Início do gradiente azul da faixa de destaque. */
  ocean: "#00668a",
  amber50: "#fffbeb",
  amber100: "#fef3c7",
  amber200: "#fde68a",
  amber500: "#f59e0b",
  amber600: "#d97706",
  amber700: "#b45309",
  amber900: "#78350f",
  rose50: "#fff1f2",
  rose200: "#fecdd3",
  rose400: "#fb7185",
  rose600: "#e11d48",
  rose700: "#be123c",
  rose800: "#9f1239",
  indigo50: "#eef2ff",
  indigo500: "#6366f1",
  /** Texto índigo pequeno sobre indigo50 (AA). */
  indigo700: "#4338ca",
  teal50: "#f0fdfa",
  teal400: "#2dd4bf",
  teal500: "#14b8a6",
  teal600: "#0d9488",
  teal700: "#0f766e",
  violet50: "#f5f3ff",
  violet100: "#ede9fe",
  violet600: "#7c3aed",
  pink50: "#fdf2f8",
  pink200: "#fbcfe8",
  pink600: "#db2777",
  /** Laranjas da seringa de insulina, do destaque das opções da aplicação e do tom warn (validade). */
  orange50: "#fff7ed",
  orange200: "#fed7aa",
  orange400: "#fb923c",
  orange500: "#f97316",
  orange600: "#ea580c",
  orange700: "#c2410c",
  bg: "#f6f8fb",
  white: "#ffffff",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  /** Cinza de texto secundário ajustado para AA também sobre o fundo #f6f8fb. */
  slate550: "#5b6b82",
  slate700: "#334155",
  slate900: "#0f172a",
} as const;

/** Papéis semânticos. Texto informativo usa no mínimo `textMuted` (AA 4,5:1 sobre as superfícies). */
export const semantic = {
  bg: palette.bg,
  surface: palette.white,
  surface2: palette.slate100,
  surface3: palette.slate50,
  text: palette.slate900,
  text2: palette.slate700,
  textMuted: palette.slate550,
  /** Só decorativo (ícones auxiliares, divisores, placeholders); nunca texto informativo. */
  textFaint: palette.slate400,
  border: palette.slate200,
  borderSoft: palette.slate100,
  brand: palette.emerald,
  primary: palette.primary,
} as const;

export type Domain =
  | "water"
  | "food"
  | "habit"
  | "body"
  | "medication"
  | "mind"
  | "attention"
  | "warn"
  | "danger"
  | "neutral";

/**
 * Cor por domínio, sem julgamento: vermelho (danger) só para erro e ações destrutivas;
 * "acima do planejado" e avisos usam neutral, attention ou warn (validade).
 */
export const domainTone: Record<Domain, { fg: string; bg: string; border: string }> = {
  water: { fg: palette.sky600, bg: palette.sky50, border: palette.sky100 },
  food: { fg: palette.green600, bg: palette.mint50, border: palette.mint200 },
  habit: { fg: palette.teal600, bg: palette.teal50, border: "#99f6e4" },
  body: { fg: palette.indigo500, bg: palette.indigo50, border: "#e0e7ff" },
  medication: { fg: palette.violet600, bg: palette.violet50, border: palette.violet100 },
  mind: { fg: palette.pink600, bg: palette.pink50, border: palette.pink200 },
  attention: { fg: palette.amber700, bg: palette.amber50, border: palette.amber200 },
  /** Validade perto do fim ou vencida: laranja, separado do âmbar da gordura e da atenção; nunca vermelho. */
  warn: { fg: palette.orange700, bg: palette.orange50, border: palette.orange200 },
  danger: { fg: palette.rose600, bg: palette.rose50, border: palette.rose200 },
  neutral: { fg: palette.slate500, bg: palette.slate100, border: palette.slate200 },
};

/** Cores fixas dos macronutrientes em todo o app. */
export const macroColor = {
  protein: palette.green500,
  carbs: palette.blue,
  fat: palette.amber500,
} as const;

export const gradients = {
  brand: "linear-gradient(90deg, #00d084, #00a3ff)",
  button: "linear-gradient(90deg, #059669, #00d084)",
  fab: "linear-gradient(45deg, #00a3ff, #00d084)",
  /** Bolha da pessoa no chat (AGENTE-01): esmeralda; o texto on-fill-mint-50 fica ≥ 4,5:1 nas duas pontas. */
  user: "linear-gradient(135deg, #047857, #058060)",
} as const;

export const shadows = {
  card: "0 4px 24px -4px rgb(0 0 0 / 0.04)",
  float: "0 8px 30px rgb(0 0 0 / 0.06)",
} as const;

export type ThemeName = "light" | "dark";

/**
 * Tema escuro (HOJE-X2): só o que muda. Tintas claras (50–300 e slate 50–300) viram superfícies
 * escuras tingidas; os escuros usados como texto viram claros legíveis. Saturados (400–600),
 * branco, navy, esmeralda, azul e os gradientes da marca são iguais nos dois temas.
 */
export const darkPalette = {
  mint50: "#0d2a22",
  mint100: "#103628",
  mint200: "#17493a",
  mint300: "#1f8a63",
  sky50: "#0e2338",
  sky100: "#13304d",
  sky300: "#1e5a8a",
  amber50: "#2a2110",
  amber100: "#3a2d12",
  amber200: "#4a3a17",
  rose50: "#2d1119",
  rose200: "#4c1d2a",
  indigo50: "#1a1f3f",
  teal50: "#0d2a2a",
  violet50: "#221a3f",
  violet100: "#2c2250",
  pink50: "#2e1628",
  pink200: "#4a2440",
  orange50: "#2d1c0f",
  orange200: "#4d3018",
  slate50: "#0e1626",
  slate100: "#16223a",
  slate200: "#24324c",
  slate300: "#33425e",
  bg: "#0b1220",
  green700: "#34d399",
  green800: "#6ee7b7",
  primary: "#2ee59d",
  sky700: "#7dd3fc",
  sky800: "#bae6fd",
  amber700: "#fcd34d",
  amber900: "#fde68a",
  rose700: "#fda4af",
  indigo700: "#c7d2fe",
  teal700: "#5eead4",
  orange700: "#fdba74",
  slate550: "#9fb0c8",
  slate700: "#c5d1e2",
  slate900: "#e6edf7",
} as const satisfies Partial<Record<keyof typeof palette, string>>;

/** Papéis semânticos do tema escuro, derivados do navy (fundo #0b1220, superfícies #111a2b/#16223a). */
export const darkSemantic = {
  bg: "#0b1220",
  surface: "#111a2b",
  surface2: "#16223a",
  surface3: "#0e1626",
  text: "#e6edf7",
  text2: "#c5d1e2",
  textMuted: "#9fb0c8",
  /** Só decorativo, como no claro. */
  textFaint: "#5e6e87",
  border: "#24324c",
  borderSoft: "#1b273d",
  brand: palette.emerald,
  primary: "#2ee59d",
} as const satisfies Record<keyof typeof semantic, string>;

/** Tons de domínio no escuro: mesma regra do claro (atenção âmbar, warn laranja, vermelho só para erro). */
export const darkDomainTone: Record<Domain, { fg: string; bg: string; border: string }> = {
  water: { fg: "#4cc3ff", bg: "#0e2338", border: "#16395a" },
  food: { fg: "#2ee59d", bg: "#0d2a22", border: "#134535" },
  habit: { fg: "#2dd4bf", bg: "#0d2a2a", border: "#144544" },
  body: { fg: "#a5b4fc", bg: "#1a1f3f", border: "#2b3366" },
  medication: { fg: "#c4b5fd", bg: "#221a3f", border: "#372b66" },
  mind: { fg: "#f9a8d4", bg: "#2e1628", border: "#4a2440" },
  attention: { fg: "#fcd34d", bg: "#2a2110", border: "#4a3a17" },
  warn: { fg: "#fb923c", bg: "#2d1c0f", border: "#4d3018" },
  danger: { fg: "#fb7185", bg: "#2d1119", border: "#4c1d2a" },
  neutral: { fg: "#9fb0c8", bg: "#16223a", border: "#24324c" },
};

export const darkMacroColor = {
  protein: "#34d399",
  carbs: "#38bdf8",
  fat: "#fbbf24",
} as const satisfies Record<keyof typeof macroColor, string>;

export const darkShadows = {
  card: "0 4px 24px -4px rgb(0 0 0 / 0.35)",
  float: "0 8px 30px rgb(0 0 0 / 0.45)",
} as const satisfies Record<keyof typeof shadows, string>;

/**
 * Papéis com o MESMO valor claro do uso atual (a varredura do tema escuro não muda nada no claro).
 * `onFill*` e `art*` são constantes: texto sobre preenchimentos escuros e as ilustrações da seringa,
 * que ficam sobre papel claro nos dois temas.
 */
export const roles = {
  surfaceGlass: "rgba(255, 255, 255, 0.85)",
  surfaceGlassStrong: "rgba(255, 255, 255, 0.92)",
  surfaceGlassSoft: "rgba(255, 255, 255, 0.6)",
  glassBorder: "rgba(226, 232, 240, 0.7)",
  accentFill: palette.green700,
  accentFillStrong: palette.green800,
  accentTextSoft: palette.green600,
  inverse: palette.navy,
  inverseBorder: "rgba(10, 25, 47, 0)",
  marker: palette.navy,
  onFillMint: palette.mint200,
  onFillMint50: palette.mint50,
  onFillSlate: palette.slate200,
  onFillAmber: palette.amber200,
  onFillSky: palette.sky100,
  onFillRose: palette.rose200,
  artPaper: palette.white,
  artInk: palette.slate900,
  artLine: palette.slate300,
  artMid: palette.slate200,
  artSoft: palette.slate100,
  artFaint: palette.slate50,
  artMuted: palette.slate400,
} as const;

/** Só os papéis que mudam no escuro. */
export const darkRoles = {
  surfaceGlass: "rgba(17, 26, 43, 0.85)",
  surfaceGlassStrong: "rgba(17, 26, 43, 0.92)",
  surfaceGlassSoft: "rgba(17, 26, 43, 0.6)",
  glassBorder: "rgba(255, 255, 255, 0.08)",
  accentTextSoft: "#34d399",
  inverse: "#2b3b5c",
  inverseBorder: "rgba(255, 255, 255, 0.12)",
  marker: "#e6edf7",
  artPaper: "#e6edf7",
} as const satisfies Partial<Record<keyof typeof roles, string>>;

/** meta theme-color do navegador. */
export const browserThemeColor = { light: "#00d084", dark: "#0b1220" } as const satisfies Record<
  ThemeName,
  string
>;

/** Escala tipográfica em px (o CSS a publica em rem). Tamanhos fora dela não devem ser usados. */
export const fontSize = {
  /** Mínimo para texto informativo (SIS-01): o antigo degrau de 11 px subiu para 12. */
  "2xs": 12,
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 17,
  xl: 20,
  "2xl": 24,
  "3xl": 28,
  "4xl": 32,
  "5xl": 36,
  "6xl": 44,
  /** Herói "Aspire até" da seringa (SERINGA-03). */
  "7xl": 48,
  /** Número herói dos conceitos (Evolução 72,4 · Seringa 2,5): um por tela. */
  hero: 60,
} as const;
export type FontStep = keyof typeof fontSize;

/** Grade de 4 px. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;

export const radius = { xs: 8, sm: 12, md: 16, lg: 24, pill: 999 } as const;

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

/**
 * Movimento: curva padrão e molas. O app usa as molas no reanimated (withSpring);
 * o CSS recebe a mesma mola amostrada em linear() (--wf-spring-*), com a duração até assentar.
 */
export const motion = {
  ease: "cubic-bezier(0.16, 1, 0.3, 1)",
  spring: {
    /** Toques e checks: rápida, com um leve passo além do alvo. */
    snappy: { stiffness: 420, damping: 28, mass: 1 },
    /** Entradas e celebrações: assenta sem balançar. */
    gentle: { stiffness: 220, damping: 24, mass: 1 },
  },
} as const satisfies { ease: string; spring: Record<string, SpringConfig> };

const SPRING_STEP_S = 1 / 240;
const SPRING_REST = 0.001;

/** Simula a mola de 0 a 1 e devolve a duração até assentar e os pontos para CSS linear(). */
export function springCurve(config: SpringConfig, samples = 24): { durationMs: number; points: number[] } {
  let x = 0;
  let v = 0;
  let t = 0;
  const trace: number[] = [0];
  while (t < 3) {
    const a = (-config.stiffness * (x - 1) - config.damping * v) / config.mass;
    v += a * SPRING_STEP_S;
    x += v * SPRING_STEP_S;
    t += SPRING_STEP_S;
    trace.push(x);
    if (Math.abs(x - 1) < SPRING_REST && Math.abs(v) < SPRING_REST * 10) break;
  }
  const points = Array.from({ length: samples + 1 }, (_, i) => {
    const value = trace[Math.round((i / samples) * (trace.length - 1))]!;
    return i === samples ? 1 : Math.round(value * 1000) / 1000;
  });
  return { durationMs: Math.round(t * 1000), points };
}

/** Degrau da escala mais próximo de um tamanho livre (empate sobe para o maior). */
export function nearestFontStep(px: number): FontStep {
  let best: FontStep = "base";
  let bestDistance = Infinity;
  for (const [step, size] of Object.entries(fontSize) as [FontStep, number][]) {
    const distance = Math.abs(size - px);
    if (distance < bestDistance || (distance === bestDistance && size > fontSize[best])) {
      best = step;
      bestDistance = distance;
    }
  }
  return best;
}

/** Contraste WCAG entre duas cores hexadecimais (#rrggbb). */
export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = channels.map((c) =>
      c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
