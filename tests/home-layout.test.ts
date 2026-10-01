import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HIDDEN,
  HOME_SECTIONS,
  HOME_SECTION_ALONE_COST,
  HOME_SECTION_HEIGHT,
  HOME_SECTION_SIZE,
  bentoLayout,
  type BentoCell,
  type HomeSectionKey,
  moveHomeSection,
  parseHomeLayout,
  serializeHomeLayout,
  toggleHomeSection,
} from "../src/lib/home-layout";
import { profileSchema } from "../src/types";
import { profileFixture, stateFixture } from "./fixtures";
import { updateProfile } from "../src/lib/domain";

test("sem preferência, o Hoje segue o conceito: refeições primeiro; bem-estar e água começam ocultos", () => {
  const sections = parseHomeLayout("");
  assert.deepEqual(
    sections.map((s) => `${s.isHidden ? "-" : ""}${s.key}`),
    ["meals", "habits", "injection", "diet", "pantry", "-mood", "-water"],
  );
  assert.deepEqual([...DEFAULT_HIDDEN].sort(), ["mood", "water"]);
  assert.equal(serializeHomeLayout(sections), "");
  // Reativar o bem-estar deixa de ser o padrão e passa a ser salvo.
  assert.equal(
    serializeHomeLayout(toggleHomeSection(sections, "mood")),
    "meals,habits,injection,diet,pantry,mood,-water",
  );
});

test("ordens salvas antes da mudança continuam valendo; o que falta entra com a visibilidade padrão", () => {
  assert.deepEqual(
    parseHomeLayout("water,-mood,meals").map((s) => `${s.isHidden ? "-" : ""}${s.key}`),
    ["water", "-mood", "meals", "habits", "injection", "diet", "pantry"],
  );
  // A ordem antiga completa com tudo visível é uma preferência explícita (não vira "").
  const legacy = "mood,water,meals,habits,injection,diet,pantry";
  assert.equal(serializeHomeLayout(parseHomeLayout(legacy)), legacy);
  assert.ok(parseHomeLayout("meals").find((s) => s.key === "water")!.isHidden);
});

test("lê ordem e ocultas, ignora chaves estranhas ou repetidas e completa as que faltam", () => {
  const sections = parseHomeLayout("water, -mood,xyz,water,habits");
  assert.deepEqual(
    sections.map((s) => `${s.isHidden ? "-" : ""}${s.key}`),
    ["water", "-mood", "habits", "meals", "injection", "diet", "pantry"],
  );
  assert.equal(sections[1]!.label, "Bem-estar");
});

test("mover e ocultar geram o texto salvo; nas pontas nada muda", () => {
  let sections = parseHomeLayout("");
  assert.equal(moveHomeSection(sections, "meals", -1), sections);
  assert.equal(moveHomeSection(sections, "water", 1), sections);
  sections = moveHomeSection(sections, "habits", -1);
  sections = toggleHomeSection(sections, "pantry");
  assert.equal(serializeHomeLayout(sections), "habits,meals,injection,diet,-pantry,-mood,-water");
  assert.deepEqual(parseHomeLayout(serializeHomeLayout(sections)), sections);
});

test("perfis salvos antes do campo carregam homeLayout vazio", () => {
  const { homeLayout: _omit, ...legacy } = profileFixture();
  assert.equal(profileSchema.parse(legacy).homeLayout, "");
});

test("concluir a anamnese com um rascunho antigo mantém a ordem salva do Hoje", () => {
  const state = stateFixture();
  state.profile = { ...state.profile!, homeLayout: "water,-mood" };
  const next = updateProfile(state, { ...state.profile, homeLayout: "" });
  assert.equal(next.profile?.homeLayout, "water,-mood");
});

// ---------- Grade do desktop (SIS-12) ----------

type Layout = Partial<Record<HomeSectionKey, BentoCell>>;
/** "chave:colunas" e "x2" quando o cartão desce por duas linhas, na ordem dada. */
const cellsOf = (keys: HomeSectionKey[], layout: Layout) =>
  keys.map((key) => `${key}:${layout[key]!.span}${layout[key]!.rows === 2 ? "x2" : ""}`);

/**
 * Posicionamento automático do CSS Grid (sem `dense`) em 12 colunas, como no navegador: cada
 * célula entra na primeira posição livre depois da anterior. Devolve linha e coluna de cada uma.
 */
function place(keys: HomeSectionKey[], layout: Layout) {
  const taken = new Set<string>();
  let row = 0;
  let col = 0;
  return keys.map((key) => {
    const { span, rows } = layout[key]!;
    const cellsAt = (r: number, c: number) =>
      Array.from({ length: rows * span }, (_, i) => `${r + Math.floor(i / span)}:${c + (i % span)}`);
    while (col + span > 12 || cellsAt(row, col).some((cell) => taken.has(cell))) {
      col += 1;
      if (col + span > 12) {
        row += 1;
        col = 0;
      }
    }
    for (const cell of cellsAt(row, col)) taken.add(cell);
    const placed = { key, row, col, span, rows };
    col += span;
    return placed;
  });
}

test("cada seção do Hoje tem peso, altura típica e custo de linha inteira na grade do desktop", () => {
  const keys = HOME_SECTIONS.map((s) => s.key).sort();
  for (const table of [HOME_SECTION_SIZE, HOME_SECTION_HEIGHT, HOME_SECTION_ALONE_COST])
    assert.deepEqual(Object.keys(table).sort(), keys);
});

test("ordem padrão: refeições e dieta empilhados ao lado dos combinados; a despensa fecha a grade", () => {
  const keys: HomeSectionKey[] = ["meals", "habits", "diet", "pantry"];
  // Sem combinados, o estado vazio (com sugestões) é o mais alto: desce por duas linhas.
  assert.deepEqual(cellsOf(keys, bentoLayout(keys)), ["meals:7", "habits:5x2", "diet:7", "pantry:12"]);
  // Com a lista, os combinados ficam mais baixos e formam par com as refeições.
  assert.deepEqual(cellsOf(keys, bentoLayout(keys, { hasHabits: true })), [
    "meals:7",
    "habits:5",
    "diet:7",
    "pantry:5",
  ]);
});

test("bem-estar e água reativados: os dois empilhados com as refeições, como antes", () => {
  const keys: HomeSectionKey[] = ["mood", "water", "meals", "habits", "diet", "pantry"];
  assert.deepEqual(cellsOf(keys, bentoLayout(keys, { hasHabits: true })), [
    "mood:7",
    "water:5x2",
    "meals:7",
    "habits:7x2",
    "diet:5",
    "pantry:5",
  ]);
});

test("com a medicação promovida no topo, ela ocupa a linha inteira e o resto segue em pilhas", () => {
  const keys: HomeSectionKey[] = ["injection", "meals", "habits", "diet", "pantry"];
  assert.deepEqual(cellsOf(keys, bentoLayout(keys)), [
    "injection:12",
    "meals:7",
    "habits:5x2",
    "diet:7",
    "pantry:12",
  ]);
  // Fora do dia estimado a medicação vem depois dos combinados.
  const later: HomeSectionKey[] = ["meals", "habits", "injection", "diet", "pantry"];
  assert.deepEqual(cellsOf(later, bentoLayout(later, { hasHabits: true })), [
    "meals:7",
    "habits:5",
    "injection:12",
    "diet:7",
    "pantry:5",
  ]);
});

test("pares: largo + estreito vira 7 + 5 em qualquer ordem; outros pares dividem 6 + 6", () => {
  assert.deepEqual(bentoLayout(["meals", "habits"]), { meals: { span: 7, rows: 1 }, habits: { span: 5, rows: 1 } });
  assert.deepEqual(bentoLayout(["habits", "meals"]), { habits: { span: 5, rows: 1 }, meals: { span: 7, rows: 1 } });
  assert.deepEqual(bentoLayout(["diet", "pantry"]), { diet: { span: 7, rows: 1 }, pantry: { span: 5, rows: 1 } });
  assert.deepEqual(bentoLayout(["mood", "pantry"]), { mood: { span: 6, rows: 1 }, pantry: { span: 6, rows: 1 } });
  assert.deepEqual(bentoLayout(["mood"]), { mood: { span: 12, rows: 1 } });
  assert.deepEqual(bentoLayout([]), {});
});

test("alturas muito diferentes não viram par: cada uma vira faixa na linha inteira", () => {
  // Água (alta) e bem-estar (baixo) lado a lado deixariam o bem-estar quase vazio.
  assert.deepEqual(bentoLayout(["water", "mood"]), { water: { span: 12, rows: 1 }, mood: { span: 12, rows: 1 } });
});

test("a ordem da pessoa decide os grupos (layout salvo em Editar Hoje)", () => {
  const keys = parseHomeLayout("water,-mood,meals")
    .filter((s) => !s.isHidden && s.key !== "injection")
    .map((s) => s.key);
  assert.deepEqual(keys, ["water", "meals", "habits", "diet", "pantry"]);
  assert.deepEqual(cellsOf(keys, bentoLayout(keys)), ["water:12", "meals:7", "habits:5x2", "diet:7", "pantry:12"]);
});

test("nunca deixa buraco: cada linha soma 12 e a leitura segue a ordem, em qualquer ordem e quantidade", () => {
  const all = HOME_SECTIONS.map((s) => s.key);
  // Todas as rotações e todos os prefixos da ordem padrão e da invertida, com e sem combinados.
  for (const hasHabits of [false, true])
    for (const base of [all, [...all].reverse()])
      for (let shift = 0; shift < base.length; shift++) {
        const rotated = [...base.slice(shift), ...base.slice(0, shift)];
        for (let size = 0; size <= rotated.length; size++) {
          const keys = rotated.slice(0, size);
          const label = `${keys.join(",")}${hasHabits ? " (com combinados)" : ""}`;
          const layout = bentoLayout(keys, { hasHabits });
          assert.equal(Object.keys(layout).length, keys.length, label);
          const placed = place(keys, layout);
          const filled = new Map<number, number>();
          for (const cell of placed)
            for (let r = cell.row; r < cell.row + cell.rows; r++) filled.set(r, (filled.get(r) ?? 0) + cell.span);
          const lastRow = Math.max(-1, ...placed.map((cell) => cell.row + cell.rows - 1));
          for (let r = 0; r <= lastRow; r++) assert.equal(filled.get(r), 12, `${label}: linha ${r + 1}`);
          const reading = [...placed].sort((a, b) => a.row - b.row || a.col - b.col).map((cell) => cell.key);
          assert.deepEqual(reading, keys, `${label}: ordem de leitura`);
        }
      }
});
