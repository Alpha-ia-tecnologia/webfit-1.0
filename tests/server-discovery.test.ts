import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DISCOVERY_DECLINED,
  discoveryDecision,
  isLoopbackUrl,
  scanConfirmCopy,
  settleDiscovery,
  shortcutUrls,
  subnetUrls,
  withDeclined,
  type DiscoveredServer,
} from "../src/lib/server-discovery";

const SCAN: DiscoveredServer = { url: "http://192.168.0.23:3000", source: "scan" };
const KNOWN: DiscoveredServer = { url: "http://192.168.0.10:3000", source: "known" };

test("discoveryDecision: conhecido entra sozinho; achado na varredura pede confirmação; recusado não volta", () => {
  const none = new Set<string>();
  assert.equal(discoveryDecision(KNOWN, none), "adopt");
  assert.equal(discoveryDecision(SCAN, none), "confirm");
  assert.equal(discoveryDecision(SCAN, new Set([SCAN.url])), "skip");
  // Recusar um endereço da varredura não afeta um servidor já conhecido.
  assert.equal(discoveryDecision(KNOWN, new Set([KNOWN.url])), "adopt");
});

test("settleDiscovery: só adota da varredura com confirmação e não pergunta de novo pelo mesmo endereço", async () => {
  const asked: string[] = [];
  const answer = (value: boolean) => async (url: string) => {
    asked.push(url);
    return value;
  };
  // Nada achado: nenhuma pergunta.
  assert.deepEqual(await settleDiscovery(null, new Set(), answer(true)), { outcome: { kind: "none" }, declined: new Set() });
  // Conhecido: adotado sem perguntar.
  const known = await settleDiscovery(KNOWN, new Set(), answer(false));
  assert.deepEqual(known.outcome, { kind: "adopted", url: KNOWN.url });
  assert.deepEqual(asked, []);
  // Varredura + recusa: não adota e guarda o endereço recusado (sem mutar o conjunto anterior).
  const before = new Set<string>();
  const declined = await settleDiscovery(SCAN, before, answer(false));
  assert.deepEqual(declined.outcome, { kind: "declined", url: SCAN.url });
  assert.deepEqual([...declined.declined], [SCAN.url]);
  assert.equal(before.size, 0);
  assert.deepEqual(asked, [SCAN.url]);
  // Mesmo endereço de novo na sessão: nenhuma nova pergunta, nada adotado.
  const again = await settleDiscovery(SCAN, declined.declined, answer(true));
  assert.deepEqual(again.outcome, { kind: "none" });
  assert.deepEqual(asked, [SCAN.url]);
  // Outro endereço da varredura ainda pode ser oferecido; confirmado, é adotado.
  const other: DiscoveredServer = { url: "http://192.168.0.40:3000", source: "scan" };
  const accepted = await settleDiscovery(other, declined.declined, answer(true));
  assert.deepEqual(accepted.outcome, { kind: "adopted", url: other.url });
  assert.deepEqual([...accepted.declined], [SCAN.url]);
  assert.deepEqual(asked, [SCAN.url, other.url]);
});

test("withDeclined devolve um conjunto novo; textos calmos com o endereço", () => {
  const first = new Set(["http://a:3000"]);
  const next = withDeclined(first, "http://b:3000");
  assert.notEqual(next, first);
  assert.deepEqual([...first], ["http://a:3000"]);
  assert.deepEqual([...next], ["http://a:3000", "http://b:3000"]);
  assert.deepEqual(scanConfirmCopy(SCAN.url), {
    title: "Usar este servidor?",
    message: "Encontramos um servidor WebFit em http://192.168.0.23:3000. Use só se for o seu computador.",
    confirmLabel: "Usar",
  });
  assert.match(DISCOVERY_DECLINED, /Testar e salvar/);
  assert.doesNotMatch(DISCOVERY_DECLINED + scanConfirmCopy(SCAN.url).message, /perigo|ataque|invasor|!/i);
});

test("shortcutUrls: conhecidos sem o atual nem loopback, e o nome do computador em .local", () => {
  assert.deepEqual(
    shortcutUrls(
      ["http://192.168.0.10:3000", "http://127.0.0.1:3000", "http://192.168.0.11:3000", "http://10.0.2.2:3000"],
      "Meu-PC",
      "3000",
      "http://192.168.0.11:3000",
    ),
    ["http://192.168.0.10:3000", "http://meu-pc.local:3000"],
  );
  assert.deepEqual(shortcutUrls([], null, "3000", "http://127.0.0.1:3000"), []);
  // Repetido não é tentado duas vezes.
  assert.deepEqual(shortcutUrls(["http://pc.local:4000"], "pc", "4000", "x"), ["http://pc.local:4000"]);
});

test("subnetUrls: a /24 do aparelho na porta, sem o próprio IP nem os recusados; IP inválido não varre", () => {
  const all = subnetUrls("192.168.0.23", "3000", new Set());
  assert.equal(all.length, 253);
  assert.equal(all[0], "http://192.168.0.1:3000");
  assert.equal(all.at(-1), "http://192.168.0.254:3000");
  assert.ok(!all.includes("http://192.168.0.23:3000"));
  const skipped = subnetUrls("192.168.0.23", "3000", new Set(["http://192.168.0.40:3000"]));
  assert.equal(skipped.length, 252);
  assert.ok(!skipped.includes("http://192.168.0.40:3000"));
  assert.deepEqual(subnetUrls("", "3000", new Set()), []);
  assert.deepEqual(subnetUrls("fe80::1", "3000", new Set()), []);
});

test("isLoopbackUrl: só o endereço padrão do build e o do emulador", () => {
  for (const url of ["http://127.0.0.1:3000", "http://localhost", "HTTP://LOCALHOST:3000", "http://10.0.2.2:3000"])
    assert.equal(isLoopbackUrl(url), true, url);
  for (const url of ["http://192.168.0.10:3000", "http://127.0.0.10:3000", "http://meu-pc.local:3000"])
    assert.equal(isLoopbackUrl(url), false, url);
});
