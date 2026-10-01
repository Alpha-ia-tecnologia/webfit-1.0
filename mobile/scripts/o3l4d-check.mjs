// Verificação da Onda 3 · Lote 4 · HOJE-X2 no app nativo, fase 1 (sub-tarefa D-C): o kit (components/ui,
// components/layout) e a raiz leem as cores do tema (ThemeProvider, useThemeColors, makeStyles), mas o
// tema escuro segue desligado (RN_DARK_MODE_ENABLED = false, app.json "light").
//  1. Tokens: o tema claro é exatamente o de antes (cores, tons, pílulas, sombras); o escuro tem as
//     mesmas chaves.
//  2. Catraca: tests/mobile-theme.test.ts passa (kit migrado; ligar o escuro exige 0 pendentes).
//  3. Portão: com o sistema em modo escuro e a preferência "escuro" gravada no aparelho, o app continua
//     claro (fundo, cartão, texto, cabeçalho, barra inferior, véu do "Registro rápido", aviso azul-marinho).
//  4. Rotas /, /diario, /evolucao, /espaco, /notificacoes, /injecao (caneta) e /refeicao a 390 e 360 px:
//     sem erros de página ou console e sem rolagem lateral.
//  5. Com um export de referência (antes da migração), as telas estáveis são idênticas pixel a pixel.
// Só o export web pode ser testado aqui (sem aparelho).
// Uso (na pasta mobile):
//   node node_modules/expo/bin/cli export --platform web --output-dir dist/o3l4d
//   node --import tsx scripts/o3l4d-check.mjs dist/o3l4d [pasta-das-fotos] [export-de-referência]
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { deepStrictEqual, equal, ok } from "node:assert/strict";
import { chromium, expect as baseExpect } from "@playwright/test";
import { domainTone, macroColor, palette, semantic } from "../../src/design/tokens.ts";
import { localDate, shiftDate } from "../../src/lib/domain.ts";
import { THEME_STORAGE_KEY } from "../../src/lib/theme.ts";
import { stateSchema } from "../../src/types.ts";
import { stateFixture } from "../../tests/fixtures.ts";
import { EVOLUCAO_TITLE } from "../../src/lib/copy.ts";
import {
  colors,
  darkColors,
  gradients,
  pillTones,
  shadows,
  themeColors,
  themeDomainTone,
  themeMacroColor,
  themePillTones,
  themeTones,
  tones,
} from "../src/theme/tokens.ts";

const target = path.resolve(process.argv[2] ?? "dist/o3l4d");
const shots = path.resolve(process.argv[3] ?? path.join(target, "..", "o3l4d-shots"));
const baseline = process.argv[4] ? path.resolve(process.argv[4]) : null;
mkdirSync(shots, { recursive: true });
const seedsDir = mkdtempSync(path.join(os.tmpdir(), "o3l4d-seed-"));
const PORT = 3227;
/** Só quando há export de referência: o mesmo app de antes, noutra origem (OPFS separado). */
const BASE_PORT = 3228;
const url = `http://127.0.0.1:${PORT}`;
const baseUrl = `http://127.0.0.1:${BASE_PORT}`;
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
function serve(root, port) {
  const server = createServer((req, res) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    if (req.url === "/__blank") {
      res.setHeader("Content-Type", "text/html");
      res.end("<!doctype html><title>Test setup</title>");
      return;
    }
    let file = path.resolve(root, "." + decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(root + path.sep) || !existsSync(file)) file = path.join(root, "index.html");
    try {
      res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream");
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL: ${name}\n  ${String(error?.message ?? error).split("\n").slice(0, 8).join("\n  ")}`);
  }
}

// ---------------------------------------------------------------------------------------------
// 1. Tokens (sem navegador)
// ---------------------------------------------------------------------------------------------

/** As 66 chaves de `colors` antes do HOJE-X2 e de onde vinham (semântico ou paleta de mesmo nome). */
const SEMANTIC_OF = {
  bg: "bg",
  surface: "surface",
  surface2: "surface2",
  surface3: "surface3",
  text: "text",
  text2: "text2",
  muted: "textMuted",
  faint: "textFaint",
  border: "border",
  borderSoft: "borderSoft",
};
const PALETTE_KEYS = (
  "emerald blue navy navySoft ocean green500 green600 green700 green800 primary mint50 mint100 mint200 mint300 " +
  "sky50 sky100 sky400 sky500 sky600 sky700 sky800 amber50 amber500 amber600 amber700 amber900 rose50 rose200 " +
  "rose400 rose600 rose700 rose800 indigo50 indigo500 indigo700 teal50 teal400 teal500 teal600 teal700 orange200 " +
  "orange400 orange500 orange600 orange700 slate50 slate100 slate200 slate300 slate400 slate900 white amber100 " +
  "amber200 violet50 violet600"
).split(" ");
/** Os literais que o kit usava antes (mesmo texto), agora chaves de `colors`. */
const KIT_LITERALS = {
  glassHeader: "rgba(255,255,255,0.92)", // app-header.tsx
  glassHeaderBorder: "rgba(226,232,240,0.6)",
  glassTabBar: "rgba(255,255,255,0.94)", // anamnese.tsx (a barra inferior agora é a superfície sólida)
  hairline: "rgba(226,232,240,0.8)", // progress.tsx, diet-week.tsx
  selectedTint: "rgba(209,250,229,0.75)",
  chipOnTint: "rgba(209,250,229,0.7)", // chips.tsx
  selectedBorder: "rgba(110,231,183,0.5)",
  mintBorder: "rgba(167,243,208,0.6)", // pill.tsx, feedback.tsx, tones
  amberBorder: "rgba(253,230,138,0.9)", // feedback.tsx
  pressedSurface: "rgba(241,245,249,0.7)", // icon-button.tsx
  pressedBorder: "rgba(226,232,240,0.5)",
  iconButtonBorder: "rgba(226,232,240,0.7)",
  scrim: "rgba(10,25,47,0.45)", // sheet.tsx
  scrimPopup: "rgba(15, 23, 42, 0.45)", // popup.tsx
  wheelWash: "rgba(236,253,245,0.9)", // wheel.tsx
  wheelEdge: "rgba(167,243,208,0.9)",
  wheelFade: "rgba(255,255,255,0)",
  buttonSheen: "rgba(255,255,255,0.9)", // button.tsx
  onFillSub: "rgba(255,255,255,0.85)", // chips.tsx
  onFillOverlay: "rgba(255,255,255,0.16)", // toast.tsx
  onFillOverlaySoft: "rgba(255,255,255,0.14)",
  onFillOverlayStrong: "rgba(255,255,255,0.22)",
  inkShadow: "rgba(0,0,0,0.18)", // rich-text.tsx
  inverse: palette.navy, // toast.tsx (colors.navy)
  onFillSky: palette.sky100, // toast.tsx (colors.sky100)
  onFillAmber: palette.amber200,
  onFillRose: palette.rose200,
  onFillMuted: palette.slate300,
  errorText: palette.rose600, // field.tsx, button.tsx (colors.rose600)
  errorTextStrong: palette.rose800, // feedback.tsx (colors.rose800)
  plateVeg: palette.green700, // mini-plate.tsx (colors.green700)
  // Fase 2 (RN tema escuro): os literais das telas, agora chaves do kit.
  chipOnWash: "rgba(236,253,245,0.55)", // anamnese/choice-chip.tsx
  skyTint: "rgba(224,242,254,0.8)", // hoje/balance-explain.tsx
  glassBar: "rgba(255,255,255,0.96)", // diario/balance-card, refeicao/meal-tray, injecao/injection-bar
  // Conceito 07: barra fixa e fim do degradê do rodapé da anamnese, no tom do fundo da página.
  glassPage: "rgba(246,248,251,0.94)", // screens/anamnese
  pageFade: "rgba(246,248,251,0)", // screens/anamnese
  glassButton: "rgba(255,255,255,0.8)", // refeicao/dish-cards.tsx
  pressedInk: "rgba(15,23,42,0.04)", // refeicao/dish-cards.tsx
  marker: palette.navy, // espaco (biomarcador, corpo, exame), evolucao (consistência, barras, gráfico) (colors.navy)
  artPaper: palette.white, // injecao/art-colors.ts (ART.white / ART.surface)
  figureFill: "#eef2f7", // evolucao/measures-card.tsx (bodySilhouette: corpo)
  figureHead: "#dbe4f0", // (cabeça)
  figureLine: palette.slate300, // (contorno)
  onFillText: "rgba(255,255,255,0.9)", // hoje/next-step-card, espaco/profile-hero
  onFillSoft: "rgba(255,255,255,0.82)", // refeicao/capture-tiles.tsx
  onFillBorder: "rgba(255,255,255,0.18)",
  onFillChip: "rgba(255,255,255,0.08)",
  onFillOverlayFaint: "rgba(255,255,255,0.1)",
  onFillPressed: "rgba(255,255,255,0.18)", // espaco/profile-hero.tsx
  onFillIdle: "rgba(255,255,255,0.35)", // antes hoje/week-strip.tsx (a faixa nova não usa)
  onFillMint: palette.mint200, // hoje/next-step-card.tsx (colors.mint200)
  // Fidelidade visual: texto da pílula cheia neutra sobre o azul-marinho (ui/pill.tsx, --wf-on-fill-slate).
  onFillSlate: palette.slate200,
  // Polimento pós-Onda 3 (contraste AA): tinta dos chips ligados sobre o esmeralda (ui/chips, injecao/dose-card),
  // antes branco (colors.white, 2,5:1).
  onEmeraldInk: palette.slate900,
  // evolucao/journey-card, injecao/syringe-figure e os preenchimentos com branco (green700): chips ligados da
  // anamnese e da refeição, "+" dos pratos e da porção, meta do primeiro acesso, balão do usuário no agente.
  accentFill: palette.green700,
  accentFillStrong: palette.green800,
  artInk: palette.slate900, // injecao/* (ART.slate900 …)
  artLine: palette.slate300,
  artMid: palette.slate200,
  artSoft: palette.slate100,
  artFaint: palette.slate50,
  artMuted: palette.slate400,
};
/** Sombras e o gradiente que eram literais nas telas (mesmo texto). */
const SCREEN_SHADOWS = {
  floatingBar: "0px 18px 40px -16px rgba(15, 23, 42, 0.35)",
  panel: "0px 1px 2px rgba(15,23,42,0.03)",
  pillOn: "0px 6px 16px -10px rgba(4, 120, 87, 0.8)",
  choiceOn: "0px 4px 14px -8px rgba(16, 185, 129, 0.5)",
  questionCard: "0px 4px 16px rgba(0, 0, 0, 0.04)",
  questionDone: "0px 6px 20px rgba(0, 208, 132, 0.14)",
  knob: "0px 2px 6px rgba(15, 23, 42, 0.18)",
  markerDot: "0px 1px 3px rgba(16, 185, 129, 0.5)",
  checkDone: "0px 2px 6px -1px rgba(0,208,132,0.5)",
  photoTile: "0px 14px 30px -18px rgba(10, 25, 47, 0.9)",
  dishAdd: "0px 8px 16px -10px rgba(4, 120, 87, 0.9)",
  stepper: "0px 4px 10px -6px rgba(15, 23, 42, 0.35)",
  medicationOn: "0px 4px 14px -8px rgba(124,58,237,0.45)",
  scanGlow: "0px 0px 14px 3px rgba(16, 185, 129, 0.55)",
};
// Brilho do "Próximo passo" em 26% do azul, como o Hoje.css do web (fidelidade ao conceito 01).
const NEXT_STEP_GLOW = ["rgba(0,163,255,0.26)", "rgba(0,163,255,0)"];
const OLD_TONES = {
  amber: { bg: palette.amber50, fg: palette.amber500, border: "rgba(253,230,138,0.6)" },
  emerald: { bg: palette.mint50, fg: palette.green600, border: "rgba(167,243,208,0.6)" },
  sky: { bg: palette.sky50, fg: palette.blue, border: "rgba(186,230,253,0.6)" },
  teal: { bg: palette.teal50, fg: palette.teal600, border: "rgba(153,246,228,0.6)" },
  rose: { bg: palette.rose50, fg: palette.rose600, border: palette.rose200 },
  indigo: { bg: palette.indigo50, fg: palette.indigo500, border: domainTone.body.border },
};
const OLD_PILL_TONES = {
  emerald: { bg: palette.mint50, fg: palette.green700, border: "rgba(167,243,208,0.6)" },
  sky: { bg: palette.sky50, fg: palette.sky700, border: "rgba(186,230,253,0.8)" },
  rose: { bg: palette.rose50, fg: palette.rose700, border: palette.rose200 },
  neutral: { bg: semantic.surface2, fg: semantic.textMuted, border: "transparent" },
  amber: { bg: palette.amber50, fg: palette.amber700, border: "rgba(253,230,138,0.7)" },
  teal: { bg: palette.teal50, fg: palette.teal700, border: "rgba(153,246,228,0.7)" },
};

await check("tokens: as 66 cores de antes têm o mesmo valor claro", () => {
  equal(PALETTE_KEYS.length + Object.keys(SEMANTIC_OF).length, 66);
  const wrong = [];
  for (const key of PALETTE_KEYS) if (colors[key] !== palette[key]) wrong.push(`${key}: ${colors[key]} ≠ ${palette[key]}`);
  for (const [key, from] of Object.entries(SEMANTIC_OF))
    if (colors[key] !== semantic[from]) wrong.push(`${key}: ${colors[key]} ≠ ${semantic[from]}`);
  deepStrictEqual(wrong, []);
});
await check("tokens: as chaves novas do kit repetem exatamente os literais claros de antes", () => {
  const extra = Object.keys(colors).filter((key) => !PALETTE_KEYS.includes(key) && !(key in SEMANTIC_OF));
  deepStrictEqual(extra.sort(), Object.keys(KIT_LITERALS).sort());
  const wrong = Object.entries(KIT_LITERALS).filter(([key, value]) => colors[key] !== value);
  deepStrictEqual(wrong, []);
});
await check("tokens: tons, pílulas, domínios, macros e sombras claros iguais aos de antes", () => {
  deepStrictEqual(tones, OLD_TONES);
  deepStrictEqual(pillTones, OLD_PILL_TONES);
  ok(themeColors("light") === colors && themeTones("light") === tones && themePillTones("light") === pillTones);
  deepStrictEqual(themeDomainTone("light"), domainTone);
  deepStrictEqual(themeMacroColor("light"), macroColor);
  equal(shadows.searchField, "0px 12px 26px -20px rgba(15, 23, 42, 0.6)");
  equal(shadows.searchFocus, "0px 0px 0px 4px rgba(16, 185, 129, 0.16)");
  equal(shadows.tabBar, "0px 12px 32px -10px rgba(15, 23, 42, 0.22)");
  deepStrictEqual(Object.entries(SCREEN_SHADOWS).filter(([key, value]) => shadows[key] !== value), []);
  deepStrictEqual([...gradients.nextStepGlow], NEXT_STEP_GLOW);
});
await check("tokens: o tema escuro tem as mesmas chaves, superfícies escuras e as constantes sobre preenchimentos", () => {
  deepStrictEqual(Object.keys(darkColors).sort(), Object.keys(colors).sort());
  ok(Object.values(darkColors).every((value) => typeof value === "string" && value.length > 0));
  ok(themeColors("dark") === darkColors);
  equal(darkColors.bg, "#0b1220");
  equal(darkColors.surface, "#111a2b");
  equal(darkColors.text, "#e6edf7");
  const constant = ["white", "emerald", "blue", "onFillSub", "onFillSky", "onFillAmber", "onFillRose", "onFillMuted", "inkShadow"];
  constant.push("onFillText", "onFillSoft", "onFillBorder", "onFillChip", "onFillOverlayFaint", "onFillPressed", "onFillIdle", "onFillMint", "onFillSlate");
  constant.push("onEmeraldInk");
  constant.push("accentFill", "accentFillStrong", "artInk", "artLine", "artMid", "artSoft", "artFaint", "artMuted");
  for (const key of constant) equal(darkColors[key], colors[key], key);
  const changing = ["glassHeader", "glassTabBar", "hairline", "scrim", "inverse", "buttonSheen", "errorText", "wheelFade"];
  changing.push("chipOnWash", "skyTint", "glassBar", "glassButton", "pressedInk", "marker", "artPaper");
  changing.push("glassPage", "pageFade");
  changing.push("figureFill", "figureHead", "figureLine");
  for (const key of changing) ok(darkColors[key] !== colors[key], `${key} deveria mudar no escuro`);
  equal(darkColors.marker, "#e6edf7");
  equal(darkColors.artPaper, "#e6edf7");
  equal(darkColors.glassBar, "rgba(17,26,43,0.96)");
  ok(darkColors.plateVeg !== themeMacroColor("dark").protein, "vegetais ≠ proteína no escuro");
  ok(themeTones("dark").emerald.border !== tones.emerald.border && themePillTones("dark").neutral.bg === darkColors.surface2);
});

// ---------------------------------------------------------------------------------------------
// 2. Catraca (teste da raiz)
// ---------------------------------------------------------------------------------------------
await check("catraca: tests/mobile-theme.test.ts passa (kit migrado; escuro só com 0 pendentes)", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const run = spawnSync(process.execPath, ["--import", "tsx", "--test", "tests/mobile-theme.test.ts"], { cwd: root, encoding: "utf8" });
  const out = `${run.stdout}\n${run.stderr}`;
  equal(run.status, 0, out.split("\n").filter((line) => /✖|not ok|Error/.test(line)).slice(0, 8).join("\n"));
  const pending = /(\d+) arquivos ainda com cores estáticas/.exec(out);
  ok(pending, "sem a linha de acompanhamento");
  console.log(`  (acompanhamento: ${pending[1]} arquivos ainda com cores estáticas)`);
});

// ---------------------------------------------------------------------------------------------
// Navegador
// ---------------------------------------------------------------------------------------------
const servers = [await serve(target, PORT)];
if (baseline) servers.push(await serve(baseline, BASE_PORT));
const expect = baseExpect.configure({ timeout: 15000 });
const browser = await chromium.launch({ channel: "chrome" });
const today = localDate();
const CLOCK = `${today}T13:00:00`;
const TIRZ = { weightLossPen: "sim", weightLossPenName: "Tirzepatida", weightLossPenDose: "2,5 mg", weightLossPenPerMonth: 4 };
/** Aplicação de Tirzepatida `daysAgo` dias atrás (frasco e seringa, 2,5 mg). */
function inj(id, daysAgo) {
  const date = shiftDate(today, -daysAgo);
  return {
    id,
    userId: stateFixture().userId,
    date,
    time: "08:30",
    createdAt: `${date}T08:30:00.000Z`,
    updatedAt: `${date}T08:30:00.000Z`,
    method: "frasco",
    medication: "Tirzepatida",
    concentrationMgPerMl: 5,
    syringeUnits: 100,
    units: 50,
    volumeMl: 0.5,
    doseMg: 2.5,
    site: "abdomen",
    notes: "",
  };
}
const baseState = () => stateFixture();
/** O cartão de água do Hoje é opcional (conceito 01: a água mora no bloco do dia); o portão liga o widget. */
const waterState = () => {
  const state = stateFixture();
  return { ...state, profile: { ...state.profile, homeLayout: "water" } };
};
const penState = () => {
  const base = stateFixture();
  return { ...base, profile: { ...base.profile, ...TIRZ }, injections: [inj("d1", 3)] };
};

let seeds = 0;
/**
 * Abre o app com o estado e a preferência de tema gravados no SQLite do navegador (a mesma tabela
 * chave-valor), o sistema em modo escuro e o relógio fixo.
 */
async function open(state, { width = 390, route = "/", ready = hojeReady, origin = url, themePref = "escuro", reducedMotion = "no-preference" } = {}) {
  const valid = stateSchema.safeParse(state);
  if (!valid.success) throw Error(`estado de teste inválido: ${JSON.stringify(valid.error.issues.slice(0, 3))}`);
  const seedFile = path.join(seedsDir, `seed-${++seeds}.sqlite`);
  const db = new DatabaseSync(seedFile);
  db.exec("DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO storage VALUES (?, ?)").run("webfit-personal-v1", JSON.stringify(state));
  if (themePref) db.prepare("INSERT INTO storage VALUES (?, ?)").run(THEME_STORAGE_KEY, themePref);
  db.close();
  const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: "dark", reducedMotion });
  const page = await context.newPage();
  await page.clock.setFixedTime(CLOCK);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  await page.route("**/api/**", (r) => r.abort("connectionrefused"));
  await page.goto(origin);
  await expect(page.getByRole("button", { name: "Personalizar alimentação", exact: true })).toBeVisible({ timeout: 30000 });
  await page.goto(origin + "/__blank");
  await page.evaluate(async (bytes) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("expo-sqlite");
    for await (const handle of dir.values()) {
      if (handle.kind !== "file") continue;
      const content = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      if (!new TextDecoder().decode(content.slice(0, 512)).split("\0")[0].endsWith("/ExpoSQLiteStorage")) continue;
      const writer = await handle.createWritable();
      const data = new Uint8Array(4096 + bytes.length);
      data.set(content.slice(0, 4096));
      data.set(bytes, 4096);
      await writer.write(data);
      await writer.close();
      return;
    }
    throw Error("Arquivo SQLite de teste não encontrado");
  }, [...readFileSync(seedFile)]);
  await goTo(page, origin, route, ready);
  return { page, context, errors };
}
async function goTo(page, origin, route, ready) {
  await page.goto(origin + route);
  await expect(ready(page)).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}
const heading = (name) => (page) => page.getByRole("heading", { name, exact: typeof name === "string" }).first();
const hojeReady = heading(/^Olá, /);

/** Lê uma chave da tabela chave-valor gravada no navegador (sai da tela). */
async function readKv(page, origin, key) {
  await page.goto(origin + "/__blank");
  const bytes = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("expo-sqlite");
    for await (const handle of dir.values()) {
      if (handle.kind !== "file") continue;
      const content = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      if (new TextDecoder().decode(content.slice(0, 512)).split("\0")[0].endsWith("/ExpoSQLiteStorage")) return [...content.slice(4096)];
    }
    throw Error("SQLite ausente");
  });
  const file = path.join(seedsDir, `kv-${++seeds}.sqlite`);
  writeFileSync(file, Buffer.from(bytes));
  const db = new DatabaseSync(file);
  const row = db.prepare("SELECT value FROM storage WHERE key=?").get(key);
  db.close();
  return row?.value ?? null;
}

/** Primeiro fundo não transparente a partir de #root (a raiz do app). */
const rootBackground = (page) =>
  page.evaluate(() => {
    const queue = [...(document.getElementById("root")?.children ?? [])];
    while (queue.length) {
      const el = queue.shift();
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
      queue.push(...el.children);
    }
    return "";
  });
const cssOf = (locator, prop) => locator.evaluate((el, p) => getComputedStyle(el)[p], prop);

/** Sem rolagem lateral: nenhum elemento visível passa da janela. */
async function noSideScroll(page) {
  const problem = await page.evaluate(() => {
    const doc = document.documentElement.scrollWidth - window.innerWidth;
    if (doc > 0) return `documento ${doc}px`;
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.opacity === "0") continue;
      if (rect.right > window.innerWidth + 1 || rect.left < -1)
        return `${el.tagName} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").slice(0, 40)} ${Math.round(rect.left)}..${Math.round(rect.right)}`;
    }
    return "";
  });
  if (problem) throw Error(`rolagem lateral: ${problem}`);
}
function noErrors(errors) {
  if (errors.length) throw Error(`erros: ${errors.slice(0, 3).join(" | ")}`);
}

// ---------------------------------------------------------------------------------------------
// 3. Portão: sistema escuro + preferência "escuro" e o app continua claro
// ---------------------------------------------------------------------------------------------
{
  const { page, context, errors } = await open(waterState());
  await check("portão: o navegador está em modo escuro e a preferência gravada é \"escuro\"", async () => {
    ok(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches));
  });
  await check("portão: fundo da raiz claro rgb(246, 248, 251)", async () => {
    equal(await rootBackground(page), "rgb(246, 248, 251)");
  });
  await check("portão: texto padrão do AppText rgb(15, 23, 42) (saudação do cabeçalho)", async () => {
    equal(await cssOf(hojeReady(page), "color"), "rgb(15, 23, 42)");
  });
  await check("portão: Card branco rgb(255, 255, 255) (cartão de água)", async () => {
    equal(await cssOf(page.getByTestId("water-card"), "backgroundColor"), "rgb(255, 255, 255)");
  });
  await check("portão: cabeçalho do Hoje sem barra no topo (fundo claro da página) e o vidro claro rgba(255, 255, 255, 0.92) pronto para a rolagem", async () => {
    // Fidelidade visual: no topo o cabeçalho não tem fundo próprio; o primeiro ancestral da saudação com fundo é a página.
    const bg = await page.evaluate(() => {
      const title = [...document.querySelectorAll('[role="heading"]')].find((el) => /^Olá, /.test(el.textContent ?? ""));
      for (let el = title; el; el = el.parentElement) {
        const value = getComputedStyle(el).backgroundColor;
        if (value !== "rgba(0, 0, 0, 0)") return value;
      }
      return "";
    });
    equal(bg, "rgb(246, 248, 251)");
    // O vidro que aparece depois de rolar continua na cor clara (o tema escuro segue desligado).
    equal(await cssOf(page.getByTestId("header-glass").first(), "backgroundColor"), "rgba(255, 255, 255, 0.92)");
  });
  await check("portão: barra inferior branca rgb(255, 255, 255) com a pílula menta clara atrás do ícone da aba ativa", async () => {
    const bar = page.getByRole("tablist").filter({ has: page.getByRole("tab", { name: "Hoje", exact: true }) });
    equal(await cssOf(bar, "backgroundColor"), "rgb(255, 255, 255)");
    const active = bar.getByRole("tab", { name: "Hoje", exact: true });
    equal(await cssOf(active.getByTestId("tab-active-pill"), "backgroundColor"), "rgb(209, 250, 229)");
  });
  await check("portão: \"Copo +250 ml\" mostra o aviso azul-marinho rgb(10, 25, 47) com texto branco", async () => {
    await page.getByTestId("water-card").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Copo +250 ml", exact: true }).click();
    const toast = page.getByTestId("toast-success");
    await expect(toast).toBeVisible();
    equal(await cssOf(toast, "backgroundColor"), "rgb(10, 25, 47)");
    equal(await cssOf(toast.getByText(/\S/).first(), "color"), "rgb(255, 255, 255)");
  });
  await check("portão: \"Registro rápido\" abre a folha branca sobre o véu rgba(10, 25, 47, 0.45)", async () => {
    await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
    const overlay = page.getByRole("button", { name: "Fechar painel", exact: true });
    await expect(overlay).toBeVisible();
    equal(await cssOf(overlay, "backgroundColor"), "rgba(10, 25, 47, 0.45)");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shots, "390-registro-rapido.png") });
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(overlay).toHaveCount(0);
  });
  await check("portão: sem erros de página ou console", async () => noErrors(errors));
  await check("portão: a preferência \"escuro\" continua gravada (o app a lê e a ignora com a chave desligada)", async () => {
    equal(await readKv(page, url, THEME_STORAGE_KEY), "escuro");
  });
  await context.close();
}

// ---------------------------------------------------------------------------------------------
// 4. Rotas a 390 e 360 px
// ---------------------------------------------------------------------------------------------
const ROUTES = [
  { route: "/", ready: hojeReady, state: baseState },
  { route: "/diario", ready: heading("Meu diário"), state: baseState },
  { route: "/evolucao", ready: heading(EVOLUCAO_TITLE), state: baseState },
  { route: "/espaco", ready: heading("Meu espaço"), state: baseState },
  { route: "/notificacoes", ready: heading("Lembretes"), state: baseState },
  { route: "/injecao", ready: heading("Seringa e dose"), state: penState },
  { route: "/refeicao", ready: heading("Registrar refeição"), state: baseState },
];
for (const width of [390, 360]) {
  for (const { route, ready, state } of ROUTES) {
    await check(`${width} px ${route}: abre claro, sem erros e sem rolagem lateral`, async () => {
      const { page, context, errors } = await open(state(), { width, route, ready });
      try {
        equal(await rootBackground(page), "rgb(246, 248, 251)");
        await noSideScroll(page);
        await page.screenshot({ path: path.join(shots, `${width}${route === "/" ? "-hoje" : route.replace("/", "-")}.png`) });
        noErrors(errors);
      } finally {
        await context.close();
      }
    });
  }
}

// ---------------------------------------------------------------------------------------------
// 5. Pixel a pixel contra o export de referência (antes da migração)
// ---------------------------------------------------------------------------------------------
/** Pixels diferentes (qualquer canal com diferença > 2) e a caixa que os contém. */
async function pixelDiff(page, a, b) {
  if (Buffer.compare(a, b) === 0) return { diff: 0, box: null };
  return page.evaluate(
    async ([one, two]) => {
      const load = (bytes) => createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      const [ia, ib] = await Promise.all([load(one), load(two)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { diff: Infinity, box: `tamanhos ${ia.width}×${ia.height} e ${ib.width}×${ib.height}` };
      const canvas = new OffscreenCanvas(ia.width, ia.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(ia, 0, 0);
      const da = ctx.getImageData(0, 0, ia.width, ia.height).data;
      ctx.clearRect(0, 0, ia.width, ia.height);
      ctx.drawImage(ib, 0, 0);
      const db = ctx.getImageData(0, 0, ia.width, ia.height).data;
      let diff = 0;
      let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1];
      for (let i = 0; i < da.length; i += 4) {
        if (Math.abs(da[i] - db[i]) > 2 || Math.abs(da[i + 1] - db[i + 1]) > 2 || Math.abs(da[i + 2] - db[i + 2]) > 2 || Math.abs(da[i + 3] - db[i + 3]) > 2) {
          diff++;
          const p = i / 4;
          const x = p % ia.width;
          const y = Math.floor(p / ia.width);
          [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
        }
      }
      return { diff, box: diff ? `${x0},${y0}–${x1},${y1}` : null };
    },
    [[...a], [...b]],
  );
}

/** Telas estáveis durante o lote (as de anamnese, evolução, injeção e espaço têm correções em paralelo). */
const PIXEL_SCREENS = [
  { name: "hoje", route: "/", ready: hojeReady, state: baseState, isStable: true },
  { name: "hoje-registro-rapido", route: "/", ready: hojeReady, state: baseState, isStable: true, sheet: true },
  { name: "diario", route: "/diario", ready: heading("Meu diário"), state: baseState, isStable: true },
  { name: "lembretes", route: "/notificacoes", ready: heading("Lembretes"), state: baseState, isStable: true },
  { name: "refeicao", route: "/refeicao", ready: heading("Registrar refeição"), state: baseState, isStable: true },
  { name: "evolucao", route: "/evolucao", ready: heading(EVOLUCAO_TITLE), state: baseState, isStable: false },
  { name: "espaco", route: "/espaco", ready: heading("Meu espaço"), state: baseState, isStable: false },
  { name: "injecao", route: "/injecao", ready: heading("Seringa e dose"), state: penState, isStable: false },
];
async function capture(origin, screen) {
  const { page, context, errors } = await open(screen.state(), { route: screen.route, ready: screen.ready, origin, reducedMotion: "reduce" });
  try {
    if (screen.sheet) {
      await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
      await expect(page.getByRole("button", { name: "Fechar painel", exact: true })).toBeVisible();
      await page.waitForTimeout(600);
    }
    noErrors(errors);
    return await page.screenshot();
  } finally {
    await context.close();
  }
}
if (baseline) {
  const compare = await (await browser.newContext()).newPage();
  await compare.goto(url + "/__blank");
  for (const screen of PIXEL_SCREENS) {
    const label = `pixel a pixel (390 px, sistema escuro) ${screen.name}: igual ao export de antes`;
    let result = null;
    try {
      const before = await capture(baseUrl, screen);
      const after = await capture(url, screen);
      writeFileSync(path.join(shots, `pixel-${screen.name}-antes.png`), before);
      writeFileSync(path.join(shots, `pixel-${screen.name}-depois.png`), after);
      result = await pixelDiff(compare, before, after);
    } catch (error) {
      await check(label, () => {
        throw error;
      });
      continue;
    }
    if (screen.isStable) {
      await check(label, () => {
        if (result.diff) throw Error(`${result.diff} pixels diferentes em ${result.box}`);
      });
    } else {
      console.log(`INFO: ${label.replace(": igual ao export de antes", "")}: ${result.diff ? `${result.diff} pixels diferentes em ${result.box} (tela com correções em paralelo)` : "idêntica"}`);
    }
  }
} else {
  console.log("INFO: sem export de referência (3º argumento): comparação pixel a pixel pulada");
}

await browser.close();
for (const server of servers) server.close();
console.log(`\n${passed} de ${passed + failed} verificações passaram${failed ? ` (${failed} falharam)` : ""}.`);
process.exit(failed ? 1 : 0);
