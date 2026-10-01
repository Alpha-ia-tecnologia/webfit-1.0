import { LAST_BACKUP_KEY } from "@shared/lib/space";
import type { AppState } from "@shared/types";
import Storage from "expo-sqlite/kv-store";
import { useEffect, useState } from "react";
import { exportJson } from "./storage";

/**
 * Data do último backup exportado neste aparelho. Como no web (localStorage), ela fica fora do
 * estado salvo: vive na mesma chave-valor das conveniências do app (endereço do servidor).
 */
type Listener = (iso: string) => void;
const listeners = new Set<Listener>();

export async function readLastBackup(): Promise<string | null> {
  try {
    return await Storage.getItemAsync(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

async function recordBackup(): Promise<void> {
  const iso = new Date().toISOString();
  try {
    await Storage.setItemAsync(LAST_BACKUP_KEY, iso);
  } catch {
    // Só uma conveniência: o arquivo já foi entregue mesmo assim.
    return;
  }
  listeners.forEach((listener) => listener(iso));
}

/** Exporta o backup completo e, se o arquivo foi entregue, lembra a data para o aviso de "Último backup". */
export async function exportBackup(state: AppState, name: string): Promise<void> {
  if (await exportJson(state, name)) await recordBackup();
}

/** Data do último backup: undefined enquanto lê, null sem backup; muda a cada exportação. */
export function useLastBackup(): string | null | undefined {
  const [value, setValue] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let isActive = true;
    let hasRecorded = false;
    const listener: Listener = (iso) => {
      hasRecorded = true;
      setValue(iso);
    };
    listeners.add(listener);
    void readLastBackup().then((iso) => {
      if (isActive && !hasRecorded) setValue(iso);
    });
    return () => {
      isActive = false;
      listeners.delete(listener);
    };
  }, []);
  return value;
}
