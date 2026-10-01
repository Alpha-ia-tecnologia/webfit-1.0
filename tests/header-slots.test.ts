import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeHeaderOptions, sameOptions } from "../src/components/HeaderPortal";

test("cabeçalho sem telas pedindo nada: sino visível, título centrado, sem pílula", () => {
  assert.deepEqual(mergeHeaderOptions({}), {
    subtitle: undefined,
    hideBell: false,
    align: "center",
    hasCenter: false,
  });
});

test("opções somadas: subtítulo mais recente, sino some e alinhamento à esquerda se alguém pedir", () => {
  const merged = mergeHeaderOptions({
    page: { subtitle: "Online · responde com seu contexto", hideBell: true },
    pill: { hasCenter: true },
    other: { align: "start" },
  });
  assert.equal(merged.subtitle, "Online · responde com seu contexto");
  assert.equal(merged.hideBell, true);
  assert.equal(merged.align, "start");
  assert.equal(merged.hasCenter, true);
  assert.equal(mergeHeaderOptions({ a: { subtitle: "um" }, b: { subtitle: "dois" } }).subtitle, "dois");
});

test("sameOptions evita render quando a tela reenvia as mesmas opções", () => {
  assert.equal(sameOptions(undefined, {}), false);
  assert.equal(sameOptions({ hideBell: false }, {}), true);
  assert.equal(sameOptions({ align: "center" }, {}), true);
  assert.equal(sameOptions({ subtitle: "a" }, { subtitle: "a", hideBell: false }), true);
  assert.equal(sameOptions({ subtitle: "a" }, { subtitle: "b" }), false);
  assert.equal(sameOptions({ hasCenter: true }, {}), false);
});
