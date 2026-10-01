import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Tema escuro do app nativo (HOJE-X2): catraca da migração, por varredura de texto.
 * 1. O conjunto já migrado (todo mobile/src, menos theme/) não usa cores estáticas.
 * 2. RN_DARK_MODE_ENABLED só liga com 0 arquivos pendentes em mobile/src, e o app.json acompanha
 *    ("light" com a chave desligada, "automatic" com ela ligada).
 * 3. Informa quantos arquivos ainda faltam (só acompanhamento).
 */
const MOBILE = path.resolve(import.meta.dirname, "../mobile");
const SRC = path.join(MOBILE, "src");
const THEME_DIR = "theme";
const THEME_FILE = path.join(SRC, THEME_DIR, "theme.tsx");
const APP_JSON = path.join(MOBILE, "app.json");

/**
 * Fase 1: o kit, o layout e a raiz; fase 2 ("RN tema escuro"): todo o resto. Hoje, cada entrada de mobile/src
 * menos theme/ (onde ficam as cores); uma pasta ou arquivo novo já entra migrado.
 */
const MIGRATED = readdirSync(SRC).filter((name) => name !== THEME_DIR);

/** Exportações com os valores do tema claro: quem as importa não acompanha o tema. */
const STATIC_EXPORTS: { module: RegExp; names: readonly string[] }[] = [
  { module: /(?:^@\/|\/)theme\/tokens$/, names: ["colors", "tones", "pillTones", "domainTone", "macroColor"] },
  { module: /(?:^@shared\/|\/)design\/tokens$/, names: ["palette", "semantic", "domainTone", "macroColor", "roles"] },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

/** Remove comentários, preservando as quebras de linha (como em mobile-style.test.ts). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, (_, before: string) => before);
}

/** O que ainda prende um arquivo ao tema claro; vazio = migrado. */
function staticColorProblems(source: string): string[] {
  const code = stripComments(source);
  const problems: string[] = [];
  for (const match of code.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    if (match[1]) continue;
    const rule = STATIC_EXPORTS.find(({ module }) => module.test(match[3]!));
    if (!rule) continue;
    for (const spec of match[2]!.split(",")) {
      const name = spec.trim();
      if (!name || name.startsWith("type ")) continue;
      const imported = name.split(/\s+as\s+/)[0]!;
      if (rule.names.includes(imported)) problems.push(`importa ${imported} de ${match[3]}`);
    }
  }
  for (const match of code.matchAll(/import\s+\*\s+as\s+\w+\s+from\s*["']([^"']+)["']/g))
    if (STATIC_EXPORTS.some(({ module }) => module.test(match[1]!))) problems.push(`importa * de ${match[1]}`);
  if (/^(?:export\s+)?const\s+\w+\s*(?::[^=\n]+)?=\s*StyleSheet\.create\(/m.test(code))
    problems.push("StyleSheet.create no nível do módulo (use makeStyles)");
  if (/\brgba?\(/.test(code)) problems.push("cor rgba() fora de theme/tokens.ts");
  return problems;
}

/** Regra de ligar o tema: a chave, o app.json e os pendentes precisam concordar. */
function darkModeVerdict(isEnabled: boolean, userInterfaceStyle: unknown, pending: readonly string[]): string[] {
  if (!isEnabled)
    return userInterfaceStyle === "light" ? [] : [`app.json precisa de "userInterfaceStyle": "light" com o tema desligado`];
  const issues = pending.map((file) => `${file} ainda usa cores estáticas`);
  if (userInterfaceStyle !== "automatic") issues.push(`app.json precisa de "userInterfaceStyle": "automatic" com o tema ligado`);
  return issues;
}

const files = sourceFiles(SRC).map((file) => ({ file, rel: rel(file) }));
const isMigrated = (relPath: string) => MIGRATED.some((entry) => relPath === entry || relPath.startsWith(`${entry}/`));
const outsideTheme = files.filter(({ rel: relPath }) => !relPath.startsWith(`${THEME_DIR}/`));
const problemsOf = (file: string) => staticColorProblems(readFileSync(file, "utf8"));
const pending = outsideTheme.filter(({ file }) => problemsOf(file).length > 0).map(({ rel: relPath }) => relPath);

function darkModeFlag(): boolean {
  const flag = /export const RN_DARK_MODE_ENABLED\s*=\s*(true|false)\s*;/.exec(readFileSync(THEME_FILE, "utf8"))?.[1];
  assert.ok(flag, "RN_DARK_MODE_ENABLED = true|false não encontrado em mobile/src/theme/theme.tsx");
  return flag === "true";
}
const userInterfaceStyle = () => (JSON.parse(readFileSync(APP_JSON, "utf8")) as { expo: { userInterfaceStyle?: unknown } }).expo.userInterfaceStyle;

test("varredura: import de cores estáticas, StyleSheet.create no módulo e rgba() contam como pendência", () => {
  const legacy = [
    'import { StyleSheet } from "react-native";',
    'import { colors, radius } from "@/theme/tokens";',
    "const styles = StyleSheet.create({ card: { backgroundColor: colors.surface } });",
  ].join("\n");
  assert.equal(staticColorProblems(legacy).length, 2);
  assert.deepEqual(staticColorProblems('const x = { borderColor: "rgba(0,0,0,0.1)" };'), ["cor rgba() fora de theme/tokens.ts"]);
  assert.deepEqual(staticColorProblems('import { palette } from "@shared/design/tokens";'), ["importa palette de @shared/design/tokens"]);
  assert.deepEqual(staticColorProblems('import { domainTone as tone } from "../../theme/tokens";'), ["importa domainTone de ../../theme/tokens"]);
  assert.deepEqual(staticColorProblems('import * as tokens from "@/theme/tokens";'), ["importa * de @/theme/tokens"]);
  const migrated = [
    'import { radius, shadows, themeDomainTone, type Domain } from "@/theme/tokens";',
    'import type { colors } from "@/theme/tokens";',
    'import { makeStyles, useThemeColors } from "@/theme/theme";',
    "// const old = StyleSheet.create({ a: { color: \"rgba(0,0,0,1)\" } });",
    "const useStyles = makeStyles((colors) => ({ card: { backgroundColor: colors.surface } }));",
    "function Box() { const styles = StyleSheet.create({}); return styles; }",
  ].join("\n");
  assert.deepEqual(staticColorProblems(migrated), []);
});

test("regra de ligar: desligado exige light; ligado exige 0 pendentes e automatic", () => {
  assert.deepEqual(darkModeVerdict(false, "light", ["a.tsx"]), []);
  assert.equal(darkModeVerdict(false, "automatic", []).length, 1);
  assert.deepEqual(darkModeVerdict(true, "automatic", []), []);
  assert.deepEqual(darkModeVerdict(true, "automatic", ["hoje/day-hero.tsx"]), ["hoje/day-hero.tsx ainda usa cores estáticas"]);
  assert.equal(darkModeVerdict(true, "light", []).length, 1);
});

test("todo mobile/src (menos theme/) já lê as cores do tema", () => {
  const migrated = files.filter(({ rel: relPath }) => isMigrated(relPath));
  assert.ok(migrated.length >= 240, `só ${migrated.length} arquivos migrados encontrados`);
  assert.equal(migrated.length, outsideTheme.length, "algum arquivo fora de theme/ ficou fora da catraca");
  for (const expected of ["components/ui/text.tsx", "app/_layout.tsx", "screens/anamnese.tsx", "components/injecao/art-colors.ts"])
    assert.ok(migrated.some(({ rel: relPath }) => relPath === expected), `${expected} fora da catraca`);
  const found = migrated.flatMap(({ file, rel: relPath }) => problemsOf(file).map((problem) => `${relPath}: ${problem}`));
  assert.deepEqual(found, [], found.join("\n"));
});

test("o tema escuro só liga quando todas as telas migrarem (e o app.json acompanha)", () => {
  const issues = darkModeVerdict(darkModeFlag(), userInterfaceStyle(), pending);
  assert.deepEqual(issues, [], issues.slice(0, 20).join("\n"));
  assert.ok(statSync(THEME_FILE).isFile());
});

test("acompanhamento: arquivos ainda com cores estáticas", (t) => {
  assert.ok(outsideTheme.length > 50, `só ${outsideTheme.length} arquivos em ${SRC}`);
  assert.ok(!pending.some(isMigrated), "um arquivo migrado voltou a usar cores estáticas");
  const byFolder = new Map<string, number>();
  for (const file of pending) {
    const folder = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ".";
    byFolder.set(folder, (byFolder.get(folder) ?? 0) + 1);
  }
  t.diagnostic(`${pending.length} arquivos ainda com cores estáticas`);
  t.diagnostic([...byFolder].sort(([a], [b]) => a.localeCompare(b)).map(([folder, n]) => `${folder} ${n}`).join(", "));
});
