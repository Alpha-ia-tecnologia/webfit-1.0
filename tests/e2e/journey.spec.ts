import { test, expect, type Page } from "@playwright/test";
import { profileFixture, stateFixture } from "../fixtures";
import { localDate, shiftDate } from "../../src/lib/domain";
import { questionnaire } from "../../src/data/questionnaire";
import { ANAMNESE_FINISH_LABEL, SETTINGS_TAB } from "../../src/lib/copy";
async function seed(page: Page, usesPen = false) {
  await page.goto("/");
  const state = stateFixture();
  if (usesPen)
    Object.assign(state.profile!, {
      weightLossPen: "sim",
      weightLossPenName: "Semaglutida",
      weightLossPenDose: "0,5 mg",
      weightLossPenPerMonth: 4,
    });
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("webfit-personal-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onsuccess = () => {
        const db = req.result,
          tx = db.transaction("state", "readwrite");
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
  await expect(
    page.getByRole("heading", { name: "Olá, Pessoa." }),
  ).toBeVisible();
  return state;
}
async function fillStep(page: Page, values: Record<string, unknown>) {
  // Localiza cada campo pelo nome a cada iteração: campos condicionais
  // (ex.: allergyDetails) surgem durante o preenchimento e deslocariam
  // índices capturados previamente com .all().
  for (const [name, value] of Object.entries(values)) {
    const choice = page.locator(
      `input[type="radio"][name="${name}Choice"][value="${value}"]`,
    );
    if (await choice.count()) {
      await page.locator("label").filter({ has: choice }).click();
      await expect(choice).toBeChecked();
      continue;
    }
    const field = page.locator(
      `form input[name="${name}"],form select[name="${name}"],form textarea[name="${name}"]`,
    );
    if ((await field.count()) === 0) continue;
    const tag = await field.evaluate((e) => e.tagName.toLowerCase());
    const type = await field.getAttribute("type");
    if (type === "checkbox") await field.setChecked(Boolean(value));
    else if (tag === "select") await field.selectOption(String(value ?? ""));
    else await field.fill(value === null ? "" : String(value));
  }
}
test("anamnese completa retoma rascunho e preserva perfil", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Personalizar alimentação", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Vamos conhecer você" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  const p = profileFixture();
  await fillStep(page, p);
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(
    page.getByRole("heading", { name: questionnaire[1].title, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: questionnaire[1].title, exact: true }),
  ).toBeVisible();
  for (let i = 1; i < 7; i++) {
    await expect(
      page.getByRole("heading", { name: questionnaire[i].title, exact: true }),
    ).toBeVisible();
    await fillStep(page, p);
    await page.getByRole("button", { name: "Salvar e continuar" }).click();
    await expect(
      page.getByRole("heading", {
        name: questionnaire[i + 1].title,
        exact: true,
      }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("heading", { name: "Revise sua anamnese" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: ANAMNESE_FINISH_LABEL })
    .click();
  await expect(
    page.getByRole("heading", { name: "Olá, Pessoa." }),
  ).toBeVisible();
  await expect(page.getByTestId("water-total")).toHaveText("0 ml");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Olá, Pessoa." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("menu rápido registra água, persiste e exclusão recalcula os totais", async ({
  page,
}) => {
  await seed(page);
  await page
    .getByRole("button", { name: "Registro rápido", exact: true })
    .click();
  await page.getByRole("button", { name: "Água", exact: true }).click();
  await page.getByLabel("Volume (ml)").fill("350");
  await page
    .getByRole("button", { name: "Salvar registro", exact: true })
    .click();
  await expect(page.getByTestId("water-total")).toHaveText("350 ml");
  await page.reload();
  await expect(page.getByTestId("water-total")).toHaveText("350 ml");
  await page.getByRole("button", { name: "Diário", exact: true }).click();
  // O Diário mostra a água do dia numa linha única, com o total.
  await expect(page.getByRole("heading", { name: "Água", exact: true })).toBeVisible();
  // Conceito 03: o total em litros ("0,35 / 2,5 L") com os copos ao lado.
  await expect(page.getByTestId("diary-water-total")).toHaveText("0,35");
  await page.getByLabel("Data dos registros").fill(shiftDate(localDate(), -1));
  await expect(
    page.getByText("Nenhum registro encontrado para este dia."),
  ).toBeVisible();
  await page.getByLabel("Data dos registros").fill(localDate());
  // Os registros de água aparecem ao expandir a linha; excluir é imediato e oferece "Desfazer".
  await page.getByRole("button", { name: "Registros de água (1)", exact: true }).click();
  await page.getByRole("button", { name: /^Mais ações: Água das \d{2}:\d{2}$/ }).click();
  await page.getByRole("menuitem", { name: "Excluir", exact: true }).click();
  // O botão excluído some; o foco vai para "Desfazer" para quem usa teclado ou leitor de tela.
  await expect(page.getByRole("button", { name: "Desfazer" })).toBeFocused();
  await page.getByRole("button", { name: "Hoje", exact: true }).first().click();
  await expect(page.getByTestId("water-total")).toHaveText("0 ml");
});
test("refeição começa vazia, mantém ingredientes na edição e funciona em outra data", async ({
  page,
}) => {
  await seed(page);
  // O atalho do Hoje saiu (conceito 01): Registro rápido → Refeição.
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await page.getByRole("button", { name: "Refeição", exact: true }).click();
  // Prato vazio: a bandeja com "Salvar refeição" só aparece com o primeiro alimento.
  await expect(
    page.getByRole("button", { name: "Salvar refeição", exact: true }),
  ).toHaveCount(0);
  // O tipo sugerido depende da hora do teste; a pílula permite escolher "Almoço".
  await page.getByRole("button", { name: /Hoje, \d{2}:\d{2}/ }).click();
  await page.getByRole("button", { name: "Almoço", exact: true }).click();
  await page.getByRole("button", { name: "Pronto", exact: true }).click();
  await page.getByLabel("Buscar alimento").fill("Arroz, integral, cozido");
  await page
    .getByRole("button", {
      name: "Adicionar Arroz, integral, cozido",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Porção de Arroz, integral, cozido em gramas")
    .fill("150");
  await page
    .getByRole("button", { name: "Salvar refeição", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Almoço", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Editar Almoço", exact: true })
    .click();
  await expect(
    page.getByLabel("Porção de Arroz, integral, cozido em gramas"),
  ).toHaveValue("150");
  await page
    .getByLabel("Porção de Arroz, integral, cozido em gramas")
    .fill("100");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(page.getByText("124 kcal", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Diário", exact: true }).click();
  await expect(page.getByText("124 kcal", { exact: true })).toBeVisible();
});
test("medidas atualizam perfil e exportação; preferências são persistentes", async ({
  page,
}) => {
  await seed(page);
  await page.getByRole("button", { name: "Evolução", exact: true }).click();
  await page
    .getByRole("button", { name: "Registrar medidas", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Registrar medidas" });
  // EVOL-08: régua, medidas opcionais e escolhas do kit da anamnese; os campos espelho recebem os valores.
  await expect(sheet.getByRole("slider", { name: "Peso (kg)", exact: true })).toBeVisible();
  await sheet.locator('input[name="weight"]').fill("73.5");
  await sheet.locator('input[name="waist"]').fill("85");
  await sheet.locator('input[name="method"]').fill("Balança e fita em casa");
  await page
    .getByRole("button", { name: "Salvar medidas", exact: true })
    .click();
  // Já existe medição hoje: a folha de confirmação do app pede para substituir.
  await page
    .getByRole("button", { name: "Substituir medição", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Meu espaço", exact: true })
    .click();
  // O card "Corpo" mostra o peso em destaque e a altura no bloco de medidas.
  await expect(page.getByTestId("body-weight")).toHaveText("73,5 kg");
  await expect(page.getByTestId("body-height")).toHaveText("165 cm");
  await page
    .getByRole("button", { name: SETTINGS_TAB.ariaLabel, exact: true })
    .click();
  const hideCalories = page.getByLabel(
    "Ocultar calorias nas telas e respostas",
    { exact: true },
  );
  await hideCalories.click();
  await expect(hideCalories).toBeChecked();
  await expect(
    page.getByText("Preferência salva.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("calories-total")).toHaveText(
    "Calorias ocultas",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Meu espaço", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar meus dados", exact: true })
    .click();
  const file = await download;
  const path = await file.path();
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(await readFile(path!, "utf8"));
  expect(data.profile.weight).toBe(73.5);
  expect(data.measurements.at(-1).waist).toBe(85);
  expect(data.profile.hideCalories).toBe(true);
  expect(data.profile.allergyDetails).toBe("Amendoim");
});
test("laudo é salvo como arquivo real e a IA permanece desativada sem autorização", async ({
  page,
}) => {
  await seed(page);
  await page.getByRole("button", { name: "Meu agente", exact: true }).click();
  await page.getByLabel("Mensagem para o agente").fill("Olá");
  await expect(
    page.getByRole("button", { name: "Enviar mensagem" }),
  ).toBeDisabled();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Meu espaço", exact: true })
    .click();
  await page.getByRole("button", { name: "Exames e consultas" }).click();
  await page.getByRole("button", { name: "Adicionar exame" }).click();
  await page.getByLabel("Nome do exame").fill("Exame de teste");
  await page.getByLabel("Arquivo do laudo").setInputFiles({
    name: "laudo.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% Test fixture\n%%EOF"),
  });
  await page.getByRole("button", { name: "Salvar exame", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Exame de teste" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Analisar com o agente" }),
  ).toBeDisabled();
});
test("layout móvel e exclusão completa retornam à entrada rápida", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/webfit-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Meu espaço", exact: true })
    .click();
  await page.getByRole("button", { name: SETTINGS_TAB.ariaLabel }).click();
  await page
    .getByRole("button", { name: "Excluir todos os meus dados" })
    .click();
  await page.getByLabel("Digite EXCLUIR para confirmar").fill("EXCLUIR");
  await page
    .getByRole("button", { name: "Excluir e recomeçar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Personalizar alimentação", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Personalizar alimentação", exact: true }),
  ).toBeVisible();
});
test("API rejeita requisição externa ou sem token", async ({ request }) => {
  const response = await request.post("/api/agent", {
    data: { mode: "chat", text: "Olá" },
  });
  expect(response.status()).toBe(403);
  const status = await request.get("/api/status");
  const data = await status.json();
  const foreign = await request.post("/api/agent", {
    headers: {
      "X-WebFit-Token": data.token,
      Origin: "https://outro-site.example",
    },
    data: {},
  });
  expect(foreign.status()).toBe(403);
});

test("cards da anamnese funcionam por teclado e respeitam movimento reduzido", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Personalizar alimentação", exact: true })
    .click();
  await expect(page.locator('[data-reduced-motion="true"]')).toBeVisible();
  const male = page.locator('input[name="sexChoice"][value="masculino"]');
  const female = page.locator('input[name="sexChoice"][value="feminino"]');
  await page.locator("label").filter({ has: male }).click();
  await expect(male).toBeChecked();
  await male.focus();
  await male.press("ArrowRight");
  await expect(female).toBeChecked();
  await expect(page.locator(".anamnese-option-card").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/anamnese-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/anamnese-mobile.png",
    fullPage: true,
  });
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("aba antiga não restaura registros depois que dados foram excluídos em outra aba", async ({
  page,
  context,
}) => {
  await seed(page);
  await page
    .getByRole("button", { name: /^Água: .* Registrar água$/ })
    .click();
  await page.getByLabel("Volume (ml)").fill("250");
  await page
    .getByRole("button", { name: "Salvar registro", exact: true })
    .click();
  await expect(page.getByTestId("water-total")).toHaveText("250 ml");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const other = await context.newPage();
  await other.goto("/");
  await other
    .getByRole("navigation")
    .getByRole("button", { name: "Meu espaço", exact: true })
    .click();
  await other.getByRole("button", { name: SETTINGS_TAB.ariaLabel }).click();
  await other
    .getByRole("button", { name: "Excluir todos os meus dados" })
    .click();
  await other.getByLabel("Digite EXCLUIR para confirmar").fill("EXCLUIR");
  await other
    .getByRole("button", { name: "Excluir e recomeçar", exact: true })
    .click();
  await expect(
    other.getByRole("button", {
      name: "Personalizar alimentação",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Água: .* Registrar água$/ })
    .click();
  await page
    .getByRole("button", { name: "Salvar registro", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("outra aba");
  await other.reload();
  await expect(
    other.getByRole("button", {
      name: "Personalizar alimentação",
      exact: true,
    }),
  ).toBeVisible();
  await other.close();
});
test("calculadora de seringa converte a dose prescrita e registra a aplicação no diário", async ({
  page,
}) => {
  await seed(page, true);
  // Para quem usa caneta, o registro rápido oferece "Aplicação", que abre a calculadora.
  await page
    .getByRole("button", { name: "Registro rápido", exact: true })
    .click();
  await page.getByRole("button", { name: "Aplicação", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Seringa e dose" }),
  ).toBeVisible();
  // Sem histórico: a dose começa vazia.
  await expect(page.getByTestId("injection-dose")).toHaveText("—");
  await expect(page.getByTestId("injection-volume")).toHaveText("—");
  await expect(
    page.getByRole("radio", { name: "Frasco e seringa" }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Seringa de 30 UI" }),
  ).toBeChecked();
  // 0,5 mg ÷ 1,34 mg/ml = 0,37 ml = 37 UI: não cabe em 30 UI, a seringa muda para 50 UI.
  await page
    .getByRole("button", { name: "Dose de 0,50 mg", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Seringa de 50 UI" }),
  ).toBeChecked();
  const manual = page.getByRole("button", { name: "Ajuste manual" });
  await manual.click();
  await expect(manual).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Unidades na seringa")).toHaveValue("37");
  await expect(page.getByTestId("injection-dose")).toHaveText("0,50");
  await page
    .getByRole("button", { name: "Aumentar 1 UI", exact: true })
    .click();
  await expect(page.getByLabel("Unidades na seringa")).toHaveValue("38");
  await expect(page.getByTestId("injection-volume")).toHaveText("0,38");
  await page.getByRole("radio", { name: "Coxa", exact: true }).click();
  await page
    .getByRole("button", { name: /^Confirmar e registrar 38 UI/ })
    .click();
  // Nada é registrado sem a confirmação explícita na folha.
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Registrar aplicação", exact: true })
    .click();
  // SERINGA-10: depois do registro, a folha "Aplicação registrada" leva ao diário.
  await page
    .getByRole("dialog", { name: "Aplicação registrada" })
    .getByRole("button", { name: "Ver no diário", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Semaglutida 0,51 mg" }),
  ).toBeVisible();
  await expect(page.getByText("38 UI · 0,38 ml · Coxa")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Calcular dose e registrar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Diário", exact: true }).click();
  await expect(page.locator(".diary-entry")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Semaglutida 0,51 mg" }),
  ).toBeVisible();
  // Editar e excluir ficam no "⋯" da aplicação (conceito 03).
  const removeInjection = async () => {
    await page
      .getByRole("button", { name: "Mais ações: aplicação Semaglutida 0,51 mg", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Excluir", exact: true }).click();
  };
  await removeInjection();
  // "Desfazer" devolve a aplicação; excluir de novo a remove.
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(
    page.getByRole("heading", { name: "Semaglutida 0,51 mg" }),
  ).toBeVisible();
  await removeInjection();
  await expect(
    page.getByText("Nenhum registro encontrado para este dia."),
  ).toBeVisible();
});
