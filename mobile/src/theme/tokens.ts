/**
 * Tokens do app nativo. As cores vêm da fonte única compartilhada com o web (src/design/tokens.ts);
 * aqui ficam só os ajustes de plataforma (gradientes do expo-linear-gradient, sombras, fontes).
 * Nenhuma tela deve usar cores fixas fora daqui.
 *
 * Tema escuro (HOJE-X2): `colors`, `tones`, `pillTones`, `domainTone` e `macroColor` são os valores
 * do tema claro, usados pelas telas ainda não migradas. As migradas leem o tema pelo provedor de
 * theme/theme.tsx (useThemeColors, makeStyles), que usa themeColors(scheme) e os demais theme*.
 */
import {
  gradients as cssGradients,
  darkDomainTone,
  darkMacroColor,
  darkPalette,
  darkRoles,
  darkSemantic,
  domainTone,
  macroColor,
  palette,
  roles,
  semantic,
  type Domain,
  type ThemeName,
} from "@shared/design/tokens";

/** `motion.spring.snappy`/`gentle` ({stiffness, damping, mass}) para o withSpring do reanimated. */
export { domainTone, fontSize, macroColor, motion, type Domain } from "@shared/design/tokens";

/**
 * Transparências do kit (vidro, bordas suaves, véus) com o valor claro exato de antes, e os papéis
 * que mudam de cor no escuro. Cada uma tem o valor escuro em DARK_ONLY, mais abaixo.
 */
const kitAlpha = {
  glassHeader: "rgba(255,255,255,0.92)",
  glassHeaderBorder: "rgba(226,232,240,0.6)",
  glassTabBar: "rgba(255,255,255,0.94)",
  hairline: "rgba(226,232,240,0.8)",
  selectedTint: "rgba(209,250,229,0.75)",
  chipOnTint: "rgba(209,250,229,0.7)",
  selectedBorder: "rgba(110,231,183,0.5)",
  mintBorder: "rgba(167,243,208,0.6)",
  amberBorder: "rgba(253,230,138,0.9)",
  pressedSurface: "rgba(241,245,249,0.7)",
  pressedBorder: "rgba(226,232,240,0.5)",
  iconButtonBorder: "rgba(226,232,240,0.7)",
  scrim: "rgba(10,25,47,0.45)",
  scrimPopup: "rgba(15, 23, 42, 0.45)",
  wheelWash: "rgba(236,253,245,0.9)",
  wheelEdge: "rgba(167,243,208,0.9)",
  /** Fim transparente do degradê da roda (a cor da superfície com alfa 0). */
  wheelFade: "rgba(255,255,255,0)",
  /** Fundo do botão secundário (.btn-secondary). */
  buttonSheen: "rgba(255,255,255,0.9)",
  /** Fundo do aviso (toast): azul-marinho no claro, azul-ardósia no escuro (como --wf-inverse). */
  inverse: roles.inverse,
  /** Texto de erro em campos e botões destrutivos (rose-600 no claro; rosa legível no escuro). */
  errorText: palette.rose600,
  /** Texto do aviso de erro (.notice.error, rose-800 no claro). */
  errorTextStrong: palette.rose800,
  /** Arco "Vegetais" do prato (MiniPlate): verde-escuro, diferente da proteína nos dois temas. */
  plateVeg: palette.green700,
  /** Fundo da opção marcada da anamnese (.choice-chip.on): menta bem clara. */
  chipOnWash: "rgba(236,253,245,0.55)",
  /** Quadro azul-claro dos ícones de água (explicação do balanço do dia). */
  skyTint: "rgba(224,242,254,0.8)",
  /** Vidro quase opaco das barras fixas: faixa do diário, bandeja da refeição, barra da seringa, topo da anamnese. */
  glassBar: "rgba(255,255,255,0.96)",
  /** Vidro no tom do fundo da página: barra fixa da anamnese sobre a página sem cartão (conceito 07). */
  glassPage: "rgba(246,248,251,0.94)",
  /** Fim transparente do degradê do rodapé da anamnese (o fundo da página com alfa 0). */
  pageFade: "rgba(246,248,251,0)",
  /** Botão em vidro sobre os cartões (o "×" dos pratos). */
  glassButton: "rgba(255,255,255,0.8)",
  /** Toque pressionado sem cor própria: tinta escura levíssima no claro, branca no escuro. */
  pressedInk: "rgba(15,23,42,0.04)",
  /** Marcadores e realces de gráfico (--wf-marker): azul-marinho no claro, quase branco no escuro. */
  marker: roles.marker,
  /** Placa das ilustrações da medicação (--wf-art-paper): um pouco mais escura no escuro. */
  artPaper: roles.artPaper,
  /** Silhueta das medidas na Evolução (corpo, cabeça e contorno de bodySilhouette); slates escuros no escuro. */
  figureFill: "#eef2f7",
  figureHead: "#dbe4f0",
  figureLine: palette.slate300,
} as const;

/**
 * Cores constantes sobre preenchimentos escuros (aviso, chips ligados, bolhas verdes): iguais nos
 * dois temas, porque o fundo delas também não muda de claro para escuro.
 */
const onFill = {
  onFillSub: "rgba(255,255,255,0.85)",
  onFillOverlay: "rgba(255,255,255,0.16)",
  onFillOverlaySoft: "rgba(255,255,255,0.14)",
  onFillOverlayStrong: "rgba(255,255,255,0.22)",
  onFillSky: roles.onFillSky,
  onFillAmber: roles.onFillAmber,
  onFillRose: roles.onFillRose,
  /** Ícone secundário sobre o aviso (o "×" de fechar). */
  onFillMuted: palette.slate300,
  /** Sombra que escurece a pílula "calorias ocultas" dentro das bolhas verdes. */
  inkShadow: "rgba(0,0,0,0.18)",
  /** Texto secundário sobre o azul-marinho (chips do "Próximo passo", resumo do perfil). */
  onFillText: "rgba(255,255,255,0.9)",
  /** Legenda sobre o azul-marinho (atalho "Foto da refeição"). */
  onFillSoft: "rgba(255,255,255,0.82)",
  /** Borda translúcida de chips, botões e do anel do avatar sobre o azul-marinho. */
  onFillBorder: "rgba(255,255,255,0.18)",
  /** Fundo dos chips sobre o azul-marinho. */
  onFillChip: "rgba(255,255,255,0.08)",
  /** Fundo dos botões quadrados sobre o azul-marinho. */
  onFillOverlayFaint: "rgba(255,255,255,0.1)",
  /** Os mesmos botões pressionados. */
  onFillPressed: "rgba(255,255,255,0.18)",
  /** Segmento apagado do anel do dia selecionado (sobre o gradiente). */
  onFillIdle: "rgba(255,255,255,0.35)",
  /** Rótulo menta sobre o azul-marinho ("Próximo passo"), como o --wf-on-fill-mint do web. */
  onFillMint: roles.onFillMint,
  /** Texto claro sobre o azul-marinho da pílula cheia neutra (--wf-on-fill-slate). */
  onFillSlate: roles.onFillSlate,
  /**
   * Tinta escura sobre o verde-esmeralda (green500) dos chips ligados (QuickChip, PressChip): 7,0:1, onde o
   * branco dava 2,5:1. O preenchimento é o mesmo nos dois temas, então a tinta também.
   */
  onEmeraldInk: palette.slate900,
} as const;

/**
 * Papéis do web iguais nos dois temas: o verde dos botões com ícone branco (--wf-accent-fill*) e os traços
 * da arte da medicação (--wf-art-*), que fica sobre a placa clara também no escuro (decisão 8.9).
 */
const fixedRoles = {
  accentFill: roles.accentFill,
  accentFillStrong: roles.accentFillStrong,
  artInk: roles.artInk,
  artLine: roles.artLine,
  artMid: roles.artMid,
  artSoft: roles.artSoft,
  artFaint: roles.artFaint,
  artMuted: roles.artMuted,
} as const;

export const colors = {
  emerald: palette.emerald,
  blue: palette.blue,
  navy: palette.navy,
  navySoft: palette.navySoft,
  ocean: palette.ocean,
  green500: palette.green500,
  green600: palette.green600,
  green700: palette.green700,
  green800: palette.green800,
  primary: palette.primary,
  mint50: palette.mint50,
  mint100: palette.mint100,
  mint200: palette.mint200,
  mint300: palette.mint300,
  sky50: palette.sky50,
  sky100: palette.sky100,
  sky400: palette.sky400,
  sky500: palette.sky500,
  sky600: palette.sky600,
  sky700: palette.sky700,
  sky800: palette.sky800,
  amber50: palette.amber50,
  amber500: palette.amber500,
  amber600: palette.amber600,
  amber700: palette.amber700,
  amber900: palette.amber900,
  rose50: palette.rose50,
  rose200: palette.rose200,
  rose400: palette.rose400,
  rose600: palette.rose600,
  rose700: palette.rose700,
  rose800: palette.rose800,
  indigo50: palette.indigo50,
  indigo500: palette.indigo500,
  indigo700: palette.indigo700,
  teal50: palette.teal50,
  teal400: palette.teal400,
  teal500: palette.teal500,
  teal600: palette.teal600,
  teal700: palette.teal700,
  /** Laranjas da seringa de insulina e do ponto de destaque das opções da aplicação. */
  orange200: palette.orange200,
  orange400: palette.orange400,
  orange500: palette.orange500,
  orange600: palette.orange600,
  orange700: palette.orange700,
  bg: semantic.bg,
  surface: semantic.surface,
  surface2: semantic.surface2,
  surface3: semantic.surface3,
  text: semantic.text,
  text2: semantic.text2,
  muted: semantic.textMuted,
  faint: semantic.textFaint,
  slate50: palette.slate50,
  slate100: palette.slate100,
  slate200: palette.slate200,
  slate300: palette.slate300,
  slate400: palette.slate400,
  slate900: palette.slate900,
  border: semantic.border,
  borderSoft: semantic.borderSoft,
  white: palette.white,
  amber100: palette.amber100,
  amber200: palette.amber200,
  violet50: palette.violet50,
  violet600: palette.violet600,
  ...kitAlpha,
  ...onFill,
  ...fixedRoles,
} as const;

export type ColorScheme = ThemeName;
export type ColorKey = keyof typeof colors;
/** As mesmas chaves de `colors`, com os valores de um tema. */
export type ThemeColors = { readonly [K in ColorKey]: string };

/** Chaves de `colors` que são papéis semânticos (as demais, fora do kit, têm o nome da paleta). */
const SEMANTIC_OF = {
  bg: "bg",
  surface: "surface",
  surface2: "surface2",
  surface3: "surface3",
  text: "text",
  text2: "text2",
  muted: "textMuted",
  faint: "textFaint",
  border: "border",
  borderSoft: "borderSoft",
} as const satisfies Partial<Record<ColorKey, keyof typeof semantic>>;

/** Valores escuros do kit; `onFill` e `fixedRoles` ficam iguais nos dois temas. */
const DARK_ONLY: Record<keyof typeof kitAlpha, string> = {
  glassHeader: "rgba(17,26,43,0.92)",
  glassHeaderBorder: "rgba(255,255,255,0.08)",
  glassTabBar: "rgba(17,26,43,0.94)",
  hairline: "rgba(255,255,255,0.1)",
  selectedTint: "rgba(46,229,157,0.14)",
  chipOnTint: "rgba(46,229,157,0.14)",
  selectedBorder: "rgba(46,229,157,0.35)",
  mintBorder: "rgba(46,229,157,0.3)",
  amberBorder: "rgba(252,211,77,0.35)",
  pressedSurface: "rgba(255,255,255,0.06)",
  pressedBorder: "rgba(255,255,255,0.06)",
  iconButtonBorder: "rgba(255,255,255,0.08)",
  scrim: "rgba(0,0,0,0.6)",
  scrimPopup: "rgba(0,0,0,0.6)",
  wheelWash: "rgba(13,42,34,0.9)",
  wheelEdge: "rgba(46,229,157,0.35)",
  wheelFade: "rgba(17,26,43,0)",
  // Branco translúcido sobre a superfície escura apagaria o texto claro do botão: vira a superfície 2.
  buttonSheen: "rgba(22,34,58,0.9)",
  inverse: darkRoles.inverse,
  errorText: darkDomainTone.danger.fg,
  errorTextStrong: darkPalette.rose700,
  // O verde-700 escuro (#34d399) é a cor da proteína no escuro: os vegetais ficam no verde-600.
  plateVeg: palette.green600,
  // Lavagens e tintas: o tom escuro com alfa baixo (como chipOnTint); vidros: a superfície escura.
  chipOnWash: "rgba(46,229,157,0.14)",
  skyTint: "rgba(76,195,255,0.14)",
  glassBar: "rgba(17,26,43,0.96)",
  glassPage: "rgba(11,18,32,0.94)",
  pageFade: "rgba(11,18,32,0)",
  glassButton: "rgba(17,26,43,0.8)",
  pressedInk: "rgba(255,255,255,0.04)",
  marker: darkRoles.marker,
  artPaper: darkRoles.artPaper,
  // Como a figura de medidas do web (--wf-slate-100/-300): a silhueta vira um slate escuro sobre o cartão.
  figureFill: darkPalette.slate100,
  figureHead: darkPalette.slate200,
  figureLine: darkPalette.slate300,
};

const isKey = <T extends object>(record: T, key: PropertyKey): key is keyof T =>
  Object.prototype.hasOwnProperty.call(record, key);

/** Valor escuro de uma chave: kit → semântico → paleta escura → o mesmo do claro (branco, saturados). */
function darkValue(key: ColorKey): string {
  if (isKey(DARK_ONLY, key)) return DARK_ONLY[key];
  if (isKey(SEMANTIC_OF, key)) return darkSemantic[SEMANTIC_OF[key]];
  if (isKey(darkPalette, key)) return darkPalette[key];
  return colors[key];
}

/** Tema escuro com as mesmas chaves de `colors` (ainda desligado: veja RN_DARK_MODE_ENABLED). */
export const darkColors: ThemeColors = Object.fromEntries(
  (Object.keys(colors) as ColorKey[]).map((key) => [key, darkValue(key)]),
) as Record<ColorKey, string>;

/** Cores de um tema (as mesmas instâncias sempre: seguras como dependência de memo). */
/**
 * Mistura duas cores #rrggbb como o `color-mix(in srgb, a peso%, b)` do web (ex.: o texto da pílula "mente",
 * 75% do rosa com 25% do texto). Só para cores dos tokens; outra forma volta `a` sem mudança.
 */
export function mixColors(a: string, b: string, weightA: number): string {
  const parse = (hex: string) => (/^#[0-9a-fA-F]{6}$/.test(hex) ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : null);
  const [ca, cb] = [parse(a), parse(b)];
  if (!ca || !cb) return a;
  const mixed = ca.map((channel, i) => Math.round(channel * weightA + cb[i]! * (1 - weightA)));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function themeColors(scheme: ColorScheme): ThemeColors {
  return scheme === "dark" ? darkColors : colors;
}

export type DomainTones = Record<Domain, { fg: string; bg: string; border: string }>;
export function themeDomainTone(scheme: ColorScheme): DomainTones {
  return scheme === "dark" ? darkDomainTone : domainTone;
}

export type MacroColors = { readonly [K in keyof typeof macroColor]: string };
export function themeMacroColor(scheme: ColorScheme): MacroColors {
  return scheme === "dark" ? darkMacroColor : macroColor;
}

type Stops = readonly [string, string, ...string[]];

/**
 * Paradas #rrggbb de um gradiente CSS da fonte compartilhada, na ordem da string: o app nativo segue o web
 * sem repetir as cores (ex.: a bolha da pessoa no chat).
 */
function cssStops(css: string): Stops {
  const [first, second, ...rest] = css.match(/#[0-9a-fA-F]{6}(?![0-9a-fA-F])/g) ?? [];
  if (!first || !second) throw Error(`gradiente sem duas cores: ${css}`);
  return [first, second, ...rest];
}

/** Gradientes da marca. Direção horizontal por padrão; os verticais estão indicados. */
export const gradients = {
  brand: [palette.emerald, palette.blue],
  button: [palette.green600, palette.emerald],
  danger: [palette.rose700, palette.rose600],
  fab: [palette.blue, palette.emerald],
  profile: [palette.green600, palette.blue],
  kcal: [palette.amber500, palette.emerald],
  aiBanner: [palette.ocean, palette.blue, palette.emerald],
  sky: [palette.sky400, palette.blue],
  /** Vertical: de cima para baixo. */
  dateChip: [palette.sky500, palette.green500],
  /** Vertical: de cima para baixo (o azul-claro do topo é o sky-300 do web, fora da paleta). */
  water: [palette.sky300, palette.blue],
  /** Vertical: de cima para baixo. */
  waterToday: [palette.emerald, palette.blue],
  /** Vertical: de cima para baixo. */
  waterWeek: ["rgba(240,249,255,0.5)", "rgba(248,250,252,0.5)"],
  /** Atalho "Foto da refeição" (.capture-tile.photo): azul-marinho em diagonal. */
  photoTile: [palette.navy, palette.navySoft],
  /** Brilho verde no canto superior direito do atalho da foto (de cima para baixo). */
  photoGlow: ["rgba(0,208,132,0.35)", "rgba(0,208,132,0)"],
  /** Brilho azul no canto inferior esquerdo do Resumo do dia (sobre o azul-marinho; 26 % do web). */
  nextStepGlow: ["rgba(0,163,255,0.26)", "rgba(0,163,255,0)"],
  /** Brilho esmeralda no canto superior direito do Resumo do dia (18 % do web). */
  nextStepGlowEmerald: ["rgba(0,208,132,0.18)", "rgba(0,208,132,0)"],
  /** Bolha da pessoa no chat (--wf-gradient-user, AGENTE-01): esmeralda escura, em diagonal (`diagonalDown`, 135deg). */
  user: cssStops(cssGradients.user),
} as const satisfies Record<string, Stops>;

export const horizontal = {
  start: { x: 0, y: 0 },
  end: { x: 1, y: 0 },
} as const;
export const vertical = { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } } as const;
/** Equivalente a linear-gradient(45deg, …). */
export const diagonal = { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } } as const;
/** Equivalente a linear-gradient(135deg, …): do canto de cima à esquerda ao de baixo à direita. */
export const diagonalDown = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } as const;

export const radius = {
  xl: 28,
  lg: 24,
  card: 22,
  md: 16,
  input: 14,
  sm: 12,
  xs: 8,
  pill: 999,
} as const;

/** Sombras: iguais nos dois temas (no escuro elas quase somem, como no web). */
export const shadows = {
  card: "0px 4px 24px -4px rgba(0, 0, 0, 0.05)",
  float: "0px 8px 30px rgba(0, 0, 0, 0.06)",
  soft: "0px 1px 2px rgba(15, 23, 42, 0.04)",
  button: "0px 6px 16px -6px rgba(5, 150, 105, 0.55)",
  danger: "0px 6px 16px -6px rgba(225, 29, 72, 0.5)",
  fab: "0px 10px 25px -5px rgba(0, 163, 255, 0.45)",
  toast: "0px 10px 40px rgba(10, 25, 47, 0.3)",
  nav: "0px -4px 20px rgba(0, 0, 0, 0.04)",
  header: "0px 2px 12px -4px rgba(0, 0, 0, 0.03)",
  sheet: "0px -10px 40px rgba(10, 25, 47, 0.18)",
  chipActive: "0px 8px 16px -6px rgba(14, 165, 233, 0.5)",
  /** Dia escolhido na faixa de pontos do Diário (pílula azul-marinho). */
  dateActive: "0px 8px 16px -6px rgba(10, 25, 47, 0.5)",
  chipOn: "0px 6px 14px -8px rgba(16, 185, 129, 0.7)",
  focus: "0px 0px 0px 3px rgba(16, 185, 129, 0.18)",
  /** Busca grande de alimentos (SearchField size="lg") e o anel de foco da busca. */
  searchField: "0px 12px 26px -20px rgba(15, 23, 42, 0.6)",
  searchFocus: "0px 0px 0px 4px rgba(16, 185, 129, 0.16)",
  /** Pílula flutuante da barra inferior (antes da fidelidade visual; sem uso na barra cheia). */
  tabBar: "0px 12px 32px -10px rgba(15, 23, 42, 0.22)",
  /** Barra inferior cheia: sombra curta para cima, como a .navigation do web no celular. */
  tabBarTop: "0px -6px 20px -14px rgba(15, 23, 42, 0.18)",
  /** Barras flutuantes no rodapé (bandeja da refeição, barra da seringa). */
  floatingBar: "0px 18px 40px -16px rgba(15, 23, 42, 0.35)",
  /** Cartões e painéis do diário: quase sem sombra. */
  panel: "0px 1px 2px rgba(15,23,42,0.03)",
  /** Anamnese: pílula ligada (verde 700), opção ligada (verde 500), pergunta e pergunta respondida. */
  pillOn: "0px 6px 16px -10px rgba(4, 120, 87, 0.8)",
  choiceOn: "0px 4px 14px -8px rgba(16, 185, 129, 0.5)",
  questionCard: "0px 4px 16px rgba(0, 0, 0, 0.04)",
  questionDone: "0px 6px 20px rgba(0, 208, 132, 0.14)",
  /** Alça de arrastar (horários do dia, divisão dos macros). */
  knob: "0px 2px 6px rgba(15, 23, 42, 0.18)",
  /** Ponto verde do marcador da régua. */
  markerDot: "0px 1px 3px rgba(16, 185, 129, 0.5)",
  /** Caixa marcada dos combinados. */
  checkDone: "0px 2px 6px -1px rgba(0,208,132,0.5)",
  /** Atalho "Foto da refeição" (azul-marinho). */
  photoTile: "0px 14px 30px -18px rgba(10, 25, 47, 0.9)",
  /** Botão "+" verde dos pratos. */
  dishAdd: "0px 8px 16px -10px rgba(4, 120, 87, 0.9)",
  /** Botões redondos de − e + da porção. */
  stepper: "0px 4px 10px -6px rgba(15, 23, 42, 0.35)",
  /** Modo de aplicação escolhido (violeta da medicação). */
  medicationOn: "0px 4px 14px -8px rgba(124,58,237,0.45)",
  /** Linha de leitura do scanner da despensa. */
  scanGlow: "0px 0px 14px 3px rgba(16, 185, 129, 0.55)",
} as const;

export type Weight = 400 | 500 | 600 | 700 | 800 | 900;

const INTER: Record<Weight, string> = {
  400: "Inter_400Regular",
  500: "Inter_500Medium",
  600: "Inter_600SemiBold",
  700: "Inter_700Bold",
  800: "Inter_800ExtraBold",
  900: "Inter_800ExtraBold",
};
const JAKARTA: Record<Weight, string> = {
  400: "PlusJakartaSans_500Medium",
  500: "PlusJakartaSans_500Medium",
  600: "PlusJakartaSans_600SemiBold",
  700: "PlusJakartaSans_700Bold",
  800: "PlusJakartaSans_800ExtraBold",
  900: "PlusJakartaSans_800ExtraBold",
};

/** Fonte por peso: Inter no texto corrido e Plus Jakarta Sans nos títulos (como no app web). */
export function fontFamily(weight: Weight = 400, heading = false): string {
  return heading ? JAKARTA[weight] : INTER[weight];
}

export type Tone = "emerald" | "sky" | "amber" | "teal" | "rose" | "indigo";
export type PillTone = "emerald" | "sky" | "rose" | "neutral" | "amber" | "teal";
type ToneColors = { bg: string; fg: string; border: string };

/** Bordas translúcidas dos quadros e pílulas; no escuro, as bordas dos tons de domínio. */
const TONE_BORDERS = {
  light: {
    amber: "rgba(253,230,138,0.6)",
    sky: "rgba(186,230,253,0.6)",
    teal: "rgba(153,246,228,0.6)",
    pillSky: "rgba(186,230,253,0.8)",
    pillAmber: "rgba(253,230,138,0.7)",
    pillTeal: "rgba(153,246,228,0.7)",
  },
  dark: {
    amber: darkDomainTone.attention.border,
    sky: darkDomainTone.water.border,
    teal: darkDomainTone.habit.border,
    pillSky: darkDomainTone.water.border,
    pillAmber: darkDomainTone.attention.border,
    pillTeal: darkDomainTone.habit.border,
  },
} as const satisfies Record<ColorScheme, Record<string, string>>;

function buildTones(c: ThemeColors, tone: DomainTones, border: (typeof TONE_BORDERS)[ColorScheme]): Record<Tone, ToneColors> {
  return {
    amber: { bg: c.amber50, fg: c.amber500, border: border.amber },
    emerald: { bg: c.mint50, fg: c.green600, border: c.mintBorder },
    sky: { bg: c.sky50, fg: c.blue, border: border.sky },
    teal: { bg: c.teal50, fg: c.teal600, border: border.teal },
    rose: { bg: c.rose50, fg: c.rose600, border: c.rose200 },
    indigo: { bg: c.indigo50, fg: c.indigo500, border: tone.body.border },
  };
}

function buildPillTones(c: ThemeColors, border: (typeof TONE_BORDERS)[ColorScheme]): Record<PillTone, ToneColors> {
  return {
    emerald: { bg: c.mint50, fg: c.green700, border: c.mintBorder },
    sky: { bg: c.sky50, fg: c.sky700, border: border.pillSky },
    rose: { bg: c.rose50, fg: c.rose700, border: c.rose200 },
    neutral: { bg: c.surface2, fg: c.muted, border: "transparent" },
    amber: { bg: c.amber50, fg: c.amber700, border: border.pillAmber },
    teal: { bg: c.teal50, fg: c.teal700, border: border.pillTeal },
  };
}

/** Ícones em quadro colorido (.meal-icon, .speed-dial-btn). */
export const tones: Record<Tone, ToneColors> = buildTones(colors, domainTone, TONE_BORDERS.light);
const darkTones = buildTones(darkColors, darkDomainTone, TONE_BORDERS.dark);
export function themeTones(scheme: ColorScheme): Record<Tone, ToneColors> {
  return scheme === "dark" ? darkTones : tones;
}

/** Pílulas de status (.status-pill, .prot-pill). */
export const pillTones: Record<PillTone, ToneColors> = buildPillTones(colors, TONE_BORDERS.light);
const darkPillTones = buildPillTones(darkColors, TONE_BORDERS.dark);
export function themePillTones(scheme: ColorScheme): Record<PillTone, ToneColors> {
  return scheme === "dark" ? darkPillTones : pillTones;
}

/** Espaço reservado no fim das telas com barra inferior (barra + botão +). */
export const TAB_BAR_SPACE = 112;
