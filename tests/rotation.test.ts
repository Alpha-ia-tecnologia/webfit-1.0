import { test } from "node:test";
import assert from "node:assert/strict";
import { injectionSchema, type InjectionEntry } from "../src/types";
import { shiftDate } from "../src/lib/dates";
import { parseBackup } from "../src/lib/backup";
import {
  draftInjection,
  injectionDetail,
  injectionSummary,
  lastRecipe,
  otherSide,
  SIDES,
  spotLabel,
  suggestedSide,
  type InjectionInput,
} from "../src/lib/injection";
import {
  FACE_LABEL,
  markText,
  recentMarks,
  ROTATION_RECENT_DAYS,
  rotationAria,
  rotationCallouts,
  rotationModel,
  siteCounts,
  SITE_FACE,
  spotStatus,
} from "../src/lib/rotation";
import {
  badgeGroups,
  BACK_DETAILS,
  FACE_SIDE_ORDER,
  FIGURE_VIEW,
  figurePercent,
  FRONT_DETAILS,
  OUTLINE,
  SPOT_POINTS,
} from "../src/components/injecao/bodyViews";
import { stateFixture } from "./fixtures";

const T = "2026-09-24";
let seq = 0;
/** Tirzepatida 2,5 mg no frasco (5 mg/ml, 50 UI), `days` dias a partir de T. */
function shot(days: number, over: Record<string, unknown> = {}): InjectionEntry {
  seq += 1;
  return injectionSchema.parse({
    id: `rot-${seq}`,
    userId: "user",
    date: shiftDate(T, days),
    time: "08:30",
    createdAt: `2026-09-01T08:00:00.${String(seq).padStart(3, "0")}Z`,
    updatedAt: "2026-09-01T08:00:00.000Z",
    medication: "Tirzepatida",
    concentrationMgPerMl: 5,
    syringeUnits: 100,
    units: 50,
    volumeMl: 0.5,
    doseMg: 2.5,
    site: "abdomen",
    ...over,
  });
}
/** Semaglutida 37 UI a 1,34 mg/ml na coxa, como o diário mostra. */
const vial = (over: Record<string, unknown> = {}) =>
  shot(0, {
    medication: "Semaglutida",
    concentrationMgPerMl: 1.34,
    syringeUnits: 50,
    units: 37,
    volumeMl: 0.37,
    doseMg: 0.4958,
    site: "coxa",
    ...over,
  });
const PEN = {
  method: "caneta",
  medication: "Mounjaro",
  concentrationMgPerMl: null,
  syringeUnits: null,
  units: null,
  volumeMl: null,
} as const;
/** Objeto cru anterior ao lado e ao método (o2l4 passa um assim para injectionDetail). */
function raw(e: InjectionEntry): Record<string, unknown> {
  const { side: _side, method: _method, ...rest } = e;
  return rest;
}
/** Braço esquerdo −16, coxa direita −9, abdômen à esquerda −2. */
const history = () => [
  shot(-16, { site: "braco", side: "esquerdo" }),
  shot(-9, { site: "coxa", side: "direito" }),
  shot(-2, { site: "abdomen", side: "esquerdo" }),
];

test("nome do ponto: local e lado da pessoa; sem lado, só o local", () => {
  const labels = (["abdomen", "coxa", "braco"] as const).flatMap((site) =>
    SIDES.map((s) => spotLabel(site, s.key)),
  );
  assert.deepEqual(labels, [
    "Abdômen à esquerda",
    "Abdômen à direita",
    "Coxa esquerda",
    "Coxa direita",
    "Braço esquerdo",
    "Braço direito",
  ]);
  assert.equal(spotLabel("coxa", null), "Coxa");
  assert.equal(spotLabel("coxa", undefined), "Coxa");
  assert.deepEqual(SIDES.map((s) => s.label), ["Esquerdo", "Direito"]);
  assert.equal(otherSide("esquerdo"), "direito");
  assert.equal(otherSide("direito"), "esquerdo");
});

test("linha do diário mostra o lado quando existe e fica igual sem ele", () => {
  assert.equal(injectionDetail(vial({ side: "direito" })), "37 UI · 0,37 ml · Coxa direita");
  assert.equal(
    injectionDetail(shot(0, { ...PEN, site: "braco", side: "esquerdo" })),
    "Caneta · Braço esquerdo",
  );
  assert.equal(injectionDetail(raw(vial()) as unknown as InjectionEntry), "37 UI · 0,37 ml · Coxa");
  assert.equal(injectionDetail(vial()), "37 UI · 0,37 ml · Coxa");
  assert.equal(injectionDetail(shot(0, { ...PEN, site: "coxa" })), "Caneta · Coxa");
  assert.equal(
    injectionDetail(shot(0, { ...PEN, method: "dose_unica", site: "braco" })),
    "Dose única · Braço",
  );
});

test("esquema e backup: registros antigos ficam sem lado; só esquerdo/direito valem", () => {
  const legacy = injectionSchema.parse(raw(vial()));
  assert.equal(legacy.side, null);
  assert.equal(injectionSchema.parse({ ...vial(), side: "esquerdo" }).side, "esquerdo");
  assert.equal(injectionSchema.safeParse({ ...vial(), side: "frente" }).success, false);
  const base = stateFixture();
  const legacyState = {
    ...base,
    injections: [raw(vial({ userId: base.userId })), raw(shot(-7, { userId: base.userId }))],
  };
  const restored = parseBackup(JSON.stringify(legacyState)).injections;
  assert.equal(restored.length, 2);
  assert.ok(restored.every((e) => e.side === null));
  const input: InjectionInput = {
    id: "d1",
    userId: "user",
    now: "2026-09-24T11:30:00.000Z",
    today: T,
    date: T,
    time: "08:30",
    method: "caneta",
    medication: "Mounjaro",
    units: null,
    concentration: null,
    syringe: null,
    doseMg: 2.5,
    site: "coxa",
    notes: "",
  };
  const withSide = draftInjection({ ...input, side: "esquerdo" });
  assert.ok(withSide.ok);
  assert.equal(withSide.entry.side, "esquerdo");
  const withoutSide = draftInjection(input);
  assert.ok(withoutSide.ok);
  assert.equal(withoutSide.entry.side, null);
});

test("lado sugerido: o oposto do último lado conhecido no local, sem inventar", () => {
  assert.equal(suggestedSide([], "coxa", T), null);
  assert.equal(suggestedSide([shot(-9, { site: "coxa", side: "direito" })], "coxa", T), "esquerdo");
  // Registros sem lado são ignorados: vale o último lado conhecido.
  assert.equal(
    suggestedSide(
      [shot(-16, { site: "coxa", side: "esquerdo" }), shot(-9, { site: "coxa" })],
      "coxa",
      T,
    ),
    "direito",
  );
  // Datas futuras não contam.
  assert.equal(
    suggestedSide(
      [shot(-9, { site: "coxa", side: "direito" }), shot(2, { site: "coxa", side: "esquerdo" })],
      "coxa",
      T,
    ),
    "esquerdo",
  );
  // Outros locais não interferem.
  assert.equal(suggestedSide([shot(-2, { site: "abdomen", side: "esquerdo" })], "coxa", T), null);
  assert.equal(suggestedSide(history(), "braco", T), "direito");
});

test("resumo e receita trazem o lado sugerido; a receita repete com lados diferentes", () => {
  const list = history();
  const summary = injectionSummary(list, T);
  assert.equal(summary.suggestedSite, "coxa");
  assert.equal(summary.suggestedSide, suggestedSide(list, summary.suggestedSite, T));
  assert.equal(summary.suggestedSide, "esquerdo");
  const recipe = lastRecipe(list, T)!;
  assert.equal(recipe.site, "coxa");
  assert.equal(recipe.side, suggestedSide(list, recipe.site, T));
  assert.equal(recipe.repeats, 3);
  assert.equal(injectionSummary([], T).suggestedSide, null);
  assert.equal(lastRecipe([shot(-2)], T)!.side, null);
});

test("últimas aplicações: as 3 mais novas com data até hoje, 1 = a mais recente", () => {
  const marks = recentMarks([...history(), shot(3, { site: "coxa", side: "esquerdo" })], T);
  assert.deepEqual(
    marks.map((m) => [m.rank, m.site, m.side, m.daysAgo, m.date]),
    [
      [1, "abdomen", "esquerdo", 2, "2026-09-22"],
      [2, "coxa", "direito", 9, "2026-09-15"],
      [3, "braco", "esquerdo", 16, "2026-09-08"],
    ],
  );
  assert.deepEqual(recentMarks(history(), T, 0), []);
  assert.equal(recentMarks([shot(-40), ...history()], T).length, 3);
  assert.equal(markText(marks[0]!), "1, Abdômen à esquerda, há 2 dias");
});

test("nome acessível do mapa: sugestão, últimas aplicações e lado não informado", () => {
  assert.equal(
    rotationModel(history(), T).aria,
    "Mapa de rodízio. Sugerido: Coxa esquerda. Últimas aplicações: 1, Abdômen à esquerda, há 2 dias; 2, Coxa direita, há 9 dias; 3, Braço esquerdo, há 16 dias.",
  );
  const legacyArm = [
    shot(-16, { site: "braco" }),
    shot(-9, { site: "coxa", side: "direito" }),
    shot(-2, { site: "abdomen", side: "esquerdo" }),
  ];
  assert.equal(
    rotationModel(legacyArm, T).aria,
    "Mapa de rodízio. Sugerido: Coxa esquerda. Últimas aplicações: 1, Abdômen à esquerda, há 2 dias; 2, Coxa direita, há 9 dias; 3, Braço, lado não informado, há 16 dias.",
  );
  const empty = rotationModel([], T);
  assert.deepEqual(empty.suggested, { site: "abdomen", side: null });
  assert.equal(empty.aria, "Mapa de rodízio. Sugerido: Abdômen. Nenhuma aplicação registrada ainda.");
  assert.equal(rotationAria({ suggested: empty.suggested, marks: [] }), empty.aria);
});

test("selos do mapa: lado da pessoa na figura certa, marcas no mesmo ponto juntas", () => {
  const groups = badgeGroups(rotationModel(history(), T).marks);
  assert.equal(groups.length, 3);
  const belly = groups.find((g) => g.site === "abdomen")!;
  assert.deepEqual([belly.face, belly.left, belly.text], ["frente", 63, "1"]);
  // De frente, o lado esquerdo da pessoa fica à direita de quem olha.
  assert.ok(belly.left > 50);
  const arm = groups.find((g) => g.site === "braco")!;
  assert.deepEqual([arm.face, arm.left, arm.text], ["costas", 21, "3"]);
  // De costas, o lado esquerdo da pessoa fica à esquerda de quem olha.
  assert.ok(arm.left < 50);
  const same = badgeGroups(
    recentMarks(
      [
        shot(-16, { site: "coxa", side: "direito" }),
        shot(-9, { site: "braco" }),
        shot(-2, { site: "coxa", side: "direito" }),
      ],
      T,
    ),
  );
  assert.equal(same.length, 1);
  assert.deepEqual([same[0]!.text, same[0]!.ranks], ["1 · 3", [1, 3]]);
  assert.deepEqual(figurePercent({ cx: 103, cy: 96 }), { left: 63, top: 41.1 });
});

test("locais nos últimos 90 dias: dia 89 entra, dia 90 fica de fora", () => {
  const list = [
    shot(-90, { site: "braco" }),
    shot(-89, { site: "braco" }),
    shot(-30, { site: "coxa" }),
    shot(-2, { site: "abdomen" }),
    shot(0, { site: "abdomen" }),
    shot(1, { site: "coxa" }),
  ];
  const result = siteCounts(list, T);
  assert.deepEqual(result.counts.map((c) => [c.site, c.label, c.count]), [
    ["abdomen", "Abdômen", 2],
    ["coxa", "Coxa", 1],
    ["braco", "Braço", 1],
  ]);
  assert.equal(result.total, 4);
  assert.equal(result.aria, "Locais nos últimos 90 dias: Abdômen 2, Coxa 1, Braço 1");
  const none = siteCounts([], T);
  assert.equal(none.total, 0);
  assert.equal(none.aria, "Locais nos últimos 90 dias: nenhuma aplicação");
});

test("figuras: todos os pontos dentro do recorte e braço nas costas", () => {
  for (const site of ["abdomen", "coxa", "braco"] as const)
    for (const s of SIDES) {
      const p = SPOT_POINTS[site][s.key];
      assert.ok(p.cx >= FIGURE_VIEW.x && p.cx <= FIGURE_VIEW.x + FIGURE_VIEW.width, `${site} ${s.key} x`);
      assert.ok(p.cy >= FIGURE_VIEW.y && p.cy <= FIGURE_VIEW.y + FIGURE_VIEW.height, `${site} ${s.key} y`);
    }
  assert.equal(SITE_FACE.braco, "costas");
  assert.equal(SITE_FACE.abdomen, "frente");
  assert.deepEqual(FACE_LABEL, { frente: "Frente", costas: "Costas" });
  assert.deepEqual(FACE_SIDE_ORDER.frente, ["direito", "esquerdo"]);
  assert.equal(OUTLINE.length, 2);
  assert.ok(FRONT_DETAILS.length > 0 && BACK_DETAILS.length === 8);
});

test("cartão Rodízio de locais: última, recente e livre por data; sugestão; nada inventado", () => {
  assert.equal(ROTATION_RECENT_DAYS, 14);
  assert.equal(spotStatus({ rank: 1, daysAgo: 30 }), "ultima");
  assert.equal(spotStatus({ rank: 2, daysAgo: 13 }), "recente");
  assert.equal(spotStatus({ rank: 3, daysAgo: 14 }), "livre");
  // Conceito 10: braço esq. −16, coxa esq. −9, abdômen sem lado −2 → sugestão coxa direita.
  const concept = [
    shot(-16, { site: "braco", side: "esquerdo" }),
    shot(-9, { site: "coxa", side: "esquerdo" }),
    shot(-2, { site: "abdomen" }),
  ];
  const view = rotationCallouts(concept, T);
  assert.deepEqual(view.suggested, { site: "coxa", side: "direito" });
  assert.equal(view.suggestedLabel, "Coxa direita");
  assert.deepEqual(
    view.callouts.map((c) => [c.label, c.detail, c.status, c.side]),
    [
      ["Abdômen", "última · há 2 dias", "ultima", null],
      ["Coxa esq.", "recente · há 9 dias", "recente", "esquerdo"],
      ["Braço esq.", "livre · há 16 dias", "livre", "esquerdo"],
    ],
  );
  assert.match(view.aria, /^Mapa de rodízio\. Sugerido: Coxa direita\./);
  assert.equal(view.count, 3);
  // O mesmo ponto duas vezes: vale a aplicação mais recente.
  const twice = rotationCallouts([shot(-9, { site: "coxa", side: "direito" }), shot(-2, { site: "coxa", side: "direito" })], T);
  assert.deepEqual(twice.callouts.map((c) => [c.rank, c.status]), [[1, "ultima"]]);
  assert.deepEqual(rotationCallouts([], T).callouts, []);
});
