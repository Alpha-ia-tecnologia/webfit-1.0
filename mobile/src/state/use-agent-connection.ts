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
  isLoopbackUrl,
  loadApiUrl,
  saveApiUrl,
  type AgentStatus,
} from "@/lib/api";
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
          return status;
        })
        .catch((error: unknown) => {
          agentStatus.current = null;
          setAiReady(false);
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
    const verify = () => {
      if (!alive) return;
      checkAgent().catch(() => {
        if (alive) void autoDiscover();
      });
    };
    void loadApiUrl().then((url) => {
      if (!alive) return;
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

  return { aiReady, aiProviders, apiUrl, apiError, checkAgent, discoverServer, updateApiUrl, agentStatus, token };
}
