import { test, expect, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import type { AppState } from "../../src/types";

/**
 * Atalhos do app instalado (HOJE-13): o manifest é servido pelo próprio app e cada atalho só abre
 * uma tela de confirmação. Nada é registrado sem a pessoa tocar em salvar; o endereço é limpo e um
 * valor desconhecido não abre nada.
 */
async function seed(page: Page, state: AppState) {
  await page.route("**/api/status", (route) => route.fulfill({ json: { ready: false, token: "test-token" } }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Personalizar alimentação", exact: true })).toBeVisible();
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
async function saved(page: Page): Promise<AppState> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("webfit-personal-v1", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("state");
          const read = tx.objectStore("state").get("current");
          read.onsuccess = () => resolve(read.result);
          read.onerror = () => reject(read.error);
          tx.oncomplete = () => db.close();
        };
      }),
  );
}
const waterEntries = async (page: Page) => (await saved(page)).diary.filter((e) => e.type === "agua");

test("o manifest e os ícones saem do próprio app, com os tipos certos", async ({ page, request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = (await response.json()) as { icons: { src: string }[]; shortcuts: unknown[] };
  expect(manifest.shortcuts).toHaveLength(3);
  for (const icon of manifest.icons) {
    const png = await request.get(icon.src);
    expect(png.status(), icon.src).toBe(200);
    expect(png.headers()["content-type"], icon.src).toContain("image/png");
  }
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
});

test("atalho de água abre a folha, limpa o endereço e só registra depois de salvar", async ({ page }) => {
  await seed(page, stateFixture());
  await page.goto("/?atalho=agua");
  const sheet = page.getByRole("dialog", { name: "Registrar água" });
  await expect(sheet).toBeVisible();
  await expect.poll(() => page.url()).not.toContain("atalho");
  await expect(sheet.getByLabel("Volume (ml)")).toHaveValue("250");
  expect(await waterEntries(page)).toHaveLength(0);
  await sheet.getByRole("button", { name: "Salvar registro", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect.poll(async () => (await waterEntries(page)).map((e) => e.amountMl)).toEqual([250]);
  // O atalho vale uma vez: recarregar não abre a folha de novo.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa." })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("atalho de refeição abre o registro de refeição sem salvar nada", async ({ page }) => {
  await seed(page, stateFixture());
  await page.goto("/?atalho=refeicao");
  await expect(page.getByRole("heading", { name: "Registrar refeição", exact: true })).toBeVisible();
  await expect.poll(() => page.url()).not.toContain("atalho");
  expect((await saved(page)).diary).toHaveLength(0);
});

test("atalho de registro rápido abre a grade", async ({ page }) => {
  await seed(page, stateFixture());
  await page.goto("/?atalho=registro");
  const quick = page.getByRole("dialog", { name: "Registro rápido" });
  await expect(quick).toBeVisible();
  await expect(quick.getByRole("button", { name: "Água", exact: true })).toBeVisible();
  await expect.poll(() => page.url()).not.toContain("atalho");
  expect((await saved(page)).diary).toHaveLength(0);
});

test("atalho antes da anamnese é descartado: o perfil que chega depois não abre a folha", async ({ page }) => {
  await page.route("**/api/status", (route) => route.fulfill({ json: { ready: false, token: "test-token" } }));
  await page.goto("/?atalho=agua");
  await expect(page.getByRole("button", { name: "Personalizar alimentação", exact: true })).toBeVisible();
  await expect.poll(() => page.url()).not.toContain("atalho");
  // O perfil chega na mesma sessão (restaurar um backup no primeiro acesso, como concluir a anamnese).
  await page.getByLabel("Arquivo de backup WebFit").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(stateFixture())),
  });
  await page.getByRole("button", { name: "Substituir dados e restaurar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa." })).toBeVisible();
  await expect(page.getByTestId("water-total")).toHaveText("0 ml");
  await expect(page.getByRole("dialog", { name: "Registrar água" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Registro rápido" })).toHaveCount(0);
  expect(await waterEntries(page)).toHaveLength(0);
});

test("valor desconhecido (inclusive dose) não abre nada e o endereço é limpo", async ({ page }) => {
  await seed(page, stateFixture());
  for (const value of ["xyz", "dose"]) {
    await page.goto(`/?atalho=${value}`);
    await expect(page.getByRole("heading", { name: "Olá, Pessoa." })).toBeVisible();
    await expect.poll(() => page.url()).not.toContain("atalho");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  expect((await saved(page)).diary).toHaveLength(0);
});
