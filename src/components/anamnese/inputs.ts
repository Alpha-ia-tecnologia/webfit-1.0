/**
 * Lógica pura dos controles interativos da anamnese (chips, régua, rodas).
 * Sem React: tudo aqui é testável em Node.
 */

// ---------- Escolhas em chips (texto composto por ", ") ----------
/** Ícones das opções (web e app traduzem para os componentes de ícone). */
export type ChoiceIconKey =
  | "heartPulse"
  | "brain"
  | "droplet"
  | "droplets"
  | "flower"
  | "testTube"
  | "flame"
  | "gauge"
  | "activity"
  | "bean"
  | "circleSlash"
  | "lock"
  | "syringe"
  | "scale"
  | "heartCrack"
  | "ribbon"
  | "plus"
  | "x";
export interface ChoiceOption {
  value: string;
  /** Texto visível mais curto ("Colesterol alto"); `value` continua gravado e no nome acessível. */
  short?: string;
  /** Ícone decorativo antes do texto (condições de saúde, opções excludentes). */
  icon?: ChoiceIconKey;
  hint?: string;
  /** Só em comida, alergias e atividade física (decorativo, fora do nome acessível). */
  emoji?: string;
  /** Textos equivalentes aceitos ao reconhecer respostas antigas ou digitadas. */
  aliases?: string[];
  /** Opção excludente ("Nenhuma", "Não uso"): limpa as demais ao ser escolhida. */
  none?: boolean;
}
/** Grupo de pílulas com título curto (os `values` são valores de opções). */
export interface ChoiceSection {
  title: string;
  values: readonly string[];
}
export interface ChoiceConfig {
  mode: "single" | "multi";
  options: ChoiceOption[];
  otherLabel?: string;
  otherPlaceholder?: string;
  /** Sem a pílula "Outros" de texto livre (a lista é fechada). */
  hideOther?: boolean;
  /** Pílulas comuns em grupos com título, todas à vista (sem "Ver mais"). */
  sections?: readonly ChoiceSection[];
  /** Texto do divisor entre as excludentes e as demais pílulas ("ou escolha" por padrão). */
  divider?: string;
}
export const CHOICE_SEPARATOR = ", ";

export const normalizeText = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function matchOption(
  part: string,
  options: ChoiceOption[],
): ChoiceOption | undefined {
  const n = normalizeText(part);
  return options.find(
    (o) =>
      normalizeText(o.value) === n ||
      o.aliases?.some((a) => normalizeText(a) === n),
  );
}

/** Decompõe o texto salvo em opções reconhecidas e no restante livre ("Outros"). */
/**
 * Separa o texto gravado em opções conhecidas e texto livre. Opções cujo valor contém o separador
 * ("Regular, todos os dias") são reconhecidas juntando o maior número possível de segmentos consecutivos;
 * antes, o pedaço final virava texto de "Outros".
 */
export function parseChoices(
  value: string,
  config: ChoiceConfig,
): { selected: string[]; other: string } {
  const parts = value
    .split(CHOICE_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
  const selected: string[] = [];
  const other: string[] = [];
  let index = 0;
  while (index < parts.length) {
    let end = parts.length;
    let found: ChoiceOption | undefined;
    for (; end > index; end--) {
      found = matchOption(
        parts.slice(index, end).join(CHOICE_SEPARATOR),
        config.options,
      );
      if (found) break;
    }
    if (found) {
      if (!selected.includes(found.value)) selected.push(found.value);
      index = end;
    } else {
      other.push(parts[index] ?? "");
      index++;
    }
  }
  // Pedaços de uma opção já marcada (gravações feitas com o defeito antigo) não viram texto livre.
  const pieces = new Set(
    selected.flatMap((v) => v.split(CHOICE_SEPARATOR).map(normalizeText)),
  );
  return {
    selected,
    other: other
      .filter((text) => text && !pieces.has(normalizeText(text)))
      .join(CHOICE_SEPARATOR),
  };
}

/** Recompõe o texto na ordem do catálogo, com o texto livre por último. */
export function composeChoices(
  selected: string[],
  other: string,
  config: ChoiceConfig,
): string {
  const ordered = config.options
    .map((o) => o.value)
    .filter((v) => selected.includes(v));
  const free = other.trim();
  return [...ordered, ...(free ? [free] : [])].join(CHOICE_SEPARATOR);
}

/** Texto visível da opção (o curto, quando houver). */
export const choiceText = (option: ChoiceOption): string =>
  option.short ?? option.value;

/**
 * Nome acessível da opção: o valor gravado. Quando o texto visível não é o começo do valor
 * ("Colesterol alto" × "Colesterol ou triglicerídeos altos"), o visível vem antes (rótulo no nome).
 */
export function choiceName(option: ChoiceOption): string {
  const short = option.short;
  if (!short || normalizeText(option.value).startsWith(normalizeText(short)))
    return option.value;
  const rest =
    option.value.charAt(0).toLocaleLowerCase("pt-BR") + option.value.slice(1);
  return `${short}, ${rest}`;
}

/** Alterna uma opção respeitando escolha única e opções excludentes. */
export function toggleChoice(
  selected: string[],
  option: ChoiceOption,
  config: ChoiceConfig,
): string[] {
  if (selected.includes(option.value))
    return selected.filter((v) => v !== option.value);
  if (config.mode === "single" || option.none) return [option.value];
  const exclusive = config.options.filter((o) => o.none).map((o) => o.value);
  return [...selected.filter((v) => !exclusive.includes(v)), option.value];
}

// ---------- Pílulas ----------
/** Quantas opções comuns aparecem antes de "Ver mais N". */
export const VISIBLE_CHOICES = 8;

/** Cartões quando alguma opção tem descrição; pílulas compactas nos demais casos. */
export const choiceLayout = (config: ChoiceConfig): "cards" | "pills" =>
  config.options.some((option) => option.hint) ? "cards" : "pills";

/**
 * Divide as opções das pílulas: excludentes ("Nenhuma", "Prefiro não informar") no topo,
 * as primeiras visíveis e o resto em "Ver todas". Uma opção marcada nunca fica escondida.
 */
export function splitChoices(
  config: ChoiceConfig,
  selected: string[],
  limit = config.sections ? Infinity : VISIBLE_CHOICES,
): { exclusive: ChoiceOption[]; visible: ChoiceOption[]; hidden: ChoiceOption[] } {
  const common = config.options.filter((option) => !option.none);
  const visible = common.filter(
    (option, index) => index < limit || selected.includes(option.value),
  );
  return {
    exclusive: config.options.filter((option) => option.none),
    visible,
    hidden: common.filter((option) => !visible.includes(option)),
  };
}

/**
 * Pílulas comuns agrupadas pelos `sections` da configuração (um grupo sem título quando não há);
 * opções fora de qualquer grupo vão para o fim, sem título.
 */
export function choiceSections(
  config: ChoiceConfig,
  options: ChoiceOption[],
): { title: string | null; options: ChoiceOption[] }[] {
  if (!config.sections) return [{ title: null, options }];
  const grouped = config.sections.map((section) => ({
    title: section.title,
    options: options.filter((option) => section.values.includes(option.value)),
  }));
  const rest = options.filter(
    (option) => !grouped.some((g) => g.options.includes(option)),
  );
  return [
    ...grouped,
    ...(rest.length ? [{ title: null, options: rest }] : []),
  ].filter((group) => group.options.length > 0);
}

/** Busca da folha "Ver todas": ignora acentos e maiúsculas e também procura nos sinônimos. */
export function filterChoices(
  options: ChoiceOption[],
  query: string,
): ChoiceOption[] {
  const term = normalizeText(query);
  if (!term) return options;
  return options.filter((option) =>
    [option.value, option.short ?? "", ...(option.aliases ?? [])].some((text) =>
      normalizeText(text).includes(term),
    ),
  );
}

// ---------- Régua arrastável ----------
export interface RulerConfig {
  min: number;
  max: number;
  /** Resolução do valor gravado. */
  step: number;
  /** Distância entre traços desenhados. */
  tickStep: number;
  /** A cada quantos traços aparece um traço maior com rótulo. */
  majorEvery: number;
  /** Passo dos botões de ajuste fino. */
  fineStep: number;
  unit: string;
  decimals: number;
  /** Posição inicial da régua quando o campo ainda está vazio. */
  initial: number;
  allowNone?: boolean;
}
export const PX_PER_TICK = 12;

const round = (value: number, decimals: number) =>
  Number(value.toFixed(decimals));

export function snapToStep(value: number, cfg: RulerConfig): number {
  const clamped = Math.min(cfg.max, Math.max(cfg.min, value));
  const steps = Math.round((clamped - cfg.min) / cfg.step);
  return round(cfg.min + steps * cfg.step, cfg.decimals);
}
export function valueFromOffset(
  px: number,
  cfg: RulerConfig,
  pxPerTick = PX_PER_TICK,
): number {
  return snapToStep(cfg.min + (px / pxPerTick) * cfg.tickStep, cfg);
}
export function offsetFromValue(
  value: number,
  cfg: RulerConfig,
  pxPerTick = PX_PER_TICK,
): number {
  const clamped = Math.min(cfg.max, Math.max(cfg.min, value));
  return ((clamped - cfg.min) / cfg.tickStep) * pxPerTick;
}
export interface RulerTick {
  value: number;
  major: boolean;
  mid: boolean;
}
export function rulerTicks(cfg: RulerConfig): RulerTick[] {
  const count = Math.round((cfg.max - cfg.min) / cfg.tickStep);
  const half = cfg.majorEvery % 2 === 0 ? cfg.majorEvery / 2 : 0;
  return Array.from({ length: count + 1 }, (_, i) => ({
    value: round(cfg.min + i * cfg.tickStep, cfg.decimals),
    major: i % cfg.majorEvery === 0,
    mid: half > 0 && i % cfg.majorEvery !== 0 && i % half === 0,
  }));
}
export function formatValue(value: number, decimals: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
/** Número gravado no rascunho ("72", 72, "" ou null) como número ou null. */
export function toNumber(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
/** IMC a partir de peso (kg) e altura (cm); null quando faltam dados. */
export function bmiOf(weight: unknown, height: unknown): number | null {
  const w = toNumber(weight),
    h = toNumber(height);
  if (w === null || h === null || w <= 0 || h <= 0) return null;
  return round(w / (h / 100) ** 2, 1);
}

// ---------- Datas e horários em rodas ----------
export const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;
const pad = (n: number) => String(n).padStart(2, "0");

/** Dias do mês (mês de 1 a 12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
export function splitDate(
  value: string,
): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}
/** Junta ano, mês e dia limitando o dia ao tamanho do mês. */
export function joinDate(year: number, month: number, day: number): string {
  const safeDay = Math.min(Math.max(1, day), daysInMonth(year, month));
  return `${year}-${pad(month)}-${pad(safeDay)}`;
}
export function splitTime(
  value: string,
): { hour: number; minute: number } | null {
  const m = /^(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}
export function joinTime(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}
/** Minutos disponíveis na roda: múltiplos de `step` mais o minuto atual, se ele fugir do passo. */
export function minuteOptions(step: number, current: number | null): number[] {
  const base = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);
  return current !== null && !base.includes(current)
    ? [...base, current].sort((a, b) => a - b)
    : base;
}
