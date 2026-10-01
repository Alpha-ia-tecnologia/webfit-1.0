import { readFile } from "node:fs/promises";
import { test, expect, type Page, type Route } from "@playwright/test";
import { stateFixture } from "../fixtures";
import {
  EXAM_REPLY,
  EXAM_RESULT,
  EXAM_URGENT_REPLY,
} from "../structured-fixtures";
import { questionnaire } from "../../src/data/questionnaire";
import { HABIT_SUGGESTIONS } from "../../src/data/habit-suggestions";
import { domainTone, palette } from "../../src/design/tokens";
import { renderExamText, type ExamResult } from "../../src/lib/exam-result";
import { goalsFor, localDate, shiftDate, uid } from "../../src/lib/domain";
import { fmtDayMonth, fmtNumber } from "../../src/lib/format";
import type { AppState, Appointment, Exam, Profile } from "../../src/types";
import { EVOLUCAO_TITLE, SETTINGS_TAB } from "../../src/lib/copy";

/**
 * Onda 3 · Lote 2 "Meu espaço": hub do perfil de saúde com editor de uma seção (ANAMNESE-X1),
 * cartão Corpo (ESPACO-06), exames estruturados (ESPACO-05), laudos e agenda de consultas
 * (ESPACO-11), preferências em lista (ESPACO-10) e o início do primeiro acesso (ESPACO-12).
 * O /api/status e o /api/agent são simulados; nada chama a IA de verdade.
 */

const today = localDate();
const PHONE = { width: 390, height: 844 };
const PDF = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n% laudo\n%%EOF").toString("base64")}`;
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

type AgentRequest = { mode: string; text: string; file?: string };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

async function mockStatus(page: Page, ready: boolean) {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: ready
        ? {
            ready: true,
            token: "meu-espaco-e2e-token",
            providers: { deepseek: true, openai: true },
          }
        : { ready: false },
    }),
  );
}

function fulfillReply(route: Route, reply: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/x-ndjson; charset=utf-8",
    body: `${JSON.stringify({ type: "stage", stage: "contexto", attempt: 1 })}\n${JSON.stringify({ type: "result", reply })}\n`,
  });
}

/** Simula o agente com uma resposta fixa e guarda os pedidos. */
async function mockAgent(page: Page, reply: unknown) {
  const requests: AgentRequest[] = [];
  await page.route("**/api/agent", (route) => {
    requests.push(route.request().postDataJSON() as AgentRequest);
    return fulfillReply(route, reply);
  });
  return requests;
}

async function putState(page: Page, state: AppState) {
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
}

/** Grava o estado, recarrega e abre Meu espaço na aba pedida. */
async function seed(
  page: Page,
  state: AppState,
  { ready = false, tab }: { ready?: boolean; tab?: string } = {},
) {
  await mockStatus(page, ready);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Personalizar alimentação", exact: true }),
  ).toBeVisible();
  await putState(page, state);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Olá, Pessoa.", exact: true }),
  ).toBeVisible();
  await openEspaco(page, tab);
}

async function openEspaco(page: Page, tab?: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Meu espaço", exact: true })
    .click();
  if (tab) await page.getByRole("button", { name: tab, exact: true }).click();
}

async function savedState(page: Page): Promise<AppState> {
  return page.evaluate(
    () =>
      new Promise<AppState>((resolve, reject) => {
        const req = indexedDB.open("webfit-personal-v1", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("state", "readonly");
          const value = tx.objectStore("state").get("current");
          tx.oncomplete = () => {
            db.close();
            resolve(value.result as AppState);
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
}

function withProfile(change: Partial<Profile>): AppState {
  const state = stateFixture();
  return { ...state, profile: { ...state.profile!, ...change } };
}

const hub = (page: Page) =>
  page.getByRole("region", { name: "Perfil de saúde" });
const hubCard = (page: Page, title: string) =>
  hub(page).getByRole("button", { name: title, exact: true });

/** As 7 etapas ficam atrás da linha "Anamnese completa · 7 seções" do mosaico (conceito 11). */
async function openHub(page: Page) {
  const toggle = hub(page).getByRole("button", { name: "Anamnese completa · 7 seções", exact: true });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

test("hub do perfil: 7 seções, respostas da etapa e editor de uma seção com prévia da meta", async ({
  page,
}) => {
  const state = withProfile({ manualCalories: null, goal: "manter" });
  await seed(page, state);
  await openHub(page);
  const titles = questionnaire.slice(0, -1).map((s) => s.title);
  expect(titles).toHaveLength(7);
  for (const title of titles)
    await expect(
      hub(page).getByRole("button", { name: new RegExp(`^${escapeRegExp(title)}`) }),
    ).toHaveCount(1);
  const about = hubCard(page, "Vamos conhecer você");
  await expect(about).toContainText("Manter o peso");
  // Seções com dado íntimo mostram só quantas respostas há.
  await expect(hubCard(page, "Cuidados importantes")).toContainText(
    "Toque para ver os detalhes",
  );

  await about.click();
  const sheet = page.getByRole("dialog", { name: "Vamos conhecer você" });
  await expect(
    sheet.locator("dl > div").filter({ hasText: "Objetivo principal" }).locator("dd"),
  ).toHaveText("Manter meu peso");
  await expect(
    sheet.locator("dl > div").filter({ hasText: "Data de nascimento" }).locator("dd"),
  ).toHaveText("15/06/1992");
  await sheet.getByRole("button", { name: "Editar esta seção" }).click();

  await expect(
    page.getByRole("heading", { name: "Vamos conhecer você", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Editar seção", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Salvar e continuar" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Salvar alterações", exact: true }),
  ).toBeVisible();

  await page
    .locator("label")
    .filter({ has: page.locator('input[name="goalChoice"][value="perder"]') })
    .click();
  const before = goalsFor(state.profile!, today).calories!;
  const after = goalsFor({ ...state.profile!, goal: "perder" }, today).calories!;
  expect(before).not.toBe(after);
  await expect(page.locator(".anamnese-goal-preview")).toHaveText(
    `Sua meta passa de ${fmtNumber(before)} para ${fmtNumber(after)} kcal por dia.`,
  );

  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Meu espaço", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Alterações salvas: Vamos conhecer você.", { exact: true }),
  ).toBeVisible();
  await openHub(page);
  await expect(hubCard(page, "Vamos conhecer você")).toContainText("Reduzir o peso");
  const saved = await savedState(page);
  expect(saved.profile?.goal).toBe("perder");
  expect(saved.goalHistory.at(-1)?.profile.goal).toBe("perder");
  expect(saved.draft).toBeNull();
});

test("editor de seção: descartar mudanças e perfil sensível sem peso nem prévia de meta", async ({
  page,
}) => {
  await seed(page, withProfile({ manualCalories: null, eatingDisorder: "sim" }));
  await openHub(page);
  await hubCard(page, "Sono, movimento e bem-estar").click();
  await page
    .getByRole("dialog", { name: "Sono, movimento e bem-estar" })
    .getByRole("button", { name: "Editar esta seção" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sono, movimento e bem-estar", exact: true }),
  ).toBeVisible();
  await page
    .locator("label")
    .filter({ has: page.locator('input[name="sleepQualityChoice"][value="ruim"]') })
    .click();
  // O "Voltar" do cabeçalho (desktop) também pede para descartar; "Cancelar" fica no editor.
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Voltar para Meu espaço" })
    .click();
  const discard = page.getByRole("dialog", { name: "Descartar alterações?" });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(discard).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Sono, movimento e bem-estar", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Voltar para Meu espaço" })
    .click();
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Meu espaço", exact: true }),
  ).toBeVisible();
  expect((await savedState(page)).profile?.sleepQuality).toBe("boa");

  await openHub(page);
  const about = hubCard(page, "Vamos conhecer você");
  await expect(about).toContainText("Objetivo definido");
  await expect(about).not.toContainText(/peso/i);
  await expect(hub(page)).not.toContainText(/\bkg\b/);
  await about.click();
  await page
    .getByRole("dialog", { name: "Vamos conhecer você" })
    .getByRole("button", { name: "Editar esta seção" })
    .click();
  await page
    .locator("label")
    .filter({ has: page.locator('input[name="goalChoice"][value="perder"]') })
    .click();
  await expect(page.getByText(/Sua meta passa de/)).toHaveCount(0);
  await expect(page.locator(".anamnese-goal-preview")).toHaveText("");
});

test("editor de seção: a caneta não oferece registrar a última aplicação (fica em Seringa e dose)", async ({
  page,
}) => {
  await seed(
    page,
    withProfile({
      weightLossPen: "sim",
      weightLossPenName: "Tirzepatida",
      weightLossPenDose: "2,5 mg",
      weightLossPenPerMonth: 4,
      penWeekday: 4,
      pregnancy: "nao",
    }),
  );
  await openHub(page);
  await hubCard(page, "Histórico de saúde").click();
  await page
    .getByRole("dialog", { name: "Histórico de saúde" })
    .getByRole("button", { name: "Editar esta seção" })
    .click();
  await expect(page.getByRole("heading", { name: "Histórico de saúde", exact: true })).toBeVisible();
  await expect(page.getByTestId("pen-schedule")).toBeVisible();
  // O editor de seção nunca registra aplicação: sem o botão nem a promessa de registrar ao concluir.
  await expect(page.getByRole("button", { name: "Registrar a última aplicação" })).toHaveCount(0);
  await expect(page.getByText("Será registrada no diário ao concluir a anamnese.")).toHaveCount(0);
  await expect(page.getByTestId("pen-register-elsewhere")).toHaveText(
    "Para registrar uma aplicação, use Seringa e dose.",
  );
});

test("precisa de atenção: alergias como 'não sei' e medição antiga, nunca em perfil sensível", async ({
  page,
}) => {
  const change = { allergies: "nao_sei", measurementDate: shiftDate(today, -90) } as const;
  await seed(page, withProfile(change));
  const attention = hub(page).getByRole("group", { name: "Precisa de atenção" });
  await expect(attention).toContainText("Alergias estão como “não sei”.");
  await expect(attention).toContainText("Última medição há 90 dias.");
  await attention.getByRole("button", { name: "Revisar alergias" }).click();
  await expect(
    page.getByRole("heading", { name: "Sua alimentação", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Voltar para Meu espaço" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Meu espaço", exact: true }),
  ).toBeVisible();
  await hub(page)
    .getByRole("button", { name: "Registrar medidas na Evolução" })
    .click();
  await expect(
    page.getByRole("heading", { name: EVOLUCAO_TITLE, exact: true }),
  ).toBeVisible();

  await putState(page, withProfile({ ...change, eatingDisorder: "sim" }));
  await page.reload();
  await openEspaco(page);
  await expect(hub(page)).toContainText("Alergias estão como “não sei”.");
  await expect(hub(page)).not.toContainText("Última medição");
});

/** Oito pesagens semanais de 76,4 a 72,4 kg terminando hoje (como em evolucao.spec). */
function withJourney(change: Partial<Profile> = {}): AppState {
  const state = withProfile({ weight: 72.4, ...change });
  const base = stateFixture().measurements[0]!;
  return {
    ...state,
    measurements: Array.from({ length: 8 }, (_, i) => ({
      ...base,
      id: uid(),
      date: shiftDate(today, -7 * (7 - i)),
      weight: Number((76.4 - (4 / 7) * i).toFixed(1)),
    })),
  };
}

test("cartão Corpo: peso, variação neutra com linha, IMC sem categoria; menor de idade vê só o peso", async ({
  page,
}) => {
  await seed(page, withJourney());
  await expect(page.getByTestId("body-weight")).toHaveText("72,4 kg");
  // Chip neutro "−4,0 kg" (conceito 11); o "desde" segue no texto para leitor de tela.
  await expect(page.getByTestId("body-trend")).toHaveText("−4,0 kg");
  await expect(
    page
      .getByTestId("body-card")
      .getByText(`Variação de −4 kg desde ${fmtDayMonth(shiftDate(today, -49))}, em 8 pesagens.`, {
        exact: true,
      }),
  ).toBeAttached();
  await expect(page.getByTestId("body-sparkline")).toBeVisible();
  await expect(page.getByTestId("body-bmi")).toContainText("IMC 26,6");
  await expect(page.getByTestId("body-height")).toHaveText("165 cm");

  const minor = `${Number(today.slice(0, 4)) - 16}-01-01`;
  await putState(page, withJourney({ birthDate: minor }));
  await page.reload();
  await openEspaco(page);
  await expect(page.getByTestId("body-weight")).toHaveText("72,4 kg");
  await expect(page.getByTestId("body-trend")).toHaveCount(0);
  await expect(page.getByTestId("body-sparkline")).toHaveCount(0);
  await expect(page.getByTestId("body-bmi")).toHaveCount(0);
  await expect(page.getByTestId("body-card")).not.toContainText("IMC");
});

/** Exame de março já analisado (Glicose 95 mg/dL) para o histórico da Glicose. */
const MARCH_RESULT: ExamResult = {
  data: null,
  resultados: [
    {
      grupo: "Bioquímica",
      nome: "Glicose",
      valor: "95",
      unidade: "mg/dL",
      referencia: "70 a 99 mg/dL",
      marcacao: null,
    },
  ],
  ilegiveis: [],
  perguntas: [],
  observacoes: [],
};

function examState(): AppState {
  const state = withProfile({ consentAi: true });
  const august: Exam = {
    id: "exam-agosto",
    name: "Laudo de agosto",
    date: "2026-08-12",
    fileName: "laudo-agosto.pdf",
    mimeType: "application/pdf",
    data: PDF,
    notes: "",
  };
  const march: Exam = {
    id: "exam-marco",
    name: "Laudo de março",
    date: "2026-03-12",
    fileName: "laudo-marco.png",
    mimeType: "image/png",
    data: PNG,
    notes: "Coleta em jejum.",
    analysis: renderExamText(MARCH_RESULT),
    analysisStructured: MARCH_RESULT,
  };
  return { ...state, exams: [march, august] };
}

test("exame estruturado: contagens, grupos, régua neutra, histórico e perguntas salvas", async ({
  page,
}) => {
  const requests = await mockAgent(page, EXAM_REPLY);
  await seed(page, examState(), { ready: true, tab: "Exames e consultas" });
  const cards = page.locator(".exam-card");
  await expect(cards.first()).toContainText("Laudo de agosto");
  await expect(cards.nth(1)).toContainText("12/03/2026 · Imagem · Resultados transcritos");
  const card = cards.filter({ hasText: "Laudo de agosto" });
  await expect(card).toContainText("12/08/2026 · PDF");
  await card.getByRole("button", { name: "Analisar com o agente" }).click();
  await expect(card.getByRole("list", { name: "Resumo da análise" })).toBeVisible();
  expect(requests.map((r) => r.mode)).toEqual(["exam"]);
  const counters = card.getByRole("list", { name: "Resumo da análise" });
  for (const text of ["5 resultados", "1 marcado pelo laboratório", "1 trecho ilegível"])
    await expect(counters).toContainText(text);

  const toggle = card.locator(".exam-results-toggle");
  await expect(toggle).toHaveText(/Ver resultados \(5\)/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(card.getByRole("heading", { name: "Bioquímica" })).toBeVisible();

  const glicose = card.locator(".biomarker").filter({ hasText: "Glicose" });
  await expect(glicose).toContainText("Referência do laudo: 70 a 99 mg/dL");
  await expect(glicose).toContainText("Laudo: H");
  expect(
    await glicose.locator(".biomarker-dot").evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(rgb(palette.navy));
  expect(
    await glicose.locator(".biomarker-zone").evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(rgb(palette.slate300));
  await expect(
    card.locator(".biomarker").filter({ hasText: "Triglicerídeos" }).locator(".biomarker-bar"),
  ).toHaveCount(0);
  await expect(glicose.getByTestId("biomarker-history")).toBeVisible();
  await expect(
    glicose.getByText(
      "Histórico nos seus exames: 95 mg/dL em 12/03/2026; 102 mg/dL em 10/08/2026.",
      { exact: true },
    ),
  ).toBeAttached();

  // Nada no resultado usa vermelho nem classifica o valor.
  const forbidden = [
    ...Object.entries(palette)
      .filter(([name]) => name.startsWith("rose"))
      .map(([, hex]) => hex),
    domainTone.danger.fg,
    domainTone.danger.bg,
    domainTone.danger.border,
  ].map(rgb);
  const colors = await card
    .locator(".exam-results")
    .evaluate((root) =>
      [root, ...root.querySelectorAll("*")].flatMap((el) => {
        const style = getComputedStyle(el);
        return [style.color, style.backgroundColor];
      }),
    );
  expect(colors.filter((color) => forbidden.includes(color))).toEqual([]);
  await expect(card.locator(".exam-results")).not.toContainText(/\bnormal|alterad/i);

  const question = card.getByRole("checkbox", {
    name: "O valor de glicose pede repetir o exame?",
  });
  // Controlado pelo estado salvo: marca depois da gravação (por isso click, não check).
  await question.click();
  await expect(question).toBeChecked();
  await expect
    .poll(async () => (await savedState(page)).exams.find((e) => e.id === "exam-agosto")?.questionsDone)
    .toEqual([0]);
  const saved = (await savedState(page)).exams.find((e) => e.id === "exam-agosto")!;
  expect(saved.analysis).toBe(EXAM_REPLY.text);
  expect(saved.analysisStructured).toEqual(EXAM_RESULT);

  await page.reload();
  await openEspaco(page, "Exames e consultas");
  await expect(
    page
      .locator(".exam-card")
      .filter({ hasText: "Laudo de agosto" })
      .getByRole("checkbox", { name: "O valor de glicose pede repetir o exame?" }),
  ).toBeChecked();
});

test("exame com alerta urgente mostra o aviso no cartão e não salva análise", async ({
  page,
}) => {
  await mockAgent(page, EXAM_URGENT_REPLY);
  await seed(page, examState(), { ready: true, tab: "Exames e consultas" });
  const card = page.locator(".exam-card").filter({ hasText: "Laudo de agosto" });
  await card.getByRole("button", { name: "Analisar com o agente" }).click();
  await expect(card.getByRole("alert")).toContainText(EXAM_URGENT_REPLY.text);
  const saved = (await savedState(page)).exams.find((e) => e.id === "exam-agosto")!;
  expect(saved.analysis).toBeUndefined();
  expect(saved.analysisStructured).toBeUndefined();
});

test("consultas como agenda: próxima em destaque, Lembrar-me em .ics, anteriores recolhidas", async ({
  page,
}) => {
  const appointment = (
    professional: string,
    days: number,
    time: string,
  ): Appointment => ({
    id: uid(),
    professional,
    registration: "",
    date: shiftDate(today, days),
    time,
    url: "https://consulta.example.com/sala",
    notes: "",
  });
  const next = appointment("Dra. Próxima", 2, "10:00");
  const state = {
    ...stateFixture(),
    appointments: [
      appointment("Dr. Passado", -3, "09:00"),
      next,
      appointment("Dra. Depois", 10, "15:00"),
    ],
  };
  await seed(page, state, { tab: "Exames e consultas" });
  const highlight = page.locator(".next-appointment");
  await expect(highlight).toContainText("Próxima consulta");
  await expect(highlight).toContainText("Dra. Próxima");
  await expect(highlight).toContainText("Em 2 dias · 10:00");
  await expect(page.getByText("Registro profissional não informado")).toHaveCount(0);
  await expect(page.locator(".appointment-list").first()).toContainText("Dra. Depois");

  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Lembrar-me: salvar a consulta com Dra. Próxima na agenda" })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`consulta-${next.date}.ics`);
  const ics = await readFile((await file.path())!, "utf8");
  for (const line of ["BEGIN:VCALENDAR", "TRIGGER:-PT1H", "SUMMARY:Consulta com"])
    expect(ics).toContain(line);

  const past = page.locator("details.appointments-past");
  await expect(past.locator("summary")).toHaveText("Consultas anteriores (1)");
  await expect(past).toHaveJSProperty("open", false);
  await expect(page.getByText("Dr. Passado")).toBeHidden();
  await past.locator("summary").click();
  await expect(past).toHaveJSProperty("open", true);
  await expect(page.getByText("Dr. Passado")).toBeVisible();

  await page.getByRole("button", { name: "Mais ações: consulta com Dra. Próxima" }).click();
  await page.getByRole("menuitem", { name: "Remover consulta" }).click();
  await expect(page.getByText("Consulta removida.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Desfazer", exact: true })).toBeVisible();
});

test("preferências em lista: switches, horário de silêncio e lembretes de água em folhas", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await seed(page, withProfile({ consentAi: true }), {
    ready: true,
    tab: SETTINGS_TAB.ariaLabel,
  });
  await expect(
    page.getByRole("switch", { name: "Ocultar calorias nas telas e respostas", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("switch", {
      name: "Permitir envio do contexto ao DeepSeek e/ou à OpenAI ao usar IA",
      exact: true,
    }),
  ).toBeChecked();
  await expect(page.locator(".set-status")).toContainText("Pronto");

  const quiet = page.getByRole("button", { name: /^Horário de silêncio/ });
  await expect(quiet).toContainText("22:00 às 07:00");
  await quiet.click();
  const quietSheet = page.getByRole("dialog", { name: "Horário de silêncio" });
  await quietSheet
    .getByRole("group", { name: "Início do silêncio" })
    .getByRole("button", { name: "23:00", exact: true })
    .click();
  await quietSheet.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Horário de silêncio salvo.", { exact: true })).toBeVisible();
  await expect(quiet).toContainText("23:00 às 07:00");
  await expect.poll(async () => (await savedState(page)).profile?.quietStart).toBe("23:00");

  const water = page.getByRole("button", { name: /^Lembretes de água/ });
  await expect(water).toContainText("A cada 2 h");
  await water.click();
  const waterSheet = page.getByRole("dialog", { name: "Lembretes de água" });
  await waterSheet.getByRole("button", { name: "Aumentar 15 min" }).click();
  await waterSheet.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(water).toContainText("A cada 2 h 15 min");
  await expect
    .poll(async () => (await savedState(page)).profile?.hydrationInterval)
    .toBe(135);

  const heights = await page
    .locator(".set-row")
    .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThanOrEqual(8);
  for (const height of heights) expect(height).toBeGreaterThanOrEqual(52);

  await page.setViewportSize({ width: 360, height: 780 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("início do primeiro acesso: marca de 32 px, copos de água com Desfazer e dados numa folha", async ({
  page,
}) => {
  const aiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/agent")) aiRequests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await page.getByLabel("Como você se chama?").fill("Ana Silva");
  await page.getByRole("radio", { name: "Emagrecer e criar hábitos" }).check();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("radio", { name: new RegExp(HABIT_SUGGESTIONS[0].title) })
    .check();
  await page
    .getByLabel("Concordo em salvar minhas respostas e registros neste navegador.")
    .check();
  await page.getByRole("button", { name: "Começar com combinados", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Olá, Ana." })).toBeVisible();

  const check = await page.locator(".starter-check").first().boundingBox();
  expect(check?.width).toBe(32);
  expect(check?.height).toBe(32);
  const habit = page.getByRole("checkbox", { name: new RegExp(HABIT_SUGGESTIONS[0].title) });
  await habit.click();
  await expect(habit).toBeChecked();

  const total = page.getByTestId("starter-water-total");
  const cups = page.getByTestId("starter-cup");
  await expect(cups).toHaveCount(0);
  await page.getByRole("button", { name: "Registrar 250 ml" }).click();
  await expect(total).toHaveText("250 ml");
  await expect(cups).toHaveCount(1);
  await page.getByRole("button", { name: "Registrar 250 ml" }).click();
  await expect(total).toHaveText("500 ml");
  await expect(cups).toHaveCount(2);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(total).toHaveText("250 ml");
  await expect(cups).toHaveCount(1);

  await expect(
    page.getByRole("list", { name: "O que você libera" }).getByRole("listitem"),
  ).toHaveCount(4);

  await page.getByRole("button", { name: "Backup e dados", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Backup e dados" });
  await expect(sheet.getByRole("button", { name: "Exportar backup", exact: true })).toBeVisible();
  await expect(sheet.getByLabel("Arquivo de backup WebFit")).toBeAttached();
  await expect(
    sheet.getByRole("button", { name: "Excluir dados e recomeçar", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: /^Mais ações: água de / }).click();
  await page.getByRole("menuitem", { name: "Remover", exact: true }).click();
  await expect(total).toHaveText("0 ml");
  await expect(cups).toHaveCount(0);
  expect(aiRequests).toEqual([]);
});
