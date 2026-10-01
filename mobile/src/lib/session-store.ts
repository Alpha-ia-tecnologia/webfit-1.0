/**
 * Onde a sessão da conta (token + conta, em JSON) fica no aparelho.
 *
 * - Android/iOS: expo-secure-store (Keystore/Keychain). O valor fica criptografado com uma chave presa ao
 *   aparelho. O backup do Android continua levando os dados do app (app.json: configureAndroidBackup
 *   false, para não tirar os registros de saúde do backup); se o arquivo cifrado da sessão vier junto num
 *   celular restaurado, ele não abre lá (a chave não vai no backup): a leitura falha, a sessão é apagada e
 *   a pessoa entra de novo.
 * - Export web (só para as verificações): o SecureStore não existe no navegador; o kv-store do expo-sqlite.
 *
 * Instalações anteriores guardavam a sessão no kv-store: na primeira leitura ela passa para o
 * SecureStore e sai do kv-store.
 */
import * as SecureStore from "expo-secure-store";
import Storage from "expo-sqlite/kv-store";
import { Platform } from "react-native";

/** Mesmo nome nas duas gravações (SecureStore aceita letras, números, ".", "-" e "_"). */
export const SESSION_KEY = "webfit-session-v1";
const SECURE = Platform.OS !== "web";
/** Só depois de desbloquear o aparelho uma vez; nunca sincronizado com outro aparelho (iCloud). */
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** Lê do cofre; valor que não abre mais (celular restaurado, chave trocada) é apagado e vale como "sem sessão". */
async function readSecure(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SESSION_KEY, SECURE_OPTIONS);
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY, SECURE_OPTIONS).catch(() => undefined);
    return null;
  }
}

/** Texto guardado da sessão, ou null. Migra a sessão antiga do kv-store para o SecureStore. */
export async function readSession(): Promise<string | null> {
  if (!SECURE) return Storage.getItemAsync(SESSION_KEY);
  const secure = await readSecure();
  if (secure !== null) return secure;
  const legacy = await Storage.getItemAsync(SESSION_KEY);
  if (legacy === null) return null;
  await SecureStore.setItemAsync(SESSION_KEY, legacy, SECURE_OPTIONS);
  await Storage.removeItemAsync(SESSION_KEY);
  return legacy;
}

export async function writeSession(value: string): Promise<void> {
  if (SECURE) await SecureStore.setItemAsync(SESSION_KEY, value, SECURE_OPTIONS);
  else await Storage.setItemAsync(SESSION_KEY, value);
}

/** Apaga dos dois lugares (inclui uma sessão antiga ainda no kv-store). */
export async function clearSession(): Promise<void> {
  if (SECURE) await SecureStore.deleteItemAsync(SESSION_KEY, SECURE_OPTIONS);
  await Storage.removeItemAsync(SESSION_KEY);
}
