import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOCK_MEALS } from "../src/lib/agent-blocks";
import { dietHighlights } from "../src/lib/diet";
import {
  PLAN_TIMES_NOTE,
  PLAN_WINDOW_MINUTES,
  SLOT_CATEGORY,
  mealHeading,
  nextPlannedMeal,
  renderDietText,
  sanitizeDietPlan,
  type DietPlanV2,
} from "../src/lib/diet-plan";
import { MEAL_WINDOW_MINUTES } from "../src/lib/meals";
import { maskStructured } from "../src/lib/structured";
import { DIET_PLAN_V2, DIET_PLAN_V2_KCAL } from "./structured-fixtures";

const EXPECTED = `## Resumo
- Plano para manter o peso com refeições simples e até 30 minutos de preparo.
- Respeita sua alergia e os alimentos que você evita.

## Seu dia de alimentação
${PLAN_TIMES_NOTE}

### Café da manhã · 07:30
- pão francês: 1 unidade (≈ 50 g)
- ovo cozido: 1 unidade (≈ 50 g)
- café com leite: 1 xícara (≈ 150 g)

### Almoço · 12:00
- arroz branco cozido: 4 colheres de sopa (≈ 100 g) · trocas: arroz integral cozido, batata cozida
- feijão carioca cozido: 1 concha (≈ 100 g) · trocas: lentilha cozida
- frango grelhado: 1 filé (≈ 100 g)
- alface: 3 folhas (≈ 30 g)

### Lanche da tarde · 16:00
- banana prata: 1 unidade (≈ 70 g)
- iogurte natural: 1 pote (≈ 170 g)

### Jantar · 19:30
- homus caseiro: 2 colheres de sopa (≈ 60 g)
- tomate: 3 fatias (≈ 45 g)

## Para facilitar
- Cozinhe o feijão da semana de uma vez e congele em porções.
- Deixe frutas lavadas à vista para os lanches.

## Perguntas para ajustar
- Você costuma almoçar em casa ou fora nos dias de trabalho?`;

const untimed = (plan: DietPlanV2): DietPlanV2 => ({
  ...plan,
  refeicoes: plan.refeicoes.map((m) => ({ ...m, horario: null })),
});

test("renderDietText: texto exato e estável, com o aviso de horários sugeridos", () => {
  assert.equal(renderDietText(DIET_PLAN_V2), EXPECTED);
  assert.equal(renderDietText(DIET_PLAN_V2), renderDietText(structuredClone(DIET_PLAN_V2)));
  // Sem horário: sem o aviso e títulos só com a refeição; sem dicas nem perguntas: sem as seções.
  const bare = renderDietText({ ...untimed(DIET_PLAN_V2), dicas: [], perguntas: [] });
  assert.doesNotMatch(bare, /Os horários são sugestões|Para facilitar|Perguntas para ajustar/);
  assert.match(bare, /## Seu dia de alimentação\n### Café da manhã\n- pão francês/);
  assert.doesNotMatch(PLAN_TIMES_NOTE, /:/);
});

test("calorias ocultas: mascarar o plano antes de renderizar não deixa kcal", () => {
  assert.match(renderDietText(DIET_PLAN_V2_KCAL), /500 kcal/);
  const masked = renderDietText(maskStructured(DIET_PLAN_V2_KCAL, true));
  assert.doesNotMatch(masked, /kcal/);
  assert.match(masked, /\[calorias ocultas\]/);
});

test("destaques do cartão do chat: os títulos das refeições do plano estruturado", () => {
  assert.deepEqual(dietHighlights(renderDietText(DIET_PLAN_V2), false), [
    "Café da manhã · 07:30",
    "Almoço · 12:00",
    "Lanche da tarde · 16:00",
    "Jantar · 19:30",
  ]);
  assert.deepEqual(dietHighlights(renderDietText(DIET_PLAN_V2), false, 2), [
    "Café da manhã · 07:30",
    "Almoço · 12:00",
  ]);
  assert.equal(mealHeading({ ...DIET_PLAN_V2.refeicoes[1]!, horario: null }), "Almoço");
});

test("próxima refeição: horário, janela de 90 min, consumo por categoria e fim do dia", () => {
  const at = (now: string, logged: string[] = [], plan = DIET_PLAN_V2) => {
    const next = nextPlannedMeal(plan, now, logged);
    return next && [next.index, next.meal.slot, next.category, next.minutesUntil];
  };
  assert.deepEqual(at("06:00"), [0, "cafe_da_manha", "Café da manhã", 90]);
  assert.deepEqual(at("10:40"), [1, "almoco", "Almoço", 80]);
  assert.deepEqual(at("12:40"), [1, "almoco", "Almoço", 0]);
  assert.deepEqual(at("12:40", ["Almoço"]), [2, "lanche_da_tarde", "Lanche", 200]);
  assert.deepEqual(at("23:00"), [3, "jantar", "Jantar", 0]);
  assert.equal(at("23:00", ["Jantar"]), null);
  assert.equal(at("08:00", [], untimed(DIET_PLAN_V2)), null);

  const twoSnacks: DietPlanV2 = {
    ...DIET_PLAN_V2,
    refeicoes: [
      { ...DIET_PLAN_V2.refeicoes[2]!, slot: "lanche_da_tarde", horario: "16:00" },
      { ...DIET_PLAN_V2.refeicoes[0]!, horario: "07:00" },
      { ...DIET_PLAN_V2.refeicoes[2]!, slot: "lanche_da_manha", horario: "10:00" },
      { ...DIET_PLAN_V2.refeicoes[1]!, horario: "12:00" },
    ],
  };
  // Um lanche registrado consome só o primeiro lanche (o da manhã); o almoço já passou da janela.
  assert.deepEqual(at("13:40", ["Café da manhã", "Lanche"], twoSnacks), [0, "lanche_da_tarde", "Lanche", 140]);
  assert.deepEqual(at("09:00", ["Café da manhã", "Lanche"], twoSnacks), [3, "almoco", "Almoço", 180]);
  assert.equal(at("13:40", ["Café da manhã", "Lanche", "Lanche"], twoSnacks), null);
  // Refeições sem horário ficam fora da conta, mesmo no meio do plano.
  const mixed: DietPlanV2 = {
    ...DIET_PLAN_V2,
    refeicoes: [{ ...DIET_PLAN_V2.refeicoes[0]!, horario: null }, DIET_PLAN_V2.refeicoes[1]!],
  };
  assert.deepEqual(at("06:00", [], mixed), [1, "almoco", "Almoço", 360]);
});

test("perfil sensível: todas as gramas do plano viram null, sem mutar o original", () => {
  const safe = sanitizeDietPlan(DIET_PLAN_V2, { sensitive: true });
  assert.ok(safe.refeicoes.every((m) => m.itens.every((i) => i.gramas === null)));
  assert.equal(DIET_PLAN_V2.refeicoes[0]!.itens[0]!.gramas, 50);
  assert.equal(sanitizeDietPlan(DIET_PLAN_V2, { sensitive: false }), DIET_PLAN_V2);
  assert.doesNotMatch(renderDietText(safe), /≈ \d+ g/);
});

test("janela e categorias do plano seguem as do diário", () => {
  assert.equal(PLAN_WINDOW_MINUTES, MEAL_WINDOW_MINUTES);
  for (const category of Object.values(SLOT_CATEGORY))
    assert.ok((BLOCK_MEALS as readonly string[]).includes(category), category);
});
