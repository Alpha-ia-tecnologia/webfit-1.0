import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftDate } from "../src/lib/domain";
import {
  availablePantry,
  emptyPantryDraft,
  expiryStatus,
  visibleScanDrafts,
} from "../src/lib/pantry";
import {
  canDecreaseQuantity,
  compactExpiry,
  EXPIRED_GROUP_LABEL,
  EXPIRY_SHORTCUTS,
  expiryPill,
  filterPantry,
  fmtPantryQuantity,
  groupByLocation,
  orderUseFirst,
  PANTRY_FALLBACK_GLYPH,
  pantryCardText,
  pantryEmoji,
  pantrySummary,
  PANTRY_SORT_LABEL,
  stepPantryQuantity,
  summaryTileLabel,
  USE_FIRST_HINT,
  type PantryStatusFilter,
} from "../src/lib/pantry-view";
import { CALORIE_PATTERN } from "../src/lib/text";
import type { PantryItem } from "../src/types";

const TODAY = "2026-09-26";
const day = (n: number) => shiftDate(TODAY, n);
let seq = 0;
const item = (name: string, extra: Partial<PantryItem> = {}): PantryItem => ({
  id: `item-${++seq}`,
  name,
  quantity: null,
  unit: "un",
  location: "despensa",
  expiresOn: null,
  notes: "",
  source: "manual",
  updatedAt: "2026-09-20T12:00:00.000Z",
  ...extra,
});
const names = (items: PantryItem[]) => items.map((i) => i.name);

/** Arroz sem validade, Iogurte em 2 d, Leite vencido ontem, Queijo em 10 d, Feijão em 30 d. */
function stock() {
  return [
    item("Arroz", { location: "despensa" }),
    item("Iogurte", { location: "geladeira", expiresOn: day(2) }),
    item("Leite", { location: "geladeira", expiresOn: day(-1) }),
    item("Queijo", { location: "geladeira", expiresOn: day(10) }),
    item("Feijão", { location: "despensa", expiresOn: day(30) }),
  ];
}

test("resumo: disponíveis, vencendo e vencidos; sem validade conta como disponível", () => {
  const items = [
    item("Macarrão", { expiresOn: day(20) }),
    item("Iogurte", { expiresOn: day(2) }),
    item("Pão", { expiresOn: day(0) }),
    item("Leite", { expiresOn: day(-1) }),
    item("Arroz"),
  ];
  const summary = pantrySummary(items, TODAY);
  assert.deepEqual(summary, { total: 5, available: 4, soon: 2, expired: 1 });
  assert.equal(summary.available, availablePantry(items, TODAY).length);
  assert.deepEqual(pantrySummary([], TODAY), { total: 0, available: 0, soon: 0, expired: 0 });
});

test("Use primeiro: vence antes no topo, sem validade depois, vencidos num grupo à parte", () => {
  const items = Object.freeze(stock().map((i) => Object.freeze(i)));
  const before = names([...items]);
  const groups = orderUseFirst(items, TODAY);
  assert.deepEqual(names(groups.usable), ["Iogurte", "Queijo", "Feijão", "Arroz"]);
  assert.deepEqual(names(groups.expired), ["Leite"]);
  assert.notEqual(groups.usable[0].name, "Leite");
  assert.deepEqual(names([...items]), before);
  const older = orderUseFirst(
    [item("Leite", { expiresOn: day(-1) }), item("Creme", { expiresOn: day(-5) })],
    TODAY,
  );
  assert.deepEqual(names(older.expired), ["Creme", "Leite"]);
  const undated = orderUseFirst([item("Pão"), item("Óleo"), item("Leite")], TODAY);
  assert.deepEqual(names(undated.usable), ["Leite", "Óleo", "Pão"]);
  const tie = orderUseFirst(
    [item("Uva", { expiresOn: day(3) }), item("Abacate", { expiresOn: day(3) })],
    TODAY,
  );
  assert.deepEqual(names(tie.usable), ["Abacate", "Uva"]);
  assert.match(USE_FIRST_HINT, /^Use primeiro/);
  assert.equal(EXPIRED_GROUP_LABEL, "Vencidos · fora das receitas");
});

test("filtros: situação, local e busca sem acento, combinados, mantendo a ordem", () => {
  const items = stock();
  const all = { status: null, location: "todos", search: "" } as const;
  const run = (filter: Partial<Parameters<typeof filterPantry>[1]>) =>
    filterPantry(items, { ...all, ...filter }, TODAY);
  assert.deepEqual(names(run({}).usable), ["Iogurte", "Queijo", "Feijão", "Arroz"]);
  assert.deepEqual(names(run({}).expired), ["Leite"]);
  const soon = run({ status: "soon" });
  assert.deepEqual([names(soon.usable), names(soon.expired)], [["Iogurte"], []]);
  const available = run({ status: "available" });
  assert.deepEqual(names(available.usable), ["Iogurte", "Queijo", "Feijão", "Arroz"]);
  assert.deepEqual(available.expired, []);
  const expired = run({ status: "expired" });
  assert.deepEqual([expired.usable, names(expired.expired)], [[], ["Leite"]]);
  assert.deepEqual(names(run({ location: "despensa" }).usable), ["Feijão", "Arroz"]);
  assert.deepEqual(names(run({ location: "geladeira" }).expired), ["Leite"]);
  assert.deepEqual(names(run({ search: "feijao" }).usable), ["Feijão"]);
  assert.deepEqual(names(run({ search: "  FEIJÃO " }).usable), ["Feijão"]);
  const combined = run({ status: "available", location: "geladeira", search: "qu" });
  assert.deepEqual(names(combined.usable), ["Queijo"]);
  assert.deepEqual(run({ status: "expired", location: "despensa" }), { usable: [], expired: [] });
});

test("pílula de validade: tabela completa, tom igual ao expiryStatus e texto completo", () => {
  const cases: [number, "expired" | "soon" | "ok", string][] = [
    [-400, "expired", "Venceu há mais de 1 ano"],
    [-366, "expired", "Venceu há mais de 1 ano"],
    [-365, "expired", "Venceu há 12 meses"],
    [-46, "expired", "Venceu há 2 meses"],
    [-45, "expired", "Venceu há 45 d"],
    [-3, "expired", "Venceu há 3 d"],
    [-1, "expired", "Venceu ontem"],
    [0, "soon", "Vence hoje"],
    [1, "soon", "Vence amanhã"],
    [3, "soon", "Vence em 3 d"],
    [4, "ok", "Vence em 4 d"],
    [45, "ok", "Vence em 45 d"],
    [46, "ok", "Vence em 2 meses"],
    [200, "ok", "Vence em 7 meses"],
    [365, "ok", "Vence em 12 meses"],
    [400, "ok", "Vence em mais de 1 ano"],
  ];
  for (const [n, tone, short] of cases) {
    const pill = expiryPill(day(n), TODAY);
    assert.equal(pill.short, short, `n=${n}`);
    assert.equal(pill.tone, tone, `n=${n}`);
    assert.equal(pill.tone, expiryStatus(day(n), TODAY).tone, `n=${n}`);
    assert.doesNotMatch(pill.short, /\b1 meses\b/);
  }
  assert.equal(expiryPill("2026-09-28", TODAY).full, "Vence em 2 dias · 28/09");
  // Pílula compacta da linha (conceito 06).
  const compact: [number, string][] = [
    [-400, "Venceu há mais de 1 ano"],
    [-46, "Venceu há 2 meses"],
    [-3, "Venceu há 3 dias"],
    [-1, "Venceu ontem"],
    [0, "hoje"],
    [1, "amanhã"],
    [2, "2 dias"],
    [12, "12 dias"],
    [45, "45 dias"],
    [46, "2 meses"],
    [92, "3 meses"],
    [183, "6 meses"],
    [400, "+1 ano"],
  ];
  for (const [n, text] of compact) {
    assert.equal(compactExpiry(day(n), TODAY), text, `compact n=${n}`);
    assert.equal(expiryPill(day(n), TODAY).compact, text, `pill n=${n}`);
  }
  assert.equal(
    expiryPill("2026-09-23", TODAY).full,
    "Venceu há 3 dias — não usado nas receitas · 23/09",
  );
});

test("por local: Geladeira e Despensa, vencidos no topo, validade ou nome, busca sem acento", () => {
  const groups = groupByLocation(stock(), "validade", TODAY);
  assert.deepEqual(
    groups.map((g) => [g.location, g.label, names(g.items)]),
    [
      ["geladeira", "Geladeira", ["Leite", "Iogurte", "Queijo"]],
      ["despensa", "Despensa", ["Feijão", "Arroz"]],
    ],
  );
  const byName = groupByLocation(stock(), "nome", TODAY);
  assert.deepEqual(names(byName[0]!.items), ["Leite", "Iogurte", "Queijo"]);
  assert.deepEqual(names(byName[1]!.items), ["Arroz", "Feijão"]);
  // A busca filtra os dois locais; local sem resultado some.
  const found = groupByLocation(stock(), "validade", TODAY, "feijao");
  assert.deepEqual(found.map((g) => [g.location, names(g.items)]), [["despensa", ["Feijão"]]]);
  assert.deepEqual(groupByLocation(stock(), "validade", TODAY, "xyz"), []);
  assert.deepEqual(groupByLocation([], "validade", TODAY), []);
  assert.equal(PANTRY_SORT_LABEL.validade, "Por validade");
  assert.equal(PANTRY_SORT_LABEL.nome, "Por nome");
});

test("quantidade com unidade por extenso e vírgula decimal", () => {
  assert.equal(fmtPantryQuantity(0.5, "kg"), "0,5 kg");
  assert.equal(fmtPantryQuantity(1, "un"), "1 unidade");
  assert.equal(fmtPantryQuantity(12, "un"), "12 unidades");
  assert.equal(fmtPantryQuantity(1.5, "un"), "1,5 unidades");
  assert.equal(fmtPantryQuantity(1, "pacote"), "1 pacote");
  assert.equal(fmtPantryQuantity(2, "pacote"), "2 pacotes");
  assert.equal(fmtPantryQuantity(1, "l"), "1 L");
  assert.equal(fmtPantryQuantity(250, "ml"), "250 ml");
  assert.equal(fmtPantryQuantity(1250.5, "g"), "1.250,5 g");
  assert.equal(fmtPantryQuantity(null, "g"), "Quantidade não informada");
});

test("emoji do item: nome, palavra no singular e o prato genérico", () => {
  assert.equal(pantryEmoji("Tomate italiano"), "🍅");
  assert.equal(pantryEmoji("Ovos"), "🥚");
  assert.equal(pantryEmoji("Ovos caipiras"), "🥚");
  assert.equal(pantryEmoji("Arroz"), "🍚");
  assert.equal(pantryEmoji(""), PANTRY_FALLBACK_GLYPH);
  assert.equal(pantryEmoji("Receita da vó"), PANTRY_FALLBACK_GLYPH);
  assert.equal(PANTRY_FALLBACK_GLYPH, "🍽️");
});

test("passo da quantidade: começa no passo, nunca zera e respeita o limite", () => {
  assert.equal(stepPantryQuantity(null, "un", 1), 1);
  assert.equal(stepPantryQuantity(null, "g", -1), null);
  assert.equal(stepPantryQuantity(1, "un", -1), 1);
  assert.equal(stepPantryQuantity(0.5, "kg", 1), 1);
  assert.equal(stepPantryQuantity(100, "g", -1), 50);
  assert.equal(stepPantryQuantity(99990, "g", 1), 100000);
  assert.equal(stepPantryQuantity(0.3, "kg", 1), 0.8);
  assert.equal(stepPantryQuantity(1.5, "l", -1), 1);
  assert.equal(canDecreaseQuantity(1, "un"), false);
  assert.equal(canDecreaseQuantity(2, "un"), true);
  assert.equal(canDecreaseQuantity(null, "g"), false);
  assert.equal(canDecreaseQuantity(50, "g"), false);
  assert.equal(canDecreaseQuantity(0.8, "kg"), true);
  assert.deepEqual([...EXPIRY_SHORTCUTS], [3, 7]);
});

test("rótulos do resumo no singular e no plural", () => {
  const expected: Record<PantryStatusFilter, [string, string, string]> = {
    available: ["0 disponíveis", "1 disponível", "3 disponíveis"],
    soon: ["0 vencem em breve", "1 vence em breve", "3 vencem em breve"],
    expired: ["0 vencidos", "1 vencido", "3 vencidos"],
  };
  for (const [kind, labels] of Object.entries(expected) as [PantryStatusFilter, string[]][])
    assert.deepEqual(
      [0, 1, 3].map((n) => summaryTileLabel(kind, n)),
      labels,
    );
});

test("texto do cartão da despensa: vazio, tudo disponível e com vencidos de fora", () => {
  assert.equal(
    pantryCardText([], TODAY),
    "Cadastre seus alimentos ou fotografe suas compras realizadas.",
  );
  assert.equal(
    pantryCardText([item("Arroz"), item("Feijão")], TODAY),
    "2 alimentos disponíveis para suas receitas.",
  );
  assert.equal(
    pantryCardText([item("Arroz"), item("Leite", { expiresOn: day(-1) })], TODAY),
    "1 alimento disponível para suas receitas. 1 vencido fica de fora.",
  );
  assert.equal(
    pantryCardText(
      [
        item("Arroz"),
        item("Iogurte", { expiresOn: day(2) }),
        item("Queijo", { expiresOn: day(10) }),
        item("Leite", { expiresOn: day(-1) }),
        item("Creme", { expiresOn: day(-4) }),
      ],
      TODAY,
    ),
    "3 alimentos disponíveis para suas receitas. 2 vencidos ficam de fora.",
  );
});

test("rascunhos do reconhecimento com calorias ocultas chegam mascarados e dentro do limite", () => {
  const drafts = [
    { ...emptyPantryDraft(), name: "Barra 200 kcal", notes: "Cada porção tem 150 kcal." },
    { ...emptyPantryDraft("geladeira"), name: `${"Iogurte ".repeat(14)}90 kcal`, notes: "" },
  ];
  const frozen = Object.freeze(drafts.map((d) => Object.freeze({ ...d })));
  const hidden = visibleScanDrafts(frozen, true);
  const pattern = new RegExp(CALORIE_PATTERN.source, "i");
  for (const draft of hidden) {
    assert.doesNotMatch(draft.name, pattern);
    assert.doesNotMatch(draft.notes, pattern);
    assert.ok(draft.name.length <= 120);
    assert.ok(draft.notes.length <= 500);
  }
  assert.equal(hidden[0].name, "Barra calorias ocultas");
  assert.equal(hidden[1].location, "geladeira");
  assert.equal(frozen[0].name, "Barra 200 kcal");
  assert.deepEqual(visibleScanDrafts(drafts, false), drafts);
});
