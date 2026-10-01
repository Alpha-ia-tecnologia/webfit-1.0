import { test, expect, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { localDate, mealTotals, shiftDate } from "../../src/lib/domain";
import {
  diarySchema,
  type AppState,
  type DiaryEntry,
  type FoodItem,
  type Profile,
} from "../../src/types";
import { SETTINGS_TAB } from "../../src/lib/copy";

/**
 * Onda 3 · Lote 4 · NOTIF-01: central de lembretes (Agora, Hoje, Próximos), atalhos de um toque
 * com "Desfazer", estado desligado com a prévia do dia e as regras de saúde (medidas, caneta,
 * gestação e restrição de líquidos). Relógio fixo às 13:00 de hoje, salvo quando indicado.
 */
const today = localDate();
const TOMORROW_OR_DATE = /^(Amanhã|\p{Lu}\p{Ll}{2}, \d{1,2} \p{Ll}{3}) · \d{2}:\d{2}$/u;

type Raw = Record<string, unknown>;

const bread: FoodItem = {
  id: "test-pao",
  name: "Pão do teste",
  category: "Cereais",
  caloriesPer100g: 280,
  proteinPer100g: 8,
  carbsPer100g: 55,
  fatPer100g: 3,
  source: "Tabela de teste",
};

function diaryEntry(fields: Raw): DiaryEntry {
  const time = String(fields.time);
  return diarySchema.parse({
    userId: "seed",
    date: today,
    createdAt: `${today}T${time}:00.000Z`,
    updatedAt: `${today}T${time}:00.000Z`,
    description: "",
    ...fields,
  });
}

/** Café às 08:10, 500 ml de água às 10:00, combinados às 12:00 e 21:30 e nenhuma medida. */
function centerState(profile: Partial<Profile> = {}): AppState {
  const state = stateFixture();
  const items = [{ food: bread, grams: 80 }];
  return {
    ...state,
    profile: { ...state.profile!, remindersEnabled: true, ...profile },
    measurements: [],
    diary: [
      diaryEntry({
        id: "cafe1",
        userId: state.userId,
        time: "08:10",
        type: "refeicao",
        title: "Café da manhã",
        categoryTag: "Café da manhã",
        items,
        ...mealTotals(items),
      }),
      diaryEntry({
        id: "agua1",
        userId: state.userId,
        time: "10:00",
        type: "agua",
        title: "Água",
        amountMl: 500,
      }),
    ],
    habits: [
      {
        id: "h1",
        title: "Caminhar 20 minutos",
        timeOfDay: "12:00",
        createdDate: shiftDate(today, -3),
        completedDates: [],
      },
      {
        id: "h2",
        title: "Chá calmante",
        timeOfDay: "21:30",
        createdDate: shiftDate(today, -3),
        completedDates: [],
      },
    ],
  };
}

/** Aplicação de Tirzepatida 5 mg/ml (50 UI, 2,50 mg) há `daysAgo` dias, como em injecao.spec. */
function injection(daysAgo: number, overrides: Raw = {}): Raw {
  const date = shiftDate(today, -daysAgo);
  return {
    id: `inj-${daysAgo}`,
    userId: "seed",
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
    ...overrides,
  };
}
/** Caneta semanal com a última aplicação há 7 dias às 00:00: hoje é o dia estimado. */
function penState(profile: Partial<Profile> = {}): AppState {
  const state = centerState({
    weightLossPen: "sim",
    weightLossPenName: "Tirzepatida",
    weightLossPenDose: "2,5 mg",
    weightLossPenPerMonth: 4,
    pregnancy: "nao",
    quietStart: "00:00",
    quietEnd: "00:00",
    ...profile,
  });
  const injections = [injection(7, { time: "00:00", userId: state.userId })];
  return { ...state, injections } as unknown as AppState;
}

async function seed(page: Page, state: AppState, time = "13:00") {
  await page.clock.setFixedTime(`${today}T${time}:00`);
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { ready: false, token: "test-token" } }),
  );
  await page.goto("/");
  await expect(
    page
      .getByRole("button", { name: "Personalizar alimentação", exact: true })
      .or(page.getByRole("heading", { name: "Olá, Pessoa." })),
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

async function openLembretes(page: Page, bell: string | RegExp = /^Notificações/) {
  await page.getByRole("button", { name: bell }).click();
  await expect(
    page.getByTestId("reminder-section-agora").or(page.getByTestId("reminders-off")),
  ).toBeVisible();
}

const agoraCards = (page: Page) =>
  page.getByTestId("reminder-section-agora").getByTestId("reminder-card");
const cardOfType = (page: Page, type: string) =>
  page.locator(`[data-testid="reminder-card"][data-type="${type}"]`);
const toast = (page: Page) => page.locator(".toast");

test("Agora, Hoje e Próximos: tipos, horários, progresso da água e nenhuma caloria", async ({ page }) => {
  await seed(page, centerState());
  await openLembretes(page, /^Notificações, 4 não lidas/);

  const cards = agoraCards(page);
  await expect(cards).toHaveCount(4);
  expect(await cards.evaluateAll((els) => els.map((el) => el.getAttribute("data-type")))).toEqual([
    "refeicao",
    "habito",
    "agua",
    "medicao",
  ]);
  await expect(page.getByTestId("reminder-section-agora").getByTestId("reminder-unread-dot")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Agora", level: 2 })).toBeVisible();
  // O sino não aparece dentro da própria tela; o aviso é o da web.
  await expect(page.getByRole("button", { name: /^Notificações/ })).toHaveCount(0);
  await expect(page.locator(".reminders-notice")).toContainText(
    "enquanto o WebFit está aberto no navegador",
  );

  const hoje = page.getByTestId("reminder-section-hoje").getByTestId("reminder-row");
  await expect(hoje.locator(".reminder-row-when")).toHaveText(["Às 15:00", "Às 19:30", "Às 21:00", "Às 21:30"]);

  const proximos = page.getByTestId("reminder-section-proximos").getByTestId("reminder-row");
  await expect(proximos).toHaveCount(6);
  await expect(proximos.first()).toContainText("Amanhã · 08:30");
  await expect(proximos.filter({ hasText: "Atualizar medidas" })).toHaveCount(0);
  for (const when of await proximos.locator(".reminder-row-when").allTextContents())
    expect(when).toMatch(TOMORROW_OR_DATE);

  await expect(page.locator("#main-content")).not.toContainText(/kcal|caloria/i);
  const water = cardOfType(page, "agua");
  await expect(water).toContainText("500 de 2.000 ml hoje");
  await expect(water.getByTestId("reminder-progress")).toBeVisible();
});

test("+250 ml registra a água de hoje, tira o cartão de Agora e Desfazer devolve", async ({ page }) => {
  await seed(page, centerState());
  await openLembretes(page);

  await page.getByRole("button", { name: "Somar 250 ml de água", exact: true }).click();
  await expect(toast(page)).toContainText("+250 ml registrados.");
  await expect(agoraCards(page)).toHaveCount(3);
  await expect(cardOfType(page, "agua")).toHaveCount(0);
  await expect(page.locator("#rs-agora")).toBeFocused();
  const added = (await saved(page)).diary.filter(
    (e) => e.type === "agua" && e.date === today && e.amountMl === 250,
  );
  expect(added).toHaveLength(1);

  await toast(page).getByRole("button", { name: "Desfazer" }).click();
  await expect(agoraCards(page)).toHaveCount(4);
  await expect(cardOfType(page, "agua")).toBeVisible();
  await expect
    .poll(async () => (await saved(page)).diary.filter((e) => e.amountMl === 250).length)
    .toBe(0);
});

test("Concluir marca o combinado de hoje e Desfazer reabre", async ({ page }) => {
  await seed(page, centerState());
  await openLembretes(page);

  await page.getByRole("button", { name: "Concluir combinado: Caminhar 20 minutos", exact: true }).click();
  await expect(toast(page)).toContainText("Combinado concluído.");
  await expect(agoraCards(page)).toHaveCount(3);
  await expect(cardOfType(page, "habito")).toHaveCount(0);
  const habit = async () => (await saved(page)).habits.find((h) => h.id === "h1")!;
  expect((await habit()).completedDates).toContain(today);

  await toast(page).getByRole("button", { name: "Desfazer" }).click();
  await expect(toast(page)).toContainText("Conclusão desfeita.");
  await expect(agoraCards(page)).toHaveCount(4);
  await expect.poll(async () => (await habit()).completedDates).not.toContain(today);
});

test("Marcar como lido leva o cartão para Hoje e devolve o foco a Agora", async ({ page }) => {
  await seed(page, centerState());
  await openLembretes(page);

  await page.getByRole("button", { name: "Marcar como lido: Atualizar medidas", exact: true }).click();
  await expect(agoraCards(page)).toHaveCount(3);
  const read = page
    .getByTestId("reminder-section-hoje")
    .getByTestId("reminder-card")
    .filter({ hasText: "Atualizar medidas" });
  await expect(read).toContainText("Lido");
  await expect(read.getByTestId("reminder-unread-dot")).toHaveCount(0);
  await expect(read.getByRole("button", { name: /^Marcar como lido/ })).toHaveCount(0);
  await expect(page.locator("#rs-agora")).toBeFocused();
  expect((await saved(page)).readNotifications).toContain(`${today}:medicao`);
});

test("Registrar abre a refeição com o tipo e Marcar todos deixa tudo em dia", async ({ page }) => {
  await seed(page, centerState());
  await openLembretes(page);

  await page.getByRole("button", { name: "Registrar almoço agora", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Almoço, Hoje, \d{2}:\d{2}/ })).toBeVisible();
  expect((await saved(page)).readNotifications).toContain(`${today}:Almoço`);
  expect((await saved(page)).diary.filter((e) => e.type === "refeicao")).toHaveLength(1);

  // Registrar refeição não tem o sino (conceito 02: o histórico fica no lugar dele): o sino é o do Hoje.
  await page.getByRole("button", { name: "Voltar para Hoje", exact: true }).click();
  await openLembretes(page, /^Notificações, 3 não lidas/);
  await page.getByRole("button", { name: "Marcar todos como lidos" }).click();
  await expect(toast(page)).toContainText("Lembretes marcados como lidos.");
  const clear = page.getByTestId("reminders-all-clear");
  await expect(clear).toContainText("Tudo em dia");
  await expect(clear).toContainText("Próximo: 15:00 · Pausa para hidratação");
  await expect(page.getByRole("button", { name: "Marcar todos como lidos" })).toHaveCount(0);
  await expect(page.locator("#rs-agora")).toBeFocused();
});

test("desligados: prévia do dia, Ajustar horários e Ativar lembretes", async ({ page }) => {
  await seed(page, centerState({ remindersEnabled: false }));
  await openLembretes(page, "Notificações");

  const off = page.getByTestId("reminders-off");
  await expect(off.getByRole("heading", { name: "Lembretes desligados" })).toBeVisible();
  await expect(page.getByTestId("reminder-section-agora")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Marcar todos como lidos" })).toHaveCount(0);
  const chips = page.getByTestId("reminders-preview").getByRole("listitem");
  await expect(chips).toHaveCount(8);
  await expect(chips.first()).toHaveText("09:00 Água");
  await expect(off).toContainText("Silêncio 22:00–07:00");

  await off.getByRole("button", { name: "Ajustar horários" }).click();
  await expect(
    page.getByRole("button", { name: SETTINGS_TAB.ariaLabel, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await openLembretes(page, "Notificações");
  await page.getByRole("button", { name: "Ativar lembretes" }).click();
  await expect(toast(page)).toContainText("Lembretes ativados.");
  await expect(agoraCards(page)).toHaveCount(4);
  await expect(page.locator("#rs-agora")).toBeFocused();
  await expect.poll(async () => (await saved(page)).profile?.remindersEnabled).toBe(true);
});

test("perfil sensível: nenhum convite a medidas, nem na prévia", async ({ page }) => {
  await seed(page, centerState({ eatingDisorder: "sim" }));
  await openLembretes(page);
  await expect(agoraCards(page)).toHaveCount(3);
  await expect(page.locator('[data-type="medicao"]')).toHaveCount(0);
  await expect(page.locator("#main-content")).not.toContainText("Atualizar medidas");

  await seed(page, centerState({ eatingDisorder: "sim", remindersEnabled: false }));
  await openLembretes(page, "Notificações");
  await expect(page.getByTestId("reminders-preview").getByRole("listitem")).not.toHaveCount(0);
  await expect(page.getByTestId("reminders-preview")).not.toContainText("Medidas");
});

test("caneta: o lembrete da aplicação só abre Seringa e dose, sem registrar", async ({ page }) => {
  await seed(page, penState());
  await openLembretes(page);

  const card = page.locator("section.card", {
    has: page.getByRole("heading", { name: "Dia da aplicação (estimado)" }),
  });
  await expect(card).toHaveCount(1);
  await expect(card).not.toContainText(/\bmg\b|Tirzepatida/);
  await expect(card.getByRole("button", { name: /^(Somar|Concluir|Registrar)/ })).toHaveCount(0);
  await card.getByRole("button", { name: "Abrir registro" }).click();
  await expect(page.getByRole("heading", { name: "Seringa e dose" })).toBeVisible();
  expect((await saved(page)).injections).toHaveLength(1);
});

test("gestação: nada sobre a aplicação na central", async ({ page }) => {
  await seed(page, penState({ pregnancy: "gestacao" }));
  await openLembretes(page);
  await expect(page.locator('[data-type="injecao"]')).toHaveCount(0);
  await expect(page.locator("#main-content")).not.toContainText("Dia da aplicação");
  await expect(page.locator("#main-content")).not.toContainText("Aplicação (estimada)");
});

test("restrição de líquidos: sem +250 ml e sem meta de água", async ({ page }) => {
  await seed(page, centerState({ fluidRestriction: "sim" }));
  await openLembretes(page);
  await expect(page.getByRole("button", { name: "Somar 250 ml de água" })).toHaveCount(0);
  const water = cardOfType(page, "agua");
  await expect(water).toContainText("500 ml registrados hoje");
  await expect(water.getByTestId("reminder-progress")).toHaveCount(0);
});

test("horário de silêncio avisa até quando e mostra tudo em dia", async ({ page }) => {
  await seed(page, centerState(), "23:30");
  await openLembretes(page, "Notificações");
  const quiet = page.getByTestId("reminders-quiet");
  await expect(quiet).toHaveRole("status");
  await expect(quiet).toHaveText("Horário de silêncio até 07:00. Os lembretes voltam depois.");
  await expect(page.getByTestId("reminders-all-clear")).toBeVisible();
  await expect(agoraCards(page)).toHaveCount(0);
});

test("360 px: sem rolagem lateral e alvos de 44 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await seed(page, centerState());
  await openLembretes(page);
  await expect(agoraCards(page)).toHaveCount(4);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const targets = page.locator(".reminder-chip, .reminder-open, .reminder-read");
  expect(await targets.count()).toBeGreaterThanOrEqual(10);
  // Caixa de layout (offset*): a entrada dos cartões desliza em translateY, e o retângulo na tela
  // pode medir 43,99997 px durante a animação sem o alvo ser menor.
  for (const box of await targets.evaluateAll((els) =>
    els.map((el) => ({
      width: (el as HTMLElement).offsetWidth,
      height: (el as HTMLElement).offsetHeight,
    })),
  )) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
});
