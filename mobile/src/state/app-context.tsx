import { prepareRestore } from "@shared/lib/backup";
import { SERVER_SYNC_COPY } from "@shared/lib/server-sync";
import {
  AUTH_COPY,
  changePassword as changeAccountPassword,
  deleteAccount as deleteServerAccount,
  fetchMe,
  logOut as logOutServer,
  prepareSignIn,
  type AccountControls,
  type AccountInfo,
  type AiQuota,
} from "@shared/lib/account";
import { useServerSync } from "@shared/lib/use-server-sync";
import { initialState, localDate, notificationsFor, uid } from "@shared/lib/domain";
import type { AppState, DiaryEntry, InjectionEntry, ToastMessage } from "@shared/types";
import { useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Toast } from "@/components/ui";
import { Popup, type PopupContent } from "@/components/ui/popup";
import { createSyncRequest, saveSession } from "@/lib/api";
import { confirmAsync } from "@/lib/confirm";
import { clearState, replaceState } from "@/lib/storage";
import { AuthScreen } from "@/components/auth/auth-screen";
import { TAB_BAR_SPACE } from "@/theme/tokens";
import { BootSkeleton, LoadErrorScreen, RestoringOverlay } from "./app-boot-screens";
import type { AppContextValue, InjectionView, MealPreset, MealPresetInput } from "./app-context-types";
import { useAgentConnection } from "./use-agent-connection";
import { useAiRequest } from "./use-ai-request";
import { useAppReminders } from "./use-app-reminders";
import { useAppStore } from "./use-app-store";
import { useDietPlan } from "./use-diet-plan";
import { useExamAnalysis } from "./use-exam-analysis";

export type { AppContextValue, InjectionView, MealPreset, MealPresetInput } from "./app-context-types";

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("Contexto WebFit ausente.");
  return context;
}

const CLOCK_MS = 30_000;

/**
 * Carrega o estado local, coordena gravações sequenciais e expõe o mesmo contrato do app web. As partes
 * ficam em hooks deste diretório: gravação (use-app-store), lembretes, conexão com o servidor, pedidos
 * ao agente, análise de exames e dieta; aqui ficam a navegação, os avisos e a troca completa dos dados.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(localDate());
  const [clock, setClock] = useState(new Date());
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [toastBottom, setToastBottom] = useState<number | null>(null);
  const [editingMeal, setEditingMeal] = useState<DiaryEntry | null>(null);
  const [mealPreset, setMealPreset] = useState<MealPreset | null>(null);
  const [editingInjection, setEditingInjection] =
    useState<InjectionEntry | null>(null);
  const [injectionView, setInjectionView] = useState<InjectionView>("auto");
  const [isQuickOpen, setQuickOpen] = useState(false);
  const [popup, setPopup] = useState<PopupContent | null>(null);
  const popupRef = useRef<PopupContent | null>(null);
  popupRef.current = popup;
  const showPopup = useCallback((next: PopupContent) => setPopup(next), []);
  const closePopup = useCallback(() => setPopup(null), []);
  const todayRef = useRef(localDate());

  const [agentDraft, setAgentDraft] = useState("");

  const notify = useCallback<AppContextValue["notify"]>(
    (message, type = "success", action) => {
      const note = typeof message === "string" ? { text: message } : message;
      setToast({ id: uid(), message: note.text, type, action, progress: note.progress });
    },
    [],
  );
  const closeToast = useCallback(() => setToast(null), []);

  const {
    state,
    setState,
    stateRef,
    loadError,
    setLoadError,
    dataEpoch,
    setDataEpoch,
    dataEpochRef,
    restoring,
    isRestoring,
    setIsRestoring,
    queue,
    commit,
  } = useAppStore(notify);

  const { seenReminders, resyncReminders } = useAppReminders({
    state,
    clock,
    stateRef,
    notify,
    setDate,
    setEditingInjection,
    setInjectionView,
    setPopup,
    popupRef,
  });
  // De volta ao primeiro plano: o relógio e os lembretes em dia, junto com a nova verificação do servidor.
  const onForeground = useCallback(() => {
    setClock(new Date());
    resyncReminders();
  }, [resyncReminders]);
  const {
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
  } = useAgentConnection({ notify, onForeground });

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(new Date());
      const today = localDate();
      if (todayRef.current !== today) {
        const previous = todayRef.current;
        setDate((current) => (current === previous ? today : current));
        todayRef.current = today;
      }
    }, CLOCK_MS);
    return () => clearInterval(timer);
  }, []);

  const editMeal = useCallback(
    (entry: DiaryEntry | null, preset?: MealPresetInput) => {
      setEditingMeal(entry);
      setMealPreset(!entry && preset ? { ...preset, id: uid() } : null);
      setQuickOpen(false);
      router.push("/refeicao");
    },
    [router],
  );
  const openInjection = useCallback(
    (entry: InjectionEntry | null, view: InjectionView = "auto") => {
      setEditingInjection(entry);
      setInjectionView(view);
      setQuickOpen(false);
      router.push("/injecao");
    },
    [router],
  );
  const askAgent = useCallback(
    (prompt: string) => {
      setAgentDraft(prompt);
      setQuickOpen(false);
      router.push("/agente");
    },
    [router],
  );
  const clearAgentDraft = useCallback(() => setAgentDraft(""), []);

  const { aiBusy, aiStage, aiRequest, abortAi } = useAiRequest({
    stateRef,
    agentStatus,
    token,
    aiReady,
  });
  const { analyzeExam, analyzingExamId, examUrgent, stopExamAnalysis } =
    useExamAnalysis({ stateRef, aiRequest, commit, notify });
  const {
    requestDietPlan,
    dietBusy,
    dietSaving,
    dietError,
    dietProgress,
    cancelDietAttempt,
    clearDiet,
  } = useDietPlan({ stateRef, aiReady, aiRequest, commit, notify });

  const cancelAi = useCallback(() => {
    stopExamAnalysis();
    abortAi();
    cancelDietAttempt();
  }, [stopExamAnalysis, abortAi, cancelDietAttempt]);
  const [syncRequest] = useState(() => createSyncRequest(() => token.current));
  const restoreRef = useRef<AppContextValue["restore"] | null>(null);
  const { controls: sync, deleteOwnCopy, flushNow } = useServerSync({
    state,
    // Online, a cópia só conversa com o servidor com a sessão aberta.
    available: syncAvailable && (mode !== "online" || !!account),
    request: syncRequest,
    getState: () => stateRef.current,
    setFlag: (enabled) =>
      commit((current) => (current.serverSync === enabled ? current : { ...current, serverSync: enabled })),
    restore: (backup, expectedRevision, message) =>
      restoreRef.current?.(backup, expectedRevision, message) ?? Promise.resolve(false),
    notify: (message, type) => notify(message, type),
  });

  /**
   * Troca todos os dados do aparelho: `next` grava outro estado (dados da conta), null apaga. Quem chama já
   * ergueu a trava `restoring` (nenhuma gravação passa no meio).
   */
  const swapAll = useCallback(
    async (next: AppState | null, message?: string) => {
      setIsRestoring(true);
      cancelAi();
      try {
        clearDiet();
        await queue.current.catch(() => undefined);
        const current = stateRef.current;
        if (next && current) await replaceState(next, current);
        else await clearState();
        const value = next ?? initialState();
        stateRef.current = value;
        setState(value);
        dataEpochRef.current += 1;
        setDataEpoch(dataEpochRef.current);
        setPopup(null);
        setEditingMeal(null);
        setMealPreset(null);
        setEditingInjection(null);
        setQuickOpen(false);
        seenReminders.current = null;
        setDate(localDate());
        router.replace(value.profile ? "/" : "/anamnese");
        if (message) notify(message);
        return true;
      } catch (error) {
        notify(error instanceof Error ? error.message : "Não foi possível trocar os dados.", "error");
        return false;
      } finally {
        restoring.current = false;
        setIsRestoring(false);
      }
    },
    [cancelAi, clearDiet, notify, router],
  );

  const reset = useCallback(async () => {
    if (restoring.current || dataEpoch !== dataEpochRef.current) return;
    // A trava sobe antes de apagar a cópia: um segundo toque e novas gravações esperam.
    restoring.current = true;
    // Excluir tudo inclui a cópia no servidor; sem conseguir apagá-la, nada é excluído (o código se perderia).
    if (!(await deleteOwnCopy())) {
      restoring.current = false;
      notify(SERVER_SYNC_COPY.deleteFailed, "error");
      return;
    }
    await swapAll(null, "Dados locais excluídos.");
  }, [notify, dataEpoch, deleteOwnCopy, swapAll]);

  // ---------- Conta (servidor online) ----------
  const [quota, setQuota] = useState<AiQuota | null>(null);
  /** Última conta deste aparelho: dados de outra conta nunca vão para a que entra (account.ts). */
  const lastAccountId = useRef<string | null>(null);
  useEffect(() => {
    if (account) lastAccountId.current = account.id;
  }, [account]);
  // Sessão de uma conta com dados do aparelho que não são dela (no iPhone, o cofre sobrevive a reinstalar
  // o app, mas os dados não): pede para entrar de novo, e a entrada traz os dados da conta.
  useEffect(() => {
    if (!account || !state || restoring.current) return;
    if (state.userId !== account.id) void setSession(null);
  }, [account, state, setSession]);
  const signIn = useCallback(
    async (signed: AccountInfo, sessionToken: string) => {
      const current = stateRef.current;
      if (!current || restoring.current) return;
      // Lida antes de abrir a sessão nova (o efeito acima passaria a apontar para a conta que entra).
      const previous = lastAccountId.current;
      // Só o token, já, para comparar e baixar a cópia; a conta aparece na tela depois da troca dos dados.
      await saveSession({ token: sessionToken, account: signed });
      try {
        const { next, message } = await prepareSignIn(syncRequest, current, signed.id, previous, () =>
          confirmAsync(AUTH_COPY.chooseTitle, AUTH_COPY.chooseMessage, AUTH_COPY.useAccount),
        );
        if (next) {
          restoring.current = true;
          if (!(await swapAll(next, message)))
            throw new Error("Não foi possível guardar os dados neste aparelho. Feche e abra o aplicativo.");
        } else if (!current.serverSync) await commit((s) => ({ ...s, serverSync: true }));
      } catch (error) {
        // Sem decidir os dados, a sessão não fica aberta.
        await saveSession(null);
        throw error;
      }
      await setSession({ token: sessionToken, account: signed });
      setQuota(null);
    },
    [commit, setSession, swapAll, syncRequest],
  );
  const refreshQuota = useCallback(async () => {
    const me = await fetchMe(syncRequest);
    if (me) setQuota(me.ai);
  }, [syncRequest]);
  const accountLogOut = useCallback(async () => {
    if (restoring.current) return;
    // Envia o que falta antes de sair; sem conseguir, a pessoa decide se sai mesmo assim.
    const result = await flushNow();
    const safe = result.kind === "synced" || result.kind === "off";
    const confirmed = await confirmAsync(
      AUTH_COPY.logoutTitle,
      safe ? AUTH_COPY.logoutMessage : AUTH_COPY.logoutPending,
      safe ? "Sair" : "Sair mesmo assim",
      !safe,
    );
    if (!confirmed || restoring.current) return;
    restoring.current = true;
    await logOutServer(syncRequest);
    await setSession(null);
    lastAccountId.current = null;
    setQuota(null);
    await swapAll(null, "Você saiu da conta.");
  }, [flushNow, setSession, swapAll, syncRequest]);
  const accountChangePassword = useCallback(
    async (current: string, next: string) => {
      try {
        await changeAccountPassword(syncRequest, current, next);
        notify("Senha trocada. As outras sessões foram encerradas.");
        return true;
      } catch (error) {
        notify(error instanceof Error ? error.message : "Não foi possível trocar a senha.", "error");
        return false;
      }
    },
    [notify, syncRequest],
  );
  const accountDelete = useCallback(
    async (password: string) => {
      if (restoring.current) return false;
      try {
        await deleteServerAccount(syncRequest, password);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Não foi possível excluir a conta.", "error");
        return false;
      }
      restoring.current = true;
      await setSession(null);
      lastAccountId.current = null;
      await swapAll(null, "Conta excluída. Seus dados saíram do servidor e deste aparelho.");
      return true;
    },
    [notify, setSession, swapAll, syncRequest],
  );
  const accountControls = useMemo<AccountControls | null>(
    () =>
      mode === "online" && account
        ? {
            info: account,
            quota,
            refreshQuota,
            logOut: accountLogOut,
            changePassword: accountChangePassword,
            deleteAccount: accountDelete,
          }
        : null,
    [mode, account, quota, refreshQuota, accountLogOut, accountChangePassword, accountDelete],
  );

  const restore = useCallback<AppContextValue["restore"]>(
    async (backup, expectedRevision, message = "Backup restaurado. IA e lembretes permanecem desativados.") => {
      if (restoring.current) return false;
      cancelAi();
      const pending = commit((current) => {
        if (current.revision !== expectedRevision)
          throw new Error(
            "Os dados mudaram. Confira o backup novamente antes de restaurar.",
          );
        return prepareRestore(backup, current);
      });
      restoring.current = true;
      setIsRestoring(true);
      try {
        const saved = await pending;
        if (!saved) return false;
        // Invalida callbacks da árvore anterior antes de liberar novas gravações.
        dataEpochRef.current += 1;
        setDataEpoch(dataEpochRef.current);
        clearDiet();
        setPopup(null);
        setEditingMeal(null);
        setMealPreset(null);
        setEditingInjection(null);
        setQuickOpen(false);
        seenReminders.current = null;
        setDate(localDate());
        router.replace(backup.profile ? "/" : "/anamnese");
        notify(message);
        return true;
      } finally {
        restoring.current = false;
        setIsRestoring(false);
      }
    },
    [cancelAi, clearDiet, commit, notify, router],
  );
  useEffect(() => {
    restoreRef.current = restore;
  }, [restore]);

  const unread = useMemo(
    () =>
      state ? notificationsFor(state, clock).filter((n) => !n.read).length : 0,
    [state, clock],
  );

  const value = useMemo<AppContextValue | null>(
    () =>
      state
        ? {
            state,
            dataEpoch,
            date,
            setDate,
            clock,
            unread,
            commit,
            notify,
            editingMeal,
            editMeal,
            mealPreset,
            editingInjection,
            openInjection,
            injectionView,
            askAgent,
            agentDraft,
            clearAgentDraft,
            isQuickOpen,
            setQuickOpen,
            reset,
            restore,
            sync,
            account: accountControls,
            aiReady,
            refreshAgent: checkAgent,
            aiBusy,
            aiStage,
            aiProviders,
            aiRequest,
            cancelAi,
            apiUrl,
            updateApiUrl,
            apiError,
            discoverServer,
            showPopup,
            analyzeExam,
            analyzingExamId,
            examUrgent,
            requestDietPlan,
            dietBusy,
            dietSaving,
            dietError,
            dietProgress,
            setToastBottom,
          }
        : null,
    [
      state,
      dataEpoch,
      date,
      clock,
      unread,
      commit,
      notify,
      editingMeal,
      editMeal,
      mealPreset,
      editingInjection,
      openInjection,
      injectionView,
      askAgent,
      agentDraft,
      clearAgentDraft,
      isQuickOpen,
      reset,
      restore,
      sync,
      accountControls,
      aiReady,
      aiBusy,
      aiStage,
      aiProviders,
      aiRequest,
      cancelAi,
      apiUrl,
      updateApiUrl,
      apiError,
      discoverServer,
      showPopup,
      analyzeExam,
      analyzingExamId,
      examUrgent,
      requestDietPlan,
      dietBusy,
      dietSaving,
      dietError,
      dietProgress,
    ],
  );

  if (loadError)
    return (
      <LoadErrorScreen
        message={loadError}
        onError={setLoadError}
        onCleared={() => {
          setLoadError("");
          const next = initialState();
          stateRef.current = next;
          setState(next);
        }}
      />
    );

  // O esqueleto também espera saber se o servidor é online: sem isso, os dados apareceriam antes da entrada.
  if (!value || mode === null) return <BootSkeleton />;
  if (mode === "online" && !account)
    return (
      <AuthScreen
        request={syncRequest}
        onSignedIn={signIn}
        notice={sessionEnded ? AUTH_COPY.sessionEnded : undefined}
      />
    );

  return (
    <AppContext.Provider value={value}>
      {children}
      <Popup popup={isRestoring ? null : popup} onClose={closePopup} />
      {toast && !isRestoring && (
        <Toast
          message={toast}
          onClose={closeToast}
          bottom={toastBottom ?? TAB_BAR_SPACE - 24 + insets.bottom}
        />
      )}
      {/* A pilha de navegação permanece montada enquanto os dados são substituídos. */}
      <RestoringOverlay visible={isRestoring} />
    </AppContext.Provider>
  );
}
