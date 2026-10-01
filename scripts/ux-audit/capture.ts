// Capturas de auditoria visual de todas as telas a 390 px, com um estado sintético rico.
// Usado para comparar antes/depois das mudanças visuais (Onda 1 em diante).
// Uso, com o servidor em execução:
//   BASE=http://127.0.0.1:3121 OUT=test-results/ux-audit/shots CHANNEL=chrome node --import tsx scripts/ux-audit/capture.ts
// Atenção: test-results/ é apagado pelo Playwright a cada npm run test:e2e; guarde as capturas em outro lugar se precisar.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { stateFixture } from "../../tests/fixtures";
import { localDate, shiftDate, uid } from "../../src/lib/domain";
import { DIET_PLAN_REQUEST, dietProfileSignature } from "../../src/lib/diet";
import { pantrySignature } from "../../src/lib/pantry";
import { renderRecipeSetText } from "../../src/lib/recipe-set";
import { recipeSetSchema, type AppState, type DiaryEntry, type RecipeSet } from "../../src/types";

const BASE = process.env.BASE ?? "http://127.0.0.1:3121";
const OUT = process.env.OUT ?? "test-results/ux-audit/shots";
mkdirSync(OUT, { recursive: true });
const W = 390;
const H = 844;
const log: string[] = [];

const META = {
  specialists: ["nutricionista"] as "nutricionista"[],
  reviewed: true,
  revisions: 0,
  urgency: "nenhuma" as const,
  notes: [],
  llmCalls: 3,
};

const DIET = `## Resumo
Plano para manter o peso (72 kg) com cerca de 1.645 kcal/dia, priorizando proteína em todas as refeições e respeitando sua alergia a amendoim. Rotina de escritório com 30 minutos por dia para cozinhar.

**Café da manhã (07:30)**
- 2 fatias de pão integral (50 g)
- 2 ovos mexidos com azeite (1 colher de chá)
- 1 xícara de café sem açúcar
- 1 fruta média (mamão, 150 g)

**Lanche da manhã (10:00)**
- 1 iogurte natural (170 g) com 1 colher de sopa de aveia

**Almoço (12:30)**
- 4 colheres de sopa de arroz integral (100 g)
- 1 concha de feijão (80 g)
- 1 filé de frango grelhado (120 g)
- Salada à vontade com 1 colher de chá de azeite

**Lanche da tarde (16:00)**
- 1 fatia de queijo branco (30 g) + 1 torrada integral
- 1 fruta pequena

**Jantar (19:30)**
- Omelete de 2 ovos com legumes ou 100 g de peixe
- Legumes cozidos à vontade
- 2 colheres de sopa de batata-doce (80 g)

## Substituições
- Frango ↔ peixe, carne magra ou tofu (mesmo peso)
- Arroz integral ↔ quinoa, batata-doce ou mandioca (mesmas calorias)
- Pão integral ↔ tapioca (2 colheres de sopa de goma) ou cuscuz

## Orientações práticas
- Cozinhe proteína para 2 dias no domingo e na quarta-feira.
- Beba 2,5 L de água ao longo do dia; deixe uma garrafa na mesa.
- Evite produtos com amendoim ou traços; leia os rótulos.
- Se sentir fome à noite, inclua mais legumes no jantar antes de aumentar carboidratos.`;

const RECIPE = `## Receita 1 — Frango ao forno com legumes
**Refeição da dieta:** Almoço
**Rendimento:** 3 porções · **Tempo:** 35 min
**Ingredientes disponíveis**
- 400 g de peito de frango
- 2 cenouras
- 1 abobrinha
- Azeite, alho e sal
**Ingredientes que faltam**
- Alecrim fresco (opcional)
**Modo de preparo**
1. Tempere o frango com alho, sal e limão por 10 minutos.
2. Corte os legumes em cubos e regue com 1 colher de azeite.
3. Asse tudo a 200 °C por 25 minutos, virando na metade.

## Receita 2 — Omelete de forno com espinafre
**Refeição da dieta:** Jantar
**Rendimento:** 2 porções · **Tempo:** 20 min
**Ingredientes disponíveis**
- 4 ovos
- 1 maço de espinafre
- 50 g de queijo branco
**Modo de preparo**
1. Bata os ovos com sal e pimenta.
2. Misture o espinafre picado e o queijo.
3. Asse em forma untada a 180 °C por 15 minutos.`;

const WEEK_SUMMARY =
  "Boa semana! Você registrou refeições em 6 de 7 dias e ficou, em média, 4% abaixo da meta de 1.645 kcal.\n\n**Destaques**\n- Proteína: média de 95 g/dia (meta 115 g). Falta um reforço no café da manhã.\n- Água: 1,9 L/dia (meta 2,5 L). Os dias sem registro à tarde puxaram a média para baixo.\n- Sono: 7 h em média, com melhora nas noites após a caminhada.\n\n**Sugestões para a próxima semana**\n1. Inclua um iogurte natural ou 2 ovos no café da manhã.\n2. Deixe uma garrafa de 1 L na mesa e reabasteça às 15 h.\n3. Mantenha a caminhada: ela aparece junto das noites de melhor sono.";
const DINNER_IDEAS =
  "Claro! Três opções rápidas (até 20 min), sem ovos e sem amendoim:\n\n- **Wrap de frango:** tortilha integral, 100 g de frango desfiado, folhas e iogurte com limão. ~420 kcal, 35 g de proteína.\n- **Peixe na frigideira:** 120 g de tilápia, legumes salteados e 2 colheres de batata-doce. ~380 kcal, 30 g de proteína.\n- **Bowl de grão-de-bico:** 1 xícara de grão-de-bico, tomate, pepino, azeite e queijo branco. ~450 kcal, 22 g de proteína.\n\nQuer que eu registre alguma delas no seu diário?";

/** Duas receitas estruturadas com os itens da despensa de exemplo (ids reais, básicos marcados). */
function structuredRecipes(state: AppState): RecipeSet {
  const home = (name: string, quantidade: string) => {
    const item = state.pantry.find((i) => i.name === name);
    if (!item) throw new Error(`Item de exemplo ausente: ${name}`);
    return { pantryItemId: item.id, nome: item.name, quantidade };
  };
  return recipeSetSchema.parse({
    version: 2,
    receitas: [
      {
        nome: "Frango ao forno com legumes",
        refeicao: "Almoço",
        porcoes: 3,
        tempoMin: 35,
        compatibilidade: "Proteína magra e legumes, como no almoço da sua dieta.",
        ingredientesCasa: [
          home("Peito de frango", "400 g"),
          home("Cenoura", "2 unidades"),
          home("Abobrinha", "1 unidade"),
        ],
        basicos: [
          { basico: "sal", quantidade: "a gosto" },
          { basico: "azeite", quantidade: "1 colher de sopa" },
          { basico: "alho", quantidade: "2 dentes" },
        ],
        faltaComprar: [{ nome: "Alecrim", quantidade: "1 ramo" }],
        passos: [
          { texto: "Tempere o frango com alho e sal.", timerMin: 10, temperaturaC: null },
          { texto: "Corte os legumes em cubos e regue com o azeite.", timerMin: null, temperaturaC: null },
          { texto: "Asse tudo, virando na metade do tempo.", timerMin: 25, temperaturaC: 200 },
        ],
        porcao: "Sirva 1 porção e complete o prato com salada.",
      },
      {
        nome: "Omelete de forno com espinafre",
        refeicao: "Jantar",
        porcoes: 2,
        tempoMin: 20,
        compatibilidade: "Ovos e folhas, como no jantar leve da sua dieta.",
        ingredientesCasa: [
          home("Ovos", "4 unidades"),
          home("Espinafre", "1 maço"),
          home("Queijo branco", "50 g"),
        ],
        basicos: [{ basico: "sal", quantidade: null }],
        faltaComprar: [],
        passos: [
          { texto: "Bata os ovos com uma pitada de sal.", timerMin: null, temperaturaC: null },
          { texto: "Misture o espinafre picado e o queijo.", timerMin: null, temperaturaC: null },
          { texto: "Asse em forma untada.", timerMin: 15, temperaturaC: 180 },
        ],
        porcao: "Sirva metade da omelete com legumes cozidos.",
      },
    ],
    perguntas: [],
  });
}

function richState(): AppState {
  const state = stateFixture();
  const today = localDate();
  const now = new Date().toISOString();
  const food = state.foods[0] ?? {
    id: "taco-1",
    name: "Arroz, integral, cozido",
    category: "Cereais e derivados",
    caloriesPer100g: 124,
    proteinPer100g: 2.6,
    carbsPer100g: 25.8,
    fatPer100g: 1,
    source: "TACO",
  };
  const base = { userId: state.userId, createdAt: now, updatedAt: now };
  const meal = (
    date: string,
    time: string,
    title: string,
    calories: number,
    macros: [number, number, number],
    description: string,
  ): DiaryEntry => ({
    ...base,
    id: uid(),
    date,
    time,
    type: "refeicao",
    title,
    description,
    categoryTag: title,
    calories: Math.round(calories),
    macros: { protein: macros[0], carbs: macros[1], fat: macros[2] },
    items: [{ food, grams: 150 }],
  });
  const water = (date: string, time: string, ml: number): DiaryEntry => ({
    ...base,
    id: uid(),
    date,
    time,
    type: "agua",
    title: "Água",
    description: "",
    amountMl: ml,
  });
  const diary: DiaryEntry[] = [];
  for (let d = 13; d >= 1; d--) {
    const date = shiftDate(today, -d);
    const k = (d * 37) % 200;
    diary.push(meal(date, "08:00", "Café da manhã", 380 + k / 2, [20, 45, 12], "Pão integral com ovo e café."));
    diary.push(meal(date, "12:30", "Almoço", 640 + k, [45, 60, 18], "Arroz, feijão, frango e salada."));
    diary.push(meal(date, "19:30", "Jantar", 450 + (k % 90), [30, 40, 15], "Omelete com legumes."));
    diary.push(water(date, "10:00", 1000 + (k % 5) * 250));
    diary.push(water(date, "16:00", 750));
    if (d % 2 === 0)
      diary.push({
        ...base,
        id: uid(),
        date,
        time: "21:00",
        type: "bem_estar",
        title: "Bem-estar",
        description: "Dia produtivo, um pouco cansada.",
        rating: 3 + (d % 3),
        sleepHours: 6.5 + (d % 3) * 0.5,
      });
  }
  diary.push(meal(today, "08:10", "Café da manhã", 420, [22, 48, 14], "Pão integral com ovo e café."));
  diary.push(meal(today, "12:30", "Almoço", 790, [60, 47, 14], "Arroz, feijão, frango e salada."));
  diary.push(water(today, "10:00", 750));
  diary.push(water(today, "14:00", 1000));
  diary.push({
    ...base,
    id: uid(),
    date: today,
    time: "07:15",
    type: "bem_estar",
    title: "Bem-estar",
    description: "Acordei disposta.",
    rating: 4,
    sleepHours: 7.5,
  });
  state.diary = diary;
  state.measurements = Array.from({ length: 8 }, (_, i) => ({
    id: uid(),
    date: shiftDate(today, -(7 - i) * 7),
    weight: +(76.4 - i * 0.6 + (i % 2) * 0.2).toFixed(1),
    height: 165,
    waist: 88 - i * 0.7,
    hip: 102 - i * 0.4,
    bodyFat: null,
    method: "Balança em casa",
  }));
  state.habits = [
    { id: uid(), title: "Caminhada leve 20 min", timeOfDay: "07:30", createdDate: shiftDate(today, -10), completedDates: [today, shiftDate(today, -1), shiftDate(today, -2), shiftDate(today, -4)] },
    { id: uid(), title: "Almoço consciente sem telas", timeOfDay: "12:30", createdDate: shiftDate(today, -10), completedDates: [shiftDate(today, -1)] },
    { id: uid(), title: "Chá calmante e higiene do sono", timeOfDay: "21:30", createdDate: shiftDate(today, -5), completedDates: [] },
  ];
  const at = (ms: number) => new Date(Date.now() - ms).toISOString();
  state.messages = [
    // Pedido e plano de dieta de ontem: o chat mostra aviso compacto + cartão-resumo.
    { id: uid(), sender: "user", text: DIET_PLAN_REQUEST, timestamp: at(90_000_000), status: "sent" },
    { id: uid(), sender: "ai", text: DIET, timestamp: at(89_900_000), status: "sent", meta: META },
    { id: uid(), sender: "user", text: "Como foi minha semana de alimentação?", timestamp: at(900000), status: "sent" },
    { id: uid(), sender: "ai", text: WEEK_SUMMARY, timestamp: at(800000), status: "sent", meta: { ...META, specialists: ["nutricionista", "rotina"] } },
    { id: uid(), sender: "user", text: "Pode me sugerir algo prático para o jantar que não use ovos?", timestamp: at(300000), status: "sent" },
    { id: uid(), sender: "ai", text: DINNER_IDEAS, timestamp: at(200000), status: "sent", meta: META },
  ];
  state.injections = [0, 7, 14].map((ago, i) => ({
    ...base,
    method: "frasco" as const,
    id: uid(),
    date: shiftDate(today, -(ago + 2)),
    time: "08:30",
    medication: "Tirzepatida",
    concentrationMgPerMl: 5,
    syringeUnits: 100 as const,
    units: 50,
    volumeMl: 0.5,
    doseMg: 2.5,
    site: (["abdomen", "coxa", "braco"] as const)[i],
    side: null,
    notes: "",
  }));
  const pantry: [string, number, "g" | "kg" | "un" | "pacote", "geladeira" | "despensa", number][] = [
    ["Peito de frango", 400, "g", "geladeira", 3],
    ["Ovos", 12, "un", "geladeira", 12],
    ["Espinafre", 1, "pacote", "geladeira", 2],
    ["Queijo branco", 250, "g", "geladeira", 6],
    ["Arroz integral", 1, "kg", "despensa", 120],
    ["Feijão carioca", 1, "kg", "despensa", 200],
    ["Aveia em flocos", 500, "g", "despensa", 90],
    ["Iogurte natural", 4, "un", "geladeira", -1],
    ["Cenoura", 3, "un", "geladeira", 8],
    ["Abobrinha", 1, "un", "geladeira", 5],
  ];
  state.pantry = pantry.map(([name, quantity, unit, location, days]) => ({
    id: uid(),
    name,
    quantity,
    unit,
    location,
    expiresOn: shiftDate(today, days),
    notes: "",
    source: "manual" as const,
    updatedAt: now,
  }));
  if (state.profile)
    state.profile = {
      ...state.profile,
      consentAi: true,
      manualCalories: 1645,
      manualWater: 2500,
      manualProtein: 115,
      manualCarbs: 175,
      manualFat: 45,
      weightLossPen: "sim",
      weightLossPenName: "Mounjaro (tirzepatida)",
      weightLossPenDose: "2,5 mg",
      weightLossPenPerMonth: 4,
      goal: "perder",
      weight: 72,
      targetWeight: 66,
    };
  // As metas do dia vêm do histórico; ele precisa refletir o perfil de exemplo.
  state.goalHistory = state.goalHistory.map((entry) => ({ ...entry, profile: state.profile! }));
  const plan = {
    id: uid(),
    text: DIET,
    meta: META,
    createdAt: now,
    profileSignature: dietProfileSignature(state.profile!),
  };
  state.dietPlan = plan;
  state.kitchenBasics = ["sal", "azeite", "alho"];
  const recipeSet = structuredRecipes(state);
  state.recipes = [
    // Geração antiga, só em texto (antes dos básicos): aparece em "Receitas anteriores".
    {
      id: uid(),
      text: RECIPE,
      meta: META,
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      dietPlanId: plan.id,
      profileSignature: plan.profileSignature,
      pantrySignature: pantrySignature(state.pantry),
    },
    // Geração atual, estruturada (AGENTE-04): cartões, cobertura, selo e folha da receita.
    {
      id: uid(),
      text: renderRecipeSetText(recipeSet),
      meta: META,
      createdAt: now,
      dietPlanId: plan.id,
      profileSignature: plan.profileSignature,
      pantrySignature: pantrySignature(state.pantry, state.kitchenBasics),
      recipeSet,
    },
  ];
  state.appointments = [
    {
      id: uid(),
      professional: "Dra. Ana Souza (nutricionista)",
      registration: "CRN-3 12345",
      date: shiftDate(today, 5),
      time: "15:00",
      url: "https://exemplo.com/consulta",
      notes: "Levar diário da semana.",
    },
  ];
  return state;
}

async function seed(page: Page, state: AppState | null) {
  await page.goto(BASE + "/");
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("webfit-personal-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("state", "readwrite");
        if (value) tx.objectStore("state").put(value, "current");
        else tx.objectStore("state").delete("current");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, state);
  await page.reload();
  await page.waitForTimeout(1200);
}

/** Salva a página em fatias de uma altura de tela e o texto visível, para comparação. */
async function shoot(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const slices = Math.min(Math.ceil(total / H), 10);
  for (let i = 0; i < slices; i++) {
    const y = i * H;
    await page.screenshot({
      path: `${OUT}/${name}-${String(i + 1).padStart(2, "0")}.png`,
      fullPage: true,
      clip: { x: 0, y, width: W, height: Math.min(H, total - y) },
    });
  }
  const text = await page.evaluate(() => document.body.innerText.replace(/\n{3,}/g, "\n\n"));
  writeFileSync(`${OUT}/${name}.txt`, text);
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  log.push(`${name}: ${slices} fatia(s), altura ${total}px, ${words} palavras`);
}

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    log.push(`FALHOU ${name}: ${(e as Error).message.split("\n")[0]}`);
  }
}

const nav = (page: Page, name: string) =>
  page.getByRole("navigation").getByRole("button", { name, exact: true }).click();

const browser = await chromium.launch({ channel: process.env.CHANNEL || undefined });
const mobile = { viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

await step("primeiro-acesso", async () => {
  const ctx = await browser.newContext(mobile);
  const page = await ctx.newPage();
  await seed(page, null);
  await shoot(page, "00-primeiro-acesso");
  await ctx.close();
});

const ctx = await browser.newContext(mobile);
const page = await ctx.newPage();
page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
await seed(page, richState());

await step("hoje", async () => {
  await page.getByRole("heading", { name: /^Olá,/ }).waitFor({ timeout: 15000 });
  await shoot(page, "01-hoje");
});
await step("registro-rapido", async () => {
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await page.locator(".quick-sheet").waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/02-registro-rapido.png` });
  await page.getByRole("button", { name: "Peso", exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/02a-peso.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Água", exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/02b-registrar-agua.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Bem-estar", exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/02c-registrar-bem-estar.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
});
await step("diario", async () => {
  await nav(page, "Diário");
  await shoot(page, "03-diario");
});
await step("refeicao", async () => {
  await page.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Refeição", exact: true }).click();
  await page.waitForTimeout(800);
  await shoot(page, "04-adicionar-refeicao");
});
await step("agente", async () => {
  await nav(page, "Meu agente");
  await page.getByRole("heading", { name: "Meu agente" }).waitFor();
  await shoot(page, "05-agente");
});
await step("evolucao", async () => {
  await nav(page, "Evolução");
  await shoot(page, "06-evolucao");
});
await step("espaco", async () => {
  await nav(page, "Meu espaço");
  await shoot(page, "07-espaco");
});
await step("dieta", async () => {
  await nav(page, "Hoje");
  await page.getByRole("button", { name: /Ver minha dieta/ }).first().click();
  await page.waitForTimeout(600);
  await shoot(page, "08-dieta");
});
await step("despensa", async () => {
  await nav(page, "Hoje");
  await page.getByRole("button", { name: "Abrir despensa e receitas" }).first().click();
  await page.waitForTimeout(600);
  await shoot(page, "09-despensa");
});
await step("injecao", async () => {
  await nav(page, "Hoje");
  await page.getByRole("button", { name: "Calcular dose e registrar" }).click();
  await page.getByRole("heading", { name: "Seringa e dose" }).waitFor();
  await shoot(page, "10-seringa-dose");
});
await step("notificacoes", async () => {
  await nav(page, "Hoje");
  await page.getByRole("button", { name: /^Notificações/ }).click();
  await page.waitForTimeout(600);
  await shoot(page, "11-notificacoes");
});
await step("anamnese", async () => {
  await nav(page, "Meu espaço");
  await page.getByRole("button", { name: "Revisar anamnese" }).click();
  await page.waitForTimeout(800);
  for (let s = 1; s <= 8; s++) {
    await shoot(page, `12-anamnese-passo${s}`);
    const next = page.getByRole("button", { name: "Salvar e continuar" });
    if (!(await next.count())) break;
    await next.click();
    await page.waitForTimeout(700);
  }
});
await ctx.close();

await step("desktop", async () => {
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dpage = await dctx.newPage();
  await seed(dpage, richState());
  await dpage.screenshot({ path: `${OUT}/90-hoje-desktop.png`, fullPage: true });
  // Agente e dieta na janela visível: mostram a barra fixa do chat e o topo da dieta.
  await dpage.getByRole("button", { name: "Meu agente", exact: true }).first().click();
  await dpage.waitForTimeout(800);
  await dpage.screenshot({ path: `${OUT}/91-agente-desktop.png` });
  await dpage.getByRole("button", { name: "Abrir dieta", exact: true }).click();
  await dpage.waitForTimeout(600);
  await dpage.screenshot({ path: `${OUT}/92-dieta-desktop.png` });
  // Diário (balanço, grupos, água) e o registro rápido como popover da barra lateral.
  await dpage.getByRole("navigation").getByRole("button", { name: "Diário", exact: true }).click();
  await dpage.waitForTimeout(800);
  await dpage.screenshot({ path: `${OUT}/93-diario-desktop.png`, fullPage: true });
  await dpage.mouse.wheel(0, 700);
  await dpage.waitForTimeout(600);
  await dpage.screenshot({ path: `${OUT}/94-diario-faixa-desktop.png` });
  await dpage.getByRole("button", { name: "Registro rápido", exact: true }).click();
  await dpage.waitForTimeout(500);
  await dpage.screenshot({ path: `${OUT}/95-registro-rapido-desktop.png` });
  await dctx.close();
});
await browser.close();
writeFileSync(`${OUT}/_log.txt`, log.join("\n"));
console.log(log.join("\n"));
