// Verificação visual do padrão WebFit contra um servidor em execução.
// Uso: BASE=http://127.0.0.1:3000 OUT=./capturas THEME=dark node --import tsx scripts/visual-check.ts
// THEME=light (padrão) ou dark: o navegador emula o modo do aparelho ("Sistema" em Aparência).
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { stateFixture } from "../tests/fixtures";
import { localDate, localTime, shiftDate, uid } from "../src/lib/domain";
import type { AppState } from "../src/types";
import { profileToDraft } from "../src/components/anamnese/condition-choice";
import { contrastIssues } from "../tests/e2e/contrast";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const THEME: "light" | "dark" = process.env.THEME === "dark" ? "dark" : "light";
const OUT = process.env.OUT ?? `test-results/visual/${THEME}`;
mkdirSync(OUT, { recursive: true });

function richState(): AppState {
  const state = stateFixture();
  const today = localDate();
  const food = state.foods[0] ?? {
    id: "taco-1",
    name: "Arroz, integral, cozido",
    category: "Cereais",
    caloriesPer100g: 124,
    proteinPer100g: 2.6,
    carbsPer100g: 25.8,
    fatPer100g: 1,
    source: "TACO",
  };
  const now = new Date().toISOString();
  state.diary = [
    {
      id: uid(),
      userId: state.userId,
      date: today,
      time: "08:10",
      createdAt: now,
      updatedAt: now,
      type: "refeicao",
      title: "Café da manhã",
      description: "Pão integral com ovo e café.",
      categoryTag: "Café da manhã",
      calories: 420,
      macros: { protein: 22, carbs: 48, fat: 14 },
      items: [{ food, grams: 120 }],
    },
    {
      id: uid(),
      userId: state.userId,
      date: today,
      time: "12:30",
      createdAt: now,
      updatedAt: now,
      type: "refeicao",
      title: "Almoço",
      description: "Arroz, feijão, frango e salada.",
      categoryTag: "Almoço",
      calories: 790,
      macros: { protein: 60, carbs: 47, fat: 14 },
      items: [{ food, grams: 200 }],
    },
    {
      id: uid(),
      userId: state.userId,
      date: today,
      time: "10:00",
      createdAt: now,
      updatedAt: now,
      type: "agua",
      title: "Água",
      description: "",
      amountMl: 750,
    },
    {
      id: uid(),
      userId: state.userId,
      date: today,
      time: localTime(),
      createdAt: now,
      updatedAt: now,
      type: "agua",
      title: "Água",
      description: "",
      amountMl: 1000,
    },
  ];
  state.habits = [
    {
      id: uid(),
      title: "Caminhada leve 20 min",
      timeOfDay: "07:30",
      createdDate: shiftDate(today, -3),
      completedDates: [today],
    },
    {
      id: uid(),
      title: "Almoço consciente sem telas",
      timeOfDay: "12:30",
      createdDate: shiftDate(today, -3),
      completedDates: [],
    },
    {
      id: uid(),
      title: "Chá calmante e higiene do sono",
      timeOfDay: "21:30",
      createdDate: shiftDate(today, -1),
      completedDates: [],
    },
  ];
  state.messages = [
    {
      id: uid(),
      sender: "ai",
      text: "Olá! Você registrou 60 g de proteína no almoço e ainda tem espaço na meta de hoje. Que tal um lanche prático à tarde?",
      timestamp: new Date(Date.now() - 600000).toISOString(),
      status: "sent",
      meta: {
        specialists: ["nutricionista"],
        reviewed: true,
        revisions: 0,
        urgency: "nenhuma",
        notes: [],
        llmCalls: 3,
      },
    },
    {
      id: uid(),
      sender: "user",
      text: "Pode me sugerir algo prático para o jantar que não use ovos?",
      timestamp: new Date(Date.now() - 300000).toISOString(),
      status: "sent",
    },
  ];
  if (state.profile) {
    state.profile.consentAi = true;
    state.profile.manualCalories = 1645;
    state.profile.manualWater = 2500;
    state.profile.manualProtein = 115;
    state.profile.manualCarbs = 175;
    state.profile.manualFat = 45;
  }
  return state;
}

async function seed(page: Page, state: AppState, waitForHome = true) {
  await page.goto(BASE + "/");
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
  if (!waitForHome) return;
  const heading = page.getByRole("heading", { name: "Olá, Pessoa." });
  try {
    await heading.waitFor({ timeout: 15000 });
  } catch {
    const text = await page.evaluate(() =>
      document.body.innerText.replace(/\s+/g, " ").slice(0, 500),
    );
    throw new Error("A semente não abriu o painel. Página: " + text);
  }
}

async function checks(
  page: Page,
  label: string,
  report: Record<string, unknown>,
) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
  const base = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      inter: document.fonts.check('16px "Inter Variable"'),
      jakarta: document.fonts.check('16px "Plus Jakarta Sans Variable"'),
      bodyFont: getComputedStyle(document.body).fontFamily.slice(0, 40),
      h1Font: getComputedStyle(document.querySelector("h1")!).fontFamily.slice(
        0,
        40,
      ),
      noHorizontalScroll:
        document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
  const contrast = await contrastIssues(page);
  report[label] = {
    ...base,
    contrast: { count: contrast.length, first: contrast.slice(0, 10) },
  };
}

const browser = await chromium.launch({
  channel: process.env.CHANNEL || undefined,
});
const report: Record<string, unknown> = {};
const errors: string[] = [];
const state = richState();

// Desktop
{
  const context = await browser.newContext({
    colorScheme: THEME,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`desktop: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`desktop console: ${m.text()}`);
  });
  await seed(page, state);
  await checks(page, "hoje-desktop", report);
  await page.screenshot({ path: `${OUT}/hoje-desktop.png`, fullPage: true });
  const before = await page.getByTestId("water-total").textContent();
  await page.getByRole("button", { name: "+250 ml" }).click();
  await page.getByText("+250 ml registrados.").waitFor();
  const after = await page.getByTestId("water-total").textContent();
  report.waterTap = { before, after };
  await page.getByRole("button", { name: "Diário", exact: true }).click();
  await page.getByRole("button", { name: "Dia anterior" }).click();
  // A data do dia aberto fica acima do título do Diário (conceito 03: "Quinta, 24 de setembro").
  report.previousDaySubtitle = await page
    .locator(".header-large .header-kicker")
    .textContent();
  await page.getByRole("button", { name: /^Hoje, / }).click();
  report.backToTodaySubtitle = await page
    .locator(".header-large .header-kicker")
    .textContent();
  await checks(page, "diario-desktop", report);
  await page.screenshot({ path: `${OUT}/diario-desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "Meu agente", exact: true }).click();
  await page.getByRole("heading", { name: "Meu agente" }).waitFor();
  await page.locator(".context-pill summary").click();
  await checks(page, "agente-desktop", report);
  await page.screenshot({ path: `${OUT}/agente-desktop.png`, fullPage: true });
  await context.close();
}
// Mobile
{
  const context = await browser.newContext({
    colorScheme: THEME,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`mobile: ${e.message}`));
  await seed(page, state);
  await checks(page, "hoje-mobile", report);
  await page.screenshot({ path: `${OUT}/hoje-mobile.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/hoje-mobile-fold.png` });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Diário", exact: true })
    .click();
  await checks(page, "diario-mobile", report);
  await page.screenshot({ path: `${OUT}/diario-mobile.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/diario-mobile-fold.png` });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Meu agente", exact: true })
    .click();
  await page.getByRole("heading", { name: "Meu agente" }).waitFor();
  await checks(page, "agente-mobile", report);
  await page.screenshot({ path: `${OUT}/agente-mobile.png`, fullPage: true });
  await page
    .getByRole("button", { name: "Registro rápido", exact: true })
    .click();
  await page.locator(".quick-sheet").waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/quick-mobile.png` });
  await context.close();
}
// Anamnese (primeiro acesso)
{
  const context = await browser.newContext({
    colorScheme: THEME,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`anamnese: ${e.message}`));
  await page.goto(BASE + "/");
  // O primeiro acesso abre a tela de entrada; a anamnese começa em "Personalizar alimentação".
  await page
    .getByRole("button", { name: "Personalizar alimentação", exact: true })
    .first()
    .click();
  await page.getByRole("heading", { name: "Vamos conhecer você" }).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({
    path: `${OUT}/anamnese-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  report.anamneseMobileNoScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  await page.screenshot({ path: `${OUT}/anamnese-mobile.png` });
  await context.close();
}
// Anamnese interativa: chips, "Outros", rodas e régua arrastável
{
  const context = await browser.newContext({
    colorScheme: THEME,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`anamnese-interativa: ${e.message}`));
  await page.goto(BASE + "/");
  // O primeiro acesso abre a tela de entrada; a anamnese começa em "Personalizar alimentação".
  await page
    .getByRole("button", { name: "Personalizar alimentação", exact: true })
    .first()
    .click();
  await page.getByRole("heading", { name: "Vamos conhecer você" }).waitFor();
  await page
    .getByRole("button", { name: "Trabalho em casa", exact: true })
    .click();
  await page.getByRole("button", { name: "Acordo cedo", exact: true }).click();
  await page
    .getByRole("button", { name: "Cozinho em casa", exact: true })
    .click();
  report.routineMirror = await page
    .locator('input[name="routine"]')
    .inputValue();
  await page.getByRole("button", { name: "Outros" }).first().click();
  await page
    .getByLabel("Ocupação e rotina de trabalho ou estudo: outros")
    .fill("Motorista de aplicativo");
  report.occupationMirror = await page
    .locator('input[name="occupation"]')
    .inputValue();
  await page.locator('input[name="name"]').fill("Pessoa Teste");
  await page.locator('input[name="birthDate"]').fill("1992-06-15");
  report.birthWheel = await page
    .locator('[data-field="birthDate"] .q-value')
    .textContent();
  await page
    .locator("label")
    .filter({ has: page.locator('input[name="sexChoice"][value="feminino"]') })
    .click();
  // Desde a Onda 3 o objetivo fica na primeira etapa.
  await page
    .locator("label")
    .filter({ has: page.locator('input[name="goalChoice"][value="manter"]') })
    .click();
  await page.locator('input[name="consentLocal"]').check();
  await page.screenshot({
    path: `${OUT}/anamnese-passo1-preenchido.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  // Triagem sensível antes das medidas: "Cuidados importantes".
  await page
    .getByRole("heading", { name: "Cuidados importantes", exact: true })
    .waitFor();
  for (const key of ["pregnancy", "eatingDisorder", "fluidRestriction"])
    await page
      .locator("label")
      .filter({ has: page.locator(`input[name="${key}Choice"][value="nao"]`) })
      .click();
  await page
    .getByRole("button", { name: "Nenhuma", exact: true })
    .first()
    .click();
  await page.screenshot({
    path: `${OUT}/anamnese-cuidados-desktop.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page
    .getByRole("heading", { name: "Seu ponto de partida", exact: true })
    .waitFor();
  await page.waitForTimeout(500);
  const ruler = page.locator('[data-field="weight"] .ruler-scroll');
  const box = await ruler.boundingBox();
  if (box) {
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.6, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, y, { steps: 12 });
    await page.mouse.up();
  }
  await page.waitForTimeout(400);
  report.weightAfterDrag = await page
    .locator('input[name="weight"]')
    .inputValue();
  await page.getByRole("button", { name: "Aumentar 0,5 kg" }).click();
  report.weightAfterPlus = await page
    .locator('input[name="weight"]')
    .inputValue();
  await page.getByRole("button", { name: "Ontem", exact: true }).click();
  report.measurementDate = await page
    .locator('input[name="measurementDate"]')
    .inputValue();
  await page.screenshot({
    path: `${OUT}/anamnese-medidas-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  report.anamneseMedidasMobileNoScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  await page.screenshot({ path: `${OUT}/anamnese-medidas-mobile.png` });
  await page.screenshot({
    path: `${OUT}/anamnese-medidas-mobile-full.png`,
    fullPage: true,
  });
  // Canetas emagrecedoras: pergunta condicional, doses por caneta e frequência mensal
  await page.locator('input[name="height"]').fill("165");
  await page
    .getByRole("button", { name: "Balança em casa", exact: true })
    .click();
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await page
    .getByRole("heading", { name: "Histórico de saúde", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Não uso medicamentos", exact: true })
    .click();
  await page
    .locator("label")
    .filter({
      has: page.locator('input[name="weightLossPenChoice"][value="sim"]'),
    })
    .click();
  await page
    .getByRole("button", { name: "Mounjaro (tirzepatida)", exact: true })
    .click();
  await page.getByRole("button", { name: "5 mg", exact: true }).click();
  await page
    .getByRole("radiogroup", { name: "Com que frequência?" })
    .getByRole("radio", { name: "Semanal" })
    .click();
  await page.getByRole("radio", { name: "Quinta-feira" }).click();
  report.pen = {
    name: await page.locator('input[name="weightLossPenName"]').inputValue(),
    dose: await page.locator('input[name="weightLossPenDose"]').inputValue(),
    perMonth: await page
      .locator('input[name="weightLossPenPerMonth"]')
      .inputValue(),
    penWeekday: await page.locator('input[name="penWeekday"]').inputValue(),
  };
  // Caneta com "Não uso medicamentos": aviso neutro com a correção em um toque.
  await page.locator(".coherence-chip").first().scrollIntoViewIfNeeded();
  await page.locator(".coherence-chip").first().screenshot({
    path: `${OUT}/anamnese-caneta-coerencia.png`,
  });
  await page
    .locator('input[name="weightLossPenChoice"][value="sim"]')
    .scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/anamnese-caneta-mobile.png` });
  await page.screenshot({
    path: `${OUT}/anamnese-caneta-mobile-full.png`,
    fullPage: true,
  });
  await context.close();
}
// Seringa e dose: calculadora, seringa virtual calibrada e mapa de aplicação
{
  const context = await browser.newContext({
    colorScheme: THEME,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`injecao: ${e.message}`));
  const penState = richState();
  if (penState.profile) {
    penState.profile.weightLossPen = "sim";
    penState.profile.weightLossPenName = "Mounjaro (tirzepatida)";
    penState.profile.weightLossPenDose = "5 mg";
    penState.profile.weightLossPenPerMonth = 4;
  }
  const stamp = new Date().toISOString();
  penState.injections = [
    {
      id: uid(),
      userId: penState.userId,
      date: shiftDate(localDate(), -6),
      time: "08:30",
      createdAt: stamp,
      updatedAt: stamp,
      method: "frasco",
      medication: "Tirzepatida",
      concentrationMgPerMl: 5,
      syringeUnits: 100,
      units: 100,
      volumeMl: 1,
      doseMg: 5,
      site: "abdomen",
      side: null,
      notes: "",
    },
  ];
  await seed(page, penState);
  await page.locator(".injection-card").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${OUT}/hoje-injecao-desktop.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Calcular dose e registrar" }).click();
  await page.getByRole("heading", { name: "Seringa e dose" }).waitFor();
  // A aplicação de 6 dias atrás é recente: a tela abre na receita ("Sua última dose").
  await page.getByTestId("injection-recipe").waitFor();
  await page.screenshot({ path: `${OUT}/injecao-receita-desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "Outra dose ou frasco novo" }).click();
  report.injecaoDefault = {
    dose: await page.getByTestId("injection-dose").textContent(),
    volume: await page.getByTestId("injection-volume").textContent(),
    medication: await page
      .getByRole("radiogroup", { name: "Medicação" })
      .getByRole("radio", { checked: true })
      .getAttribute("aria-label"),
    suggested: await page.locator(".inj-tag.suggested").count(),
  };
  await page.getByRole("button", { name: "Dose de 5,00 mg" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Ajuste manual" }).click();
  report.injecaoPreset = {
    dose: await page.getByTestId("injection-dose").textContent(),
    volume: await page.getByTestId("injection-volume").textContent(),
    units: await page.getByLabel("Unidades na seringa").inputValue(),
    syringe: await page
      .getByRole("radio", { name: /^Seringa de/, checked: true })
      .getAttribute("aria-label"),
  };
  await checks(page, "injecao-desktop", report);
  await page.screenshot({ path: `${OUT}/injecao-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  report.injecaoMobileNoScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  // Meta ≤ 1.700 px (SERINGA-06); com o ajuste manual aberto a página cresce, então fecha antes de medir.
  await page.getByRole("button", { name: "Ajuste manual" }).click();
  report.injecaoFormHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/injecao-mobile-fold.png` });
  await page.screenshot({ path: `${OUT}/injecao-mobile.png`, fullPage: true });
  await page.getByRole("radio", { name: "Braço", exact: true }).click();
  await page
    .getByRole("button", { name: /^Confirmar e registrar 100 UI/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Registrar aplicação", exact: true })
    .click();
  // SERINGA-10: a folha "Aplicação registrada" confirma; "Ver no diário" abre o dia.
  const savedSheet = page.getByRole("dialog", { name: "Aplicação registrada" });
  await savedSheet.waitFor();
  await page.screenshot({ path: `${OUT}/injecao-registrada-mobile.png` });
  await savedSheet.getByRole("button", { name: "Ver no diário", exact: true }).click();
  await page
    .getByRole("heading", { name: "Tirzepatida 5,00 mg" })
    .first()
    .waitFor();
  report.injecaoRegistrada = await page
    .locator(".diary-entry", { hasText: "Tirzepatida" })
    .first()
    .innerText();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${OUT}/diario-injecao-mobile.png`,
    fullPage: true,
  });
  await context.close();
}
// Metas automáticas: caneta emagrecedora sem metas manuais (Hoje e Meu espaço) e revisão da anamnese
{
  const context = await browser.newContext({
    colorScheme: THEME,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`metas: ${e.message}`));
  const goalState = richState();
  const penProfile = {
    ...goalState.profile!,
    goal: "perder" as const,
    weightLossPen: "sim" as const,
    weightLossPenName: "Ozempic (semaglutida)",
    weightLossPenDose: "0,5 mg",
    weightLossPenPerMonth: 4,
    manualCalories: null,
    manualProtein: null,
    manualCarbs: null,
    manualFat: null,
  };
  goalState.profile = penProfile;
  goalState.goalHistory = goalState.goalHistory.map((h) => ({
    ...h,
    profile: penProfile,
  }));
  await seed(page, goalState);
  // Desde a Onda 1 o balanço fica no modal "Como calculamos" e os macros nos anéis do topo.
  await page.getByRole("button", { name: "Como calculamos" }).click();
  const explain = page.getByRole("dialog");
  report.metasCaneta = {
    kcal: await page.getByTestId("calories-total").textContent(),
    macros: await page
      .locator(".day-macro")
      .evaluateAll((els) =>
        els.map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim()),
      ),
    source: await explain.locator(".hint").first().textContent(),
  };
  await page.screenshot({
    path: `${OUT}/hoje-metas-caneta-desktop.png`,
    fullPage: true,
  });
  await explain.getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("button", { name: "Meu espaço", exact: true }).click();
  // Desde o lote 5 a memória de cálculo fica em "Como calculamos?" dentro de "Minhas metas diárias".
  const memo = page.locator(".goals-card");
  await memo.waitFor();
  await memo.getByText("Como calculamos?", { exact: true }).click();
  report.metasMemoria = (await memo.innerText()).replace(/\s+/g, " ");
  await page.screenshot({
    path: `${OUT}/espaco-metas-caneta-desktop.png`,
    fullPage: true,
  });
  await seed(
    page,
    { ...stateFixture(), profile: null, draft: profileToDraft(penProfile), draftStep: 7 },
    false,
  );
  const start = page.locator(".anamnese-start-card");
  await start.waitFor({ timeout: 15000 });
  report.metasRevisao = (await start.innerText()).replace(/\s+/g, " ");
  await start.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${OUT}/anamnese-revisao-metas-desktop.png`,
    fullPage: true,
  });
  await context.close();
}
await browser.close();
report.theme = THEME;
report.errors = errors;
console.log(JSON.stringify(report, null, 1));
