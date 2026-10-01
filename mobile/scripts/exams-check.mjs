// Teste da jornada Expo com SQLite real em um contexto de navegador isolado.
// Executar da raiz: node --import tsx mobile/scripts/exams-check.mjs
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium, expect as baseExpect } from "@playwright/test";
import { initialState } from "../../src/lib/domain.ts";
import { profileFixture } from "../../tests/fixtures.ts";
import { ANAMNESE_FINISH_LABEL } from "../../src/lib/copy.ts";
const target = path.resolve(process.argv[2] ?? "mobile/dist");
const output = path.join(target, "exams-check");
mkdirSync(output, { recursive: true });
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const server = createServer((req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  if (req.url === "/__blank") {
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><title>Test setup</title>");
    return;
  }
  let file = path.resolve(
    target,
    "." + decodeURIComponent(req.url.split("?")[0]),
  );
  if (!file.startsWith(target + path.sep) || !existsSync(file))
    file = path.join(target, "index.html");
  try {
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] ?? "application/octet-stream",
    );
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(3210, "127.0.0.1", resolve));
const url = "http://127.0.0.1:3210";
const expect = baseExpect.configure({ timeout: 30000 });
const browser = await chromium.launch({ channel: "chrome" });
const meta = {
  specialists: ["analista_exames"],
  reviewed: true,
  revisions: 0,
  urgency: "nenhuma",
  notes: [],
  llmCalls: 2,
};
const examReply = {
  text: "Transcrição automática de teste. Confira os valores no laudo original.",
  meta,
};
const dietReply = {
  text: "Plano de teste: refeições e substituições.",
  meta: { ...meta, specialists: ["nutricionista"] },
};
const fixture = {
  ...initialState(),
  draft: { ...profileFixture(), consentAi: true },
  draftStep: 7,
};
const seedFile = path.join(output, "seed.sqlite");
const db = new DatabaseSync(seedFile);
db.exec(
  "DROP TABLE IF EXISTS storage; CREATE TABLE storage (key TEXT PRIMARY KEY NOT NULL, value TEXT); PRAGMA user_version=1;",
);
db.prepare("INSERT INTO storage VALUES (?, ?)").run(
  "webfit-personal-v1",
  JSON.stringify(fixture),
);
db.close();
const seedBytes = [...readFileSync(seedFile)];
async function setup() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: { ready: true, token: "test-token" },
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.goto(url);
  await expect(
    page.getByRole("button", { name: "Personalizar alimentação", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.goto(url + "/__blank");
  await page.evaluate(async (bytes) => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("expo-sqlite");
    for await (const entry of dir.values()) {
      if (entry.kind !== "file") continue;
      const content = new Uint8Array(
        await (await entry.getFile()).arrayBuffer(),
      );
      const name = new TextDecoder()
        .decode(content.slice(0, 512))
        .split("\0")[0];
      if (!name.endsWith("/ExpoSQLiteStorage")) continue;
      const writer = await entry.createWritable();
      const data = new Uint8Array(4096 + bytes.length);
      data.set(content.slice(0, 4096));
      data.set(bytes, 4096);
      await writer.write(data);
      await writer.close();
      return;
    }
    throw Error("Arquivo SQLite de teste não encontrado");
  }, seedBytes);
  await page.goto(url + "/anamnese");
  await expect(
    page.getByRole("heading", { name: "Revise sua anamnese", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  return { page, context };
}
async function attach(page) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page
      .getByRole("button", { name: "Adicionar exame: escolher arquivo", exact: true })
      .click(),
  ]);
  await chooser.setFiles({
    name: "Hemograma.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4"),
  });
  await expect(page.getByLabel("Nome do exame", { exact: true })).toHaveValue(
    "Hemograma",
  );
  await expect(
    page.getByRole("button", {
      name: ANAMNESE_FINISH_LABEL,
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Salvar anexo", exact: true }).click();
  await expect(
    page.getByRole("switch", {
      name: "Analisar Hemograma ao concluir",
      exact: true,
    }),
  ).toBeVisible();
}
async function readState(page, name) {
  await page.goto(url + "/__blank");
  const bytes = await page.evaluate(async () => {
    const dir = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("expo-sqlite");
    for await (const entry of dir.values()) {
      if (entry.kind !== "file") continue;
      const content = new Uint8Array(
        await (await entry.getFile()).arrayBuffer(),
      );
      if (
        new TextDecoder()
          .decode(content.slice(0, 512))
          .split("\0")[0]
          .endsWith("/ExpoSQLiteStorage")
      )
        return [...content.slice(4096)];
    }
    throw Error("SQLite ausente");
  });
  const file = path.join(output, name + ".sqlite");
  writeFileSync(file, Buffer.from(bytes));
  const db = new DatabaseSync(file);
  const state = JSON.parse(
    db
      .prepare("SELECT value FROM storage WHERE key=?")
      .get("webfit-personal-v1").value,
  );
  db.close();
  return state;
}
try {
  {
    const { page, context } = await setup();
    const requests = [];
    await page.route("**/api/agent", (route) => {
      const body = route.request().postDataJSON();
      requests.push(body);
      return route.fulfill({
        json: body.mode === "exam" ? examReply : dietReply,
        headers: { "access-control-allow-origin": "*" },
      });
    });
    await attach(page);
    await page.reload();
    const toggle = page.getByRole("switch", {
      name: "Analisar Hemograma ao concluir",
      exact: true,
    });
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await page.screenshot({ path: path.join(output, "review-mobile.png") });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: ANAMNESE_FINISH_LABEL, exact: true })
      .click();
    await expect(page.getByTestId("diet-plan-text")).toContainText(
      dietReply.text,
      { timeout: 20000 },
    );
    expect(requests.map((r) => r.mode)).toEqual(["exam", "diet"]);
    expect(requests[0].file).toMatch(
      /^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/,
    );
    expect(requests[1].context.examAnalyses[0].analysis).toBe(examReply.text);
    expect(requests[1].file).toBeUndefined();
    const saved = await readState(page, "success");
    expect(saved.exams[0].analysis).toBe(examReply.text);
    expect(saved.dietPlan.text).toBe(dietReply.text);
    await context.close();
    console.log(
      "PASS: anexo, recarga, seleção, análise antes da dieta e SQLite persistente",
    );
  }
  {
    const { page, context } = await setup();
    const requests = [];
    let fail = true;
    await page.route("**/api/agent", async (route) => {
      requests.push(route.request().postDataJSON());
      if (fail)
        await route.fulfill({
          status: 502,
          json: { error: "Falha de teste na análise." },
          headers: { "access-control-allow-origin": "*" },
        });
      else await new Promise((resolve) => page.once("close", () => resolve()));
    });
    await attach(page);
    await page
      .getByRole("switch", {
        name: "Analisar Hemograma ao concluir",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: ANAMNESE_FINISH_LABEL, exact: true })
      .click();
    await expect(
      page.getByText("Falha de teste na análise.", { exact: true }),
    ).toBeVisible();
    fail = false;
    await page
      .getByRole("button", { name: "Tentar novamente", exact: true })
      .click();
    // A legenda visível e a região viva (role=status) repetem o mesmo texto.
    const examProgress = "Analisando exame 1 de 1: Hemograma";
    await expect(
      page.getByRole("status").filter({ hasText: examProgress }),
    ).toHaveCount(1);
    await expect(
      page.getByText(examProgress, { exact: true }).first(),
    ).toBeVisible();
    await expect.poll(() => requests.length).toBe(2);
    await page
      .getByRole("button", { name: "Cancelar geração", exact: true })
      .click();
    await expect(
      page.getByText(
        "Criação da dieta cancelada. Você pode tentar novamente.",
        { exact: true },
      ),
    ).toBeVisible();
    const saved = await readState(page, "cancelled");
    expect(saved.exams).toHaveLength(1);
    expect(saved.exams[0].analysis).toBeUndefined();
    expect(saved.dietPlan).toBeNull();
    expect(requests.every((r) => r.mode === "exam")).toBe(true);
    await context.close();
    console.log(
      "PASS: falha, progresso, nova tentativa e cancelamento preservam anexo",
    );
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
