import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  needsRehash,
  newCode,
  normalizeCode,
  normalizeEmail,
  passwordProblem,
  sha256,
  verifyPassword,
} from "../server/auth/secrets";
import { onlineConfig } from "../server/online";

test("a senha confere só com o texto certo e o hash não guarda a senha", async () => {
  const stored = await hashPassword("correta horse battery");
  assert.match(stored, /^scrypt\$15\$8\$1\$[\w-]+\$[\w-]+$/);
  assert.equal(needsRehash(stored), false);
  // Hash antigo (custo 2^14) ainda confere, mas pede para ser refeito.
  assert.equal(needsRehash("scrypt$14$8$1$c2Fs$aGFzaA"), true);
  assert.ok(!stored.includes("correta"));
  assert.equal(await verifyPassword("correta horse battery", stored), true);
  assert.equal(await verifyPassword("correta horse batterY", stored), false);
  // Duas gravações da mesma senha têm sal diferente.
  assert.notEqual(await hashPassword("correta horse battery"), stored);
});

test("hash malformado ou com custo absurdo nunca confere (nem trava o servidor)", async () => {
  for (const stored of ["", "bcrypt$x", "scrypt$14$8$1$$", "scrypt$40$8$1$c2Fs$aGFzaA", "scrypt$14$8$1$c2Fs$curto"])
    assert.equal(await verifyPassword("qualquer", stored), false, stored);
});

test("regras de senha: mínimo de 8 e máximo de 200 caracteres, sem regras de composição", () => {
  assert.equal(passwordProblem("1234567"), "Use pelo menos 8 caracteres.");
  assert.equal(passwordProblem("12345678"), null);
  assert.equal(passwordProblem("só letras e espaços"), null);
  assert.match(passwordProblem("x".repeat(201))!, /no máximo 200/);
});

test("códigos legíveis: 4 grupos de 4, sem letras confundíveis, aceitos de qualquer jeito digitado", () => {
  const code = newCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  assert.equal(normalizeCode(code.toLowerCase().replaceAll("-", " ")), code.replaceAll("-", ""));
  assert.equal(normalizeCode("ABCD-EFGH-JKLM-NPQ0"), null); // 0 e O ficam de fora
  assert.equal(normalizeCode("curto"), null);
  assert.notEqual(newCode(), code);
  assert.match(sha256("x"), /^[0-9a-f]{64}$/);
});

test("e-mail vira minúsculas sem espaços nas pontas; o resto é recusado", () => {
  assert.equal(normalizeEmail("  Maria.Silva@Exemplo.com.BR "), "maria.silva@exemplo.com.br");
  for (const bad of ["", "maria", "maria@", "@exemplo.com", "maria silva@exemplo.com", `${"a".repeat(250)}@x.com`])
    assert.equal(normalizeEmail(bad), null, bad);
});

test("modo online liga só com WEBFIT_PUBLIC_URL em https e banco configurado", () => {
  const db = { DATABASE_URL: "postgres://banco-de-teste/nutri" };
  assert.equal(onlineConfig({ ...db }), null);
  assert.deepEqual(onlineConfig({ ...db, WEBFIT_PUBLIC_URL: "https://webfit.exemplo.com.br/" }), {
    publicOrigin: "https://webfit.exemplo.com.br",
    publicHost: "webfit.exemplo.com.br",
    aiDailyLimit: 30,
  });
  assert.equal(onlineConfig({ ...db, WEBFIT_PUBLIC_URL: "http://localhost:3000", WEBFIT_AI_DAILY_LIMIT: "5" })?.aiDailyLimit, 5);
  assert.throws(() => onlineConfig({ ...db, WEBFIT_PUBLIC_URL: "http://webfit.exemplo.com.br" }), /https/);
  assert.throws(() => onlineConfig({ WEBFIT_PUBLIC_URL: "https://webfit.exemplo.com.br" }), /DATABASE_URL/);
  assert.throws(() => onlineConfig({ ...db, WEBFIT_PUBLIC_URL: "nada" }), /inválida/);
  assert.throws(() => onlineConfig({ ...db, WEBFIT_PUBLIC_URL: "https://x.com", WEBFIT_AI_DAILY_LIMIT: "-1" }), /inteiro/);
});
