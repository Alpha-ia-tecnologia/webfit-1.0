import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_WELLBEING_TAGS,
  WELLBEING_TAGS,
  canCelebrate,
  sleepLabel,
  toggleTag,
  whenDayLabel,
} from "../src/lib/wellbeing";
import { searchDiary } from "../src/lib/diary-day";
import { diarySchema } from "../src/types";

const entry = (tags?: string[]) => ({
  id: "b1",
  userId: "u",
  date: "2026-09-20",
  time: "08:10",
  createdAt: "2026-09-20T08:10:00.000Z",
  updatedAt: "2026-09-20T08:10:00.000Z",
  type: "bem_estar" as const,
  title: "Bem-estar",
  description: "",
  rating: 4,
  sleepHours: 7,
  ...(tags ? { tags } : {}),
});

test("marcadores são opcionais e limitados a 8 por registro", () => {
  assert.equal(diarySchema.safeParse(entry()).success, true);
  assert.equal(diarySchema.safeParse(entry(["Náusea", "Calma"])).success, true);
  assert.equal(diarySchema.safeParse(entry(Array.from({ length: 9 }, (_, i) => `t${i}`))).success, false);
  assert.equal(diarySchema.safeParse(entry([""])).success, false);
});

test("toggleTag liga, desliga e respeita o limite", () => {
  assert.deepEqual(toggleTag([], "Calma"), ["Calma"]);
  assert.deepEqual(toggleTag(["Calma", "Fome"], "Calma"), ["Fome"]);
  const full = WELLBEING_TAGS.slice(0, MAX_WELLBEING_TAGS);
  assert.equal(toggleTag(full, WELLBEING_TAGS[MAX_WELLBEING_TAGS]!).length, MAX_WELLBEING_TAGS);
});

test("linha 'Hoje · agora' e rótulo do sono em pt-BR", () => {
  assert.equal(whenDayLabel("2026-09-26", "2026-09-26", "2026-09-25"), "Hoje");
  assert.equal(whenDayLabel("2026-09-25", "2026-09-26", "2026-09-25"), "Ontem");
  assert.equal(whenDayLabel("2026-09-02", "2026-09-26", "2026-09-25"), "02/09");
  assert.equal(sleepLabel(7.5), "Sono 7,5 h");
});

test("celebração desligada para transtorno alimentar, gestação, amamentação, sem resposta ou menor de idade", () => {
  const adult = { birthDate: "1990-01-01" } as const;
  const today = "2026-09-28";
  assert.equal(canCelebrate({ ...adult, eatingDisorder: "nao", pregnancy: "nao" }, today), true);
  assert.equal(canCelebrate({ ...adult, eatingDisorder: "sim", pregnancy: "nao" }, today), false);
  assert.equal(canCelebrate({ ...adult, eatingDisorder: "nao", pregnancy: "gestacao" }, today), false);
  assert.equal(canCelebrate({ ...adult, eatingDisorder: "nao", pregnancy: "amamentacao" }, today), false);
  assert.equal(canCelebrate({ ...adult, eatingDisorder: "nao_informado", pregnancy: "nao" }, today), false);
  assert.equal(canCelebrate({ birthDate: "2010-05-01", eatingDisorder: "nao", pregnancy: "nao" }, today), false);
  assert.equal(canCelebrate({ birthDate: "2008-09-28", eatingDisorder: "nao", pregnancy: "nao" }, today), true);
});

test("a busca do diário encontra bem-estar pelos marcadores", () => {
  const groups = searchDiary([diarySchema.parse(entry(["Náusea"]))], [], "nausea");
  assert.equal(groups.length, 1);
  assert.match(groups[0]!.hits[0]!.detail, /Náusea/);
});
