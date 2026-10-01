import { test, expect, type Page, type Request } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { SETTINGS_TAB } from "../../src/lib/copy";
import { SERVER_SYNC_COPY } from "../../src/lib/server-sync";
import type { AppState } from "../../src/types";

/**
 * Cópia no servidor (PostgreSQL) em Meu espaço › Ajustes: ligar, enviar, conflito, restaurar do servidor e
 * excluir tudo junto com a cópia. /api/status e /api/sync* são simulados (o banco real é coberto por
 * tests/state-sync.integration.ts).
 */

const TOKEN = "copia-e2e-token";
const SWITCH = "Guardar uma cópia no servidor";
const SYNC_ROUTE = /\/api\/sync(\/|\?|$)/;
type SyncCall = { method: string; path: string; search: string; token: string | null; body: AppState | null };
type SyncServer = {
  /** Revisão guardada no servidor (null: sem cópia). */
  revision?: number | null;
  /** Estado devolvido por GET /api/sync/state. */
  copy?: AppState | null;
  deleteStatus?: number;
};

async function mockStatus(page: Page, { sync = true }: { sync?: boolean } = {}) {
  await page.route("**/api/status", (route) => route.fulfill({ json: { ready: false, token: TOKEN, sync } }));
}

/** Simula /api/sync e guarda cada pedido (método, caminho, token e corpo). */
async function mockSync(page: Page, server: SyncServer = {}) {
  const calls: SyncCall[] = [];
  let revision = server.revision ?? null;
  await page.route(SYNC_ROUTE, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const raw = request.postData();
    const body = raw ? (JSON.parse(raw) as AppState) : null;
    calls.push({
      method: request.method(),
      path: url.pathname,
      search: url.search,
      token: request.headers()["x-webfit-token"] ?? null,
      body,
    });
    if (url.pathname === "/api/sync/status") return route.fulfill({ json: { configured: true, revision } });
    if (url.pathname === "/api/sync/state")
      return server.copy
        ? route.fulfill({ json: { state: server.copy } })
        : route.fulfill({ status: 404, json: { error: "sem cópia" } });
    if (request.method() === "DELETE") return route.fulfill({ status: server.deleteStatus ?? 200, json: { deleted: true } });
    const force = url.searchParams.get("force") === "1";
    if (body && (force || revision === null || body.revision > revision)) {
      revision = body.revision;
      return route.fulfill({ json: { revision } });
    }
    return route.fulfill({ status: 409, json: { error: "conflito", serverRevision: revision } });
  });
  return calls;
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

async function savedState(page: Page): Promise<AppState> {
  return page.evaluate(
    () =>
      new Promise<AppState>((resolve, reject) => {
        const req = indexedDB.open("webfit-personal-v1", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const get = req.result.transaction("state").objectStore("state").get("current");
          get.onsuccess = () => {
            req.result.close();
            resolve(get.result as AppState);
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );
}

/** Grava o estado, recarrega e abre Meu espaço › Ajustes. */
async function openSettings(page: Page, state: AppState) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Personalizar alimentação", exact: true })).toBeVisible();
  await putState(page, state);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa.", exact: true })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Meu espaço", exact: true }).click();
  await page.getByRole("button", { name: SETTINGS_TAB.ariaLabel, exact: true }).click();
  await expect(page.getByRole("heading", { name: SERVER_SYNC_COPY.title, exact: true })).toBeVisible();
}

const syncCard = (page: Page) => page.locator(".sync-card");
const isPut = (request: Request) => request.url().includes("/api/sync") && request.method() === "PUT";

test("desligada por padrão; ao ligar, envia o estado com o token e mostra o código de restauração", async ({ page }) => {
  const state = stateFixture();
  await mockStatus(page);
  const calls = await mockSync(page);
  await openSettings(page, state);
  const toggle = page.getByRole("switch", { name: SWITCH });
  await expect(toggle).not.toBeChecked();
  await expect(syncCard(page).getByRole("status")).toHaveText("Desligada");
  await expect(page.getByText("Tudo fica neste navegador: sem conta, sem nuvem.")).toBeVisible();
  expect(calls).toEqual([]);

  const put = page.waitForRequest(isPut, { timeout: 15_000 });
  await toggle.check();
  await put;
  await expect(syncCard(page).getByRole("status")).toHaveText(/^Atualizada às \d{2}:\d{2}$/);
  const sent = calls.find((call) => call.method === "PUT")!;
  expect(sent.token).toBe(TOKEN);
  expect(sent.body?.userId).toBe(state.userId);
  expect(sent.body?.serverSync).toBe(true);
  await expect(syncCard(page).locator("code")).toHaveText(state.userId);
  await expect(page.getByText(/numa cópia no banco de dados do servidor/)).toBeVisible();
  await expect(page.getByText(/Remove tudo deste navegador e a cópia no servidor\./)).toBeVisible();
  expect((await savedState(page)).serverSync).toBe(true);
});

test("servidor sem banco: o interruptor fica indisponível e nada é enviado", async ({ page }) => {
  await mockStatus(page, { sync: false });
  const calls = await mockSync(page);
  await openSettings(page, stateFixture());
  await expect(page.getByRole("switch", { name: SWITCH })).toBeDisabled();
  await expect(syncCard(page).getByText(SERVER_SYNC_COPY.unavailable)).toBeVisible();
  await expect(syncCard(page).getByRole("button", { name: SERVER_SYNC_COPY.restore })).toHaveCount(0);
  expect(calls).toEqual([]);
});

test("conflito: servidor mais novo não é sobrescrito; restaurar dele traz a cópia e a reenvia por cima", async ({
  page,
}) => {
  const local = { ...stateFixture(), serverSync: true, revision: 3 };
  const remote: AppState = {
    ...local,
    revision: 9,
    profile: local.profile ? { ...local.profile, name: "Pessoa Remota", consentAi: true } : null,
  };
  await mockStatus(page);
  const calls = await mockSync(page, { revision: 9, copy: remote });
  await openSettings(page, local);
  await expect(syncCard(page).getByRole("status")).toHaveText("Servidor mais novo");
  await expect(syncCard(page).getByRole("alert")).toContainText(SERVER_SYNC_COPY.conflict);
  expect(calls.filter((call) => call.method === "PUT")).toEqual([]);

  await syncCard(page).getByRole("alert").getByRole("button", { name: SERVER_SYNC_COPY.restore }).click();
  const dialog = page.getByRole("dialog", { name: SERVER_SYNC_COPY.restore });
  await expect(dialog.getByRole("textbox", { name: SERVER_SYNC_COPY.codeLabel })).toHaveValue(local.userId);
  const forced = page.waitForRequest((request) => isPut(request) && request.url().includes("force=1"));
  await dialog.getByRole("button", { name: "Substituir dados e restaurar" }).click();
  await expect(page.getByText(SERVER_SYNC_COPY.restored)).toBeVisible();
  await forced;
  const saved = await savedState(page);
  expect(saved.profile?.name).toBe("Pessoa Remota");
  // Como no backup em arquivo: a IA volta desligada e o aparelho mantém o próprio código.
  expect(saved.profile?.consentAi).toBe(false);
  expect(saved.userId).toBe(local.userId);
});

test("código inválido ou sem cópia: avisa e não muda nada", async ({ page }) => {
  const state = stateFixture();
  await mockStatus(page);
  await mockSync(page, { copy: null });
  await openSettings(page, state);
  await syncCard(page).getByRole("button", { name: SERVER_SYNC_COPY.restore }).click();
  const dialog = page.getByRole("dialog", { name: SERVER_SYNC_COPY.restore });
  const code = dialog.getByRole("textbox", { name: SERVER_SYNC_COPY.codeLabel });
  await code.fill("1234");
  await dialog.getByRole("button", { name: "Substituir dados e restaurar" }).click();
  await expect(page.getByText(SERVER_SYNC_COPY.invalidCode)).toBeVisible();
  await code.fill(crypto.randomUUID());
  await dialog.getByRole("button", { name: "Substituir dados e restaurar" }).click();
  await expect(page.getByText(SERVER_SYNC_COPY.notFound)).toBeVisible();
  expect((await savedState(page)).revision).toBe(state.revision);
});

test("excluir tudo apaga antes a cópia no servidor; se ela não sai, nada é excluído", async ({ page }) => {
  const state = { ...stateFixture(), serverSync: true };
  await mockStatus(page);
  const failing = await mockSync(page, { revision: state.revision, deleteStatus: 503 });
  await openSettings(page, state);
  await page.getByRole("button", { name: "Excluir todos os meus dados" }).click();
  const dialog = page.getByRole("dialog", { name: "Excluir todos os dados locais" });
  await expect(dialog).toContainText("e também a cópia no servidor");
  await dialog.getByRole("textbox").fill("EXCLUIR");
  await dialog.getByRole("button", { name: "Excluir e recomeçar" }).click();
  await expect(page.getByText(SERVER_SYNC_COPY.deleteFailed)).toBeVisible();
  expect(failing.some((call) => call.method === "DELETE" && call.search === `?userId=${state.userId}`)).toBe(true);
  expect((await savedState(page)).profile).not.toBeNull();

  await page.unroute(SYNC_ROUTE);
  const calls = await mockSync(page, { revision: state.revision });
  await dialog.getByRole("button", { name: "Excluir e recomeçar" }).click();
  await expect(page.getByText("Dados locais excluídos.")).toBeVisible();
  expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(1);
});
