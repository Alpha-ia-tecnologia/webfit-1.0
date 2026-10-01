import { test, expect, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import type { AppState } from "../../src/types";
import { SETTINGS_TAB } from "../../src/lib/copy";

async function seed(page: Page, state: AppState) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Personalizar alimentação", exact: true }),
  ).toBeVisible();
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("webfit-personal-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("state", "readwrite");
        tx.objectStore("state").put(value, "current");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  }, state);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Olá, Pessoa.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Meu espaço", exact: true })
    .click();
}

test("meu espaço: identidade, metas visuais, backup lembrado e restauração comparada", async ({
  page,
}) => {
  const state = stateFixture();
  await seed(page, state);
  await expect(
    page.getByRole("heading", { name: "Pessoa Teste", exact: true }),
  ).toBeVisible();
  // Topo (conceito 11): anel da anamnese e o chip "Anamnese 100%"; a próxima consulta acima das abas.
  await expect(page.locator(".profile-hero")).toContainText("Anamnese 100%");
  await expect(page.getByTestId("consulta-card")).toBeVisible();

  const goals = page.locator(".goals-card");
  await expect(
    goals.getByRole("heading", { name: "Minhas metas diárias" }),
  ).toBeVisible();
  await expect(goals.getByText("Definida por você", { exact: true })).toBeVisible();
  await expect(
    goals.getByText("kcal por dia", { exact: true }),
  ).toBeVisible();
  await goals.getByRole("button", { name: "Como calculamos?", exact: true }).click();
  const ruler = goals.locator(".goal-ruler");
  await expect(ruler).toBeVisible();
  await expect(ruler).toContainText("Basal");
  await expect(ruler).toContainText("Gasto");

  await page
    .getByRole("button", { name: SETTINGS_TAB.ariaLabel, exact: true })
    .click();
  await expect(page.getByText("Nenhum backup exportado ainda")).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar meus dados", exact: true })
    .click();
  await download;
  await expect(page.getByText("Último backup: hoje")).toBeVisible();

  await page.getByLabel("Arquivo de backup WebFit").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state)),
  });
  await expect(
    page.getByRole("heading", { name: "Conferir backup" }),
  ).toBeVisible();
  await expect(page.getByRole("row", { name: /Medições/ })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.setViewportSize({ width: 360, height: 780 });
  for (const tab of [
    "Minha saúde",
    "Exames e consultas",
    SETTINGS_TAB.ariaLabel,
  ]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("meu espaço com calorias ocultas mostra só água e gramas nas metas", async ({
  page,
}) => {
  const state = stateFixture();
  state.profile = { ...state.profile!, hideCalories: true };
  await seed(page, state);
  const goals = page.locator(".goals-card");
  await expect(goals.getByText("água por dia")).toBeVisible();
  await expect(goals.getByText("kcal por dia")).toHaveCount(0);
  await goals.getByRole("button", { name: "Como calculamos?", exact: true }).click();
  await expect(goals).not.toContainText(/\d\s*kcal/);
  await expect(goals).not.toContainText("%");
});

test("digitar num formulário em modal mantém o foco no campo (letra a letra)", async ({
  page,
}) => {
  await seed(page, stateFixture());
  await page
    .getByRole("button", { name: "Exames e consultas", exact: true })
    .click();
  await page.getByRole("button", { name: "Registrar consulta" }).click();
  const field = page.getByLabel("Nome do profissional");
  await field.click();
  await page.keyboard.type("Dra. Ana", { delay: 20 });
  await expect(field).toHaveValue("Dra. Ana");
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
