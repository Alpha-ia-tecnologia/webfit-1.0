import { reviewAiConsent } from "@shared/lib/consent";
import { MAX_BACKUP_BYTES, parseBackup } from "@shared/lib/backup";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import Storage from "expo-sqlite/kv-store";
import { Platform } from "react-native";
import { stateSchema, type AppState } from "@shared/types";

const KEY = "webfit-personal-v1";

/** Estado completo do aplicativo, validado pelo mesmo esquema do app web. */
export async function loadState(): Promise<AppState | null> {
  const raw = await readRaw();
  return raw === null ? null : reviewAiConsent(stateSchema.parse(raw));
}

export async function readRaw(): Promise<unknown> {
  const text = await Storage.getItemAsync(KEY);
  return text === null ? null : JSON.parse(text);
}

/** Grava com verificação de revisão: uma gravação concorrente é recusada em vez de sobrescrita. */
export async function saveState(state: AppState) {
  const parsed = stateSchema.parse(state);
  const previous = await Storage.getItemAsync(KEY);
  const old = previous === null ? null : (JSON.parse(previous) as AppState);
  const conflict = old
    ? old.userId !== parsed.userId || old.revision !== parsed.revision - 1
    : parsed.revision !== 1;
  if (conflict)
    throw new Error(
      "Os dados foram alterados por outra gravação. Feche e abra o aplicativo antes de continuar.",
    );
  await Storage.setItemAsync(KEY, JSON.stringify(parsed));
}

/**
 * Troca o estado inteiro por outro de dono ou revisão diferentes (entrar na conta: adotar os dados do
 * aparelho ou trazer os da conta). Só grava se o salvo ainda é `expected` (nada mudou no meio).
 */
export async function replaceState(next: AppState, expected: Pick<AppState, "userId" | "revision">) {
  const parsed = stateSchema.parse(next);
  const previous = await Storage.getItemAsync(KEY);
  const old = previous === null ? null : (JSON.parse(previous) as AppState);
  if (old && (old.userId !== expected.userId || old.revision !== expected.revision))
    throw new Error("Os dados foram alterados por outra gravação. Feche e abra o aplicativo antes de continuar.");
  await Storage.setItemAsync(KEY, JSON.stringify(parsed));
}

export async function clearState() {
  await Storage.removeItemAsync(KEY);
}

/**
 * Gera um arquivo JSON e abre a folha de compartilhamento (no web, faz o download).
 * Devolve false quando não há como entregar o arquivo (sem documento ou sem compartilhamento).
 */
export async function exportJson(value: unknown, name: string): Promise<boolean> {
  const content = JSON.stringify(value, null, 2);
  if (Platform.OS === "web") {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return false;
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = doc.createElement("a");
    link.href = url;
    link.download = name;
    doc.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/json",
    dialogTitle: name,
    UTI: "public.json",
  });
  return true;
}

/** Salva uma data URL (laudo) como arquivo e compartilha. */
export async function shareDataUrl(
  dataUrl: string,
  name: string,
  mimeType: string,
) {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  if (Platform.OS === "web") {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return;
    const link = doc.createElement("a");
    link.href = dataUrl;
    link.download = name;
    doc.body.append(link);
    link.click();
    link.remove();
    return;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: "base64" });
  if (await Sharing.isAvailableAsync())
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

/** Nome do arquivo do "Relatório para consulta" (reportFileName: relatorio-webfit-AAAA-MM-DD.html). */
const REPORT_FILE = /^relatorio-webfit-.*\.html$/;

/**
 * Apaga do cache do app os relatórios de consulta compartilhados antes (nome, idade, medicamentos e
 * exames em texto puro). Roda ao abrir o relatório de novo, nunca logo depois de compartilhar: o app
 * que recebeu o arquivo pode lê-lo mais tarde. No export web não há arquivo (é um download).
 * Qualquer falha é ignorada de propósito: o sistema limpa o cache do app mais tarde.
 */
export function clearReportFiles(): void {
  if (Platform.OS === "web") return;
  try {
    for (const entry of Paths.cache.list())
      if (entry instanceof File && REPORT_FILE.test(entry.name)) entry.delete();
  } catch {
    // Cache inacessível: nada a apagar agora.
  }
}

/** Seleciona JSON local e valida antes de solicitar confirmação de substituição. */
export async function pickBackup(): Promise<AppState | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "application/octet-stream"],
    multiple: false,
    copyToCacheDirectory: true,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset.name.toLowerCase().endsWith(".json"))
    throw new Error("Escolha um arquivo de backup .json do WebFit.");
  const file = Platform.OS === "web" ? asset.file : new File(asset.uri);
  if (!file) throw new Error("Não foi possível abrir o arquivo selecionado.");
  if ((asset.size ?? file.size ?? 0) > MAX_BACKUP_BYTES)
    throw new Error("Escolha um backup de até 256 MB.");
  return parseBackup(await file.text());
}

export type PickedFile = { dataUrl: string; name: string; mimeType: string };

const tooBig = (size: number | undefined, maxBytes: number) =>
  size !== undefined && size > maxBytes;

/** Escolhe um documento (PDF ou imagem) e devolve como data URL, respeitando tipo e tamanho. */
export async function pickDocument(
  maxBytes: number,
  allowed: string[],
): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: allowed,
    copyToCacheDirectory: true,
    multiple: false,
    base64: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? "";
  if (!allowed.includes(mimeType))
    throw new Error(
      "Formato não aceito. Use PDF, JPG, PNG ou WebP conforme indicado.",
    );
  if (tooBig(asset.size, maxBytes))
    throw new Error(
      `O arquivo deve ter no máximo ${maxBytes / 1024 / 1024} MB.`,
    );
  const encoded = asset.base64 ?? (await new File(asset.uri).base64());
  // No web, o seletor retorna a data URL completa; no Android, apenas base64.
  const base64 = encoded.startsWith("data:")
    ? encoded.slice(encoded.indexOf(",") + 1)
    : encoded;
  const bytes =
    (base64.length * 3) / 4 -
    (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (bytes > maxBytes)
    throw new Error(
      `O arquivo deve ter no máximo ${maxBytes / 1024 / 1024} MB.`,
    );
  return {
    dataUrl: `data:${mimeType};base64,${base64}`,
    name: asset.name,
    mimeType,
  };
}

/** Limite da foto anexada a uma refeição (tela de refeição e "Foto do prato" do registro rápido). */
export const MEAL_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** Foto da câmera ou da galeria como data URL JPEG. */
export async function pickPhoto(
  source: "camera" | "library",
  maxBytes: number,
): Promise<PickedFile | null> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      source === "camera"
        ? "Permita o uso da câmera para fotografar."
        : "Permita o acesso às fotos para escolher uma imagem.",
    );
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.7,
    base64: true,
    allowsEditing: false,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  const shrunk = await shrinkPhoto(asset.uri, asset.width, asset.height);
  const mimeType = shrunk
    ? "image/jpeg"
    : asset.mimeType && /^image\/(jpeg|png|webp)$/.test(asset.mimeType)
      ? asset.mimeType
      : "image/jpeg";
  const base64 = shrunk ?? asset.base64 ?? (await new File(asset.uri).base64());
  const bytes = Math.ceil((base64.length * 3) / 4);
  if (bytes > maxBytes)
    throw new Error(
      `A foto deve ter no máximo ${maxBytes / 1024 / 1024} MB, mesmo depois de reduzida.`,
    );
  return {
    dataUrl: `data:${mimeType};base64,${base64}`,
    name: asset.fileName ?? `foto-${Date.now()}.jpg`,
    mimeType,
  };
}

const PHOTO_MAX_SIDE = 1280;
const PHOTO_QUALITY = 0.72;
/** Fotos da câmera passam de 3 MB; o lado maior é reduzido a 1280 px em JPEG antes de anexar e enviar ao agente. */
async function shrinkPhoto(
  uri: string,
  width?: number,
  height?: number,
): Promise<string | null> {
  const w = width ?? 0;
  const h = height ?? 0;
  if (w > 0 && Math.max(w, h) <= PHOTO_MAX_SIDE) return null;
  try {
    const resized = await manipulateAsync(
      uri,
      [
        {
          resize:
            w >= h ? { width: PHOTO_MAX_SIDE } : { height: PHOTO_MAX_SIDE },
        },
      ],
      {
        compress: PHOTO_QUALITY,
        format: SaveFormat.JPEG,
        base64: true,
      },
    );
    return resized.base64 ?? null;
  } catch {
    return null;
  }
}
