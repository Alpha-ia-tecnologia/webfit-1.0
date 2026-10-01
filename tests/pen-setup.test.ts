import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completeAnamnese,
  isWeeklyDraft,
  PEN_LAST_BLOCK_TEXT,
  penFirstEntry,
  penFrequencyOf,
  penLastPreview,
  penMedicationConflict,
  penMedicationLabel,
  WEEKDAYS,
  weekdayOf,
} from "../src/lib/pen-setup";
import { initialState, shiftDate, updateProfile } from "../src/lib/domain";
import { injectionSchema, type Draft } from "../src/types";
import { profileFixture } from "./fixtures";

const TODAY = "2026-09-27";
const NOW = "08:30";
const ctx = {
  id: "inj-1",
  userId: "user-1",
  nowIso: "2026-09-27T11:30:00.000Z",
  today: TODAY,
  now: NOW,
};
const pen = (changes: Draft = {}): Draft => ({
  weightLossPen: "sim",
  weightLossPenName: "Mounjaro (tirzepatida)",
  weightLossPenDose: "5 mg",
  weightLossPenPerMonth: 4,
  penLastDate: "2026-09-26",
  penLastSite: "abdomen",
  penMethod: "caneta",
  ...changes,
});

test("frequência da caneta e dia da semana", () => {
  assert.equal(penFrequencyOf(4), "semanal");
  assert.equal(penFrequencyOf("4"), "semanal");
  assert.equal(penFrequencyOf(30), "diaria");
  assert.equal(penFrequencyOf(28), "diaria");
  assert.equal(penFrequencyOf(2), "outra");
  assert.equal(penFrequencyOf(""), null);
  assert.equal(isWeeklyDraft(pen()), true);
  assert.equal(isWeeklyDraft(pen({ weightLossPenPerMonth: 30 })), false);
  assert.equal(isWeeklyDraft(pen({ weightLossPen: "nao" })), false);
  assert.equal(isWeeklyDraft(pen({ weightLossPenPerMonth: "" })), false);
  assert.equal(weekdayOf("2026-09-24"), 4);
  assert.equal(WEEKDAYS[4].plural, "quintas");
  assert.equal(WEEKDAYS.length, 7);
});

test("caneta com “Não uso medicamentos” vira um aviso com a correção", () => {
  assert.deepEqual(
    penMedicationConflict({ weightLossPen: "sim", medications: "Não uso medicamentos" }),
    {
      text: "Você marcou “Não uso medicamentos”, mas usa uma caneta. Ela também conta como medicamento.",
      actionLabel: "Incluir nos medicamentos",
      fix: "Medicamento para emagrecer",
    },
  );
  assert.equal(
    penMedicationConflict({ weightLossPen: "sim", medications: "Não uso medicamentos, vitamina C" })?.fix,
    "Medicamento para emagrecer, vitamina C",
  );
  assert.equal(penMedicationConflict({ weightLossPen: "nao", medications: "Não uso medicamentos" }), null);
  assert.equal(penMedicationConflict({ weightLossPen: "sim", medications: "Insulina" }), null);
});

test("rótulo do registro: nome da calculadora ou o informado; sem nome, nada", () => {
  assert.equal(penMedicationLabel("Mounjaro (tirzepatida)"), "Tirzepatida");
  assert.equal(penMedicationLabel("Ozempic (semaglutida)"), "Semaglutida");
  assert.equal(penMedicationLabel("Saxenda (liraglutida)"), "Saxenda (liraglutida)");
  assert.equal(penMedicationLabel("Não sei o nome"), null);
  assert.equal(penMedicationLabel(""), null);
});

test("pré-visualização da última aplicação: bloqueios na ordem e texto do registro", () => {
  const cases: [Draft, keyof typeof PEN_LAST_BLOCK_TEXT][] = [
    [pen({ weightLossPenName: "" }), "caneta"],
    [pen({ weightLossPenName: "Não sei o nome", weightLossPenDose: "" }), "caneta"],
    [pen({ weightLossPenDose: "Não sei a dose", penLastDate: "" }), "dose"],
    [pen({ penLastDate: "", penLastSite: "" }), "data"],
    [pen({ penLastDate: "2026-09-28" }), "data"],
    [pen({ penLastDate: shiftDate(TODAY, -61) }), "data"],
    [pen({ penLastSite: "", penMethod: "" }), "local"],
    [pen({ penMethod: "frasco" }), "tipo"],
  ];
  for (const [answers, block] of cases) {
    const preview = penLastPreview(answers, TODAY, NOW);
    assert.equal(preview.block, block, JSON.stringify(answers));
    assert.equal(preview.text, PEN_LAST_BLOCK_TEXT[block]);
  }
  assert.deepEqual(penLastPreview(pen(), TODAY, NOW), {
    block: null,
    text: "Tirzepatida 5,00 mg · Caneta · Abdômen · ontem, 12:00",
  });
  assert.equal(
    penLastPreview(pen({ penLastDate: TODAY, penMethod: "dose_unica", penLastSite: "coxa" }), TODAY, NOW).text,
    "Tirzepatida 5,00 mg · Dose única · Coxa · hoje, 08:30",
  );
  assert.equal(penLastPreview(pen({ penLastDate: shiftDate(TODAY, -60) }), TODAY, NOW).block, null);
  assert.match(penLastPreview(pen({ penLastDate: "2026-09-20" }), TODAY, NOW).text, /· \S+, 20 set, 12:00$/);
});

test("primeira aplicação só com confirmação explícita e dados válidos", () => {
  assert.equal(penFirstEntry(pen(), ctx), null);
  assert.equal(penFirstEntry(pen({ penLastConfirmed: "true" }), ctx), null);
  const confirmed = (changes: Draft = {}) => pen({ penLastConfirmed: true, ...changes });
  assert.equal(penFirstEntry(confirmed({ weightLossPenDose: "Não sei a dose" }), ctx), null);
  assert.equal(penFirstEntry(confirmed({ penLastDate: shiftDate(TODAY, -61) }), ctx), null);
  assert.equal(penFirstEntry(confirmed({ penLastDate: "2026-09-28" }), ctx), null);
  assert.equal(penFirstEntry(confirmed({ weightLossPen: "nao" }), ctx), null);
  const entry = penFirstEntry(confirmed(), ctx)!;
  assert.equal(entry.method, "caneta");
  assert.equal(entry.medication, "Tirzepatida");
  assert.equal(entry.doseMg, 5);
  assert.equal(entry.date, "2026-09-26");
  assert.equal(entry.time, "12:00");
  assert.equal(entry.site, "abdomen");
  assert.equal(entry.concentrationMgPerMl, null);
  assert.equal(entry.syringeUnits, null);
  assert.equal(entry.units, null);
  assert.equal(entry.volumeMl, null);
  assert.equal(entry.userId, "user-1");
  assert.deepEqual(injectionSchema.parse(entry), entry);
  assert.equal(penFirstEntry(confirmed({ penLastDate: TODAY }), ctx)!.time, NOW);
});

test("concluir a anamnese grava o perfil e, uma vez só, a primeira aplicação", () => {
  const state = initialState();
  const profile = profileFixture();
  const entry = penFirstEntry(pen({ penLastConfirmed: true }), { ...ctx, userId: state.userId })!;
  const next = completeAnamnese(state, profile, entry);
  assert.deepEqual(next.injections, [entry]);
  assert.equal(next.profile?.name, profile.name);
  assert.equal(next.draft, null);
  assert.equal(state.injections.length, 0, "sem mutação");
  const withHistory = { ...state, injections: [{ ...entry, id: "old" }] };
  assert.deepEqual(
    completeAnamnese(withHistory, profile, entry).injections,
    withHistory.injections,
  );
  const plain = completeAnamnese(state, profile, null);
  const expected = updateProfile(state, profile);
  const withoutIds = (s: typeof plain) => ({
    ...s,
    measurements: s.measurements.map(({ id: _id, ...m }) => m),
  });
  assert.deepEqual(withoutIds(plain), withoutIds(expected));
});
