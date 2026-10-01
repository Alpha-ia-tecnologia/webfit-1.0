import { test, expect, type Page } from "@playwright/test";
import { stateFixture } from "../fixtures";
import { SETTINGS_TAB } from "../../src/lib/copy";
import { adoptIntoAccount, type AccountInfo } from "../../src/lib/account";
import { ADMIN_COPY, type AdminAccount, type AdminInvite } from "../../src/lib/admin";
import type { AppState } from "../../src/types";

/**
 * Painel do administrador (servidor online, só o dono): convites e contas. /api/status, /api/auth/me,
 * /api/sync* e /api/admin/* são simulados; as regras do servidor ficam nos testes de integração.
 */

const OWNER: AccountInfo = {
  id: "0b8f2c1e-5d7a-4c3b-9e21-7f6a5d4c3b2a",
  email: "dona@exemplo.com",
  name: "Dona",
  role: "owner",
};
const MEMBER: AccountInfo = {
  id: "6a1d9e0f-3b2c-4d5e-8f70-1a2b3c4d5e6f",
  email: "bruno@exemplo.com",
  name: "Bruno",
  role: "member",
};
const CODE = "ABCD-EFGH-JKLM-NPQR";
const RESET = "RSET-WXYZ-2345-6789";
const PENDING_HASH = "b".repeat(64);
const EXPIRES = "2026-10-15T12:00:00.000Z";

const invite = (over: Partial<AdminInvite>): AdminInvite => ({
  id: "a".repeat(64),
  note: "",
  createdAt: "2026-10-01T12:00:00.000Z",
  expiresAt: EXPIRES,
  usedAt: null,
  usedBy: null,
  status: "pending",
  ...over,
});
const row = (account: AccountInfo, aiToday: number): AdminAccount => ({
  ...account,
  disabled: false,
  createdAt: "2026-09-30T12:00:00.000Z",
  aiToday,
});

type AdminCall = { method: string; path: string; body: unknown };

/** Servidor online com a conta da sessão e a cópia da conta já em dia. */
async function mockOnline(page: Page, account: AccountInfo, revision: number) {
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { mode: "online", ready: false, sync: true, account } }),
  );
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { account, ai: { used: 2, limit: null } } }));
  await page.route(/\/api\/sync(\/|\?|$)/, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/sync/status") return route.fulfill({ json: { configured: true, revision } });
    return route.fulfill({ json: { revision } });
  });
}

/** Simula /api/admin/* e guarda cada pedido. */
async function mockAdmin(page: Page) {
  const calls: AdminCall[] = [];
  await page.route("**/api/admin/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const raw = request.postData();
    calls.push({ method: request.method(), path, body: raw ? JSON.parse(raw) : null });
    if (path === "/api/admin/invites" && request.method() === "GET")
      return route.fulfill({
        json: {
          invites: [
            invite({ id: PENDING_HASH, note: "Ana" }),
            invite({ note: "Carla", status: "used", usedBy: "carla@exemplo.com", usedAt: "2026-10-02T12:00:00.000Z" }),
          ],
        },
      });
    if (path === "/api/admin/invites")
      return route.fulfill({ json: { code: CODE, invite: invite({ id: "c".repeat(64), note: "Bruno" }) } });
    if (path.startsWith("/api/admin/invites/")) return route.fulfill({ json: { ok: true } });
    if (path === "/api/admin/accounts") return route.fulfill({ json: { accounts: [row(OWNER, 5), row(MEMBER, 3)] } });
    if (path.endsWith("/reset")) return route.fulfill({ json: { code: RESET, expiresAt: EXPIRES } });
    return route.fulfill({ json: { ok: true } });
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

/** Grava o estado já da conta, recarrega e abre Meu espaço › Ajustes. */
async function openSettings(page: Page, account: AccountInfo) {
  const state = adoptIntoAccount(stateFixture(), account.id);
  await mockOnline(page, account, state.revision);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Personalizar alimentação", exact: true })).toBeVisible();
  await putState(page, state);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Olá, Pessoa.", exact: true })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Meu espaço", exact: true }).click();
  await page.getByRole("button", { name: SETTINGS_TAB.ariaLabel, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sua conta", exact: true })).toBeVisible();
}

test("dono: gera convite com código e mensagem, revoga um pendente e gera código de senha", async ({ page }) => {
  const calls = await mockAdmin(page);
  await openSettings(page, OWNER);
  await page.getByRole("button", { name: ADMIN_COPY.open, exact: true }).click();
  const panel = page.getByRole("dialog", { name: ADMIN_COPY.title });
  await expect(panel.getByRole("button", { name: ADMIN_COPY.invites })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByText("Usado por carla@exemplo.com")).toBeVisible();
  await expect(panel.getByText("Pendente")).toBeVisible();
  // Convite usado não tem "Revogar".
  await expect(panel.getByRole("button", { name: /^Revogar convite/ })).toHaveCount(1);

  await panel.getByRole("textbox", { name: ADMIN_COPY.note }).fill("Bruno");
  await expect(panel.getByRole("spinbutton", { name: ADMIN_COPY.days })).toHaveValue("14");
  await panel.getByRole("button", { name: ADMIN_COPY.generate }).click();
  const box = panel.locator(".admin-code");
  await expect(box.locator("code")).toHaveText(CODE);
  await expect(box).toContainText(
    `Seu convite para o WebFit: ${CODE}. Acesse http://127.0.0.1:3107, toque em Criar conta e use este código. Ele vale até 15/10/2026, para uma conta.`,
  );
  await expect(box.getByRole("button", { name: ADMIN_COPY.copyCode })).toBeVisible();
  await expect(box.getByRole("button", { name: ADMIN_COPY.copyMessage })).toBeVisible();
  expect(calls.find((call) => call.method === "POST")?.body).toEqual({ note: "Bruno", days: 14 });

  await panel.getByRole("button", { name: "Revogar convite Ana" }).click();
  const ask = page.getByRole("dialog", { name: ADMIN_COPY.revokeTitle });
  await ask.getByRole("button", { name: ADMIN_COPY.revoke, exact: true }).click();
  await expect(page.getByText(ADMIN_COPY.revoked)).toBeVisible();
  expect(calls.some((call) => call.method === "DELETE" && call.path === `/api/admin/invites/${PENDING_HASH}`)).toBe(true);
  await expect(panel.getByRole("button", { name: "Revogar convite Ana" })).toHaveCount(0);

  await panel.getByRole("button", { name: ADMIN_COPY.accounts }).click();
  await expect(panel.getByRole("button", { name: ADMIN_COPY.accounts })).toHaveAttribute("aria-pressed", "true");
  const owner = panel.locator(".admin-item", { hasText: OWNER.email });
  const member = panel.locator(".admin-item", { hasText: MEMBER.email });
  await expect(owner.getByText(ADMIN_COPY.owner, { exact: true })).toBeVisible();
  await expect(member.getByText("IA hoje: 3", { exact: false })).toBeVisible();
  // A própria conta não pode ser bloqueada nem rebaixada.
  await expect(owner.getByRole("button", { name: ADMIN_COPY.block })).toHaveCount(0);
  await expect(owner.getByRole("button", { name: ADMIN_COPY.makeMember })).toHaveCount(0);
  await expect(member.getByRole("button", { name: ADMIN_COPY.makeOwner })).toBeVisible();

  // O código troca a senha de quem o tiver: só sai depois de confirmar.
  await member.getByRole("button", { name: ADMIN_COPY.resetCode }).click();
  await page.getByRole("button", { name: "Gerar código", exact: true }).click();
  await expect(member.locator(".admin-code code")).toHaveText(RESET);
  await expect(member.getByText(ADMIN_COPY.resetHint)).toBeVisible();
  expect(calls.some((call) => call.method === "POST" && call.path === `/api/admin/accounts/${MEMBER.id}/reset`)).toBe(
    true,
  );

  // Com um código à mostra, fechar pede confirmação ("Voltar" mantém o painel e o código).
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(member.locator(".admin-code code")).toHaveText(RESET);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fechar mesmo assim", exact: true }).click();
  await expect(panel).toHaveCount(0);
});

test("dono no celular (390 px): o painel cabe sem rolagem lateral", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAdmin(page);
  await openSettings(page, OWNER);
  await page.getByRole("button", { name: ADMIN_COPY.open, exact: true }).click();
  const panel = page.getByRole("dialog", { name: ADMIN_COPY.title });
  await panel.getByRole("button", { name: ADMIN_COPY.generate }).click();
  await expect(panel.locator(".admin-code code")).toHaveText(CODE);
  const fits = async () =>
    panel.evaluate((element) => element.scrollWidth <= element.clientWidth && document.documentElement.scrollWidth <= 390);
  expect(await fits()).toBe(true);
  await panel.getByRole("button", { name: ADMIN_COPY.accounts }).click();
  await expect(panel.locator(".admin-item", { hasText: MEMBER.email })).toBeVisible();
  expect(await fits()).toBe(true);
});

test("conta comum não vê o botão de administração", async ({ page }) => {
  const calls = await mockAdmin(page);
  await openSettings(page, MEMBER);
  await expect(page.getByRole("button", { name: "Trocar senha", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: ADMIN_COPY.open, exact: true })).toHaveCount(0);
  expect(calls).toEqual([]);
});
