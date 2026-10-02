/**
 * Sinais do app (IA proativa, parte determinística): leituras curtas dos últimos dias nos
 * indicadores, grátis e instantâneas. Fora do Hoje viram uma linha de chips (título ≤ 4 palavras)
 * com a folha de detalhe (corpo ≤ 110 caracteres, uma frase; ação ≤ 3 palavras) no Diário,
 * Evolução e Seringa; no Hoje entram no cartão Resumo (título ou chip). Web + app nativo. Lógica
 * pura, sem IA: o agente só recebe o `brief` (ou o título) como contexto.
 *
 * Regras de cuidado: nada para perfis calmos ou sensíveis (isCalmOn: transtorno alimentar,
 * gestação/amamentação, menor de 18); com "Ocultar calorias" nenhum sinal de energia (nem
 * implícito); com "Ocultar números do corpo" nenhum sinal de peso; nunca vermelho, cobrança,
 * "atrasado" ou dose. Os dias passados medem contra a meta-base (goalsForDate), nunca contra a
 * meta já ajustada pelo dia anterior. Com IMC abaixo de 18,5, peso descendo nunca é elogiado e não
 * há convite a comer menos; com restrição de líquidos (ou sem resposta), nenhum texto fala em água.
 *
 * Prioridade (o primeiro que vale e não foi dispensado é o principal da tela; os outros ativos
 * da mesma tela viram chips, activeSignals):
 * - hoje: registro-pausa > agua-baixa > sequencia-boa
 * - diario: energia-acima > energia-abaixo > proteina-baixa > proteina-em-dia
 * - evolucao: sono-estresse > peso-tendencia
 * - seringa: caneta-ingestao
 * Dispensar pausa o sinal por 3 dias (signalDismissals no estado, id → data).
 */
import type { AppState, DiaryEntry, SymptomKey } from "../types";
import { bmiOf } from "./conditions";
import { INTAKE_CHIPS, INTAKE_PROMPTS, isCalmOn } from "./day";
import { goalsForDate, shiftDate, totalsFor, UNDERWEIGHT_BMI } from "./domain";
import {
  canSuggestWater,
  intakeAlert,
  LOOKBACK_DAYS,
  MIN_DAYS,
  qualifyingDays,
  type IntakeAlert,
} from "./intake-alert";

export type SignalScreen = "hoje" | "diario" | "evolucao" | "seringa";
export const SIGNAL_SCREENS: readonly SignalScreen[] = ["hoje", "diario", "evolucao", "seringa"];
export type SignalId =
  | "registro-pausa"
  | "agua-baixa"
  | "sequencia-boa"
  | "energia-acima"
  | "energia-abaixo"
  | "proteina-baixa"
  | "proteina-em-dia"
  | "sono-estresse"
  | "peso-tendencia"
  | "caneta-ingestao";
export interface SignalAction {
  label: string;
  /** Pergunta pronta: abre Meu agente com ela na caixa (a pessoa revisa antes de enviar). */
  prompt: string;
}
export interface Signal {
  id: SignalId;
  screen: SignalScreen;
  /** "positive" é reforço (sequência, proteína em dia); "info" é um cuidado. Nunca alarme. */
  tone: "info" | "positive";
  /** Título do chip: até 4 palavras ("Água abaixo", "3 dias acima da meta"). */
  title: string;
  /** Uma frase, até 110 caracteres (a folha); sem números quando o indicador ligado a elas está oculto. */
  body: string;
  /** Rótulo ≤ 3 palavras e a pergunta pronta. */
  action?: SignalAction;
  /** O padrão em palavras para o contexto do agente, quando o título do chip é curto demais. */
  brief?: string;
}

/** Dias de pausa depois de dispensar um sinal (o dia da dispensa conta como o 1º). */
export const SIGNAL_COOLDOWN_DAYS = 3;
/** Energia fora desta fração da meta-base conta como dia acima ou abaixo. */
const KCAL_TOLERANCE = 0.1;
const PROTEIN_LOW_SHARE = 0.8;
const PROTEIN_GOOD_SHARE = 0.9;
const WATER_LOW_SHARE = 0.7;
/** Dias seguidos sem nenhum registro (ontem e anteontem) para o convite a retomar. */
const GAP_DAYS = 2;
/** Dias seguidos com refeição registrada para o reforço positivo. */
const STREAK_DAYS = 5;
/** Janela do bem-estar (marcadores e sono) e dias que precisam repetir o padrão. */
const WELLBEING_DAYS = 7;
const SHORT_SLEEP_H = 6;
const TIRED_TAGS = ["Cansaço", "Estresse", "Ansiedade"];
/** Com os efeitos da caneta à vista, "Cansaço" vira o sintoma "cansaco" (symptoms.ts, visibleTags). */
const TIRED_SYMPTOMS: readonly SymptomKey[] = ["cansaco"];
/** Tendência do peso: medições em 30 dias, ao menos 3 pontos cobrindo 14 dias; até 0,5 kg é estável. */
const TREND_DAYS = 30;
const TREND_MIN_POINTS = 3;
const TREND_MIN_SPAN_DAYS = 14;
const STABLE_KG = 0.5;
/** Desconfortos que, junto de pouca comida, mudam o texto do sinal da caneta. */
const DISCOMFORT_SYMPTOMS: readonly SymptomKey[] = ["nausea", "vomito", "azia", "dor_barriga"];
const DISCOMFORT_TAGS = ["Náusea"];
/** Teto do registro de dispensas (o esquema do estado aceita até 200 chaves). */
const MAX_DISMISSALS = 200;

const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};
const daysBetween = (from: string, to: string) => Math.round(dayNumber(to) - dayNumber(from));
const lastDays = (today: string, n: number, includeToday = false) =>
  Array.from({ length: n }, (_, i) => shiftDate(today, includeToday ? -i : -(i + 1)));
/** "3 dos últimos 5 dias" (só dentro da folha; o chip não traz contagem). */
const ofLast = (n: number, total: number) => `${n} dos últimos ${total} dias`;
/** IMC abaixo de 18,5 com o peso dado (ou o do perfil): nada de comer menos nem elogio a peso descendo. */
function isUnderweight(state: AppState, weight = state.profile?.weight ?? 0): boolean {
  const bmi = bmiOf(weight, state.profile?.height ?? 0);
  return bmi !== null && bmi < UNDERWEIGHT_BMI;
}

// ---------- Hoje ----------

/** Ontem e anteontem sem nenhum registro, depois de já ter registrado antes. */
function loggingGap(state: AppState, today: string): Signal | null {
  const gap = lastDays(today, GAP_DAYS);
  const oldest = gap[gap.length - 1];
  if (state.diary.some((e) => gap.includes(e.date))) return null;
  if (!state.diary.some((e) => e.date < oldest)) return null;
  return {
    id: "registro-pausa",
    screen: "hoje",
    tone: "info",
    title: "Que bom ver você",
    brief: "Alguns dias sem registros",
    body: "Faz alguns dias sem registros, e tudo bem: um registro hoje já retoma o ritmo.",
    action: {
      label: "Recomeço leve",
      prompt: "Fiquei alguns dias sem registrar. Pode me ajudar a retomar com um passo simples para hoje?",
    },
  };
}

/** Água abaixo de 70% da meta em 3+ dos últimos 5 dias com água registrada; nunca com restrição hídrica. */
function lowWater(state: AppState, today: string): Signal | null {
  if (state.profile?.fluidRestriction === "sim") return null;
  const low = lastDays(today, LOOKBACK_DAYS).filter((date) => {
    const goal = goalsForDate(state, date).water;
    const logged = state.diary.some((e) => e.date === date && e.type === "agua");
    return logged && goal !== null && goal > 0 && totalsFor(state.diary, date).water < goal * WATER_LOW_SHARE;
  });
  if (low.length < MIN_DAYS) return null;
  return {
    id: "agua-baixa",
    screen: "hoje",
    tone: "info",
    title: "Água abaixo",
    brief: "Água abaixo do combinado em vários dias",
    body: `Em ${ofLast(low.length, LOOKBACK_DAYS)} a água ficou abaixo do combinado; uma garrafa à vista ajuda.`,
    action: { label: "Lembrar da água", prompt: "Como posso lembrar de beber água ao longo do dia?" },
  };
}

/** Reforço: refeição registrada em cada um dos últimos 5 dias. */
function loggingStreak(state: AppState, today: string): Signal | null {
  const days = lastDays(today, STREAK_DAYS);
  if (!days.every((date) => state.diary.some((e) => e.date === date && e.type === "refeicao"))) return null;
  return {
    id: "sequencia-boa",
    screen: "hoje",
    tone: "positive",
    title: `${STREAK_DAYS} dias de registros`,
    brief: `${STREAK_DAYS} dias seguidos de registros`,
    body: `Refeição registrada em cada um dos últimos ${STREAK_DAYS} dias: constância é o que mais ajuda.`,
  };
}

// ---------- Diário ----------

interface DayReading {
  date: string;
  calories: number;
  protein: number;
  kcalGoal: number | null;
  proteinGoal: number | null;
}
/** Dias fechados com 2+ refeições, cada um com a meta-base daquele dia. */
function readings(state: AppState, today: string): DayReading[] {
  return qualifyingDays(state, today).map((date) => {
    const totals = totalsFor(state.diary, date);
    const goals = goalsForDate(state, date);
    return {
      date,
      calories: totals.calories,
      protein: totals.protein,
      kcalGoal: goals.calories,
      proteinGoal: goals.protein,
    };
  });
}

/** Energia acima ou abaixo da meta-base em 3+ dias; nada com "Ocultar calorias"; "acima" nunca com IMC abaixo de 18,5. */
function energyPattern(state: AppState, today: string, days: DayReading[]): Signal | null {
  if (state.profile?.hideCalories) return null;
  const withGoal = days.filter((d) => d.kcalGoal !== null && d.kcalGoal > 0);
  const above = withGoal.filter((d) => d.calories > d.kcalGoal! * (1 + KCAL_TOLERANCE)).length;
  const below = withGoal.filter((d) => d.calories < d.kcalGoal! * (1 - KCAL_TOLERANCE)).length;
  if (above >= MIN_DAYS && !isUnderweight(state))
    return {
      id: "energia-acima",
      screen: "diario",
      tone: "info",
      title: `${above} dias acima da meta`,
      brief: "Alguns dias acima da meta",
      body: `${ofLast(above, withGoal.length)} ficaram acima da meta; refeições com fibras e proteína saciam mais.`,
      action: {
        label: "Ideias que saciam",
        prompt:
          "Nos últimos dias passei da meta algumas vezes. Pode me sugerir refeições que saciam mais, dentro das minhas preferências e sem pular refeições?",
      },
    };
  // Quem usa caneta já recebe o alerta de ingestão (intakeAlert): sem repetir o assunto.
  if (below >= MIN_DAYS && !intakeAlert(state, today))
    return {
      id: "energia-abaixo",
      screen: "diario",
      tone: "info",
      title: `${below} dias abaixo da meta`,
      brief: "Alguns dias abaixo da meta",
      body: `${ofLast(below, withGoal.length)} ficaram abaixo da meta; lanches práticos ajudam a manter a energia.`,
      action: {
        label: "Lanches práticos",
        prompt:
          "Nos últimos dias comi menos que a meta. Pode me sugerir lanches práticos e refeições fáceis, dentro das minhas preferências?",
      },
    };
  return null;
}

/** Proteína abaixo de 80% em 3+ dias (sem repetir o alerta da caneta); reforço com 90%+ em 3+ dias. */
function proteinPattern(state: AppState, today: string, days: DayReading[]): Signal | null {
  const withGoal = days.filter((d) => d.proteinGoal !== null && d.proteinGoal > 0);
  const low = withGoal.filter((d) => d.protein < d.proteinGoal! * PROTEIN_LOW_SHARE).length;
  if (low >= MIN_DAYS)
    return intakeAlert(state, today)?.kind === "protein"
      ? null
      : {
          id: "proteina-baixa",
          screen: "diario",
          tone: "info",
          title: "Proteína baixa",
          brief: "Proteína abaixo do combinado",
          body: `Proteína abaixo do combinado em ${ofLast(low, withGoal.length)}; uma fonte em cada refeição já ajuda.`,
          action: {
            label: "Fontes de proteína",
            prompt: "Pode me sugerir fontes de proteína práticas para cada refeição, dentro das minhas preferências?",
          },
        };
  const good = withGoal.filter((d) => d.protein >= d.proteinGoal! * PROTEIN_GOOD_SHARE).length;
  if (good < MIN_DAYS) return null;
  return {
    id: "proteina-em-dia",
    screen: "diario",
    tone: "positive",
    title: "Proteína em dia",
    brief: "Proteína em dia nos últimos dias",
    body: `Proteína perto do combinado em ${ofLast(good, withGoal.length)}: bom trabalho.`,
  };
}

// ---------- Evolução ----------

const wellbeingOn = (entries: DiaryEntry[], date: string) =>
  entries.filter((e) => e.date === date && e.type === "bem_estar");

/** Cansaço, estresse ou ansiedade marcados, ou sono curto, em 3+ dos últimos 7 dias. */
function restPattern(state: AppState, today: string): Signal | null {
  const days = lastDays(today, WELLBEING_DAYS, true).filter((date) =>
    wellbeingOn(state.diary, date).some(
      (e) =>
        (e.tags ?? []).some((tag) => TIRED_TAGS.includes(tag)) ||
        (e.symptoms ?? []).some((s) => TIRED_SYMPTOMS.includes(s.key)) ||
        (e.sleepHours !== undefined && e.sleepHours < SHORT_SLEEP_H),
    ),
  );
  if (days.length < MIN_DAYS) return null;
  return {
    id: "sono-estresse",
    screen: "evolucao",
    tone: "info",
    title: "Cuidar do descanso",
    brief: "Cansaço, estresse ou pouco sono em vários dias",
    body: "Cansaço, estresse ou pouco sono em vários dias; horários regulares e uma rotina de sono ajudam.",
    action: {
      label: "Descansar melhor",
      prompt: "Tenho sentido cansaço ou estresse nos últimos dias. O que posso ajustar na rotina e nas refeições para descansar melhor?",
    },
  };
}

type Direction = "down" | "up" | "stable";
const WEIGHT_TITLES: Record<Direction, string> = {
  down: "Peso descendo",
  up: "Peso subiu um pouco",
  stable: "Peso estável",
};
const WEIGHT_BRIEFS: Record<Direction, string> = {
  down: "Peso descendo aos poucos",
  up: "Peso subiu um pouco",
  stable: "Peso estável",
};
const UNDERWEIGHT_DOWN_BODY =
  "O peso vem descendo e já está abaixo do recomendado para a altura; vale conversar com quem acompanha você.";
/** Tendência do peso só em palavras; nada com "Ocultar números do corpo". IMC baixo e peso descendo: informativo, nunca elogio. */
function weightTrend(state: AppState, today: string): Signal | null {
  const profile = state.profile;
  if (!profile || profile.hideBodyNumbers) return null;
  const from = shiftDate(today, -TREND_DAYS);
  const points = state.measurements
    .filter((m) => m.date > from && m.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < TREND_MIN_POINTS) return null;
  const first = points[0],
    last = points[points.length - 1];
  if (daysBetween(first.date, last.date) < TREND_MIN_SPAN_DAYS) return null;
  const delta = last.weight - first.weight;
  const direction: Direction = Math.abs(delta) <= STABLE_KG ? "stable" : delta < 0 ? "down" : "up";
  const underweightDown = direction === "down" && isUnderweight(state, last.weight);
  const aligned =
    (profile.goal === "perder" && direction === "down" && !underweightDown) ||
    (profile.goal === "ganhar" && direction === "up") ||
    ((profile.goal === "manter" || profile.goal === "organizar") && direction === "stable");
  return {
    id: "peso-tendencia",
    screen: "evolucao",
    tone: aligned ? "positive" : "info",
    title: WEIGHT_TITLES[direction],
    brief: WEIGHT_BRIEFS[direction],
    body: underweightDown
      ? UNDERWEIGHT_DOWN_BODY
      : aligned
        ? "Nas últimas semanas o peso seguiu no sentido do seu objetivo; constância vale mais que pressa."
        : "Oscilações nas últimas semanas são normais; o agente pode olhar sua rotina com calma, sem cobrança.",
    action: {
      label: "Falar da evolução",
      prompt: "Pode olhar a minha evolução das últimas semanas e me dar uma sugestão prática para a rotina, sem citar números do corpo?",
    },
  };
}

// ---------- Seringa ----------

const hasDiscomfort = (state: AppState, today: string) =>
  state.diary.some(
    (e) =>
      e.type === "bem_estar" &&
      e.date > shiftDate(today, -(LOOKBACK_DAYS + 1)) &&
      e.date <= today &&
      ((e.tags ?? []).some((tag) => DISCOMFORT_TAGS.includes(tag)) ||
        (e.symptoms ?? []).some((s) => DISCOMFORT_SYMPTOMS.includes(s.key))),
  );

/** Corpo da folha da Seringa (uma frase, ≤ 110): a orientação do alerta, encurtada; com ou sem água. */
const PEN_BODIES: Record<IntakeAlert["kind"], { water: string; dry: string }> = {
  low_intake: {
    water: "Comendo pouco há dias: refeições menores, proteína e água ajudam; se continuar, fale com quem prescreveu.",
    dry: "Comendo pouco há dias: refeições menores com proteína ajudam; se continuar, fale com quem prescreveu.",
  },
  protein: {
    water: "Proteína abaixo do combinado há dias: uma fonte em cada refeição, como ovos, iogurte ou feijão, ajuda.",
    dry: "Proteína abaixo do combinado há dias: uma fonte em cada refeição, como ovos, iogurte ou feijão, ajuda.",
  },
};

/** Caneta: reaproveita intakeAlert (sem repetir a regra); com enjoo registrado, o texto fala dele. */
function penIntake(state: AppState, today: string): Signal | null {
  const alert = intakeAlert(state, today);
  if (!alert) return null;
  const action = { label: "Pedir ideias", prompt: INTAKE_PROMPTS[alert.kind] };
  const bodies = PEN_BODIES[alert.kind];
  if (alert.kind === "low_intake" && hasDiscomfort(state, today))
    return {
      id: "caneta-ingestao",
      screen: "seringa",
      tone: "info",
      title: "Enjoo e pouco apetite",
      body: canSuggestWater(state.profile!)
        ? "Enjoo e pouca comida: refeições pequenas, proteína e água ajudam; se continuar, fale com quem prescreveu."
        : "Enjoo e pouca comida: refeições pequenas com proteína ajudam; se continuar, fale com quem prescreveu.",
      action,
    };
  return {
    id: "caneta-ingestao",
    screen: "seringa",
    tone: "info",
    title: INTAKE_CHIPS[alert.kind],
    brief: alert.title,
    body: canSuggestWater(state.profile!) ? bodies.water : bodies.dry,
    action,
  };
}

// ---------- Seleção ----------

/** Candidatos na ordem de prioridade (todas as telas); vazio para perfis calmos ou sem perfil. */
function candidates(state: AppState, today: string): Signal[] {
  const profile = state.profile;
  if (!profile || isCalmOn(profile, today)) return [];
  const days = readings(state, today);
  return [
    loggingGap(state, today),
    lowWater(state, today),
    loggingStreak(state, today),
    energyPattern(state, today, days),
    proteinPattern(state, today, days),
    restPattern(state, today),
    weightTrend(state, today),
    penIntake(state, today),
  ].filter((signal): signal is Signal => signal !== null);
}

/** Dispensado há menos de 3 dias (o dia da dispensa conta como o 1º). */
export function isCoolingDown(
  dismissals: Readonly<Record<string, string>>,
  id: string,
  today: string,
): boolean {
  const since = dismissals[id];
  return since !== undefined && daysBetween(since, today) < SIGNAL_COOLDOWN_DAYS;
}

/**
 * Sinais ativos: com `screen`, no máximo um (o primeiro na prioridade que não está em pausa);
 * sem `screen`, um por tela, na ordem de SIGNAL_SCREENS.
 */
export function signals(state: AppState, today: string, screen?: SignalScreen): Signal[] {
  const dismissals = state.signalDismissals ?? {};
  const active = candidates(state, today).filter((s) => !isCoolingDown(dismissals, s.id, today));
  const screens = screen ? [screen] : SIGNAL_SCREENS;
  return screens.flatMap((name) => active.find((s) => s.screen === name) ?? []);
}

/** O principal da tela: o sinal ativo de maior prioridade, ou null. */
export function signalFor(state: AppState, today: string, screen: SignalScreen): Signal | null {
  return signals(state, today, screen)[0] ?? null;
}

/** Todos os sinais ativos da tela, na ordem de prioridade: a linha de chips (e os chips do Resumo). */
export function activeSignals(state: AppState, today: string, screen: SignalScreen): Signal[] {
  const dismissals = state.signalDismissals ?? {};
  return candidates(state, today).filter(
    (s) => s.screen === screen && !isCoolingDown(dismissals, s.id, today),
  );
}

/**
 * Os padrões observados em palavras (`brief`, ou o título; sem números de corpo ou kcal, inclusive
 * os dispensados: são fatos) para o contexto da IA e o recado do dia. Vazio para perfis calmos.
 */
export function signalBriefs(state: AppState, today: string): string[] {
  return candidates(state, today).map((s) => s.brief ?? s.title);
}

/**
 * Dispensa um sinal (ou o comentário do dia) por SIGNAL_COOLDOWN_DAYS: grava a data e tira as
 * dispensas já vencidas, para o registro não crescer.
 */
export function dismissSignal(state: AppState, id: string, today: string): AppState {
  const kept = Object.entries(state.signalDismissals ?? {}).filter(
    ([key, date]) => key !== id && isCoolingDown({ [key]: date }, key, today),
  );
  return {
    ...state,
    signalDismissals: Object.fromEntries([...kept.slice(-(MAX_DISMISSALS - 1)), [id, today]]),
  };
}
