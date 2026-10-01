import { useCallback, useState } from "react";
import { RECAP_DISMISS_KEY } from "../../lib/week-recap";

/** Semana dispensada neste navegador; armazenamento bloqueado conta como nenhuma. */
function readDismissed(): string | null {
  try {
    return localStorage.getItem(RECAP_DISMISS_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(week: string | null) {
  try {
    if (week === null) localStorage.removeItem(RECAP_DISMISS_KEY);
    else localStorage.setItem(RECAP_DISMISS_KEY, week);
  } catch {
    // Janela privada ou armazenamento bloqueado: o cartão some só nesta visita.
  }
}

/**
 * Dispensa do cartão "Sua semana" no Hoje: conveniência do aparelho (fora do AppState, sem backup
 * nem sincronização), como o tema. `restore` devolve o valor anterior ("Desfazer").
 */
export function useRecapDismissal(): {
  dismissed: string | null;
  dismiss: (week: string) => void;
  restore: (previous: string | null) => void;
} {
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);
  const dismiss = useCallback((week: string) => {
    writeDismissed(week);
    setDismissed(week);
  }, []);
  const restore = useCallback((previous: string | null) => {
    writeDismissed(previous);
    setDismissed(previous);
  }, []);
  return { dismissed, dismiss, restore };
}
