import { test, expect, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { localDate } from "../../src/lib/domain";
import { SETTINGS_TAB } from "../../src/lib/copy";

async function readState(page: Page) {
  return page.evaluate(
    async () =>
      new Promise<any>((resolve, reject) => {
        const request = indexedDB.open("webfit-personal-v1", 1);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("state", "readonly");
          const value = transaction.objectStore("state").get("current");
          transaction.oncomplete = () => {
            database.close();
            resolve(value.result);
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
  );
}

test("backup pode ser restaurado no primeiro acesso com revisão, persistência e nova autorização de IA", async ({
  page,
}) => {
  const backup = stateFixture();
  backup.profile!.name = "Maria Backup";
  backup.profile!.consentAi = true;
  backup.profile!.remindersEnabled = true;
  backup.revision = 87;
  backup.diary.push({
    id: "agua-backup",
    userId: backup.userId,
    date: localDate(),
    time: "10:00",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: "agua",
    title: "Água",
    description: "Copo",
    amountMl: 350,
  });
  await page.goto("/");
  await page
    .getByLabel("Arquivo de backup WebFit")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await expect(
    page.getByRole("heading", { name: "Conferir backup" }),
  ).toBeVisible();
  await expect(page.getByText("Maria Backup", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(await readState(page)).toBeUndefined();
  await page
    .getByLabel("Arquivo de backup WebFit")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await page
    .getByRole("button", { name: "Substituir dados e restaurar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Olá, Maria." }),
  ).toBeVisible();
  await expect(page.getByTestId("water-total")).toHaveText("350 ml");
  const restored = await readState(page);
  expect(restored.profile.consentAi).toBe(false);
  expect(restored.profile.remindersEnabled).toBe(false);
  expect(restored.revision).toBe(1);
  expect(restored.diary[0].userId).toBe(restored.userId);
  expect(restored.userId).not.toBe(backup.userId);
  await page.reload();
  await expect(page.getByTestId("water-total")).toHaveText("350 ml");
  await page.getByRole("button", { name: "Meu espaço", exact: true }).click();
  await page
    .getByRole("button", { name: SETTINGS_TAB.ariaLabel, exact: true })
    .click();
  await page
    .getByLabel("Arquivo de backup WebFit")
    .setInputFiles({
      name: "invalido.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":999}'),
    });
  await expect(page.getByText(/não é um backup WebFit válido/)).toBeVisible();
  expect(await readState(page)).toEqual(restored);
});
