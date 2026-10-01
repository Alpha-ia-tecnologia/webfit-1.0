import * as Network from "expo-network";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState as RNAppState, Platform } from "react-native";
import type { AiProviders } from "@shared/lib/agent-presentation";
import { scanConfirmCopy, settleDiscovery, type DiscoveryOutcome } from "@shared/lib/server-discovery";
import {
  AGENT_NOT_CONFIGURED,
  discoverApiUrl,
  fetchStatus,
  getApiUrl,
  getSessionToken,
  isLoopbackUrl,
  loadApiUrl,
  loadSession,
  saveApiUrl,
  saveSession,
  type AgentStatus,
} from "@/lib/api";
import type { AccountInfo, ServerMode } from "@shared/lib/account";
import { confirmAsync } from "@/lib/confirm";
import type { AppContextValue } from "./app-context-types";

const STATUS_POLL_MS = 60_000;
/** Intervalo mínimo entre buscas automáticas do servidor na rede (a varredura leva alguns segundos). */
const AUTO_DISCOVERY_INTERVAL_MS = 90_000;

type Options = {
  notify: AppContextValue["notify"];
  /** Chamado a cada volta ao primeiro plano, logo depois de pedir a nova verificação (relógio e lembretes). */
  onForeground: () => void;
};

/**
 * Conexão com o servidor do agente: endereço salvo, estado (pronto, provedores, token), consulta
 * periódica, ao voltar ao primeiro plano e quando a rede muda, e a busca do servidor na rede.
 */
export function useAgentConnection({ notify, onForeground }: Options) {
  const [aiReady, setAiReady] = useState(false);
  const [aiProviders, setAiProviders] = useState<AiProviders | null>(null);
  // Fora do ar não muda: a cópia no servidor espera a conexão voltar em vez de parecer "sem banco".
  const [syncAvailable, setSyncAvailable] = useState(false);
  // Servidor online (contas) ou local; null até a primeira resposta. A conta vem da sessão guardada.
  const [mode, setMode] = useState<ServerMode | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const accountRef = useRef<AccountInfo | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [apiUrl, setApiUrlState] = useState(getApiUrl());
  const [apiError, setApiError] = useState<string | null>(null);
  const discovering = useRef(false);
  const lastDiscovery = useRef(0);
  // Busca em andamento (automática ou "Procurar na rede"): uma só por vez, uma só pergunta.
  const discoveryRun = useRef<Promise<DiscoveryOutcome> | null>(null);
  // Endereços da varredura recusados nesta sessão: não são oferecidos de novo.
  const declinedServers = useRef<ReadonlySet<string>>(new Set());
  const token = useRef("");
  const agentStatus = useRef<AgentStatus | null>(null);

  const checkAgent = useCallback(
    () =>
      fetchStatus()
        .then((status) => {
          agentStatus.current = status;
          setAiReady(status.ready);
          setAiProviders(status.providers);
          setApiError(status.ready ? null : AGENT_NOT_CONFIGURED);
          token.current = status.token;
          setSyncAvailable(status.sync);
          setMode(status.mode);
          if (accountRef.current?.id !== status.account?.id) {
            // Havia conta e o servidor não reconhece mais a sessão: pede para entrar de novo.
            if (accountRef.current && !status.account) setSessionEnded(true);
            accountRef.current = status.account;
            setAccount(status.account);
          }
          return status;
        })
        .catch((error: unknown) => {
          agentStatus.current = null;
          setAiReady(false);
          // Sem resposta na primeira vez: o app abre com os dados do aparelho (a conta guardada continua).
          setMode((current) => current ?? (getSessionToken() ? "online" : "local"));
          // Sem servidor, os provedores anteriores não valem mais.
          setAiProviders(null);
          setApiError(
            error instanceof Error
              ? error.message
              : "Sem conexão com o servidor.",
          );
          throw error;
        }),
    [],
  );
  const discoverServer = useCallback<
    AppContextValue["discoverServer"]
  >(() => {
    if (discoveryRun.current) return discoveryRun.current;
    const run = (async (): Promise<DiscoveryOutcome> => {
      const found = await discoverApiUrl(declinedServers.current);
      const settled = await settleDiscovery(found, declinedServers.current, (url) => {
        const copy = scanConfirmCopy(url);
        return confirmAsync(copy.title, copy.message, copy.confirmLabel);
      });
      declinedServers.current = settled.declined;
      if (settled.outcome.kind !== "adopted") return settled.outcome;
      await saveApiUrl(settled.outcome.url);
      setApiUrlState(settled.outcome.url);
      await checkAgent().catch(() => undefined);
      return settled.outcome;
    })();
    discoveryRun.current = run;
    return run.finally(() => {
      discoveryRun.current = null;
    });
  }, [checkAgent]);
  // Sem servidor no endereço atual: procura sozinho (endereços conhecidos, nome do computador, sub-rede),
  // no máximo uma vez por intervalo, sem exigir toque em "Procurar na rede". Um endereço achado só na
  // varredura da sub-rede pede confirmação antes de receber qualquer dado.
  const autoDiscover = useCallback(async () => {
    if (Platform.OS === "web" || discovering.current || discoveryRun.current) return;
    if (Date.now() - lastDiscovery.current < AUTO_DISCOVERY_INTERVAL_MS) return;
    discovering.current = true;
    lastDiscovery.current = Date.now();
    try {
      const outcome = await discoverServer();
      if (outcome.kind === "adopted") notify(`Servidor do agente encontrado em ${outcome.url}.`);
    } catch {
      // a próxima verificação tenta de novo
    } finally {
      discovering.current = false;
    }
  }, [discoverServer, notify]);
  // O endereço salvo é lido antes da primeira verificação; depois o estado é consultado periodicamente,
  // ao voltar ao primeiro plano e quando a rede muda. Cada falha dispara a busca automática.
  useEffect(() => {
    let alive = true;
    // Até o endereço e a sessão serem lidos, nenhuma consulta sai (sem isso, a primeira iria sem o Bearer).
    let loaded = false;
    const verify = () => {
      if (!alive || !loaded) return;
      checkAgent().catch(() => {
        if (alive) void autoDiscover();
      });
    };
    void Promise.all([loadApiUrl(), loadSession()]).then(([url, saved]) => {
      if (!alive) return;
      loaded = true;
      // Sem internet, o app abre com a última conta (os dados estão no aparelho); o servidor confirma depois.
      if (saved && !accountRef.current) {
        accountRef.current = saved;
        setAccount(saved);
      }
      setApiUrlState(url);
      if (isLoopbackUrl(url)) lastDiscovery.current = 0;
      verify();
    });
    const timer = setInterval(verify, STATUS_POLL_MS);
    const appState = RNAppState.addEventListener("change", (status) => {
      if (status === "active") {
        verify();
        onForeground();
      }
    });
    const network =
      Platform.OS === "web"
        ? null
        : Network.addNetworkStateListener((event) => {
            if (event.isConnected) {
              lastDiscovery.current = 0;
              verify();
            }
          });
    return () => {
      alive = false;
      clearInterval(timer);
      appState.remove();
      network?.remove();
    };
  }, [checkAgent, autoDiscover, onForeground]);
  const updateApiUrl = useCallback<AppContextValue["updateApiUrl"]>(
    async (url) => {
      const saved = await saveApiUrl(url);
      setApiUrlState(saved);
      return checkAgent();
    },
    [checkAgent],
  );

  /** Entrou (token e conta) ou saiu (null): grava a sessão e atualiza a conta na hora. */
  const setSession = useCallback(async (session: { token: string; account: AccountInfo } | null) => {
    await saveSession(session);
    accountRef.current = session?.account ?? null;
    setAccount(accountRef.current);
    setSessionEnded(false);
  }, []);

  return {
    mode,
    account,
    sessionEnded,
    setSession,
    aiReady,
    aiProviders,
    syncAvailable,
    apiUrl,
    apiError,
    checkAgent,
    discoverServer,
    updateApiUrl,
    agentStatus,
    token,
  };
}
