import { randomUUID } from "expo-crypto";

/**
 * O código compartilhado usa crypto.randomUUID (disponível nos navegadores).
 * No Hermes o objeto crypto não existe, então ele é preenchido com o expo-crypto.
 */
const target = globalThis as unknown as {
  crypto?: { randomUUID?: () => string };
};
if (!target.crypto) target.crypto = {};
if (typeof target.crypto.randomUUID !== "function")
  target.crypto.randomUUID = randomUUID;
