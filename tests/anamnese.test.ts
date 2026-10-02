import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONDITION_CHOICES,
  CONDITION_COPY,
  choicesToTags,
  isOtherConditionOn,
  profileToDraft,
  tagsToChoices,
  withConditionIssues,
  conditionDetailsCopy,
  showsConditionDetails,
} from "../src/components/anamnese/condition-choice";
import {
  completion,
  essentialFields,
  isAnswered,
  isRequiredByAnswer,
  MILESTONE_MESSAGES,
  pendingMessage,
  reachedMilestone,
  stepMinutes,
  stepProgress,
} from "../src/components/anamnese/progress";
import { ECHO_KEYS, echoFor } from "../src/components/anamnese/echoes";
import { questionnaire } from "../src/data/questionnaire";
import type { ChoiceConfig } from "../src/components/anamnese/inputs";
import {
  bmiOf,
  choiceLayout,
  choiceSections,
  composeChoices,
  filterChoices,
  splitChoices,
  daysInMonth,
  joinDate,
  joinTime,
  minuteOptions,
  offsetFromValue,
  parseChoices,
  rulerTicks,
  snapToStep,
  toggleChoice,
  valueFromOffset,
} from "../src/components/anamnese/inputs";
import {
  CHOICE_FIELDS,
  penDoseConfig,
  RULER_FIELDS,
  SELECT_HINTS,
} from "../src/data/anamneseOptions";
import { emptyDraft } from "../src/lib/domain";
import { profileFixture } from "./fixtures";
import { profileSchema, type Draft } from "../src/types";

test("pontuação do perfil conta só respostas essenciais e varia com a alergia", () => {
  const empty = emptyDraft() as Draft;
  const start = completion(empty);
  // O rascunho vazio já traz horários e intervalo padrão: poucos pontos, nunca zero.
  assert.ok(start.answered > 0 && start.answered <= 8, String(start.answered));
  assert.ok(start.percent < 20, String(start.percent));
  // Com lembretes desligados, silêncio e intervalo da água saem das essenciais (51 → 48).
  assert.ok(start.total >= 45 && start.total <= 70, String(start.total));
  const keys = essentialFields(empty).map((f) => f.key);
  assert.ok(keys.includes("consentLocal"));
  assert.ok(!keys.includes("allergyDetails"));
  assert.ok(!keys.includes("targetWeight"));
  assert.ok(
    essentialFields({ ...empty, allergies: "sim" }).some(
      (f) => f.key === "allergyDetails",
    ),
  );
  const full = completion({
    ...(profileFixture() as unknown as Draft),
    conditionTags: "nenhuma",
  });
  assert.equal(full.percent, 100);
  assert.equal(full.answered, full.total);
});

test("marcos são só 50% e 100% e são detectados apenas ao cruzar para cima", () => {
  assert.equal(reachedMilestone(20, 30), null);
  assert.equal(reachedMilestone(20, 80), 50);
  assert.equal(reachedMilestone(50, 50), null);
  assert.equal(reachedMilestone(99, 100), 100);
  assert.equal(reachedMilestone(40, 100), 100);
  assert.equal(reachedMilestone(60, 40), null);
  assert.ok(!/ponto/i.test(Object.values(MILESTONE_MESSAGES).join(" ")));
});

test("progresso da etapa conta as respostas essenciais visíveis e o tempo segue as perguntas", () => {
  const empty = emptyDraft() as Draft;
  const health = questionnaire.find((s) =>
    s.fields.some((f) => f.key === "weightLossPen"),
  )!.fields;
  const before = stepProgress(empty, health);
  assert.equal(before.answered, 0);
  // A caneta abre três perguntas essenciais a mais.
  const withPen = stepProgress({ ...empty, weightLossPen: "sim" }, health);
  assert.equal(withPen.total, before.total + 3);
  assert.equal(withPen.answered, 1);
  const full = profileFixture() as unknown as Draft;
  const done = stepProgress(full, health);
  assert.equal(done.answered, done.total);
  // A triagem foi para "Cuidados importantes": o histórico tem 5 perguntas visíveis.
  assert.ok(stepMinutes(empty, health) >= 1);
  assert.equal(stepMinutes(empty, []), 1);
  assert.ok(
    stepMinutes({ ...empty, weightLossPen: "sim" }, health) >=
      stepMinutes(empty, health),
  );
  for (const step of questionnaire)
    assert.ok(
      step.summary.split(/\s+/).length <= 12,
      `resumo curto: ${step.title}`,
    );
});

test("ecos acolhedores seguem as respostas e poupam perfis sensíveis de metas de peso", () => {
  const base = {
    ...(emptyDraft() as Draft),
    eatingDisorder: "nao",
    pregnancy: "nao",
  };
  assert.equal(echoFor("allergyDetails", base), null);
  assert.equal(
    echoFor("allergyDetails", { ...base, allergyDetails: "Amendoim" }),
    "O agente vai deixar amendoim fora das sugestões.",
  );
  assert.equal(
    echoFor("allergyDetails", {
      ...base,
      allergyDetails: "Ovo, Amendoim, camarão",
    }),
    "O agente vai deixar ovo, amendoim e camarão fora das sugestões.",
  );
  assert.equal(
    echoFor("allergyDetails", { ...base, allergyDetails: "Prefiro não detalhar" }),
    null,
  );
  assert.match(
    echoFor("allergyDetails", {
      ...base,
      allergyDetails:
        "Leite e derivados, Glúten ou trigo, Castanhas e nozes, Frutos do mar",
    })!,
    /suas alergias/,
  );
  assert.match(echoFor("goal", { ...base, goal: "perder" })!, /gradual/);
  // Perfil sensível: sem eco de mudança de peso, mas "organizar" continua.
  const sensitive = { ...base, eatingDisorder: "sim" };
  assert.equal(echoFor("goal", { ...sensitive, goal: "perder" }), null);
  assert.equal(echoFor("goal", { ...sensitive, goal: "manter" }), null);
  assert.ok(echoFor("goal", { ...sensitive, goal: "organizar" }));
  assert.ok(echoFor("eatingDisorder", sensitive));
  assert.equal(echoFor("eatingDisorder", base), null);
  assert.ok(echoFor("pregnancy", { ...base, pregnancy: "gestacao" }));
  assert.ok(echoFor("weightLossPen", { ...base, weightLossPen: "sim" }));
  assert.match(
    echoFor("diet", { ...base, diet: "Vegetariana" })!,
    /vegetarianas/,
  );
  assert.equal(echoFor("diet", { ...base, diet: "Low carb" }), null);
  assert.ok(echoFor("hideCalories", { ...base, hideCalories: true }));
  assert.equal(echoFor("hideCalories", { ...base, hideCalories: false }), null);
  assert.equal(echoFor("name", base), null);
  // Nenhum eco cita números de calorias, dose ou peso.
  for (const key of ECHO_KEYS)
    for (const value of ["sim", "nao_informado", "gestacao", "perder", true])
      assert.ok(
        !/\d|kcal/i.test(echoFor(key, { ...base, [key]: value }) ?? ""),
        key,
      );
});

test("pílulas: excludentes no topo, 8 visíveis, marcadas nunca escondidas e busca sem acento", () => {
  const config = CHOICE_FIELDS.conditions;
  const empty = splitChoices(config, []);
  assert.deepEqual(
    empty.exclusive.map((o) => o.value),
    ["Nenhuma", "Prefiro não informar"],
  );
  assert.equal(empty.visible.length, 8);
  assert.equal(empty.hidden.length, config.options.length - 2 - 8);
  // Uma opção marcada além das 8 primeiras continua à vista.
  const withHidden = splitChoices(config, ["Anemia"]);
  assert.ok(withHidden.visible.some((o) => o.value === "Anemia"));
  assert.ok(!withHidden.hidden.some((o) => o.value === "Anemia"));
  assert.deepEqual(
    filterChoices(config.options, "tireo").map((o) => o.value),
    ["Hipotireoidismo", "Hipertireoidismo"],
  );
  assert.equal(filterChoices(config.options, "  ").length, config.options.length);
  // "Prefiro não informar" também é excludente.
  const [, hypertension] = config.options;
  const privateOption = config.options.find((o) => o.value === "Prefiro não informar")!;
  assert.deepEqual(toggleChoice(["Hipertensão"], privateOption, config), [
    "Prefiro não informar",
  ]);
  assert.deepEqual(toggleChoice(["Prefiro não informar"], hypertension, config), [
    "Hipertensão",
  ]);
  assert.equal(choiceLayout(CHOICE_FIELDS.occupation), "cards");
  assert.equal(choiceLayout(config), "pills");
  // Emoji só em comida, alergias e atividade física.
  const withEmoji = Object.entries(CHOICE_FIELDS)
    .filter(([, c]) => c.options.some((o) => o.emoji))
    .map(([key]) => key)
    .sort();
  assert.deepEqual(withEmoji, [
    "allergyDetails",
    "avoidedFoods",
    "exerciseType",
    "favoriteFoods",
  ]);
});

test("descrições do objetivo são neutras: sem déficit, calorias ou números", () => {
  for (const [value, hint] of Object.entries(SELECT_HINTS.goal))
    assert.ok(!/déficit|kcal|\d/i.test(hint), `${value}: ${hint}`);
});

test("resposta booleana só conta quando verdadeira", () => {
  const draft = { ...(emptyDraft() as Draft), consentLocal: false };
  const consent = essentialFields(draft).find((f) => f.key === "consentLocal")!;
  assert.equal(isAnswered(draft, consent), false);
  assert.equal(isAnswered({ ...draft, consentLocal: true }, consent), true);
});

test("chips: o texto salvo vira seleção mais 'Outros' e volta ao mesmo texto", () => {
  const config = CHOICE_FIELDS.conditions;
  const parsed = parseChoices("Hipertensão, Anemia, Rinite alérgica", config);
  assert.deepEqual(parsed.selected, ["Hipertensão", "Anemia"]);
  assert.equal(parsed.other, "Rinite alérgica");
  assert.equal(
    composeChoices(parsed.selected, parsed.other, config),
    "Hipertensão, Anemia, Rinite alérgica",
  );
  assert.deepEqual(parseChoices("não", CHOICE_FIELDS.alcohol).selected, [
    "Não bebo",
  ]);
  assert.deepEqual(parseChoices("NENHUMA", config).selected, ["Nenhuma"]);
  assert.deepEqual(parseChoices("Amendoim", CHOICE_FIELDS.allergyDetails), {
    selected: ["Amendoim"],
    other: "",
  });
  for (const field of Object.values(CHOICE_FIELDS))
    assert.ok(field.options.length >= 4, "cada campo oferece opções reais");
});

test("chips: opção excludente limpa as demais e escolha única troca a anterior", () => {
  const config = CHOICE_FIELDS.conditions;
  const [none, hypertension] = config.options;
  assert.deepEqual(toggleChoice(["Anemia"], none, config), ["Nenhuma"]);
  assert.deepEqual(toggleChoice(["Nenhuma"], hypertension, config), [
    "Hipertensão",
  ]);
  assert.deepEqual(toggleChoice(["Hipertensão"], hypertension, config), []);
  const single = CHOICE_FIELDS.alcohol;
  assert.deepEqual(toggleChoice(["Não bebo"], single.options[2], single), [
    "1 a 2 vezes por semana",
  ]);
});

test("régua: deslocamento e valor são inversos e respeitam limites e passo", () => {
  const cfg = RULER_FIELDS.weight;
  assert.equal(snapToStep(72.04, cfg), 72);
  assert.equal(snapToStep(500, cfg), 200);
  assert.equal(snapToStep(-5, cfg), 30);
  const px = offsetFromValue(72.5, cfg);
  assert.equal(valueFromOffset(px, cfg), 72.5);
  assert.equal(valueFromOffset(px + 3, cfg), 72.6);
  const ticks = rulerTicks(cfg);
  assert.equal(ticks[0].value, 30);
  assert.equal(ticks.at(-1)?.value, 200);
  assert.equal(ticks[0].major, true);
  assert.equal(ticks[1].major, false);
  assert.equal(bmiOf(72, 165), 26.4);
  assert.equal(bmiOf("", 165), null);
});

test("canetas emagrecedoras: detalhes só contam quando a resposta é Sim e as doses seguem a caneta", () => {
  const empty = emptyDraft() as Draft;
  const keys = (answers: Draft) => essentialFields(answers).map((f) => f.key);
  assert.ok(keys(empty).includes("weightLossPen"));
  assert.ok(!keys(empty).includes("weightLossPenName"));
  const yes = { ...empty, weightLossPen: "sim" };
  for (const key of [
    "weightLossPenName",
    "weightLossPenDose",
    "weightLossPenPerMonth",
  ])
    assert.ok(keys(yes).includes(key), key);
  assert.ok(
    !keys({ ...empty, weightLossPen: "nao" }).includes("weightLossPenDose"),
  );
  const mounjaro = penDoseConfig("Mounjaro (tirzepatida)");
  assert.deepEqual(
    mounjaro.options.slice(0, 2).map((o) => o.value),
    ["2,5 mg", "5 mg"],
  );
  assert.ok(mounjaro.options.some((o) => o.value === "Não sei a dose"));
  assert.ok(penDoseConfig("Caneta manipulada").options.length >= 5);
  assert.deepEqual(
    parseChoices("semaglutida", CHOICE_FIELDS.weightLossPenName).selected,
    ["Ozempic (semaglutida)"],
  );
});

test("datas e horários em rodas respeitam o calendário", () => {
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(joinDate(2023, 2, 31), "2023-02-28");
  assert.equal(joinDate(1990, 6, 15), "1990-06-15");
  assert.equal(joinTime(7, 5), "07:05");
  assert.deepEqual(minuteOptions(15, null), [0, 15, 30, 45]);
  assert.deepEqual(minuteOptions(15, 7), [0, 7, 15, 30, 45]);
});

test("pendingMessage resume as respostas pendentes com até três rótulos", () => {
  assert.equal(pendingMessage([]), "");
  assert.equal(
    pendingMessage(["Como você se chama?"]),
    "Falta 1 resposta: Como você se chama.",
  );
  assert.equal(
    pendingMessage(["Data de nascimento", "Sexo biológico para estimativas"]),
    "Faltam 2 respostas: Data de nascimento e Sexo biológico para estimativas.",
  );
  assert.equal(
    pendingMessage(["A", "B", "C", "D", "E"]),
    "Faltam 5 respostas: A, B e C e mais 2.",
  );
});

test("parseChoices reconhece opções cujo valor contém vírgula e ignora sobras antigas", () => {
  const config: ChoiceConfig = {
    mode: "single",
    options: [
      { value: "Regular, todos os dias", aliases: ["regular"] },
      { value: "Irregular" },
    ],
  };
  assert.deepEqual(parseChoices("Regular, todos os dias", config), {
    selected: ["Regular, todos os dias"],
    other: "",
  });
  assert.deepEqual(
    parseChoices(
      composeChoices(["Regular, todos os dias"], "às vezes à noite", config),
      config,
    ),
    { selected: ["Regular, todos os dias"], other: "às vezes à noite" },
  );
  assert.deepEqual(
    parseChoices("Regular, todos os dias, todos os dias", config),
    { selected: ["Regular, todos os dias"], other: "" },
  );
  assert.deepEqual(parseChoices("Irregular, quase nunca", config), {
    selected: ["Irregular"],
    other: "quase nunca",
  });
});

test("condições: pílulas da lista fechada, “Nenhuma” exclusiva e rascunho em códigos", () => {
  const config = CONDITION_CHOICES;
  assert.equal(config.options.length, 13);
  assert.equal(config.hideOther, true);
  assert.equal(choiceLayout(config), "pills");
  // Todas à vista: sem "Ver mais", em grupos com título; "Nenhuma" fica entre as excludentes.
  const split = splitChoices(config, []);
  assert.deepEqual(split.exclusive.map((o) => o.value), ["Nenhuma"]);
  assert.equal(split.visible.length, 12);
  assert.equal(split.hidden.length, 0);
  const sections = choiceSections(config, split.visible);
  assert.deepEqual(sections.map((s) => [s.title, s.options.length]), [
    ["Com ajustes nas metas", 7],
    ["Com orientação individual", 5],
  ]);
  // Texto das pílulas ↔ códigos do rascunho, na ordem da lista.
  assert.equal(
    tagsToChoices("diabetes_tipo_2,hipertensao"),
    "Hipertensão (pressão alta), Diabetes tipo 2",
  );
  assert.equal(tagsToChoices(["outra"]), "Outra");
  assert.equal(tagsToChoices("asma,"), "");
  assert.equal(
    choicesToTags("Diabetes tipo 2, Hipertensão (pressão alta)"),
    "hipertensao,diabetes_tipo_2",
  );
  assert.equal(choicesToTags("Texto livre"), "");
  // "Nenhuma" limpa as demais; outra escolha tira "Nenhuma".
  const nenhuma = config.options.find((o) => o.none)!;
  const renal = config.options.find((o) => o.value === "Doença renal")!;
  assert.deepEqual(toggleChoice(["Doença renal"], nenhuma, config), ["Nenhuma"]);
  assert.deepEqual(toggleChoice(["Nenhuma"], renal, config), ["Doença renal"]);
  // Perfil salvo → rascunho: a lista vira texto "a,b".
  const draft = profileToDraft({
    ...profileFixture(),
    conditionTags: ["hipertensao", "obesidade"],
  });
  assert.equal(draft.conditionTags, "hipertensao,obesidade");
});

test("condições: perfil antigo escolhe na lista e “Outra” pede os detalhes", () => {
  const keys = ["conditionTags", "conditions"];
  const legacy = { conditionTags: "", conditions: "Hipertensão" } as Draft;
  assert.deepEqual(withConditionIssues(legacy, {}, keys), {
    conditionTags: CONDITION_COPY.required,
  });
  // Sem escolha, o aviso do texto livre sai (vinha da falta de escolha).
  assert.deepEqual(
    withConditionIssues({ conditionTags: "" }, { conditions: "x", sex: "y" }, keys),
    { sex: "y", conditionTags: CONDITION_COPY.required },
  );
  // Com escolha, os erros do perfil ficam como estão; fora da etapa, nada muda.
  const other = { conditionTags: "outra", conditions: "" } as Draft;
  assert.deepEqual(withConditionIssues(other, { conditions: "x" }, keys), { conditions: "x" });
  assert.deepEqual(withConditionIssues(legacy, {}, ["name"]), {});
  assert.equal(isOtherConditionOn(other), true);
  assert.equal(isOtherConditionOn(legacy), false);
  const details = questionnaire.flatMap((s) => s.fields).find((f) => f.key === "conditions")!;
  assert.equal(isRequiredByAnswer(other, details), true);
  assert.equal(isRequiredByAnswer({ conditionTags: "outrao" }, details), false);
  assert.equal(isRequiredByAnswer({ conditionTags: ["hipertensao", "outra"] } as unknown as Draft, details), true);
  // O perfil confere o mesmo: sem escolha e sem texto, ou "Outra" sem detalhes, não passa.
  const base = { ...profileFixture(), conditions: "" };
  const issue = (draft: object) =>
    profileSchema.safeParse(draft).error?.issues.map((i) => String(i.path[0])) ?? [];
  assert.deepEqual(issue({ ...base, conditionTags: "" }), ["conditionTags"]);
  assert.deepEqual(issue({ ...base, conditionTags: "outra" }), ["conditions"]);
  assert.deepEqual(issue({ ...base, conditionTags: "nenhuma,hipertensao" }), ["conditionTags"]);
  assert.deepEqual(
    profileSchema.parse({ ...base, conditionTags: "hipertensao,diabetes_tipo_2" }).conditionTags,
    ["hipertensao", "diabetes_tipo_2"],
  );
});

test("condições: detalhes opcionais à vista com qualquer condição marcada; obrigatórios só com 'Outra'", () => {
  const draftWith = (conditionTags: string) => ({ conditionTags, conditions: "" });
  assert.equal(showsConditionDetails(draftWith(""), false, false), false);
  assert.equal(showsConditionDetails(draftWith("nenhuma"), false, false), false);
  for (const tags of ["diabetes_tipo_2", "hipertensao", "doenca_renal", "outra", "hipertensao,outra"])
    assert.equal(showsConditionDetails(draftWith(tags), false, false), true, tags);
  // Texto já salvo (perfil antigo) ou aviso pendente mantêm o campo à vista.
  assert.equal(showsConditionDetails(draftWith("nenhuma"), true, false), true);
  assert.equal(showsConditionDetails(draftWith(""), false, true), true);
  assert.equal(conditionDetailsCopy(false).hint, CONDITION_COPY.detailsOptional);
  assert.equal(conditionDetailsCopy(true).hint, CONDITION_COPY.detailsRequired);
  assert.doesNotMatch(conditionDetailsCopy(false).placeholder, /outra condição/);
});
