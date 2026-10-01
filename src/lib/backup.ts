import { stateSchema, type AppState, type Profile } from "../types";

export const MAX_BACKUP_BYTES = 256 * 1024 * 1024;

/** Arquivos exportados são dados não confiáveis: validar antes de oferecer restauração. */
export function parseBackup(content: string): AppState {
  let bytes = 0;
  for (const character of content) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes > MAX_BACKUP_BYTES)
      throw new Error("Escolha um backup de até 256 MB.");
  }
  let value: unknown;
  try {
    value = JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(
      "Não foi possível ler este JSON. Escolha um backup exportado pelo WebFit.",
    );
  }
  const result = stateSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "Este arquivo não é um backup WebFit válido ou usa uma versão incompatível. Seus dados atuais foram preservados.",
    );
  const state = result.data;
  for (const entries of [state.diary, state.injections])
    if (entries.some((entry) => entry.userId !== state.userId))
      throw new Error(
        "O backup contém registros de perfis diferentes. Seus dados atuais foram preservados.",
      );
  for (const entries of [
    state.diary,
    state.injections,
    state.measurements,
    state.habits,
    state.messages,
    state.foods,
    state.exams,
    state.appointments,
    state.pantry,
    state.recipes,
    state.savedMeals,
    state.shoppingList,
  ]) {
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
      throw new Error(
        "O backup contém registros duplicados. Seus dados atuais foram preservados.",
      );
  }
  return state;
}

const privateProfile = (profile: Profile): Profile => ({
  ...profile,
  consentAi: false,
  remindersEnabled: false,
});

/** Substitui o conteúdo na próxima gravação normal, sem apagar antes e sem reutilizar a revisão do arquivo. */
export function prepareRestore(backup: AppState, current: AppState): AppState {
  return stateSchema.parse({
    ...backup,
    userId: current.userId,
    revision: current.revision,
    profile: backup.profile ? privateProfile(backup.profile) : null,
    draft: backup.draft
      ? { ...backup.draft, consentAi: false, remindersEnabled: false }
      : null,
    goalHistory: backup.goalHistory.map((entry) => ({
      ...entry,
      profile: privateProfile(entry.profile),
    })),
    diary: backup.diary.map((entry) => ({ ...entry, userId: current.userId })),
    injections: backup.injections.map((entry) => ({
      ...entry,
      userId: current.userId,
    })),
    readNotifications: [],
  });
}
