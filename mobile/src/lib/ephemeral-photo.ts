import { File, Paths } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { LABEL_PHOTO_ERRORS } from "@shared/lib/label-read";

/**
 * Foto de uso único (INJECAO-X2, rótulo do frasco): escolhe ou tira a foto, sempre a recodifica em JPEG
 * (a recodificação descarta o EXIF) e apaga do cache os arquivos do seletor e da redução antes de
 * devolver a data URL. Nada é gravado: a data URL vive só no estado da folha que a pediu.
 */
const MAX_SIDE = 1280;
const PICK_QUALITY = 0.7;
const COMPRESS = 0.72;
const MAX_BYTES = 2 * 1024 * 1024;
export const EPHEMERAL_TOO_BIG = "A foto ficou muito grande. Fotografe só o rótulo.";

/**
 * Apaga um arquivo temporário da foto. No web, só revoga URLs `blob:` (o seletor e o manipulador criam
 * uma cada). No aparelho, só apaga dentro do cache do app (cópias do seletor e a foto reduzida), nunca o
 * original da galeria; qualquer erro é ignorado de propósito: o sistema limpa o cache depois.
 */
export function deleteCached(uri: string | null | undefined): void {
  if (!uri) return;
  if (Platform.OS === "web") {
    if (uri.startsWith("blob:")) URL.revokeObjectURL(uri);
    return;
  }
  try {
    if (!uri.startsWith(Paths.cache.uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Arquivo já removido ou inacessível: o sistema limpa o cache do app mais tarde.
  }
}

async function ensurePermission(source: "camera" | "library") {
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
}

/** Redução para o lado maior ≤ 1280 px; sem medidas conhecidas, só recodifica. */
function resizeFor(width: number, height: number) {
  if (!(width > 0 && height > 0)) return [];
  return [
    {
      resize:
        width >= height
          ? { width: Math.min(width, MAX_SIDE) }
          : { height: Math.min(height, MAX_SIDE) },
    },
  ];
}

/** Foto da câmera ou da galeria como `data:image/jpeg;base64,…`; null quando a pessoa cancela. */
export async function pickEphemeralPhoto(source: "camera" | "library"): Promise<string | null> {
  await ensurePermission(source);
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: PICK_QUALITY,
    base64: false,
    exif: false,
    allowsEditing: false,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  let resizedUri: string | null = null;
  try {
    const resized = await manipulateAsync(asset.uri, resizeFor(asset.width, asset.height), {
      compress: COMPRESS,
      format: SaveFormat.JPEG,
      base64: true,
    });
    resizedUri = resized.uri;
    if (!resized.base64) throw new Error(LABEL_PHOTO_ERRORS.prepare);
    const bytes = Math.ceil((resized.base64.length * 3) / 4);
    if (bytes > MAX_BYTES) throw new Error(EPHEMERAL_TOO_BIG);
    return `data:image/jpeg;base64,${resized.base64}`;
  } finally {
    deleteCached(asset.uri);
    deleteCached(resizedUri);
  }
}
