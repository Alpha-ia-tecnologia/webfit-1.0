import { test, expect } from "@playwright/test";
import { emptyDraft, initialState } from "../../src/lib/domain";
import { HABIT_SUGGESTIONS } from "../../src/data/habit-suggestions";

test("entrada breve registra hábitos e água sem perfil clínico e retoma cadastro sem perder registros", async ({
  page,
}) => {
  const aiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/agent")) aiRequests.push(request.url());
  });
  await page.goto("/");
  // Tela 1: valor, com "Personalizar alimentação" e restaurar backup à vista.
  await expect(
    page.getByRole("heading", { name: "Sua rotina começa aqui" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Personalizar alimentação" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  // Tela 2: nome e objetivo em cartões; sem objetivo não avança.
  await expect(page.getByRole("heading", { name: "Sobre você" })).toBeFocused();
  await page.getByLabel("Como você se chama?").fill("Ana Silva");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Escolha seu objetivo.");
  await page.getByRole("radio", { name: "Emagrecer e criar hábitos" }).check();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  // Tela 3: primeiro combinado e consentimento.
  await expect(
    page.getByRole("heading", { name: "Seu primeiro passo" }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: new RegExp(HABIT_SUGGESTIONS[0].title) })
    .check();
  await page
    .getByLabel(
      "Concordo em salvar minhas respostas e registros neste navegador.",
    )
    .check();
  await page
    .getByRole("button", { name: "Começar com combinados", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Olá, Ana." })).toBeVisible();
  // O combinado só aparece marcado depois de salvo (gravação antes da tela).
  const firstHabit = page.getByRole("checkbox", {
    name: new RegExp(HABIT_SUGGESTIONS[0].title),
  });
  await firstHabit.click();
  await expect(firstHabit).toBeChecked();
  await page.getByRole("button", { name: "Registrar 250 ml" }).click();
  await expect(page.getByTestId("starter-water-total")).toHaveText("250 ml");
  await page.reload();
  await expect(page.getByTestId("starter-water-total")).toHaveText("250 ml");
  await expect(
    page.getByRole("checkbox", {
      name: new RegExp(HABIT_SUGGESTIONS[0].title),
    }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Personalizar alimentação" }).click();
  await expect(
    page.getByRole("heading", { name: "Vamos conhecer você", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Como você se chama?").fill("Ana Maria");
  await page
    .getByRole("button", { name: "Salvar e voltar aos combinados" })
    .click();
  await expect(page.getByRole("heading", { name: "Olá, Ana." })).toBeVisible();
  await page.getByRole("button", { name: "Personalizar alimentação" }).click();
  await expect(page.getByLabel("Como você se chama?")).toHaveValue("Ana Maria");
  expect(aiRequests).toEqual([]);
});

test("restaurar cadastro incompleto remonta o formulário e não ressuscita respostas antigas", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Personalizar alimentação", exact: true })
    .click();
  await page.getByLabel("Como você se chama?").fill("Nome antigo");
  const backup = {
    ...initialState(),
    draft: { ...emptyDraft(), name: "Nome recuperado", consentLocal: true },
    draftStep: 0,
  };
  await page
    .getByLabel("Arquivo de backup WebFit")
    .setInputFiles({
      name: "rascunho.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await page
    .getByRole("button", { name: "Substituir dados e restaurar" })
    .click();
  await expect(page.getByLabel("Como você se chama?")).toHaveValue(
    "Nome recuperado",
  );
  await page.getByLabel("Como você se chama?").fill("Nome recuperado editado");
  // O selo "Salvo" na barra de etapa confirma o rascunho gravado neste navegador.
  await expect(page.getByText("Salvo", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Como você se chama?")).toHaveValue(
    "Nome recuperado editado",
  );
});
