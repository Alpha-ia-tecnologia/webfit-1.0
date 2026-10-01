/**
 * Liga o estado do app à cópia no servidor (server-sync.ts), igual no web e no nativo.
 *
 * - Desligada (state.serverSync false) ou servidor sem banco: nada sai do aparelho.
 * - Ao ligar (ou abrir o app com ela ligada): compara a revisão do servidor com a do aparelho uma vez;
 *   aparelho à frente envia, servidor à frente vira conflito e nada é enviado até a pessoa escolher
 *   ("Enviar a deste aparelho" ou "Restaurar do servidor"). Depois, cada gravação agenda um envio.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "../types";
import {
  compareWithServer,
  createSyncQueue,
  deleteServerCopy,
  fetchServerState,
  isRestoreCode,
  pushState,
  SERVER_SYNC_COPY,
  type ServerSyncControls,
  type SyncRequest,
  type SyncStatus,
} from "./server-sync";

export interface ServerSyncOptions {
  state: AppState | null;
  /** O servidor respondeu /api/status com sync: true. */
  available: boolean;
  request: SyncRequest;
  /** Estado mais recente já gravado (o do render pode estar um passo atrás). */
  getState: () => AppState | null;
  /** Grava state.serverSync pelo caminho normal de gravação do app. */
  setFlag: (enabled: boolean) => Promise<boolean>;
  /** O restaurar de backup do app (prepareRestore), com a mensagem final. */
  restore: (backup: AppState, expectedRevision: number, message: string) => Promise<boolean>;
  notify: (message: string, type?: "success" | "error") => void;
}

export function useServerSync(options: ServerSyncOptions) {
  const { state, available } = options;
  const [status, setStatus] = useState<SyncStatus>({ kind: "off" });
  // As funções do app mudam a cada render; os controles leem sempre as mais recentes.
  const opts = useRef(options);
  const stateRef = useRef(state);
  /** userId já comparado com o servidor nesta sessão (null: comparar de novo). */
  const checked = useRef<string | null>(null);
  const comparing = useRef(false);
  const conflict = useRef(false);
  const [queue] = useState(() =>
    createSyncQueue({
      push: (next) => pushState(opts.current.request, next),
      onStatus: (next) => {
        conflict.current = next.kind === "conflict";
        setStatus(next);
      },
    }),
  );
  useEffect(() => {
    opts.current = options;
  });
  useEffect(() => () => queue.cancel(), [queue]);

  useEffect(() => {
    stateRef.current = state;
    if (!state) return;
    if (!state.serverSync || !available) {
      queue.cancel();
      checked.current = null;
      conflict.current = false;
      const kind = state.serverSync ? "unavailable" : "off";
      // Mesmo objeto quando nada mudou: sem novo render do app a cada gravação.
      setStatus((current) => (current.kind === kind ? current : { kind }));
      return;
    }
    if (checked.current === state.userId) {
      if (!comparing.current && !conflict.current) queue.schedule(state);
      return;
    }
    checked.current = state.userId;
    comparing.current = true;
    setStatus({ kind: "pending" });
    void compareWithServer(opts.current.request, state).then(({ relation, revision }) => {
      comparing.current = false;
      const latest = stateRef.current;
      if (!latest?.serverSync || latest.userId !== state.userId) return;
      if (relation === "unavailable") {
        // Fora do alcance agora: compara de novo na próxima gravação.
        checked.current = null;
        setStatus({ kind: "error", message: SERVER_SYNC_COPY.offline, retry: true });
      } else if (relation === "ahead") {
        conflict.current = true;
        setStatus({ kind: "conflict", serverRevision: revision ?? latest.revision });
      } else if (relation === "same" && latest.revision === state.revision) {
        setStatus({ kind: "synced", at: latest.updatedAt });
      } else queue.schedule(latest);
    });
  }, [state, available, queue]);

  /** Para os envios agendados e espera o que estiver em andamento. */
  const stop = useCallback(async () => {
    queue.cancel();
    await queue.settle();
  }, [queue]);

  /** Envia a cópia deste aparelho por cima da do servidor (a pessoa escolheu, ou acabou de restaurá-la). */
  const forcePush = useCallback(
    async (current: AppState) => {
      await stop();
      setStatus({ kind: "pending" });
      const result = await pushState(opts.current.request, current, true);
      conflict.current = result.kind === "conflict";
      checked.current = current.userId;
      setStatus(result);
      return result.kind === "synced";
    },
    [stop],
  );

  /**
   * Envia já a versão do aparelho (sem passar por cima de uma mais nova) e devolve como ficou; usado antes
   * de sair da conta, para nada se perder. Com a cópia desligada, responde "off".
   */
  const flushNow = useCallback(async (): Promise<SyncStatus> => {
    const current = opts.current.getState();
    if (!current?.serverSync || !opts.current.available) return { kind: "off" };
    await stop();
    setStatus({ kind: "pending" });
    const result = await pushState(opts.current.request, current);
    conflict.current = result.kind === "conflict";
    checked.current = current.userId;
    setStatus(result);
    return result;
  }, [stop]);

  /** Ao excluir os dados do aparelho: apaga antes a cópia no servidor (true se não havia o que apagar). */
  const deleteOwnCopy = useCallback(async () => {
    const current = opts.current.getState();
    if (!current?.serverSync) return true;
    if (!opts.current.available) return false;
    await stop();
    return deleteServerCopy(opts.current.request, current.userId);
  }, [stop]);

  const setEnabled = useCallback<ServerSyncControls["setEnabled"]>(
    async (enabled, deleteCopy = false) => {
      const { setFlag, notify } = opts.current;
      if (enabled || !deleteCopy) return setFlag(enabled);
      if (!(await deleteOwnCopy())) {
        notify(SERVER_SYNC_COPY.copyDeleteFailed, "error");
        return false;
      }
      const saved = await setFlag(false);
      if (saved) notify(SERVER_SYNC_COPY.copyDeleted);
      return saved;
    },
    [deleteOwnCopy],
  );

  const sendMine = useCallback(async () => {
    const current = opts.current.getState();
    return current ? forcePush(current) : false;
  }, [forcePush]);

  const restoreFromServer = useCallback(
    async (code: string) => {
      const { getState, request, restore, notify } = opts.current;
      const before = getState();
      if (!before) return false;
      let remote: AppState;
      try {
        remote = await fetchServerState(request, code);
      } catch (error) {
        notify(error instanceof Error ? error.message : SERVER_SYNC_COPY.notFound, "error");
        return false;
      }
      if (!(await restore(remote, before.revision, SERVER_SYNC_COPY.restored))) return false;
      // A revisão do aparelho pode estar atrás da do servidor: a cópia restaurada passa a ser a de lá.
      const after = getState();
      if (after?.serverSync && opts.current.available) await forcePush(after);
      return true;
    },
    [forcePush],
  );

  const deleteCopy = useCallback(
    async (code: string) => {
      const { getState, request, notify } = opts.current;
      const userId = code.trim().toLowerCase();
      if (!isRestoreCode(userId)) {
        notify(SERVER_SYNC_COPY.invalidCode, "error");
        return false;
      }
      // A deste aparelho, com a cópia ligada, voltaria no próximo envio: desliga junto.
      const current = getState();
      if (current?.serverSync && userId === current.userId) return setEnabled(false, true);
      const deleted = await deleteServerCopy(request, userId);
      notify(deleted ? SERVER_SYNC_COPY.copyDeleted : SERVER_SYNC_COPY.copyDeleteFailed, deleted ? "success" : "error");
      return deleted;
    },
    [setEnabled],
  );

  const controls = useMemo<ServerSyncControls>(
    () => ({ available, status, setEnabled, sendMine, restoreFromServer, deleteCopy }),
    [available, status, setEnabled, sendMine, restoreFromServer, deleteCopy],
  );
  return { controls, deleteOwnCopy, flushNow };
}
