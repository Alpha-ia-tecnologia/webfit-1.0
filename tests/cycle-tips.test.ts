import { test } from "node:test";
import assert from "node:assert/strict";
import { habitSchema, injectionSchema, type DiaryEntry, type InjectionEntry, type Profile, type Symptom } from "../src/types";
import {
  CYCLE_NOTE,
  CYCLE_PHASES,
  CYCLE_TIPS,
  cycleCard,
  cycleDayLabel,
  cyclePhase,
  habitFromTip,
  PHASE_LABEL,
  PHASE_SUFFIX,
  tipsFor,
  type CycleInput,
  type CyclePhase,
} from "../src/lib/cycle-tips";
import { MEDICATION_PATTERN, SENSITIVE_NUDGE_PATTERN, matchesPattern } from "../src/lib/agent-blocks";
import { allergenIn, allergenTokens } from "../src/lib/allergens";
import { profileFixture } from "./fixtures";

const T = "2026-09-28";
const DOSE_ADVICE = /aument|reduz|ajust|mantenha|dobr|atrasad/i;
let seq = 0;
function app(date: string): InjectionEntry {
  seq += 1;
  return injectionSchema.parse({
    id: `inj-${seq}`,
    userId: "u",
    date,
    time: "08:00",
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
    method: "caneta",
    medication: "Tirzepatida",
    doseMg: 5,
    site: "abdomen",
  });
}
const wellbeing = (date: string, symptoms: Symptom[]): DiaryEntry => ({
  id: `b-${date}`,
  userId: "u",
  date,
  time: "09:00",
  createdAt: "x",
  updatedAt: "x",
  type: "bem_estar",
  title: "Bem-estar",
  description: "",
  rating: 3,
  symptoms,
});
/** Caneta semanal, adulto, sem gestação, transtorno alimentar ou restrição de líquidos; alergia a amendoim. */
const profile = (over: Partial<Profile> = {}): Profile => ({
  ...profileFixture(),
  weightLossPen: "sim",
  weightLossPenName: "Mounjaro",
  weightLossPenDose: "5 mg",
  weightLossPenPerMonth: 4,
  ...over,
});
const input = (
  dates: string[],
  over: Partial<Profile> = {},
  diary: DiaryEntry[] = [],
): CycleInput => ({ profile: profile(over), injections: dates.map(app), diary, today: T });
const keys = (phase: CyclePhase, value: CycleInput) => tipsFor(phase, value).map((t) => t.key);

test("cyclePhase: 0–2, 3–5 e 6–7 dias depois da aplicação; fora disso, nenhuma fase", () => {
  assert.deepEqual([0, 1, 2].map(cyclePhase), ["d0_2", "d0_2", "d0_2"]);
  assert.deepEqual([3, 5].map(cyclePhase), ["d3_5", "d3_5"]);
  assert.deepEqual([6, 7].map(cyclePhase), ["d6_7", "d6_7"]);
  assert.deepEqual([8, -1, 1.5].map(cyclePhase), [null, null, null]);
});

test("cartão do ciclo: fase atual, dia, dica principal e as três fases com até 3 dicas", () => {
  const card = cycleCard(input(["2026-09-27"]));
  assert.ok(card);
  assert.equal(card.phase, "d0_2");
  assert.equal(card.label, "Dias 0 a 2");
  assert.equal(card.dayLabel, "1 dia depois da aplicação");
  assert.equal(card.top?.key, "comer_devagar");
  assert.deepEqual(
    card.phases.map((p) => [p.phase, p.tips.map((t) => t.key)]),
    [
      ["d0_2", ["comer_devagar", "porcoes_menores", "preparacoes_leves"]],
      ["d3_5", ["refeicoes_regulares", "frutas_legumes", "proteina_refeicoes"]],
      ["d6_7", ["refeicoes_regulares", "planejar_refeicoes", "lanche_pratico"]],
    ],
  );
  assert.deepEqual(card.phases.map((p) => p.isCurrent), [true, false, false]);
  assert.deepEqual(card.phases.map((p) => p.label), ["Dias 0 a 2", "Dias 3 a 5", "Dias 6 e 7"]);
  assert.equal(card.note, CYCLE_NOTE);
});

test("cartão do ciclo: dia da aplicação, outras fases, aplicação antiga e aplicação futura", () => {
  assert.equal(cycleCard(input(["2026-09-28"]))?.dayLabel, "Dia da aplicação");
  assert.equal(cycleCard(input(["2026-09-25"]))?.phase, "d3_5");
  assert.equal(cycleCard(input(["2026-09-22"]))?.phase, "d6_7");
  const seventh = cycleCard(input(["2026-09-21"]));
  assert.equal(seventh?.phase, "d6_7");
  assert.equal(seventh?.dayLabel, "7 dias depois da aplicação");
  assert.equal(cycleCard(input(["2026-09-20"])), null);
  assert.equal(cycleCard(input(["2026-09-29"])), null, "só aplicação futura");
  assert.equal(cycleCard(input(["2026-09-21", "2026-09-29"]))?.phase, "d6_7");
  assert.equal(cycleCard(input([])), null);
});

test("ranking: efeitos registrados na mesma fase sobem a dica que fala deles", () => {
  const diary = [wellbeing("2026-09-15", [{ key: "cansaco", intensity: 2 }]), wellbeing("2026-09-22", [{ key: "cansaco", intensity: 1 }])];
  const value = input(["2026-09-14", "2026-09-21", "2026-09-27"], {}, diary);
  assert.deepEqual(keys("d0_2", value), ["descanso", "comer_devagar", "porcoes_menores"]);
  assert.equal(cycleCard(value)?.top?.key, "descanso");
  // Registro de mais de 28 dias atrás não conta.
  const old = input(["2026-08-24", "2026-09-27"], {}, [wellbeing("2026-08-25", [{ key: "cansaco", intensity: 3 }])]);
  assert.deepEqual(keys("d0_2", old), ["comer_devagar", "porcoes_menores", "preparacoes_leves"]);
});

test("transtorno alimentar: só dicas calmas; com restrição de líquidos, sem hidratação", () => {
  const eating = input(["2026-09-27"], { eatingDisorder: "sim" });
  assert.deepEqual(keys("d0_2", eating), ["goles_agua", "descanso"]);
  assert.deepEqual(keys("d3_5", eating), ["refeicoes_regulares", "frutas_legumes", "goles_agua"]);
  assert.deepEqual(keys("d0_2", input(["2026-09-27"], { eatingDisorder: "sim", fluidRestriction: "sim" })), ["descanso"]);
  assert.deepEqual(keys("d0_2", input(["2026-09-27"], { eatingDisorder: "sim", fluidRestriction: "nao_sei" })), ["descanso"]);
  assert.deepEqual(keys("d0_2", input(["2026-09-27"], { eatingDisorder: "nao_informado" })), ["goles_agua", "descanso"]);
  assert.equal(cycleCard(eating)?.top?.key, "goles_agua");
});

test("alergia declarada tira a dica que cita o alimento", () => {
  const value = input(["2026-09-27"], { allergyDetails: "frutas" });
  assert.deepEqual(keys("d3_5", value), ["refeicoes_regulares", "proteina_refeicoes", "caminhada_leve"]);
});

test("nada aparece em gestação, amamentação, sem resposta, sem caneta, para menores ou fora da aplicação semanal", () => {
  const recent = ["2026-09-27"];
  for (const pregnancy of ["gestacao", "amamentacao", "nao_informado"] as const)
    assert.equal(cycleCard(input(recent, { pregnancy })), null, pregnancy);
  for (const weightLossPen of ["nao", "nao_informado"] as const)
    assert.equal(cycleCard(input(recent, { weightLossPen })), null, weightLossPen);
  assert.equal(cycleCard(input(recent, { birthDate: "2010-01-01" })), null);
  for (const weightLossPenPerMonth of [30, 2, null])
    assert.equal(cycleCard(input(recent, { weightLossPenPerMonth })), null, String(weightLossPenPerMonth));
});

test("habitFromTip cria o combinado da dica; todo combinado passa no esquema com título curto", () => {
  const tip = CYCLE_TIPS.find((t) => t.key === "comer_devagar")!;
  assert.deepEqual(habitFromTip(tip, "id1", T), {
    id: "id1",
    title: "Comer devagar no jantar",
    timeOfDay: "19:30",
    createdDate: T,
    completedDates: [],
  });
  for (const t of CYCLE_TIPS) {
    assert.ok(habitSchema.safeParse(habitFromTip(t, `id-${t.key}`, T)).success, t.key);
    assert.ok(t.combinado.title.length <= 60, t.key);
  }
  assert.equal(CYCLE_TIPS.length, 13);
  assert.equal(new Set(CYCLE_TIPS.map((t) => t.key)).size, 13);
});

test("toda dica tem fase e toda fase tem ao menos uma dica calma sem hidratação", () => {
  for (const tip of CYCLE_TIPS) assert.ok(tip.phases.length >= 1, tip.key);
  for (const phase of CYCLE_PHASES)
    assert.ok(
      CYCLE_TIPS.some((t) => t.phases.includes(phase) && t.isCalmSafe && !t.isHydration),
      phase,
    );
});

test("varredura de segurança: dicas e combinados sem medicamento, número, dose ou alergênico comum", () => {
  const allergens = allergenTokens("leite, ovo, amendoim, glúten, soja, frutos do mar, peixe");
  const texts = CYCLE_TIPS.flatMap((t) => [t.text, t.combinado.title]);
  for (const text of texts) {
    assert.equal(matchesPattern(text, MEDICATION_PATTERN), false, text);
    assert.doesNotMatch(text, /\d/, text);
    assert.doesNotMatch(text, /aument|reduz|ajust|mantenha|dobr|atrasad|dose|aplica/i, text);
    assert.equal(allergenIn(text, allergens, "food"), null, text);
  }
  for (const tip of CYCLE_TIPS.filter((t) => t.isCalmSafe))
    for (const text of [tip.text, tip.combinado.title])
      assert.equal(matchesPattern(text, SENSITIVE_NUDGE_PATTERN), false, text);
  const labels = [...Object.values(PHASE_LABEL), PHASE_SUFFIX, CYCLE_NOTE, ...[0, 1, 2, 3, 4, 5, 6, 7].map(cycleDayLabel)];
  for (const text of labels) {
    assert.doesNotMatch(text, DOSE_ADVICE, text);
    assert.doesNotMatch(text, /\bdoses?\b|\bmg\b/i, text);
  }
});
