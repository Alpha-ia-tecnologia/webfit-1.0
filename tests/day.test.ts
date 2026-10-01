import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayInsight,
  energyRing,
  insightTitle,
  MOOD_LABELS,
  periodLabel,
  type DayInsightInput,
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

test("Resumo: até 2 chips com tipo; combinado longo vira a 1ª palavra e o título inteiro fica em full", () => {
  const pantry: PantryItem[] = [
    { id: "p1", name: "Espinafre", quantity: 1, unit: "pacote", location: "geladeira", expiresOn: "2026-09-26", notes: "", source: "manual", updatedAt: "2026-09-20T10:00:00.000Z" },
    { id: "p2", name: "Iogurte", quantity: 1, unit: "un", location: "geladeira", expiresOn: "2026-09-23", notes: "", source: "manual", updatedAt: "2026-09-20T10:00:00.000Z" },
  ];
  const insight = dayInsight(input({ habits: [habit({})], pantry }));
  assert.deepEqual(insight.chipItems, [
    { kind: "water", text: "faltam 750 ml", full: "faltam 750 ml" },
    { kind: "habit", text: "chá às 21:30", full: "Chá calmante e higiene do sono às 21:30" },
  ]);
  assert.deepEqual(insight.chips, ["faltam 750 ml", "chá às 21:30"]);
  // Com a água em dia, o vencimento da despensa ocupa o segundo lugar.
  const watered = dayInsight(input({ habits: [habit({})], pantry, totals: { water: 2500, protein: 82 } }));
  assert.deepEqual(watered.chips, ["chá às 21:30", "Espinafre vence em 2 dias"]);
  assert.equal(watered.chipItems[1]!.kind, "pantry");
  // Títulos curtos entram inteiros.
  const short = dayInsight(input({ habits: [habit({ title: "Beber água", timeOfDay: "20:00" })] }));
  assert.ok(short.chips.includes("beber água às 20:00"));
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
