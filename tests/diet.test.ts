import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDietPlan,
  dietChips,
  dietHighlights,
  dietProfileSignature,
  isDietPlanStale,
} from "../src/lib/diet";
import { profileSchema, stateSchema, type AgentReply } from "../src/types";
import { profileFixture, stateFixture } from "./fixtures";
import { CHAT_REPLY, DIET_PLAN_V2, DIET_REPLY } from "./structured-fixtures";

const reply: AgentReply = {
  text: "Café da manhã: fruta e pão. Almoço: arroz, feijão e legumes. Jantar: sopa de legumes.",
  meta: {
    specialists: ["nutricionista"],
    reviewed: true,
    revisions: 0,
    urgency: "nenhuma",
    notes: [],
    llmCalls: 2,
  },
};

test("dados antigos carregam sem dieta e o plano salvo sobrevive à serialização", () => {
  const original = stateFixture();
  const { dietPlan, ...legacy } = original;
  assert.equal(stateSchema.parse(legacy).dietPlan, null);
  const plan = createDietPlan(reply, original.profile!);
  const restored = stateSchema.parse(
    JSON.parse(JSON.stringify({ ...original, dietPlan: plan })),
  );
  assert.deepEqual(restored.dietPlan, plan);
  assert.deepEqual(restored.diary, original.diary);
  assert.deepEqual(restored.profile, original.profile);
  assert.equal(isDietPlanStale(plan, restored.profile!), false);
});

test("mudanças alimentares, alergias, metas e medidas invalidam a dieta", () => {
  const profile = profileFixture();
  const plan = createDietPlan(reply, profile);
  for (const changes of [
    { allergyDetails: "Leite" },
    { weight: 76 },
    { goal: "perder" as const },
    { avoidedFoods: "Ovos" },
    { mealRoutine: "Trabalho à noite" },
    { manualCalories: 2000 },
    { pregnancy: "gestacao" as const },
  ])
    assert.equal(isDietPlanStale(plan, { ...profile, ...changes }), true);
});

test("nome e preferências de privacidade não invalidam o conteúdo alimentar", () => {
  const profile = profileFixture();
  const signature = dietProfileSignature(profile);
  assert.equal(
    dietProfileSignature({
      ...profile,
      name: "Outra grafia",
      consentAi: true,
      hideCalories: true,
      remindersEnabled: !profile.remindersEnabled,
      quietStart: "21:00",
    }),
    signature,
  );
  const reordered = Object.fromEntries(
    Object.entries(profile).reverse(),
  ) as typeof profile;
  assert.equal(dietProfileSignature(reordered), signature);
  // O dia da aplicação da caneta não invalida dietas nem receitas salvas.
  assert.equal(
    dietProfileSignature({ ...profile, penWeekday: 3 }),
    dietProfileSignature({ ...profile, penWeekday: null }),
  );
  const { penWeekday: _weekday, ...beforeWeekday } = profile;
  assert.equal(
    dietProfileSignature(beforeWeekday as typeof profile),
    signature,
  );
});

test("migração e nova autorização de IA preservam a assinatura de dietas legadas", () => {
  const { aiConsentVersion: _version, ...legacy } = profileFixture();
  // Uma dieta criada antes do versionamento de consentimento não tinha esse campo na assinatura.
  const legacyPlan = createDietPlan(
    reply,
    legacy as ReturnType<typeof profileFixture>,
  );
  const migrated = profileSchema.parse(legacy);
  assert.equal(migrated.aiConsentVersion, 0);
  assert.equal(isDietPlanStale(legacyPlan, migrated), false);
  const authorized = { ...migrated, consentAi: true, aiConsentVersion: 1 };
  assert.equal(
    dietProfileSignature(authorized),
    dietProfileSignature(migrated),
  );
  assert.equal(isDietPlanStale(legacyPlan, authorized), false);
});

test("não salva resposta sem revisão, de outro especialista ou orientação urgente como dieta", () => {
  const profile = profileFixture();
  assert.throws(() =>
    createDietPlan(
      { ...reply, meta: { ...reply.meta, reviewed: false } },
      profile,
    ),
  );
  assert.throws(() =>
    createDietPlan(
      { ...reply, meta: { ...reply.meta, specialists: ["rotina"] } },
      profile,
    ),
  );
  assert.throws(
    () =>
      createDietPlan(
        {
          ...reply,
          text: "Procure atendimento imediato.",
          meta: { ...reply.meta, urgency: "imediata" },
        },
        profile,
      ),
    /Procure atendimento imediato/,
  );
  assert.throws(() => createDietPlan({ ...reply, text: "" }, profile));
});

test("chips de personalização: objetivo, alergia, tempo e plano profissional", () => {
  const profile = profileFixture();
  assert.deepEqual(dietChips(profile), [
    { kind: "goal", label: "Manter 72 kg" },
    { kind: "allergy", label: "Sem amendoim" },
    { kind: "time", label: "30 min para cozinhar" },
  ]);
  const vegan = profileSchema.parse({
    ...profile,
    goal: "perder",
    targetWeight: 65,
    diet: "Vegana há dois anos",
    allergies: "nao",
    professionalPlan: "Sigo o plano da nutricionista",
  });
  assert.deepEqual(
    dietChips(vegan).map((c) => c.label),
    ["Meta de 65 kg", "Vegana", "30 min para cozinhar", "Segue plano profissional"],
  );
});

test("perfis sensíveis não veem pesos nos chips da dieta", () => {
  for (const change of [
    { eatingDisorder: "sim" },
    { eatingDisorder: "nao_informado" },
    { pregnancy: "gestacao" },
  ]) {
    const profile = profileSchema.parse({
      ...profileFixture(),
      goal: "perder",
      targetWeight: 60,
      ...change,
    });
    const [goal] = dietChips(profile);
    assert.equal(goal.label, "Reduzir o peso");
    assert.doesNotMatch(dietChips(profile).map((c) => c.label).join(" "), /kg/);
  }
});

test("destaques do plano: refeições com horário, sem calorias quando ocultas", () => {
  const text = [
    "## Resumo",
    "Plano simples para o dia, 1800 kcal.",
    "### Café da manhã (07:30)",
    "- Pão integral com ovo",
    "**Almoço às 12h:** arroz, feijão e frango",
    "Lanche da tarde - fruta e iogurte",
    "Jantar às 19h: sopa de legumes com 350 kcal.",
  ].join("\n");
  assert.deepEqual(dietHighlights(text, false), [
    "Café da manhã (07:30)",
    "Almoço às 12h",
    "Lanche da tarde",
    "Jantar às 19h",
  ]);
  const plain = dietHighlights("Siga o plano com calma.\nBeba água, 2000 kcal no dia.", true);
  assert.deepEqual(plain, ["Siga o plano com calma.", "Beba água, calorias ocultas no dia."]);
  assert.ok(dietHighlights(text, true).every((line) => !/kcal/.test(line)));
  const body = "Porções para seus 72 kg.\nBeba água, 2000 kcal no dia.";
  assert.deepEqual(dietHighlights(body, true, 5, true), [
    "Porções para seus número oculto.",
    "Beba água, calorias ocultas no dia.",
  ]);
  assert.deepEqual(dietHighlights(body, false), ["Porções para seus 72 kg.", "Beba água, 2000 kcal no dia."]);
});

test("dieta estruturada: createDietPlan guarda o plano; resposta de chat não vira plano", () => {
  const profile = profileFixture();
  const plan = createDietPlan(DIET_REPLY, profile);
  assert.deepEqual(plan.structured, DIET_PLAN_V2);
  assert.equal(plan.text, DIET_REPLY.text);
  const chat = createDietPlan({ ...CHAT_REPLY, meta: reply.meta }, profile);
  assert.equal("structured" in chat, false);
  // Plano antigo (só texto) não ganha a chave: continua igual na comparação estrita.
  const legacy = createDietPlan(reply, profile);
  assert.equal("structured" in legacy, false);
  assert.deepStrictEqual(Object.keys(legacy).sort(), [
    "createdAt",
    "id",
    "meta",
    "profileSignature",
    "text",
  ]);
});

test("dieta estruturada: sobrevive à serialização e plano inválido é descartado", () => {
  const original = stateFixture();
  const plan = createDietPlan(DIET_REPLY, original.profile!);
  const restored = stateSchema.parse(
    JSON.parse(JSON.stringify({ ...original, dietPlan: plan })),
  );
  assert.deepStrictEqual(restored.dietPlan, plan);
  const broken = stateSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...original,
        dietPlan: { ...plan, structured: { refeicoes: "x" } },
      }),
    ),
  );
  assert.equal(broken.dietPlan?.structured, undefined);
  assert.equal(broken.dietPlan?.text, plan.text);
});

test("destaques: títulos de refeição do plano estruturado; texto antigo segue a heurística", () => {
  assert.deepEqual(dietHighlights(DIET_REPLY.text, false), [
    "Café da manhã · 07:30",
    "Almoço · 12:00",
    "Lanche da tarde · 16:00",
    "Jantar · 19:30",
  ]);
  // Plano em texto com a seção "Seu dia de alimentação" só em listas: heurística de sempre.
  const legacy = [
    "## Seu dia de alimentação",
    "- Café da manhã, 8h: pão e fruta.",
    "- Almoço, 12h: arroz e feijão.",
    "- Café com leite à tarde.",
  ].join("\n");
  assert.deepEqual(dietHighlights(legacy, false), [
    "Café da manhã, 8h",
    "Almoço, 12h",
    "Café com leite à tarde",
  ]);
});

test("ocultar números do corpo: não invalida a dieta e tira o peso dos chips (também de menores)", () => {
  const profile = profileFixture();
  const { hideBodyNumbers: _hidden, ...withoutKey } = profile;
  const signature = dietProfileSignature(profile);
  assert.equal(dietProfileSignature({ ...profile, hideBodyNumbers: true }), signature);
  assert.equal(dietProfileSignature({ ...profile, hideBodyNumbers: false }), signature);
  assert.equal(dietProfileSignature(withoutKey as typeof profile), signature);
  const T = "2026-09-28";
  assert.equal(dietChips({ ...profile, goal: "manter", hideBodyNumbers: true }, T)[0]!.label, "Manter o peso");
  const minor = { ...profile, birthDate: "2012-01-01", goal: "perder" as const, targetWeight: 50 };
  assert.ok(!dietChips(minor, T).some((c) => /kg/.test(c.label)));
  assert.equal(dietChips(profile, T)[0]!.label, "Manter 72 kg");
});

test("perfil antigo sem condições estruturadas mantém a assinatura ao ganhar a lista vazia", () => {
  const { conditionTags: _tags, ...legacy } = profileFixture();
  const legacyProfile = legacy as ReturnType<typeof profileFixture>;
  const legacyPlan = createDietPlan(reply, legacyProfile);
  const parsed = profileSchema.parse(legacy);
  assert.deepEqual(parsed.conditionTags, []);
  assert.equal(dietProfileSignature(parsed), dietProfileSignature(legacyProfile));
  assert.equal(isDietPlanStale(legacyPlan, parsed), false);
  // O estado inteiro carregado de novo também não invalida a dieta salva.
  const loaded = stateSchema.parse({ ...stateFixture(), profile: legacy });
  assert.equal(isDietPlanStale(legacyPlan, loaded.profile!), false);
  // Marcar condições de verdade muda a assinatura (a dieta precisa ser revista).
  assert.equal(isDietPlanStale(legacyPlan, { ...parsed, conditionTags: ["hipertensao"] }), true);
  assert.notEqual(
    dietProfileSignature({ ...parsed, conditionTags: ["hipertensao"] }),
    dietProfileSignature({ ...parsed, conditionTags: ["diabetes_tipo_2"] }),
  );
});
