import { test, expect, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import type { AppState } from "../../src/types";
import { EVOLUCAO_TITLE } from "../../src/lib/copy";

/**
 * Telas sob demanda (code splitting): um pedaço que não carrega (ex.: arquivo de uma versão
 * anterior depois de atualizar o app) vira um aviso calmo com "Recarregar", nunca uma tela branca;
 * o servidor guarda os arquivos com hash por um ano e o index.html sempre revalida.
 */
async function seed(page: Page, state: AppState) {
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready: false, token: "test-token" } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Personalizar alimentação", exact: true }),
  ).toBeVisible();
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("webfit-personal-v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("state");
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("state", "readwrite");
        tx.objectStore("state").put(value, "current");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, state);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa." })).toBeVisible();
}

test("tela cujo arquivo não carrega mostra o aviso com Recarregar e volta ao Hoje", async ({ page }) => {
  await page.route(/\/assets\/ScreenAgente-[^/]+\.js$/, (route) => route.abort());
  await seed(page, stateFixture());
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Meu agente", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Esta tela não abriu" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Seus registros continuam salvos");
  await expect(page.getByRole("button", { name: "Recarregar" })).toBeVisible();
  // O cabeçalho e a navegação continuam no lugar.
  await expect(page.getByRole("heading", { name: "Meu agente", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Voltar para Hoje" }).click();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa." })).toBeVisible();
  // Outra tela sob demanda continua abrindo normalmente.
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Evolução", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: EVOLUCAO_TITLE, level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Esta tela não abriu" })).toHaveCount(0);
});

test("arquivos com hash ficam em cache longo, index.html revalida e pedaço ausente é 404", async ({ request }) => {
  const html = await request.get("/");
  expect(html.headers()["cache-control"]).toBe("no-cache");
  const entry = (await html.text()).match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
  expect(entry).toBeTruthy();
  const script = await request.get(entry!);
  expect(script.status()).toBe(200);
  expect(script.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  const missing = await request.get("/assets/ScreenAgente-versao-antiga.js");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-type"]).toContain("text/plain");
  const route = await request.get("/qualquer/rota");
  expect(route.headers()["cache-control"]).toBe("no-cache");
});
