import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustmentChipText,
  DAILY_COMMENT_KEY,
  dayInsight,
  energyRing,
  insightTitle,
  INTAKE_CHIPS,
  INTAKE_PROMPTS,
  MOOD_LABELS,
  periodLabel,
  proteinChipText,
  signalChip,
  TITLE_TIERS,
  titleTier,
  type DayInsightInput,
  type InsightSignal,
} from "../src/lib/day";
import { profileFixture } from "./fixtures";
import type { HabitItem, PantryItem } from "../src/types";

const DATE = "2026-09-24";
function input(over: Partial<DayInsightInput> = {}): DayInsightInput {
  return {
    profile: { ...profileFixture(), wakeTime: "07:00", sleepTime: "23:00" },
    totals: { water: 1750, protein: 82 },
    goals: { water: 2500, protein: 115 },
    habits: [],
    meals: [
      { title: "Café da manhã", categoryTag: "Café da manhã", time: "08:10" },
      { title: "Almoço", categoryTag: "Almoço", time: "12:30" },
    ],
    pantry: [],
    date: DATE,
    time: "15:00",
    ...over,
  };
}
const habit = (over: Partial<HabitItem>): HabitItem => ({
  id: "h1",
  title: "Chá calmante e higiene do sono",
  timeOfDay: "21:30",
  createdDate: DATE,
  completedDates: [],
  ...over,
});
const noKcal = (text: string) => assert.doesNotMatch(text, /kcal|caloria/i);

test("anel de energia mostra o restante e fica neutro ao atingir a meta", () => {
  assert.deepEqual(energyRing(1210, 1645), { percent: 74, remaining: 435, reached: false });
  assert.deepEqual(energyRing(1700, 1645), { percent: 100, remaining: 0, reached: true });
  assert.equal(energyRing(900, null), null);
});

test("rostos de bem-estar têm cinco rótulos em ordem", () => {
  assert.deepEqual(MOOD_LABELS, ["Muito mal", "Mal", "Regular", "Bem", "Muito bem"]);
});

test("próximo passo: refeição principal ainda não registrada no horário dela", () => {
  const insight = dayInsight(input({ meals: [], time: "13:10" }));
  assert.equal(insight.action?.kind, "meal");
  assert.equal(insight.action?.label, "Registrar almoço");
  assert.ok(insight.headline.split(/\s+/).length <= 7);
});

test("próximo passo: água atrasada em relação ao horário acordado", () => {
  const insight = dayInsight(input({ totals: { ...input().totals, water: 500 }, time: "15:00" }));
  assert.equal(insight.domain, "water");
  assert.deepEqual(insight.action, { kind: "water", ml: 250, label: "Registrar um copo" });
  assert.ok(insight.chips.includes("faltam 2.000 ml"));
});

test("próximo passo: sem lembrete de água com restrição hídrica", () => {
  const insight = dayInsight(
    input({
      profile: { ...input().profile, fluidRestriction: "sim" },
      totals: { ...input().totals, water: 0 },
    }),
  );
  assert.notEqual(insight.domain, "water");
  assert.ok(!insight.chips.some((c) => c.includes("ml")));
});

test("próximo passo: combinado vencido vira ação de marcar como feito", () => {
  const insight = dayInsight(
    input({ habits: [habit({ id: "cam", title: "Caminhada leve 20 min", timeOfDay: "14:30" })] }),
  );
  assert.deepEqual(insight.action, { kind: "habit", habitId: "cam", label: "Marcar como feito" });
});

test("próximo passo: proteína só à noite e nunca para perfis sensíveis", () => {
  const evening = input({ time: "19:00", meals: input().meals });
  const insight = dayInsight(evening);
  assert.equal(insight.headline, "Faltam 33 g de proteína");
  // "Prefiro não informar" também é tratado com cautela, como nas metas (goalsFor).
  for (const sensitive of [
    { eatingDisorder: "sim" as const },
    { eatingDisorder: "nao_informado" as const },
    { pregnancy: "gestacao" as const },
    { pregnancy: "nao_informado" as const },
  ]) {
    const safe = dayInsight({ ...evening, profile: { ...evening.profile, ...sensitive } });
    assert.doesNotMatch(safe.headline, /proteína/);
  }
});

const PANTRY: PantryItem[] = [
  { id: "p1", name: "Espinafre", quantity: 1, unit: "pacote", location: "geladeira", expiresOn: "2026-09-26", notes: "", source: "manual", updatedAt: "2026-09-20T10:00:00.000Z" },
  { id: "p2", name: "Iogurte", quantity: 1, unit: "un", location: "geladeira", expiresOn: "2026-09-23", notes: "", source: "manual", updatedAt: "2026-09-20T10:00:00.000Z" },
];

test("Resumo: até 3 chips de contexto com tipo; combinado longo vira a 1ª palavra e o título inteiro fica em full", () => {
  const insight = dayInsight(input({ habits: [habit({})], pantry: PANTRY }));
  assert.equal(insight.source, "insight");
  assert.equal(insight.sheet, undefined);
  assert.deepEqual(insight.chipItems, [
    { kind: "water", text: "faltam 750 ml", full: "faltam 750 ml" },
    { kind: "habit", text: "chá às 21:30", full: "Chá calmante e higiene do sono às 21:30" },
    { kind: "pantry", text: "Espinafre vence em 2 dias", full: "Espinafre vence em 2 dias" },
  ]);
  assert.deepEqual(insight.chips, ["faltam 750 ml", "chá às 21:30", "Espinafre vence em 2 dias"]);
  // Com a água em dia, o vencimento da despensa sobe para o segundo lugar.
  const watered = dayInsight(input({ habits: [habit({})], pantry: PANTRY, totals: { water: 2500, protein: 82 } }));
  assert.deepEqual(watered.chips, ["chá às 21:30", "Espinafre vence em 2 dias"]);
  assert.equal(watered.chipItems[1]!.kind, "pantry");
  // Títulos curtos entram inteiros.
  const short = dayInsight(input({ habits: [habit({ title: "Beber água", timeOfDay: "20:00" })] }));
  assert.ok(short.chips.includes("beber água às 20:00"));
});

const COMMENT = { headline: "Inclua uma fruta e proteína no lanche da tarde.", time: "07:10" };
const WATER_SIGNAL: InsightSignal = {
  id: "agua-baixa",
  tone: "info",
  title: "Água abaixo",
  body: "Em 3 dos últimos 5 dias a água ficou abaixo do combinado; uma garrafa à vista ajuda.",
  action: { label: "Lembrar da água", prompt: "Como posso lembrar de beber água ao longo do dia?" },
};
const STREAK_SIGNAL: InsightSignal = {
  id: "sequencia-boa",
  tone: "positive",
  title: "5 dias de registros",
  body: "Refeição registrada em cada um dos últimos 5 dias: constância é o que mais ajuda.",
};

test("Resumo: o recado do dia é o título, com o kicker do agente; a ação segue o passo na hora ou abre a conversa", () => {
  // Nada na hora (15:00, almoço registrado): a ação abre a conversa e o título abre a folha do recado.
  const quiet = dayInsight(input({ comment: COMMENT }));
  assert.equal(quiet.source, "comment");
  assert.equal(quiet.headline, COMMENT.headline);
  assert.equal(quiet.kicker, "Seu agente · 07:10");
  assert.deepEqual(quiet.action, { kind: "chat", label: "Abrir a conversa" });
  assert.equal(quiet.sheet?.id, "comment");
  assert.equal(quiet.sheet?.body, COMMENT.headline);
  assert.deepEqual(quiet.sheet?.action, { kind: "chat", label: "Abrir a conversa" });
  assert.deepEqual(quiet.sheet?.dismiss, { key: DAILY_COMMENT_KEY, label: "Dispensar o recado de hoje" });
  assert.equal(quiet.titleChip?.text, "Recado do agente");
  assert.equal(quiet.titleChip?.sheet?.id, "comment");
  // Almoço ainda não registrado na janela dele: o título continua o recado, mas a ação é registrar.
  const lunch = dayInsight(input({ comment: COMMENT, meals: [], time: "13:10" }));
  assert.equal(lunch.headline, COMMENT.headline);
  assert.deepEqual(lunch.action, { kind: "meal", label: "Registrar almoço" });
  assert.match(lunch.prompt, /almoço/);
  // O recado vence o alerta e os sinais no título; eles viram chips com folha.
  const busy = dayInsight(input({ comment: COMMENT, intakeAlert: PROTEIN_ALERT, signals: [WATER_SIGNAL] }));
  assert.equal(busy.source, "comment");
  assert.deepEqual(busy.chips, [INTAKE_CHIPS.protein, "Água abaixo", "faltam 750 ml"]);
  assert.equal(busy.chipItems[0]!.sheet?.id, "alert");
  assert.equal(busy.chipItems[1]!.sheet?.dismiss?.key, "agua-baixa");
});

test("Resumo: o 1º sinal do Hoje vira o título (com dispensar na folha) e os outros viram chips", () => {
  const insight = dayInsight(input({ signals: [WATER_SIGNAL, STREAK_SIGNAL] }));
  assert.equal(insight.source, "signal");
  assert.equal(insight.headline, "Água abaixo");
  assert.equal(insight.kicker, "Resumo · tarde");
  assert.deepEqual(insight.action, { kind: "agent", label: "Lembrar da água" });
  assert.equal(insight.prompt, WATER_SIGNAL.action!.prompt);
  assert.equal(insight.sheet?.body, WATER_SIGNAL.body);
  assert.deepEqual(insight.sheet?.dismiss, { key: "agua-baixa", label: "Dispensar por 3 dias" });
  assert.deepEqual(insight.chips, ["5 dias de registros", "faltam 750 ml"]);
  assert.equal(insight.chipItems[0]!.sheet?.tone, "positive");
  // Um sinal sem ação: a ação do cartão volta a ser a do passo.
  const streak = dayInsight(input({ signals: [STREAK_SIGNAL] }));
  assert.equal(streak.headline, "5 dias de registros");
  assert.deepEqual(streak.action, { kind: "agent", label: "Conversar com o agente" });
  // O sinal em chip, fora do Hoje: mesmo título e mesma folha.
  const chip = signalChip(WATER_SIGNAL);
  assert.equal(chip.kind, "signal");
  assert.equal(chip.text, "Água abaixo");
  assert.deepEqual(chip.sheet?.action, { kind: "agent", label: "Lembrar da água", prompt: WATER_SIGNAL.action!.prompt });
});

test("Resumo: o ajuste da meta vira chips (kcal e proteína) com a folha e 'Como calculamos'; nunca kcal com calorias ocultas", () => {
  const note = "Hoje a meta está um pouco maior porque ontem você comeu menos (147 kcal a mais). Hoje a proteína está um pouco maior para recuperar a de ontem.";
  const up = dayInsight(input({ adjustment: { adjustment: 147, proteinBoost: 9, note } }));
  assert.deepEqual(up.chips, ["↑ +147 kcal hoje", "prot. +9 g", "faltam 750 ml"]);
  assert.equal(up.chipItems[0]!.sheet?.title, "Meta um pouco maior hoje");
  assert.equal(up.chipItems[0]!.sheet?.body, note);
  assert.deepEqual(up.chipItems[0]!.sheet?.action, { kind: "explain", label: "Como calculamos" });
  assert.equal(up.chipItems[1]!.sheet?.title, "Proteína um pouco maior hoje");
  const down = dayInsight(input({ adjustment: { adjustment: -99, proteinBoost: 0, note: "Hoje a meta está um pouco menor para equilibrar ontem (99 kcal a menos)." } }));
  assert.equal(down.chips[0], "↓ −99 kcal hoje");
  assert.equal(down.chipItems[0]!.sheet?.title, "Meta um pouco menor hoje");
  // Calorias ocultas: só a direção em palavras e sem "Como calculamos".
  const hidden = dayInsight(input({ profile: { ...input().profile, hideCalories: true }, adjustment: { adjustment: 147, proteinBoost: 9, note: "Hoje a proteína está um pouco maior para recuperar a de ontem." } }));
  assert.deepEqual(hidden.chips.slice(0, 2), ["Meta um pouco maior", "prot. +9 g"]);
  hidden.chips.forEach(noKcal);
  assert.equal(hidden.chipItems[0]!.sheet?.action, undefined);
  // Sem ajuste, nenhum chip a mais.
  assert.deepEqual(dayInsight(input({ adjustment: { adjustment: 0, proteinBoost: 0, note: null } })).chips, ["faltam 750 ml"]);
});

test("Resumo: no máximo 3 chips, na ordem ajuste, alerta e sinais fora do título, contextos", () => {
  const insight = dayInsight(
    input({
      habits: [habit({})],
      pantry: PANTRY,
      adjustment: { adjustment: 147, proteinBoost: 0, note: "Hoje a meta está um pouco maior porque ontem você comeu menos (147 kcal a mais)." },
      intakeAlert: PROTEIN_ALERT,
      signals: [WATER_SIGNAL],
    }),
  );
  assert.equal(insight.source, "alert");
  assert.equal(insight.chips.length, 3);
  assert.deepEqual(insight.chips, ["↑ +147 kcal hoje", "Água abaixo", "faltam 750 ml"]);
});

test("chip do ajuste: Resumo compacto, Diário com o motivo, outra data e calorias ocultas", () => {
  assert.equal(adjustmentChipText({ adjustment: 147 }, { hideCalories: false, compact: true }), "↑ +147 kcal hoje");
  assert.equal(adjustmentChipText({ adjustment: -99 }, { hideCalories: false, compact: true }), "↓ −99 kcal hoje");
  assert.equal(adjustmentChipText({ adjustment: 147 }, { hideCalories: false }), "↑ +147 kcal · ontem você comeu menos");
  assert.equal(adjustmentChipText({ adjustment: -99 }, { hideCalories: false }), "↓ −99 kcal · para equilibrar ontem");
  assert.equal(adjustmentChipText({ adjustment: 147 }, { hideCalories: false, isToday: false }), "Neste dia +147 kcal");
  assert.equal(adjustmentChipText({ adjustment: -1250 }, { hideCalories: false, isToday: false }), "Neste dia −1.250 kcal");
  assert.equal(adjustmentChipText({ adjustment: 147 }, { hideCalories: true }), "Meta um pouco maior");
  assert.equal(adjustmentChipText({ adjustment: -99 }, { hideCalories: true, isToday: false }), "Meta um pouco menor");
  assert.equal(adjustmentChipText({ adjustment: 0 }, { hideCalories: false }), null);
  assert.equal(proteinChipText(9, true), "prot. +9 g");
  assert.equal(proteinChipText(9), "Proteína +9 g");
  assert.equal(proteinChipText(0), null);
});

test("Resumo: kicker pelo período do dia", () => {
  const kickerAt = (time: string) => dayInsight(input({ time, meals: input().meals })).kicker;
  assert.equal(periodLabel("09:00"), "manhã");
  assert.equal(periodLabel("15:00"), "tarde");
  assert.equal(periodLabel("17:20"), "fim de tarde");
  assert.equal(periodLabel("20:00"), "noite");
  assert.equal(periodLabel("02:00"), "noite");
  assert.equal(kickerAt("17:20"), "Resumo · fim de tarde");
  assert.equal(kickerAt("11:00"), "Resumo · manhã");
});

test("Resumo: proteína com a consequência só antes do jantar e nunca para menores", () => {
  const evening = input({ time: "17:20" });
  const insight = dayInsight(evening);
  assert.equal(insight.followUp, "O jantar resolve.");
  assert.equal(insightTitle(insight), "Faltam 33 g de proteína. O jantar resolve.");
  const afterDinner = dayInsight({
    ...evening,
    meals: [...evening.meals, { title: "Jantar", categoryTag: "Jantar", time: "17:00" }],
  });
  assert.equal(afterDinner.followUp, undefined);
  assert.equal(insightTitle(afterDinner), "Faltam 33 g de proteína");
  const minor = dayInsight({ ...evening, profile: { ...evening.profile, birthDate: "2012-05-10" } });
  assert.equal(minor.followUp, undefined);
  // Fora do caso da proteína não há consequência.
  assert.equal(dayInsight(input()).followUp, undefined);
});

test("próximo passo: nome da despensa com calorias fica oculto quando o perfil esconde calorias", () => {
  const pantry: PantryItem[] = [
    { id: "p1", name: "Barra 200 kcal", quantity: 1, unit: "un", location: "despensa", expiresOn: "2026-09-25", notes: "", source: "manual", updatedAt: "2026-09-20T10:00:00.000Z" },
  ];
  const chipOf = (hideCalories: boolean) =>
    dayInsight(input({ pantry, profile: { ...input().profile, hideCalories } })).chips.find((c) => c.includes(" vence "));
  assert.equal(chipOf(true), "Barra calorias ocultas vence amanhã");
  assert.equal(chipOf(false), "Barra 200 kcal vence amanhã");
});

test("próximo passo nunca menciona calorias", () => {
  for (const time of ["08:30", "13:10", "15:00", "19:00", "22:30"]) {
    const insight = dayInsight(input({ time, meals: [], totals: { ...input().totals, water: 0 } }));
    noKcal(insight.headline);
    insight.chips.forEach(noKcal);
  }
});

test("próximo passo: dia em dia sugere conversar com o agente", () => {
  const insight = dayInsight(
    input({
      time: "11:00",
      totals: { ...input().totals, water: 2500 },
      meals: [{ title: "Café da manhã", categoryTag: "Café da manhã", time: "08:00" }],
    }),
  );
  assert.equal(insight.headline, "Tudo em dia por aqui");
  assert.equal(insight.action?.kind, "agent");
});

const PROTEIN_ALERT = {
  kind: "protein" as const,
  title: "Proteína abaixo do combinado",
  body: "Inclua uma fonte de proteína em cada refeição.",
};

test("alerta da caneta: título do Resumo com a orientação na folha; a ação fica com refeição, água ou combinado na hora", () => {
  const evening = input({ time: "19:00", intakeAlert: PROTEIN_ALERT });
  const insight = dayInsight(evening);
  assert.equal(insight.source, "alert");
  assert.equal(insight.headline, "Proteína abaixo do combinado");
  assert.equal(insight.sheet?.body, PROTEIN_ALERT.body);
  assert.equal(insight.sheet?.dismiss, undefined, "o alerta não se dispensa");
  assert.equal(insight.followUp, undefined);
  assert.equal(insight.domain, "food");
  assert.deepEqual(insight.action, { kind: "agent", label: "Pedir ideias ao agente" });
  assert.doesNotMatch(insight.prompt, /\d|dose/i);
  assert.equal(insight.titleChip?.text, INTAKE_CHIPS.protein);
  assert.ok(!insight.chips.includes(INTAKE_CHIPS.protein), "o alerta no título não repete como chip");
  // Refeição, água e combinado na hora continuam com a ação (o título segue o alerta).
  const lunch = dayInsight(input({ meals: [], time: "13:10", intakeAlert: PROTEIN_ALERT }));
  assert.equal(lunch.headline, PROTEIN_ALERT.title);
  assert.equal(lunch.action?.kind, "meal");
  assert.equal(
    dayInsight(input({ totals: { ...input().totals, water: 500 }, intakeAlert: PROTEIN_ALERT })).action?.kind,
    "water",
  );
  assert.equal(
    dayInsight(
      input({ habits: [habit({ id: "cam", timeOfDay: "14:30" })], intakeAlert: PROTEIN_ALERT }),
    ).action?.kind,
    "habit",
  );
  // Sem alerta, a proteína da noite segue como antes.
  assert.equal(dayInsight({ ...evening, intakeAlert: null }).headline, "Faltam 33 g de proteína");
});

test("perfis calmos nunca recebem alerta, recado nem sinais, mesmo se vierem na entrada", () => {
  const evening = input({ time: "19:00", intakeAlert: PROTEIN_ALERT, comment: COMMENT, signals: [WATER_SIGNAL] });
  for (const calm of [
    { eatingDisorder: "sim" as const },
    { pregnancy: "amamentacao" as const },
    { birthDate: "2012-05-10" },
  ]) {
    const insight = dayInsight({ ...evening, profile: { ...evening.profile, ...calm } });
    assert.equal(insight.source, "insight");
    assert.notEqual(insight.headline, PROTEIN_ALERT.title);
    assert.equal(insight.sheet, undefined);
    assert.equal(insight.titleChip, undefined);
    assert.match(insight.kicker, /^Resumo · /);
    assert.ok(insight.chipItems.every((chip) => !chip.sheet));
  }
});

test("degrau do título do Resumo: cheio até 36 caracteres, 'long' até 60, 'xlong' acima (o recado pode ter 90)", () => {
  assert.equal(titleTier("Hora de um copo d'água"), "base");
  assert.equal(titleTier("Você comeu pouco nos últimos dias"), "base");
  assert.equal(titleTier("x".repeat(TITLE_TIERS.long)), "base");
  assert.equal(titleTier("Inclua uma fruta e proteína no lanche da tarde."), "long");
  assert.equal(titleTier("x".repeat(TITLE_TIERS.xlong)), "long");
  assert.equal(titleTier("x".repeat(TITLE_TIERS.xlong + 1)), "xlong");
  assert.equal(titleTier("x".repeat(90)), "xlong");
});

test("perguntas prontas do alerta da caneta (Hoje e sinal da Seringa): ideias de refeição, sem números nem dose", () => {
  for (const prompt of Object.values(INTAKE_PROMPTS)) {
    assert.doesNotMatch(prompt, /\d|dose|aplica|kcal|caloria/i);
    assert.match(prompt, /dentro da minha dieta/);
  }
});
