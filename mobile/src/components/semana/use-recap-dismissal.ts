import Storage from "expo-sqlite/kv-store";
import { useCallback, useEffect, useState } from "react";
import { RECAP_DISMISS_KEY } from "@shared/lib/week-recap";

type RecapDismissal = {
  /** Início da semana dispensada; null sem dispensa; undefined enquanto lê (o cartão fica oculto, sem piscar). */
  dismissed: string | null | undefined;
  dismiss: (week: string) => void;
  /** "Desfazer": volta ao valor anterior (remove a chave quando não havia nenhum). */
  restore: (previous: string | null) => void;
};

/** Grava só no aparelho; falha de escrita é inofensiva (o cartão volta na segunda seguinte, no pior caso). */
async function write(value: string | null): Promise<void> {
  try {
    if (value === null) await Storage.removeItemAsync(RECAP_DISMISS_KEY);
    else await Storage.setItemAsync(RECAP_DISMISS_KEY, value);
  } catch {
    return;
  }
}

/**
 * Dispensa do cartão "Sua semana" no Hoje (EVOL-05): uma conveniência deste aparelho, fora do estado
 * salvo (sem backup nem sincronização), na mesma chave-valor do último backup e do tema.
 */
export function useRecapDismissal(): RecapDismissal {
  const [dismissed, setDismissed] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let isActive = true;
    Storage.getItemAsync(RECAP_DISMISS_KEY)
      .catch(() => null)
      .then((value) => {
        // Uma dispensa feita durante a leitura vale mais que o valor lido.
        if (isActive) setDismissed((current) => (current === undefined ? value : current));
      });
    return () => {
      isActive = false;
    };
  }, []);
  const dismiss = useCallback((week: string) => {
    setDismissed(week);
    void write(week);
  }, []);
  const restore = useCallback((previous: string | null) => {
    setDismissed(previous);
    void write(previous);
  }, []);
  return { dismissed, dismiss, restore };
}
