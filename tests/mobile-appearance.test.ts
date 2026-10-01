import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_THEME_PREF,
  parseThemePref,
  THEME_COPY,
  THEME_PREFS,
  THEME_STORAGE_KEY,
  type ThemePref,
} from "../src/lib/theme";

/**
 * "Aparência" no app nativo (HOJE-X2), por varredura de texto como tests/mobile-theme.test.ts (o código
 * do RN não roda no Node):
 * 1. A linha "Aparência" de "Suas escolhas" e a folha só existem com RN_DARK_MODE_ENABLED ligado.
 * 2. A folha é um radiogroup "Tema" com as três opções, aria-checked, vibração de escolha e setPref.
 * 3. O provedor lê a preferência de forma assíncrona e grava a escolha crua em `webfit-theme`; com a
 *    chave desligada o tema é sempre claro e o fundo nativo não muda.
 * 4. A escolha vai e volta pela chave-valor: o que setPref grava, parseThemePref lê igual.
 */
const SRC = path.resolve(import.meta.dirname, "../mobile/src");
const SETTINGS_TAB = "components/espaco/settings-tab.tsx";
const APPEARANCE_SHEET = "components/espaco/appearance-sheet.tsx";
const THEME_FILE = "theme/theme.tsx";
/** Alvo de toque mínimo (pt) das opções da folha. */
const MIN_TOUCH = 44;

/** Remove comentários, preservando as quebras de linha (como em mobile-theme.test.ts). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, (_, before: string) => before);
}

const code = (rel: string) => stripComments(readFileSync(path.join(SRC, rel), "utf8"));
const count = (source: string, pattern: RegExp) => source.match(new RegExp(pattern.source, "g"))?.length ?? 0;

/** O que deixa a linha ou a folha "Aparência" à mostra com a chave desligada; vazio = protegida. */
function appearanceGateProblems(source: string): string[] {
  const text = stripComments(source);
  const problems: string[] = [];
  if (!/import\s*\{[^}]*\bRN_DARK_MODE_ENABLED\b[^}]*\}\s*from\s*["']@\/theme\/theme["']/.test(text))
    problems.push("não importa RN_DARK_MODE_ENABLED de @/theme/theme");
  const rows = count(text, /label=\{THEME_COPY\.row\}/);
  if (rows !== 1) problems.push(`${rows} linhas "Aparência" (esperada 1)`);
  // [^<]*? fica dentro da mesma tag: a linha protegida é o próprio <ValueRow> logo depois da chave.
  else if (!/\{\s*RN_DARK_MODE_ENABLED\s*&&\s*\(?\s*<ValueRow\b[^<]*?label=\{THEME_COPY\.row\}/.test(text))
    problems.push('a linha "Aparência" está fora de {RN_DARK_MODE_ENABLED && (...)}');
  const sheets = count(text, /<AppearanceSheet\b/);
  if (sheets !== 1) problems.push(`${sheets} folhas "Aparência" (esperada 1)`);
  else if (!/\{\s*RN_DARK_MODE_ENABLED\s*&&\s*sheet\s*===\s*"appearance"\s*&&\s*\(?\s*<AppearanceSheet\b/.test(text))
    problems.push('a folha "Aparência" está fora de {RN_DARK_MODE_ENABLED && sheet === "appearance" && ...}');
  return problems;
}

test("varredura: a linha e a folha Aparência só contam como protegidas atrás de RN_DARK_MODE_ENABLED", () => {
  const imports = 'import { RN_DARK_MODE_ENABLED, makeStyles } from "@/theme/theme";';
  const row = '<ValueRow icon={SunMoon} label={THEME_COPY.row} value={value} onPress={open} />';
  const sheet = '{RN_DARK_MODE_ENABLED && sheet === "appearance" && <AppearanceSheet onClose={close} />}';
  const gated = [imports, `{RN_DARK_MODE_ENABLED && (\n  ${row}\n)}`, sheet].join("\n");
  assert.deepEqual(appearanceGateProblems(gated), []);
  assert.equal(appearanceGateProblems([imports, row, sheet].join("\n")).length, 1, "linha sem a chave");
  const openSheet = '{sheet === "appearance" && <AppearanceSheet onClose={close} />}';
  assert.equal(appearanceGateProblems([imports, `{RN_DARK_MODE_ENABLED && (${row})}`, openSheet].join("\n")).length, 1);
  // A chave protegendo outra linha não vale para a Aparência logo abaixo.
  const other = '{RN_DARK_MODE_ENABLED && (<ValueRow icon={Moon} label="Outra" value="x" onPress={open} />)}';
  assert.equal(appearanceGateProblems([imports, other, row, sheet].join("\n")).length, 1);
  // Chave só em comentário não protege nada; sem a importação também não.
  assert.equal(appearanceGateProblems([imports, `// {RN_DARK_MODE_ENABLED && (\n${row}`, sheet].join("\n")).length, 1);
  assert.equal(appearanceGateProblems(gated.replace(imports, "")).length, 1);
});

test("Meu espaço › Dados: a linha Aparência e a folha só aparecem com RN_DARK_MODE_ENABLED ligado", (t) => {
  const source = readFileSync(path.join(SRC, SETTINGS_TAB), "utf8");
  const problems = appearanceGateProblems(source);
  assert.deepEqual(problems, [], problems.join("\n"));
  const text = stripComments(source);
  assert.match(text, /import\s*\{[^}]*\bAppearanceSheet\b[^}]*\}\s*from\s*["']\.\/appearance-sheet["']/);
  assert.match(text, /icon=\{SunMoon\}/, "ícone SunMoon, como no web");
  assert.match(text, /value=\{THEME_COPY\.options\[themePref\]\}/, "o valor da linha é a escolha atual");
  const flag = /export const RN_DARK_MODE_ENABLED\s*=\s*(true|false)\s*;/.exec(code(THEME_FILE))?.[1];
  assert.ok(flag, "RN_DARK_MODE_ENABLED não encontrado");
  t.diagnostic(`RN_DARK_MODE_ENABLED = ${flag}: linha "Aparência" ${flag === "true" ? "visível" : "oculta"}`);
});

test("folha Aparência: radiogroup Tema com as três opções, aria-checked, alvo de 44 pt, vibração e setPref", () => {
  const text = code(APPEARANCE_SHEET);
  assert.match(text, /title=\{THEME_COPY\.title\}/);
  assert.match(text, /\{THEME_COPY\.hint\}/, 'aviso "Vale só para este aparelho."');
  assert.match(text, /accessibilityRole="radiogroup"\s+accessibilityLabel=\{THEME_COPY\.group\}/);
  assert.match(text, /THEME_PREFS\.map\(/);
  assert.match(text, /accessibilityRole="radio"/);
  assert.match(text, /accessibilityLabel=\{THEME_COPY\.options\[option\]\}/);
  assert.match(text, /accessibilityState=\{\{\s*checked:\s*isOn\s*\}\}/);
  assert.match(text, /webAttrs\(\{\s*"aria-checked":\s*isOn\s*\}\)/, "aria-checked no DOM do export web");
  assert.match(text, /THEME_COPY\.details\[option\]/);
  const minHeight = Number(/const OPTION_MIN_HEIGHT\s*=\s*(\d+)\s*;/.exec(text)?.[1]);
  assert.ok(minHeight >= MIN_TOUCH, `opção com ${minHeight} pt (mínimo ${MIN_TOUCH})`);
  assert.match(text, /minHeight:\s*OPTION_MIN_HEIGHT/);
  // Escolher: vibração leve e setPref; a opção já marcada não vibra nem grava de novo.
  assert.match(text, /if\s*\(\s*option\s*===\s*pref\s*\)\s*return;\s*selectionHaptic\(\);\s*setPref\(option\);/);
  assert.doesNotMatch(text, /Storage\./, "a folha não grava sozinha: quem grava é o provedor");
});

test("provedor: lê a preferência de forma assíncrona e grava a escolha crua em webfit-theme", () => {
  const text = code(THEME_FILE);
  assert.match(text, /Storage\.getItemAsync\(THEME_STORAGE_KEY\)/);
  assert.match(text, /setPrefState\(parseThemePref\(value\)\)/);
  assert.match(text, /Storage\.setItemAsync\(THEME_STORAGE_KEY,\s*next\)/, "grava o valor da escolha, sem transformar");
  assert.doesNotMatch(text, /getItemSync|setItemSync/, "leitura síncrona trava a abertura do export web");
  assert.match(text, /setPref:\s*\(pref:\s*ThemePref\)\s*=>\s*void/);
});

test("provedor: o modo do aparelho vem de uma assinatura estável (Sistema acompanha toda troca)", () => {
  const text = code(THEME_FILE);
  // O useColorScheme do react-native-web reassina a cada render e perde a primeira troca no export web.
  assert.doesNotMatch(text, /\buseColorScheme\b/);
  assert.match(text, /useSyncExternalStore\(subscribeSystemScheme,\s*systemScheme,\s*systemScheme\)/);
  assert.match(text, /Appearance\.addChangeListener\(onChange\)/);
});

test("provedor: com a chave desligada o tema é sempre claro e o fundo nativo não muda", () => {
  const text = code(THEME_FILE);
  assert.match(text, /RN_DARK_MODE_ENABLED\s*\?\s*resolveTheme\(pref,\s*system\s*===\s*"dark"\)\s*:\s*"light"/);
  const calls = count(text, /SystemUI\.setBackgroundColorAsync\(/);
  assert.equal(calls, 1, "uma chamada ao fundo nativo");
  assert.match(text, /if\s*\(\s*!RN_DARK_MODE_ENABLED\s*\)\s*return;\s*SystemUI\.setBackgroundColorAsync\(/);
});

test("a escolha vai e volta pela chave-valor: o que setPref grava, parseThemePref lê igual", () => {
  // A mesma tabela chave-valor do aparelho: setPref grava `next` como está; a abertura lê com parseThemePref.
  const store = new Map<string, string>();
  const save = (pref: ThemePref) => store.set(THEME_STORAGE_KEY, pref);
  const load = () => parseThemePref(store.get(THEME_STORAGE_KEY) ?? null);
  assert.equal(load(), DEFAULT_THEME_PREF, "sem escolha gravada: Sistema");
  for (const pref of ["escuro", "claro", "sistema", "escuro"] as const) {
    save(pref);
    assert.equal(store.get("webfit-theme"), pref);
    assert.equal(load(), pref);
    assert.ok(THEME_COPY.options[load()].length > 0, `valor da linha para ${pref}`);
  }
  for (const pref of THEME_PREFS) assert.equal(parseThemePref(JSON.parse(JSON.stringify(pref))), pref);
  for (const broken of ["dark", "Escuro", "", "null", '"escuro"']) {
    store.set(THEME_STORAGE_KEY, broken);
    assert.equal(load(), "sistema", `valor gravado ${JSON.stringify(broken)}`);
  }
});
