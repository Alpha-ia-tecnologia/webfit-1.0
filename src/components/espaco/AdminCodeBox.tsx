import { useCallback, useEffect, useState } from "react";
import { Copy, MessageSquareText } from "lucide-react";
import { ADMIN_COPY } from "../../lib/admin";
import { useApp } from "../../lib/context";

/** Frase de um erro para a pessoa (os pedidos do painel já lançam frases prontas). */
export const messageOf = (error: unknown) => (error instanceof Error ? error.message : ADMIN_COPY.failed);

/** Lista do painel carregada ao abrir a seção; `setItems` aplica as mudanças sem buscar de novo. */
export function useAdminList<T>(load: () => Promise<T[]>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      const next = await load();
      setItems(next);
      setError("");
    } catch (failure) {
      setError(messageOf(failure));
    }
  }, [load]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { items, setItems, error, reload };
}

/** Copia para a área de transferência; sem permissão, avisa para copiar à mão. */
function useCopy() {
  const { notify } = useApp();
  return async (text: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("sem área de transferência");
      await navigator.clipboard.writeText(text);
      notify(ADMIN_COPY.copied);
    } catch {
      notify(ADMIN_COPY.copyFailed, "warning");
    }
  };
}

/** Código que aparece uma vez só (convite ou senha), com os botões de copiar e a mensagem pronta. */
export function CodeBox({
  label,
  code,
  hint,
  message,
}: {
  label: string;
  code: string;
  hint?: string;
  message?: string;
}) {
  const copy = useCopy();
  return (
    <div className="admin-code" role="status">
      <span className="admin-code-label">{label}</span>
      <code className="admin-code-value">{code}</code>
      {hint && <p className="hint">{hint}</p>}
      {message && <p className="admin-message">{message}</p>}
      <div className="admin-code-actions">
        <button type="button" className="btn-secondary btn-sm" onClick={() => void copy(code)}>
          <Copy size={16} aria-hidden="true" />
          {ADMIN_COPY.copyCode}
        </button>
        {message && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => void copy(message)}>
            <MessageSquareText size={16} aria-hidden="true" />
            {ADMIN_COPY.copyMessage}
          </button>
        )}
      </div>
    </div>
  );
}
