import { reviewAiConsent } from "./consent";
import { LABEL_PHOTO_ERRORS } from "./label-read";
import { stateSchema, type AppState } from "../types";
import { LAST_BACKUP_KEY } from "./space";
const DB = "webfit-personal-v1";
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("state");
    r.onsuccess = () => {
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = () =>
      reject(
        new Error("O navegador não permitiu abrir o armazenamento local."),
      );
  });
}
export async function loadState(): Promise<AppState | null> {
  const raw = await readRaw();
  return raw === undefined ? null : reviewAiConsent(stateSchema.parse(raw));
}
export async function readRaw(): Promise<unknown> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readonly");
    const r = tx.objectStore("state").get("current");
    tx.oncomplete = () => {
      db.close();
      resolve(r.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error("Não foi possível ler seus dados."));
    };
  });
}
export async function saveState(state: AppState) {
  const parsed = stateSchema.parse(state);
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    const store = tx.objectStore("state");
    const r = store.get("current");
    let conflict = false;
    r.onsuccess = () => {
      const old = r.result as AppState | undefined;
      if (
        old
          ? old.userId !== parsed.userId || old.revision !== parsed.revision - 1
          : parsed.revision !== 1
      ) {
        conflict = true;
        tx.abort();
      } else store.put(parsed, "current");
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        new Error(
          conflict
            ? "Os dados foram alterados em outra aba. Recarregue esta página antes de continuar."
            : "Não foi possível salvar. Verifique o espaço disponível no navegador; seus dados anteriores foram preservados.",
        ),
      );
    };
  });
}
/**
 * Troca o estado inteiro por outro de dono ou revisão diferentes (entrar na conta: adotar os dados do
 * navegador ou trazer os da conta). Só grava se o salvo ainda é `expected` (outra aba não mudou nada).
 */
export async function replaceState(next: AppState, expected: Pick<AppState, "userId" | "revision">) {
  const parsed = stateSchema.parse(next);
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    const store = tx.objectStore("state");
    const r = store.get("current");
    let conflict = false;
    r.onsuccess = () => {
      const old = r.result as AppState | undefined;
      // Sem nada salvo (primeiro acesso), vale a troca; com algo salvo, precisa ser o que a tela mostra.
      if (old && (old.userId !== expected.userId || old.revision !== expected.revision)) {
        conflict = true;
        tx.abort();
      } else store.put(parsed, "current");
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        new Error(
          conflict
            ? "Os dados foram alterados em outra aba. Recarregue esta página antes de continuar."
            : "Não foi possível salvar. Verifique o espaço disponível no navegador; seus dados anteriores foram preservados.",
        ),
      );
    };
  });
}
export async function clearState() {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error("Não foi possível excluir os dados."));
    };
  });
}
export function downloadJson(value: unknown, name: string) {
  downloadBlob(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    name,
  );
}
/** Data do último backup exportado neste navegador (conveniência local, fora dos dados salvos). */
export function readLastBackup(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}
/** Baixa o backup completo e lembra a data neste navegador para o aviso de "Último backup". */
export function exportBackup(state: AppState, name: string) {
  downloadJson(state, name);
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch {
    // Armazenamento bloqueado (janela privada): o backup foi baixado mesmo assim.
  }
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readFile(
  file: File,
  maxBytes: number,
  allowed: string[],
) {
  if (!allowed.includes(file.type))
    throw new Error(
      "Formato não aceito. Use PDF, JPG, PNG ou WebP conforme indicado.",
    );
  if (file.size > maxBytes)
    throw new Error(
      `O arquivo deve ter no máximo ${maxBytes / 1024 / 1024} MB.`,
    );
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

/** Reduz fotos de câmera antes do envio; o original não é persistido no estoque. */
export async function readPantryPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type))
    throw new Error("Use uma foto JPG, PNG ou WebP.");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Escolha uma foto de até 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const ratio = Math.min(
      1,
      1600 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(LABEL_PHOTO_ERRORS.prepare);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.8);
    if (data.length * 0.75 > 2 * 1024 * 1024)
      throw new Error("A foto ficou muito grande. Fotografe uma área menor.");
    return data;
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message.includes("foto")
        ? error.message
        : "Não foi possível abrir a imagem. Tente outra foto.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
