import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESSENTIAL_COPY,
  essentialSummary,
  medicationNames,
} from "../src/lib/essential";
import type { AppState } from "../src/types";
import { stateFixture } from "./fixtures";
import { appointment, withProfile } from "./report-fixtures";

type ProfilePatch = Partial<NonNullable<AppState["profile"]>>;
const summaryOf = (
  patch: ProfilePatch,
  appointments: AppState["appointments"] = [],
) => essentialSummary({ ...withProfile(stateFixture(), patch), appointments });
const chipsOf = (result: ReturnType<typeof essentialSummary>, key: string) =>
  result.groups.find((g) => g.key === key)?.chips;

test("alergias, condições e medicamentos só pelo nome; resumo sem nomes", () => {
  const result = summaryOf({
    allergies: "sim",
    allergyDetails: "Amendoim, Camarão",
    conditions: "Hipertensão, Diabetes tipo 2",
    medications: "Anti-hipertensivo, Losartana 50 mg 1x ao dia",
    weightLossPen: "sim",
    weightLossPenName: "Mounjaro (tirzepatida)",
    weightLossPenDose: "5 mg",
    weightLossPenPerMonth: 4,
  });
  assert.deepEqual(chipsOf(result, "alergias"), ["Amendoim", "Camarão"]);
  assert.deepEqual(chipsOf(result, "condicoes"), [
    "Hipertensão",
    "Diabetes tipo 2",
  ]);
  assert.deepEqual(chipsOf(result, "medicamentos"), [
    "Anti-hipertensivo",
    "Losartana",
    "Mounjaro (tirzepatida)",
  ]);
  assert.equal(result.summary, "2 alergias · 2 condições · 3 medicamentos");
  assert.equal(
    result.groups.find((g) => g.key === "medicamentos")?.note,
    ESSENTIAL_COPY.medsNote,
  );
  assert.deepEqual(
    result.groups.map((g) => g.title),
    ["Alergias", "Condições", "Medicamentos"],
  );
  assert.doesNotMatch(JSON.stringify(result), /\d+\s*mg|1x/);
  assert.equal(result.isEmpty, false);
});

test("nada informado: vazio e o texto de nenhum", () => {
  const result = summaryOf({
    allergies: "nao",
    conditions: "Nenhuma",
    medications: "Não uso medicamentos",
  });
  assert.deepEqual(result.groups, []);
  assert.equal(result.isEmpty, true);
  assert.equal(
    result.summary,
    "Nenhuma alergia, condição ou medicamento informado",
  );
  assert.equal(result.summary, ESSENTIAL_COPY.empty);
});

test("prefiro não informar some; alergia sem detalhe ou a confirmar", () => {
  assert.equal(
    chipsOf(summaryOf({ medications: "Prefiro não informar" }), "medicamentos"),
    undefined,
  );
  const noDetails = summaryOf({
    allergies: "sim",
    allergyDetails: "Prefiro não detalhar",
  });
  assert.deepEqual(chipsOf(noDetails, "alergias"), [
    "Alergias informadas, sem detalhes",
  ]);
  assert.equal(noDetails.summary, "alergias informadas");
  const unsure = summaryOf({ allergies: "nao_sei" });
  assert.deepEqual(chipsOf(unsure, "alergias"), ["A confirmar"]);
  assert.equal(unsure.summary, "alergias a confirmar");
  const pen = summaryOf({
    medications: "Não",
    weightLossPen: "sim",
    weightLossPenName: "Não sei o nome",
  });
  assert.deepEqual(chipsOf(pen, "medicamentos"), [
    "Caneta para emagrecer (nome não informado)",
  ]);
});

test("cuidados: gestação e restrição de líquidos; transtorno alimentar nunca aparece", () => {
  const result = summaryOf({
    pregnancy: "gestacao",
    fluidRestriction: "sim",
    eatingDisorder: "sim",
  });
  assert.deepEqual(chipsOf(result, "cuidados"), [
    "Gestação",
    "Restrição de líquidos",
  ]);
  assert.doesNotMatch(JSON.stringify(result), /transtorno|alimentar/i);
  assert.deepEqual(
    chipsOf(summaryOf({ pregnancy: "amamentacao" }), "cuidados"),
    ["Amamentação"],
  );
});

test("profissionais: consultas mais recentes primeiro, sem repetir, com registro quando há", () => {
  const result = summaryOf({}, [
    appointment("2026-09-01", "Dra. Ana Lima", "CRN 1234"),
    appointment("2026-10-02", "Dra. Ana Lima", "CRN 1234"),
    appointment("2026-08-01", "Dr. Bruno", ""),
  ]);
  assert.deepEqual(chipsOf(result, "profissionais"), [
    "Dra. Ana Lima · CRN 1234",
    "Dr. Bruno",
  ]);
});

test("medicationNames: tira dose e frequência", () => {
  assert.deepEqual(
    medicationNames("Metformina 850mg, Vitamina B12 1x ao dia"),
    ["Metformina", "Vitamina B12"],
  );
  assert.deepEqual(medicationNames("losartana: 50 mg, Losartana"), [
    "Losartana",
  ]);
  assert.deepEqual(medicationNames("Não uso medicamentos"), []);
});

test("medicationNames: dose e frequência separadas por vírgula ou entre parênteses também saem", () => {
  assert.deepEqual(medicationNames("Losartana, 50 mg, 1x ao dia"), ["Losartana"]);
  assert.deepEqual(medicationNames("Sertralina (50mg)"), ["Sertralina"]);
  assert.deepEqual(medicationNames("Sertralina(50mg), Vitamina D 2000 UI"), ["Sertralina", "Vitamina D"]);
  assert.deepEqual(medicationNames("Levotiroxina 25 mcg em jejum"), ["Levotiroxina"]);
  assert.deepEqual(medicationNames("Metformina uma vez ao dia, duas vezes ao dia"), ["Metformina"]);
  assert.deepEqual(medicationNames("Insulina NPH 10 unidades à noite"), ["Insulina NPH"]);
  assert.deepEqual(medicationNames("Omeprazol de manhã"), ["Omeprazol"]);
  assert.deepEqual(medicationNames("Vitamina B12"), ["Vitamina B12"], "número colado ao nome fica");
  assert.deepEqual(medicationNames("50 mg, 1x ao dia"), []);
});

test("caneta: nome sem dose; só dose vira 'nome não informado'", () => {
  const named = summaryOf({
    medications: "Losartana, 50 mg, 1x ao dia",
    weightLossPen: "sim",
    weightLossPenName: "Tirzepatida manipulada 2,5 mg",
  });
  assert.deepEqual(chipsOf(named, "medicamentos"), ["Losartana", "Tirzepatida manipulada"]);
  assert.doesNotMatch(JSON.stringify(named.groups), /\d/);
  const doseOnly = summaryOf({ medications: "Não", weightLossPen: "sim", weightLossPenName: "2,5 mg" });
  assert.deepEqual(chipsOf(doseOnly, "medicamentos"), ["Caneta para emagrecer (nome não informado)"]);
});

test("chips: primeira letra maiúscula, até 40 caracteres e no máximo 8", () => {
  const long = "a".repeat(60);
  const many = Array.from({ length: 10 }, (_, i) => `Condição ${i + 1}x`).join(
    ", ",
  );
  const chips = chipsOf(
    summaryOf({ conditions: `hipotireoidismo, ${long}, ${many}` }),
    "condicoes",
  );
  assert.ok(chips);
  assert.equal(chips.length, 8);
  assert.equal(chips[0], "Hipotireoidismo");
  assert.equal(chips[1], `A${"a".repeat(38)}…`);
});
