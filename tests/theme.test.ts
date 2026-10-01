import { test } from "node:test";
import assert from "node:assert/strict";
import {
  memoByScheme,
  parseThemePref,
  resolveTheme,
  THEME_COPY,
  THEME_PREFS,
  THEME_STORAGE_KEY,
  themeAttribute,
  type ThemeName,
  type ThemePref,
} from "../src/lib/theme";

test("preferência de tema: só os três valores válidos; o resto vira Sistema", () => {
  for (const pref of THEME_PREFS) assert.equal(parseThemePref(pref), pref);
  for (const invalid of [null, undefined, "", "dark", "light", "Escuro", " claro", 1, true, {}, ["escuro"]])
    assert.equal(parseThemePref(invalid), "sistema", JSON.stringify(invalid));
  assert.deepEqual([...THEME_PREFS], ["sistema", "claro", "escuro"]);
  assert.equal(THEME_STORAGE_KEY, "webfit-theme");
});

test("tema efetivo: escolha explícita vence o aparelho; Sistema segue o aparelho", () => {
  const table: [ThemePref, boolean, ThemeName][] = [
    ["sistema", false, "light"],
    ["sistema", true, "dark"],
    ["claro", false, "light"],
    ["claro", true, "light"],
    ["escuro", false, "dark"],
    ["escuro", true, "dark"],
  ];
  for (const [pref, systemDark, expected] of table)
    assert.equal(resolveTheme(pref, systemDark), expected, `${pref} com aparelho ${systemDark ? "escuro" : "claro"}`);
});

test("data-theme: Sistema não fixa nada; Claro e Escuro fixam o tema", () => {
  assert.equal(themeAttribute("sistema"), null);
  assert.equal(themeAttribute("claro"), "light");
  assert.equal(themeAttribute("escuro"), "dark");
});

test("memoByScheme cria um valor por tema, uma vez só, e devolve o mesmo objeto", () => {
  const calls: ThemeName[] = [];
  const styles = memoByScheme((scheme) => {
    calls.push(scheme);
    return { scheme, card: { padding: 16 } };
  });
  const light = styles("light");
  assert.equal(styles("light"), light);
  const dark = styles("dark");
  assert.equal(styles("dark"), dark);
  assert.notEqual(light, dark);
  assert.equal(light.scheme, "light");
  assert.equal(dark.scheme, "dark");
  assert.deepEqual(calls, ["light", "dark"]);
});

test("memoByScheme guarda também valores falsos sem recriar", () => {
  let calls = 0;
  const flag = memoByScheme(() => {
    calls += 1;
    return 0;
  });
  assert.equal(flag("dark"), 0);
  assert.equal(flag("dark"), 0);
  assert.equal(calls, 1);
});

test("textos da Aparência cobrem as três opções, com o aviso de que vale só para o aparelho", () => {
  for (const pref of THEME_PREFS) {
    assert.ok(THEME_COPY.options[pref].length > 0, pref);
    assert.ok(THEME_COPY.details[pref].length > 0, pref);
  }
  assert.deepEqual(THEME_COPY.options, { sistema: "Sistema", claro: "Claro", escuro: "Escuro" });
  assert.equal(THEME_COPY.row, "Aparência");
  assert.equal(THEME_COPY.title, "Aparência");
  assert.equal(THEME_COPY.group, "Tema");
  assert.equal(THEME_COPY.hint, "Vale só para este aparelho.");
});
