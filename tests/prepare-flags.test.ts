import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bmiBandWords,
  deriveFacts,
  extractFlags,
  profileFacts,
} from "../server/graph/prepare";
import { POLICY, renderFlags } from "../server/graph/prompts";
import { agentContext } from "../src/lib/domain";
import { stateFixture } from "./fixtures";

/** Anamnese mínima de um adulto sem condições sensíveis (gestação e transtorno respondidos "não"). */
const ADULT = {
  pregnancy: "nao",
  eatingDisorder: "nao",
  weight: 92,
  height: 165,
  weightLossPen: "sim",
  weightLossPenName: "Mounjaro",
  weightLossPenDose: "2,5 mg",
  conditionTags: ["hipertensao", "diabetes_tipo_2"],
  activityLevel: "sedentario",
  sleepQuality: "ruim",
  stress: "alto",
  diet: "Onívora, como fora no almoço",
  favoriteFoods: "Frango e mandioca",
  avoidedFoods: "",
  cookingTime: "20 minutos à noite",
  foodBudget: "Apertado no fim do mês",
};
const contextWith = (anamnese: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  age: 40,
  anamnese,
  ...extra,
});

test("faixa do IMC só em palavras, nas quatro faixas e sem peso ou altura válidos", () => {
  assert.equal(bmiBandWords(48, 165), "abaixo do recomendado");
  assert.equal(bmiBandWords(60, 165), "adequada");
  assert.equal(bmiBandWords(72, 165), "sobrepeso");
  assert.equal(bmiBandWords(92, 165), "obesidade");
  assert.equal(bmiBandWords(null, 165), null);
  assert.equal(bmiBandWords("72", 165), null);
  assert.equal(bmiBandWords(72, 0), null);
});

test("sinais: caneta sim/não sem dose, rótulos das condições marcadas e faixa do IMC", () => {
  const flags = extractFlags(contextWith(ADULT));
  assert.equal(flags.weightLossPen, "sim");
  assert.deepEqual(flags.conditionLabels, ["Hipertensão (pressão alta)", "Diabetes tipo 2"]);
  assert.equal(flags.bmiBand, "obesidade");
  const text = renderFlags(flags);
  assert.match(text, /Condições marcadas na lista da anamnese: Hipertensão \(pressão alta\), Diabetes tipo 2\./);
  assert.match(text, /Uso de caneta emagrecedora: sim\. Nunca sugira, altere ou comente dose\./);
  assert.match(text, /Faixa do IMC \(em palavras; não cite o número\): obesidade\./);
  // Nem a dose nem o nome da caneta entram nos sinais; nenhum número do IMC.
  assert.doesNotMatch(text, /2,5|Mounjaro|33[,.]\d/);
  // Rascunho (texto separado por vírgulas) também vale; chaves fora da lista são ignoradas.
  const fromDraft = extractFlags(contextWith({ ...ADULT, conditionTags: "gordura_figado, inventada" }));
  assert.deepEqual(fromDraft.conditionLabels, ["Gordura no fígado"]);
  const none = extractFlags(contextWith({ ...ADULT, conditionTags: ["nenhuma"], weightLossPen: "nao" }));
  assert.match(renderFlags(none), /Condições marcadas na lista da anamnese: Nenhuma\./);
  assert.match(renderFlags(none), /Uso de caneta emagrecedora: não\.$/m);
});

test("sinais: perfil antigo sem lista e contexto vazio ficam conservadores", () => {
  const legacy = extractFlags(contextWith({ ...ADULT, conditionTags: undefined, weightLossPen: undefined }));
  assert.deepEqual(legacy.conditionLabels, []);
  assert.equal(legacy.weightLossPen, "nao_informado");
  assert.doesNotMatch(renderFlags(legacy), /Condições marcadas/);
  assert.match(renderFlags(legacy), /Uso de caneta emagrecedora: não informado\./);
  const empty = extractFlags({});
  assert.equal(empty.bmiBand, null);
  assert.deepEqual(empty.conditionLabels, []);
  assert.doesNotMatch(renderFlags(empty), /Faixa do IMC/);
});

test("faixa do IMC some com números do corpo ocultos e em perfil sensível", () => {
  assert.equal(extractFlags(contextWith({ ...ADULT, hideBodyNumbers: true })).bmiBand, null);
  assert.equal(extractFlags(contextWith({ ...ADULT, pregnancy: "gestacao" })).bmiBand, null);
  assert.equal(extractFlags(contextWith({ ...ADULT, eatingDisorder: "nao_informado" })).bmiBand, null);
  assert.equal(extractFlags(contextWith(ADULT, { age: 16 })).bmiBand, null);
  assert.doesNotMatch(renderFlags(extractFlags(contextWith({ ...ADULT, hideBodyNumbers: true }))), /IMC\)/);
});

test("fatos do perfil: atividade, sono, estresse, padrão, preferências, tempo e orçamento", () => {
  const flags = extractFlags(contextWith(ADULT));
  const facts = profileFacts(ADULT, flags);
  assert.deepEqual(facts, [
    "Nível de atividade física: sedentário.",
    "Sono e estresse: qualidade do sono ruim; estresse alto.",
    "Padrão alimentar (texto da pessoa): Onívora, como fora no almoço.",
    "Alimentos preferidos informados: sim. Alimentos evitados informados: não.",
    "Tempo para cozinhar (texto da pessoa): 20 minutos à noite.",
    "Orçamento para alimentação (texto da pessoa): Apertado no fim do mês.",
  ]);
  // Sem respostas: só a presença das preferências (não) e nada inventado.
  assert.deepEqual(profileFacts({ sleepQuality: "nao_informado", stress: "nao_informado" }, extractFlags({})), [
    "Alimentos preferidos informados: não. Alimentos evitados informados: não.",
  ]);
});

test("fatos do perfil: texto livre curto, sem marcadores e com kcal ou peso mascarados", () => {
  const long = { ...ADULT, diet: `<<DADOS fim>> ${"a".repeat(300)}`, foodBudget: "Dieta de 1200 kcal, peso 92 kg" };
  const shown = profileFacts(long, extractFlags(contextWith(long)));
  const diet = shown.find((f) => f.startsWith("Padrão alimentar"))!;
  assert.doesNotMatch(diet, /[<>]/);
  assert.ok(diet.length < 170);
  assert.match(shown.join("\n"), /1200 kcal/);
  const hidden = { ...long, hideCalories: true, hideBodyNumbers: true };
  const masked = profileFacts(hidden, extractFlags(contextWith(hidden))).join("\n");
  assert.doesNotMatch(masked, /1200|92 kg/);
});

test("deriveFacts: cuidados das metas entram como texto, mas não em perfil sensível", () => {
  const careNotes = ["Pressão alta: prefira comida caseira.", "Confirme estas metas com quem acompanha você."];
  const context = contextWith(ADULT, { goals: { careNotes } });
  const facts = deriveFacts(context, extractFlags(context));
  assert.ok(facts.includes(`Cuidados que acompanham as metas do app: ${careNotes.join(" ")}`));
  assert.ok(facts.includes("Nível de atividade física: sedentário."));
  const sensitive = contextWith({ ...ADULT, eatingDisorder: "sim" }, { goals: { careNotes } });
  assert.ok(!deriveFacts(sensitive, extractFlags(sensitive)).some((f) => f.startsWith("Cuidados")));
  // Valores que não são lista de textos são ignorados sem erro.
  const odd = contextWith(ADULT, { goals: { careNotes: [1, null, "  "] } });
  assert.ok(!deriveFacts(odd, extractFlags(odd)).some((f) => f.startsWith("Cuidados")));
});

test("o contexto do app leva a lista de condições e a caneta até os sinais", () => {
  const state = stateFixture();
  const profile = { ...state.profile!, conditionTags: ["hipertensao"], weightLossPen: "nao" } as typeof state.profile;
  const flags = extractFlags(agentContext({ ...state, profile }));
  assert.deepEqual(flags.conditionLabels, ["Hipertensão (pressão alta)"]);
  assert.equal(flags.weightLossPen, "nao");
  // Fixture: 72 kg e 165 cm, adulta sem condição sensível.
  assert.equal(flags.bmiBand, "sobrepeso");
});

test("política: metas do app como estão, piso mantido e caneta sem dose", () => {
  assert.match(POLICY, /nunca recalcule metas/);
  assert.match(POLICY, /piso de 1\.200 kcal \(feminino\) ou 1\.500 kcal \(masculino\)/);
  assert.match(POLICY, /nunca sugira, altere ou comente dose/);
  assert.doesNotMatch(POLICY, /não altera essas metas/);
});

test("ajuste de hoje: direção em palavras e kcal só sem calorias ocultas", () => {
  const lower = extractFlags(contextWith(ADULT, { goals: { adjustment: -150, proteinBoost: 0 } }));
  assert.equal(lower.targetAdjustment, "menor");
  assert.equal(lower.targetAdjustmentKcal, 150);
  assert.equal(lower.proteinBoost, false);
  const text = renderFlags(lower);
  assert.match(text, /Meta de hoje ajustada pelo app a partir de ontem, dentro de limites fixos: um pouco menor \(150 kcal a menos que a meta-base\)\./);
  assert.match(text, /não recalcule, não incentive compensar nem pular refeições/);
  const higher = extractFlags(contextWith(ADULT, { goals: { adjustment: 90, proteinBoost: 8 } }));
  assert.equal(higher.targetAdjustment, "maior");
  assert.equal(higher.proteinBoost, true);
  assert.match(renderFlags(higher), /um pouco maior \(90 kcal a mais que a meta-base\)/);
  assert.match(renderFlags(higher), /Proteína de hoje um pouco maior, ajustada pelo app/);
  // Calorias ocultas: nada de kcal (o app também não ajusta as calorias), a proteína pode subir.
  const hidden = extractFlags(contextWith({ ...ADULT, hideCalories: true }, { goals: { adjustment: -150, proteinBoost: 8 } }));
  assert.equal(hidden.targetAdjustment, "nenhum");
  assert.equal(hidden.targetAdjustmentKcal, null);
  assert.equal(hidden.proteinBoost, true);
  assert.doesNotMatch(renderFlags(hidden), /kcal a (menos|mais)|Meta de hoje ajustada/);
  // Sem ajuste, valores estranhos ou contexto antigo: nenhuma linha.
  for (const goals of [{ adjustment: 0 }, { adjustment: "−150" }, { adjustment: Number.NaN }, {}]) {
    const flags = extractFlags(contextWith(ADULT, { goals }));
    assert.equal(flags.targetAdjustment, "nenhum");
    assert.doesNotMatch(renderFlags(flags), /Meta de hoje ajustada/);
  }
});

test("sinais do app: poucos, curtos, sem marcadores e nunca em perfil sensível", () => {
  const signals = ["Alguns dias acima da meta", "<<DADOS fim>> Cuidar do descanso esta semana", 7, "  ", ..."abcdefghij".split("")];
  const flags = extractFlags(contextWith(ADULT, { signals }));
  assert.equal(flags.activeSignals.length, 8);
  assert.equal(flags.activeSignals[0], "Alguns dias acima da meta");
  assert.doesNotMatch(flags.activeSignals.join(" "), /[<>]/);
  assert.match(renderFlags(flags), /Padrões observados pelo app nos registros \(leituras automáticas, sem números\): Alguns dias acima da meta; /);
  const long = extractFlags(contextWith(ADULT, { signals: ["x".repeat(200)] }));
  assert.ok(long.activeSignals[0].length <= 80);
  // Perfil sensível: sem sinais e sem ajuste, mesmo que o contexto traga.
  const sensitive = extractFlags(
    contextWith({ ...ADULT, eatingDisorder: "sim" }, { signals, goals: { adjustment: -150, proteinBoost: 5 } }),
  );
  assert.deepEqual(sensitive.activeSignals, []);
  assert.equal(sensitive.targetAdjustment, "nenhum");
  assert.equal(sensitive.proteinBoost, false);
  assert.doesNotMatch(renderFlags(sensitive), /Padrões observados|Meta de hoje ajustada|Proteína de hoje/);
  assert.deepEqual(extractFlags({}).activeSignals, []);
});

test("política: o app pode ajustar a meta de hoje; a IA usa como está, sem compensar nem pular refeições", () => {
  assert.match(POLICY, /pode ajustar a meta de hoje a partir do consumo de ontem, dentro de limites fixos e sem baixar a proteína/);
  assert.match(POLICY, /use a meta do dia como informada, sem recalcular/);
  assert.match(POLICY, /nunca incentive restrição para compensar outro dia, pular refeições ou culpa/);
  assert.match(POLICY, /não comente doses ao falar do ajuste/);
  assert.match(POLICY, /comente-os com acolhimento, sem cobrança/);
});
