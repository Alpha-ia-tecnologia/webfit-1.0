/**
 * Verificação do WebFit online no navegador, com o servidor de verdade em modo online
 * (WEBFIT_PUBLIC_URL=http://localhost:3109, build de produção, banco do .env.local) e o Chrome:
 * tela de entrada, cadastro por convite, os dados do navegador indo para a conta, Ajustes da conta,
 * sair (os dados saem do navegador) e entrar de novo (os dados voltam da conta).
 *
 * Uso: npm run build && node --import tsx scripts/online-check.ts
 * Contas de teste usam o domínio reservado teste-webfit.invalid e são apagadas no fim.
 */
import { spawn } from "node:child_process";
import { config } from "dotenv";
import type pg from "pg";
import { chromium, expect as baseExpect, type Page } from "@playwright/test";
import { createInvite } from "../server/auth/repo";
import { databaseTarget, withClient } from "../server/db/client";
import { stateFixture } from "../tests/fixtures";

config({ path: ".env.local", quiet: true });
const PORT = 3109;
const URL_BASE = `http://localhost:${PORT}`;
const DOMAIN = "teste-webfit.invalid";
const EMAIL = `online-${Date.now()}@${DOMAIN}`;
const PASSWORD = "frase de teste online";
const expect = baseExpect.configure({ timeout: 20_000 });
const db = <T>(work: (client: pg.Client) => Promise<T>) => withClient(databaseTarget().url, work);

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL: ${name}\n  ${String((error as Error)?.message ?? error).split("\n").slice(0, 6).join("\n  ")}`);
  }
}

async function putState(page: Page, value: unknown) {
  await page.evaluate(async (state) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("webfit-personal-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const tx = req.result.transaction("state", "readwrite");
        tx.objectStore("state").put(state, "current");
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, value);
}

async function savedState(page: Page): Promise<{ userId: string } | undefined> {
  return page.evaluate(
    () =>
      new Promise<{ userId: string } | undefined>((resolve, reject) => {
        const req = indexedDB.open("webfit-personal-v1", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("state");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const get = req.result.transaction("state").objectStore("state").get("current");
          get.onsuccess = () => {
            req.result.close();
            resolve(get.result as { userId: string } | undefined);
          };
        };
      }),
  );
}

const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", WEBFIT_PUBLIC_URL: URL_BASE, WEBFIT_AI_DAILY_LIMIT: "30" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));
const browser = await chromium.launch({ channel: "chrome" });
try {
  // Espera o servidor responder.
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`${URL_BASE}/api/status`).then(
      (r) => r.ok,
      () => false,
    );
    if (ok) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const invite = await db((client) => createInvite(client, "teste automatizado"));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await check("o status online não entrega token e pede conta", async () => {
    const status = await (await fetch(`${URL_BASE}/api/status`)).json();
    if (status.mode !== "online" || "token" in status || status.account !== null) throw Error(JSON.stringify(status));
  });

  await check("sem conta, só a tela de entrada aparece (nenhum dado do navegador)", async () => {
    await page.goto(URL_BASE);
    await putState(page, stateFixture());
    await page.reload();
    await expect(page.getByRole("heading", { name: "Entre na sua conta" })).toBeVisible();
    await expect(page.getByText("Olá, Pessoa.")).toHaveCount(0);
  });

  await check("cadastro com convite: os registros deste navegador passam a ser da conta e sobem", async () => {
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    await page.getByLabel("Código de convite").fill(invite.toLowerCase());
    await page.getByLabel("Como quer ser chamado(a)").fill("Pessoa");
    await page.getByLabel("E-mail").fill(EMAIL);
    await page.getByLabel("Senha").fill(PASSWORD);
    await page.locator("form").getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByRole("heading", { name: "Olá, Pessoa.", exact: true })).toBeVisible();
    const account = await db((client) =>
      client.query<{ id: string }>("select id from webfit.accounts where email = $1", [EMAIL]),
    );
    const id = account.rows[0].id;
    expect((await savedState(page))?.userId).toBe(id);
    // A cópia chega à conta em alguns segundos.
    await expect
      .poll(async () => (await db((client) => client.query("select 1 from webfit.users where id = $1", [id]))).rowCount, {
        timeout: 20_000,
      })
      .toBe(1);
    const session = (await context.cookies()).find((c) => c.name === "wf_session");
    if (!session?.httpOnly || session.sameSite !== "Strict") throw Error("cookie de sessão sem HttpOnly/SameSite");
  });

  await check("Ajustes mostram a conta, o uso de IA e a cópia na conta (sem interruptor nem código)", async () => {
    await page.getByRole("navigation").getByRole("button", { name: "Meu espaço", exact: true }).click();
    await page.getByRole("button", { name: "Ajustes e dados", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sua conta", exact: true })).toBeVisible();
    await expect(page.getByText(EMAIL)).toBeVisible();
    await expect(page.getByText("0 de 30 hoje")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cópia na sua conta" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Guardar uma cópia no servidor" })).toHaveCount(0);
  });

  await check("sair: confirma, os dados saem do navegador e volta a tela de entrada", async () => {
    await page.getByRole("button", { name: "Sair da conta" }).click();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Entre na sua conta" })).toBeVisible();
    expect(await savedState(page)).toBeUndefined();
    expect((await context.cookies()).some((c) => c.name === "wf_session")).toBe(false);
  });

  await check("entrar de novo: os dados voltam da conta", async () => {
    await page.getByLabel("E-mail").fill(EMAIL);
    await page.getByLabel("Senha").fill("senha errada 1");
    await page.locator("form").getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toHaveText("E-mail ou senha não conferem.");
    await page.getByLabel("Senha").fill(PASSWORD);
    await page.locator("form").getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Olá, Pessoa.", exact: true })).toBeVisible();
  });

  await check("nenhum erro no console da página", async () => {
    if (errors.length) throw Error(errors.slice(0, 3).join(" | "));
  });
  await context.close();
} finally {
  await browser.close();
  server.kill();
  await db(async (client) => {
    await client.query("delete from webfit.users where id in (select id from webfit.accounts where email like $1)", [
      `%@${DOMAIN}`,
    ]);
    await client.query("delete from webfit.accounts where email like $1", [`%@${DOMAIN}`]);
    await client.query("delete from webfit.invites where note = $1", ["teste automatizado"]);
  });
}
if (failed) console.log(serverLog.split("\n").slice(-15).join("\n"));
console.log(`\n${passed} passaram, ${failed} falharam.`);
process.exit(failed ? 1 : 0);
