import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChatBlock, ChatOutput, PlannedItem } from "../src/lib/agent-blocks";
import type { DietPlanV2 } from "../src/lib/diet-plan";
import { agentContext } from "../src/lib/domain";
import { extractFlags } from "../server/graph/prepare";
import { isUiSensitive, type Flags } from "../server/graph/state";
import { lintStructured } from "../server/graph/structured-guard";
import {
  CHAT_SPEC,
  CHAT_SPEC_SENSITIVE,
  DIET_SPEC,
  PHOTO_SPEC,
} from "../server/graph/structured-specs";
import { stateFixture } from "./fixtures";
import { DIET_PLAN_V2, PHOTO_DRAFT } from "./structured-fixtures";

const flags: Flags = extractFlags(agentContext(stateFixture()));
const sensitive: Flags = { ...flags, eatingDisorder: "sim" };
const item = (alimento: string): PlannedItem => ({
  alimento,
  medidaCaseira: "1 porção",
  gramas: 100,
});
const options = (nome: string, alimento = "arroz cozido"): ChatBlock => ({
  tipo: "opcoes_refeicao",
  titulo: null,
  refeicao: "Jantar",
  opcoes: [{ nome, emoji: "🍽️", minutos: 20, itens: [item(alimento)] }],
});
const habit = (titulo: string): ChatBlock => ({
  tipo: "acao",
  acao: "criar_habito",
  titulo,
  horario: "07:00",
});
const chat = (...blocos: ChatBlock[]): ChatOutput => ({ blocos });

function lintChat(value: ChatOutput, f: Flags = flags) {
  return lintStructured({
    role: "nutricionista",
    value,
    spec: isUiSensitive(f) ? CHAT_SPEC_SENSITIVE : CHAT_SPEC,
    flags: f,
    mode: "chat",
  }).map((i) => `${i.codigo}:${i.gravidade}`);
}
function lintDiet(plan: DietPlanV2, f: Flags = flags) {
  return lintStructured({ role: "nutricionista", value: plan, spec: DIET_SPEC, flags: f, mode: "diet" });
}

test("alergênico declarado no plural acha o alimento no singular", () => {
  const plural: Flags = { ...flags, allergyDetails: "Tenho alergia a ovos e camarões" };
  assert.deepEqual(lintChat(chat(options("Omelete", "ovo cozido")), plural), ["alergeno:hard"]);
  assert.deepEqual(lintChat(chat(options("Camarão grelhado")), plural), ["alergeno:hard"]);
  assert.deepEqual(lintChat(chat(options("Arroz sem ovo")), plural), []);
});

test("alergênico: nome do prato e troca contam; negação no nome e alerta em lista não", () => {
  assert.deepEqual(lintChat(chat(options("Frango com amendoim"))), ["alergeno:hard"]);
  assert.deepEqual(lintChat(chat(options("Arroz sem amendoim"))), []);
  assert.deepEqual(lintChat(chat(options("Prato do dia", "paçoca de amendoim"))), ["alergeno:hard"]);
  assert.deepEqual(
    lintChat(chat({ tipo: "lista", titulo: null, ordenada: false, itens: ["Evite amendoim"] })),
    [],
  );
  const swap: DietPlanV2 = {
    ...DIET_PLAN_V2,
    refeicoes: [
      {
        slot: "lanche_da_tarde",
        horario: "16:00",
        itens: [{ ...item("banana prata"), trocas: ["pasta de amendoim"] }],
      },
    ],
  };
  const issues = lintDiet(swap);
  assert.deepEqual(
    issues.map((i) => [i.codigo, i.gravidade, i.papel, i.trecho]),
    [["alergeno", "hard", "nutricionista", "pasta de amendoim"]],
  );
  assert.match(issues[0]!.correcao, /nem no nome do prato nem como troca/);
  assert.deepEqual(lintDiet(DIET_PLAN_V2), []);
});

test("número nutricional: campos de cartão e dicas da dieta, não a lista do chat", () => {
  assert.deepEqual(lintChat(chat(options("Prato leve", "arroz (450 kcal)"))), ["dado_inventado:hard"]);
  assert.deepEqual(
    lintChat(chat({ tipo: "lista", titulo: null, ordenada: false, itens: ["Um lanche de 300 kcal"] })),
    [],
  );
  for (const dica of ["Evite passar de 500 kcal no lanche", "Inclua 30 g de proteína no almoço"]) {
    const issues = lintDiet({ ...DIET_PLAN_V2, dicas: [dica] });
    assert.deepEqual(
      issues.map((i) => `${i.codigo}:${i.gravidade}`),
      ["dado_inventado:hard"],
      dica,
    );
  }
  assert.deepEqual(lintChat(chat(habit("Beber 500 ml de água"))), []);
});

test("combinados: medicamento para todo perfil; peso só em perfil sensível", () => {
  const medication = chat(habit("Aplicar a caneta 0,5 mg"));
  assert.deepEqual(lintChat(medication), ["prescricao:hard"]);
  assert.deepEqual(lintChat(medication, sensitive), ["prescricao:hard"]);
  assert.deepEqual(lintChat(chat(habit("Usar o aplicativo à noite"))), []);
  const weight = chat(habit("Anotar o peso toda manhã"));
  assert.deepEqual(lintChat(weight), []);
  assert.deepEqual(lintChat(weight, sensitive), ["prescricao:hard"]);
  assert.deepEqual(lintChat(weight, { ...flags, pregnancy: "nao_informado" }), ["prescricao:hard"]);
  assert.deepEqual(lintChat(weight, { ...flags, isMinor: true }), ["prescricao:hard"]);
});

test("no máximo um problema por regra e papel", () => {
  const value = chat(
    options("Frango com amendoim", "amendoim torrado (200 kcal)"),
    options("Paçoca de 300 kcal"),
    habit("Tomar o remédio às 8h"),
    habit("Aplicar a dose da caneta"),
  );
  assert.deepEqual(lintChat(value), ["alergeno:hard", "dado_inventado:hard", "prescricao:hard"]);
  assert.deepEqual(lintChat(value, sensitive), ["alergeno:hard", "dado_inventado:hard", "prescricao:hard"]);
  const both = chat(habit("Pesar-se toda manhã"), habit("Aplicar a caneta"));
  assert.deepEqual(lintChat(both, sensitive), ["prescricao:hard", "prescricao:hard"]);
});

test("foto: nomes e termos de busca não disparam alergênico (o cartão avisa)", () => {
  assert.deepEqual(
    lintStructured({ role: "nutricionista", value: PHOTO_DRAFT, spec: PHOTO_SPEC, flags, mode: "photo" }),
    [],
  );
  const grams = { ...PHOTO_DRAFT, items: [{ ...PHOTO_DRAFT.items[0]!, name: "Arroz (130 kcal)" }] };
  assert.deepEqual(
    lintStructured({ role: "nutricionista", value: grams, spec: PHOTO_SPEC, flags, mode: "photo" }).map(
      (i) => i.codigo,
    ),
    ["dado_inventado"],
  );
});
