/**
 * Senhas, tokens de sessão e códigos (convite, redefinição) só com node:crypto.
 *
 * - Senha: scrypt (N=2^14, r=8, p=1, 64 bytes) com sal aleatório; guardada como "scrypt$14$8$1$sal$hash".
 * - Token de sessão: 32 bytes aleatórios em base64url; o banco guarda só o SHA-256 (hex).
 * - Código de convite ou redefinição: 16 letras de um alfabeto sem caracteres confundíveis, em grupos de 4
 *   (cerca de 80 bits); o banco guarda o SHA-256 da forma normalizada (maiúsculas, sem traços nem espaços).
 */
import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
/** 2^15 (OWASP); hashes antigos com custo menor são refeitos no próximo login (needsRehash). */
const COST_LOG2 = 15;
/** Memória para o scrypt: 128 · N · r com folga (o padrão do Node, 32 MB, não cabe N=2^15). */
const memoryFor = (costLog2: number, blockSize: number) => 256 * 2 ** costLog2 * blockSize;
const BLOCK_SIZE = 8;
const PARALLEL = 1;
/** NIST 800-63B: no mínimo 8 caracteres e sem regras de composição; o teto evita custo exagerado. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 16;

const scrypt = (password: string, salt: Buffer, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password.normalize("NFKC"), salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );

/** Frase para a pessoa quando a senha não serve; null quando serve. */
export function passwordProblem(password: string): string | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return `Use pelo menos ${PASSWORD_MIN} caracteres.`;
  if (length > PASSWORD_MAX) return `Use no máximo ${PASSWORD_MAX} caracteres.`;
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, {
    N: 2 ** COST_LOG2,
    r: BLOCK_SIZE,
    p: PARALLEL,
    maxmem: memoryFor(COST_LOG2, BLOCK_SIZE),
  });
  return ["scrypt", COST_LOG2, BLOCK_SIZE, PARALLEL, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** Confere a senha com o hash guardado (tempo constante na comparação; hash malformado nunca confere). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, cost, block, parallel, salt, key] = stored.split("$");
  if (kind !== "scrypt" || !salt || !key) return false;
  const [n, r, p] = [cost, block, parallel].map(Number);
  if (![n, r, p].every(Number.isInteger) || n < 10 || n > 20 || r < 1 || r > 32 || p < 1 || p > 4) return false;
  const expected = Buffer.from(key, "base64url");
  if (expected.length !== KEY_LENGTH) return false;
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), {
    N: 2 ** n,
    r,
    p,
    maxmem: memoryFor(n, r),
  });
  return timingSafeEqual(actual, expected);
}

/** Hash feito com custo menor que o atual: refazer quando a senha for conferida com sucesso. */
export function needsRehash(stored: string): boolean {
  const [kind, cost, block, parallel] = stored.split("$");
  return kind !== "scrypt" || Number(cost) < COST_LOG2 || Number(block) !== BLOCK_SIZE || Number(parallel) !== PARALLEL;
}

/** Hash usado para tokens e códigos guardados no banco. */
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const newSessionToken = () => randomBytes(32).toString("base64url");

/** Código legível para mandar a alguém (ex.: "K7QF-2MZD-8HNA-XR4C"). */
export function newCode(): string {
  const chars = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
  return chars.join("").match(/.{4}/g)!.join("-");
}

/** Aceita o código digitado com minúsculas, espaços ou traços; null quando não tem o formato. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

/** E-mail como chave da conta: sem espaços nas pontas e em minúsculas; null quando não parece e-mail. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
