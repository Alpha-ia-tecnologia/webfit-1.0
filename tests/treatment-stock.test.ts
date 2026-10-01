import { test } from "node:test";
import assert from "node:assert/strict";
import {
  injectionSchema,
  stateSchema,
  treatmentStockSchema,
  type InjectionEntry,
  type TreatmentStock,
} from "../src/types";
import {
  NOTICE_USE_BY_PAST,
  penFill,
  STOCK_COPY,
  STOCK_NOTICES,
  stockDefaults,
  stockDraft,
  stockModel,
  vialLiquid,
  type StockDraftInput,
  type StockModel,
} from "../src/lib/treatment-stock";
import { parseBackup } from "../src/lib/backup";
import { initialState } from "../src/lib/domain";
import { stateFixture } from "./fixtures";

const T = "2026-09-28";
const ADULT = { pregnancy: "nao" as const };
const PREGNANT = { pregnancy: "gestacao" as const };
const NO_ADVICE = /aument|reduz|ajust|mantenha|dobr|atrasad|\bmg\b|\bUI\b/i;
let seq = 0;
const meta = (date: string) => {
  seq += 1;
  return {
    id: `inj-${seq}`,
    userId: "u",
    date,
    time: "08:00",
    createdAt: `${date}T08:00:00.${String(seq).padStart(3, "0")}Z`,
    updatedAt: `${date}T08:00:00.000Z`,
    medication: "Tirzepatida",
    site: "abdomen",
  };
};
/** Frasco de Tirzepatida a 5 mg/ml, `units` UI na seringa de 100. */
const vial = (date: string, units: number): InjectionEntry =>
  injectionSchema.parse({
    ...meta(date),
    method: "frasco",
    concentrationMgPerMl: 5,
    syringeUnits: 100,
    units,
    volumeMl: units / 100,
    doseMg: (units / 100) * 5,
  });
const pen = (date: string, method: "caneta" | "dose_unica" = "caneta"): InjectionEntry =>
  injectionSchema.parse({ ...meta(date), method, doseMg: 5 });
const stock = (over: Partial<TreatmentStock>): TreatmentStock =>
  treatmentStockSchema.parse({ method: "frasco", volumeMl: 2, openedOn: "2026-09-07", ...over });
const FRASCO = stock({ useBy: "2026-10-15" });
const WEEKLY_50 = [vial("2026-09-07", 50), vial("2026-09-14", 50), vial("2026-09-21", 50)];

const allStrings = (m: StockModel) =>
  [m.title, m.amount, m.dosesChip, m.useByChip, m.aria, ...m.notices].filter((s): s is string => s !== null);

test("frasco: resta 0,50 ml, cerca de 1 dose igual à última e o aviso de reposição", () => {
  assert.deepEqual(stockModel(FRASCO, WEEKLY_50, ADULT, T), {
    method: "frasco",
    title: "Frasco",
    amount: "0,50 ml de 2,00 ml",
    level: 0.25,
    counted: 3,
    dosesLeft: 1,
    dosesChip: "≈ 1 dose",
    useByChip: "usar até 15/10",
    isUseByPast: false,
    notices: [STOCK_NOTICES.frasco.one],
    showsCounts: true,
    aria: "Frasco: 0,50 ml de 2,00 ml, cerca de 1 dose igual à última registrada, usar até 15/10.",
  });
  assert.equal(
    STOCK_NOTICES.frasco.one,
    "Pelas aplicações registradas, este frasco tem cerca de 1 dose igual à última. Se precisar de mais, organize a reposição com antecedência.",
  );
});

test("frasco: depois da quarta aplicação o frasco pode ter acabado", () => {
  const model = stockModel(FRASCO, [...WEEKLY_50, vial("2026-09-28", 50)], ADULT, T);
  assert.equal(model.amount, "0,00 ml de 2,00 ml");
  assert.equal(model.level, 0);
  assert.equal(model.dosesLeft, 0);
  assert.equal(model.dosesChip, null);
  assert.deepEqual(model.notices, [STOCK_NOTICES.frasco.none]);
});

test("frasco: divide o que resta pela última dose registrada", () => {
  const entries = [vial("2026-09-01", 37), vial("2026-09-08", 37), vial("2026-09-15", 75), vial("2026-09-22", 75)];
  const small = stockModel(stock({ volumeMl: 2.4, openedOn: "2026-09-01" }), entries, ADULT, T);
  assert.equal(small.dosesLeft, 0);
  assert.equal(small.amount, "0,16 ml de 2,40 ml");
  const big = stockModel(stock({ volumeMl: 3, openedOn: "2026-09-01" }), entries, ADULT, T);
  assert.equal(big.amount, "0,76 ml de 3,00 ml");
  assert.equal(big.dosesLeft, 1);
});

test("frasco: ignora aplicações antes da abertura, futuras e de caneta; registro cru sem método conta", () => {
  const { method: _method, ...raw } = vial("2026-09-15", 50);
  const entries = [
    vial("2026-08-31", 50),
    vial("2026-09-29", 50),
    pen("2026-09-10"),
    raw as InjectionEntry,
  ];
  const model = stockModel(stock({ openedOn: "2026-09-01" }), entries, ADULT, T);
  assert.equal(model.counted, 1);
  assert.equal(model.amount, "1,50 ml de 2,00 ml");
  assert.equal(model.dosesLeft, 3);
  assert.equal(model.dosesChip, "≈ 3 doses");
  assert.deepEqual(model.notices, []);
});

test("frasco: o que resta nunca fica negativo", () => {
  const model = stockModel(stock({ volumeMl: 1 }), WEEKLY_50, ADULT, T);
  assert.equal(model.amount, "0,00 ml de 1,00 ml");
  assert.equal(model.level, 0);
});

test("frasco sem aplicação de frasco: volume cheio e nenhuma contagem de doses", () => {
  const model = stockModel(stock({}), [pen("2026-09-14")], ADULT, T);
  assert.equal(model.dosesLeft, null);
  assert.equal(model.dosesChip, null);
  assert.equal(model.amount, "2,00 ml de 2,00 ml");
  assert.equal(model.level, 1);
  assert.deepEqual(model.notices, []);
});

test("caneta com seletor: doses que restam e avisos com 1 e com nenhuma", () => {
  const caneta = stock({ method: "caneta", volumeMl: null, doses: 4 });
  const two = stockModel(caneta, [pen("2026-09-07"), pen("2026-09-14")], ADULT, T);
  assert.equal(two.amount, "2 de 4 doses");
  assert.equal(two.level, 0.5);
  assert.equal(two.dosesChip, null);
  assert.deepEqual(two.notices, []);
  assert.equal(two.aria, "Caneta: 2 de 4 doses.");
  const one = stockModel(caneta, [pen("2026-09-07"), pen("2026-09-14"), pen("2026-09-21")], ADULT, T);
  assert.equal(one.amount, "1 de 4 doses");
  assert.deepEqual(one.notices, [STOCK_NOTICES.caneta.one]);
  const none = stockModel(caneta, [pen("2026-09-07"), pen("2026-09-14"), pen("2026-09-21"), pen("2026-09-28")], ADULT, T);
  assert.equal(none.amount, "0 de 4 doses");
  assert.deepEqual(none.notices, [STOCK_NOTICES.caneta.none]);
  assert.equal(stockModel(caneta, [vial("2026-09-14", 50)], ADULT, T).counted, 0, "frasco não conta na caneta");
});

test("caneta de dose única: canetas que restam na caixa", () => {
  const box = stock({ method: "dose_unica", volumeMl: null, doses: 2 });
  const model = stockModel(box, [pen("2026-09-21", "dose_unica")], ADULT, T);
  assert.equal(model.title, "Canetas de dose única");
  assert.equal(model.amount, "1 de 2 canetas");
  assert.deepEqual(model.notices, [STOCK_NOTICES.dose_unica.one]);
  assert.deepEqual(stockModel(box, [pen("2026-09-14", "dose_unica"), pen("2026-09-21", "dose_unica")], ADULT, T).notices, [
    STOCK_NOTICES.dose_unica.none,
  ]);
});

test("'usar até' vencido vira aviso âmbar em primeiro; no próprio dia ainda não venceu", () => {
  const past = stockModel(stock({ useBy: "2026-09-27" }), WEEKLY_50, ADULT, T);
  assert.equal(past.useByChip, "data de uso passou: 27/09");
  assert.equal(past.isUseByPast, true);
  assert.equal(past.notices[0], NOTICE_USE_BY_PAST);
  assert.deepEqual(past.notices, [NOTICE_USE_BY_PAST, STOCK_NOTICES.frasco.one]);
  const same = stockModel(stock({ useBy: T }), WEEKLY_50, ADULT, T);
  assert.equal(same.isUseByPast, false);
  assert.equal(same.useByChip, "usar até 28/09");
});

test("gestação: sem contagem de doses; frasco com o volume, canetas 'em uso desde'; 'usar até' vencido segue avisado", () => {
  const vialModel = stockModel(FRASCO, WEEKLY_50, PREGNANT, T);
  assert.equal(vialModel.showsCounts, false);
  assert.equal(vialModel.amount, "0,50 ml de 2,00 ml");
  assert.equal(vialModel.level, 0.25);
  assert.equal(vialModel.dosesLeft, null);
  assert.equal(vialModel.dosesChip, null);
  assert.deepEqual(vialModel.notices, []);
  assert.equal(vialModel.aria, "Frasco: 0,50 ml de 2,00 ml, usar até 15/10.");
  const caneta = stock({ method: "caneta", volumeMl: null, doses: 4 });
  const penModel = stockModel(caneta, [pen("2026-09-07"), pen("2026-09-14"), pen("2026-09-21")], PREGNANT, T);
  assert.equal(penModel.amount, "Em uso desde 07/09");
  assert.equal(penModel.level, null);
  assert.equal(penModel.dosesLeft, null);
  assert.deepEqual(penModel.notices, []);
  assert.deepEqual(stockModel(stock({ useBy: "2026-09-20" }), WEEKLY_50, PREGNANT, T).notices, [NOTICE_USE_BY_PAST]);
});

test("nenhum texto do estoque fala em ajustar, aumentar, mg ou UI", () => {
  const caneta = stock({ method: "caneta", volumeMl: null, doses: 4 });
  const box = stock({ method: "dose_unica", volumeMl: null, doses: 2 });
  const models = [ADULT, PREGNANT].flatMap((p) => [
    stockModel(FRASCO, WEEKLY_50, p, T),
    stockModel(FRASCO, [...WEEKLY_50, vial("2026-09-28", 50)], p, T),
    stockModel(stock({ useBy: "2026-09-10" }), [], p, T),
    stockModel(caneta, [pen("2026-09-21")], p, T),
    stockModel(caneta, [pen("2026-09-07"), pen("2026-09-14"), pen("2026-09-21"), pen("2026-09-28")], p, T),
    stockModel(box, [pen("2026-09-21", "dose_unica")], p, T),
    stockModel(box, [], p, T),
  ]);
  for (const text of [...models.flatMap(allStrings), NOTICE_USE_BY_PAST, ...Object.values(STOCK_NOTICES).flatMap((n) => [n.one, n.none])])
    assert.doesNotMatch(text, NO_ADVICE, text);
});

test("desenho: líquido do frasco e preenchimento da caneta, sempre dentro dos limites", () => {
  assert.deepEqual(vialLiquid(0.25), { y: 70.5, height: 15.5 });
  assert.deepEqual(vialLiquid(0), { y: 86, height: 0 });
  assert.deepEqual(vialLiquid(1.4), { y: 24, height: 62 });
  assert.deepEqual(vialLiquid(Number.NaN), { y: 86, height: 0 });
  assert.equal(penFill(0.5), 44);
  assert.equal(penFill(-1), 0);
  assert.equal(penFill(2), 88);
});

test("stockDraft valida volume, doses, abertura e 'usar até'", () => {
  const base: StockDraftInput = {
    method: "frasco",
    volumeText: "2,4",
    doses: 4,
    openedOn: "2026-09-07",
    useBy: null,
    today: T,
  };
  const ok = stockDraft(base);
  assert.ok(ok.ok);
  assert.deepEqual(ok.stock, { method: "frasco", volumeMl: 2.4, doses: null, openedOn: "2026-09-07", useBy: null });
  assert.ok(treatmentStockSchema.safeParse(ok.stock).success);
  for (const volumeText of ["2,456", "0", "10,5", "", "abc", "-1"]) {
    const bad = stockDraft({ ...base, volumeText });
    assert.equal(bad.ok, false, volumeText);
    if (!bad.ok) {
      assert.equal(bad.field, "volumeMl");
      assert.equal(bad.message, "Informe o volume do frasco em ml (até 10 ml, com até 2 casas).");
    }
  }
  assert.equal(stockDraft({ ...base, volumeText: "10" }).ok, true);
  for (const doses of [0, 61, 2.5]) {
    const caneta = stockDraft({ ...base, method: "caneta", doses });
    assert.deepEqual(caneta, { ok: false, field: "doses", message: "Informe de 1 a 60 doses." });
  }
  assert.deepEqual(stockDraft({ ...base, method: "dose_unica", doses: 0 }), {
    ok: false,
    field: "doses",
    message: "Informe de 1 a 60 canetas.",
  });
  const penDraft = stockDraft({ ...base, method: "caneta", volumeText: "", doses: 4 });
  assert.ok(penDraft.ok);
  assert.deepEqual(penDraft.stock, { method: "caneta", volumeMl: null, doses: 4, openedOn: "2026-09-07", useBy: null });
  assert.deepEqual(stockDraft({ ...base, openedOn: "2026-09-29" }), {
    ok: false,
    field: "openedOn",
    message: "A abertura não pode estar no futuro.",
  });
  assert.deepEqual(stockDraft({ ...base, openedOn: "" }), {
    ok: false,
    field: "openedOn",
    message: "Informe a data de abertura.",
  });
  assert.deepEqual(stockDraft({ ...base, useBy: "2026-09-06" }), {
    ok: false,
    field: "useBy",
    message: "A data de uso deve ser igual ou posterior à abertura.",
  });
  const withUseBy = stockDraft({ ...base, useBy: "2026-10-15" });
  assert.ok(withUseBy.ok);
  assert.equal(withUseBy.stock.useBy, "2026-10-15");
  const blankUseBy = stockDraft({ ...base, useBy: "" });
  assert.ok(blankUseBy.ok);
  assert.equal(blankUseBy.stock.useBy, null);
});

test("stockDefaults: método da última aplicação até hoje ou frasco; 4 doses; abertura hoje", () => {
  assert.deepEqual(stockDefaults([vial("2026-09-07", 50), pen("2026-09-14")], T), {
    method: "caneta",
    doses: 4,
    openedOn: T,
  });
  assert.deepEqual(stockDefaults([], T), { method: "frasco", doses: 4, openedOn: T });
  assert.equal(stockDefaults([pen("2026-09-29", "dose_unica")], T).method, "frasco", "aplicação futura não conta");
});

test("estado e backup: sem estoque vira null, estoque inválido vira null e o válido volta do backup", () => {
  const { treatmentStock: _stock, ...legacy } = stateFixture();
  assert.equal(stateSchema.parse(legacy).treatmentStock, null);
  const invalid = { method: "frasco", volumeMl: 12, doses: null, openedOn: "2026-09-07", useBy: null };
  assert.equal(stateSchema.parse({ ...stateFixture(), treatmentStock: invalid }).treatmentStock, null);
  const restored = parseBackup(JSON.stringify({ ...stateFixture(), treatmentStock: FRASCO }));
  assert.deepEqual(restored.treatmentStock, FRASCO);
  assert.equal(initialState().treatmentStock, null);
});

test("STOCK_COPY: rótulos e dicas por tipo, avisos de desfazer (sem dose)", () => {
  assert.equal(STOCK_COPY.dosesLabel("caneta"), "Doses na caneta");
  assert.equal(STOCK_COPY.dosesLabel("dose_unica"), "Canetas na caixa");
  assert.equal(STOCK_COPY.dosesHint("caneta"), "Quantas aplicações a caneta rende, pela bula ou pela farmácia.");
  assert.equal(STOCK_COPY.dosesHint("dose_unica"), "Canetas de dose única na caixa aberta.");
  assert.equal(STOCK_COPY.saveUndone(true), "Estoque anterior restaurado.");
  assert.equal(STOCK_COPY.saveUndone(false), "Estoque removido.");
  assert.equal(STOCK_COPY.restored, "Estoque restaurado.");
  assert.equal(STOCK_COPY.clearUseBy, "Limpar data de uso");
  const texts = Object.values(STOCK_COPY).flatMap((v) =>
    typeof v === "function" ? [v("caneta" as never), v("dose_unica" as never), v("frasco" as never)] : [v],
  );
  for (const text of texts) assert.doesNotMatch(String(text), /\bmg\b|aument|diminu|dose (?:maior|menor)/i);
});
