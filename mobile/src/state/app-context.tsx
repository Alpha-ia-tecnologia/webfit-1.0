import { prepareRestore } from "@shared/lib/backup";
import { initialState, localDate, notificationsFor, uid } from "@shared/lib/domain";
import type { DiaryEntry, InjectionEntry, ToastMessage } from "@shared/types";
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
import { clearState } from "@/lib/storage";
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
    aiReady,
    aiProviders,
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
  const reset = useCallback(async () => {
    if (restoring.current || dataEpoch !== dataEpochRef.current) return;
    restoring.current = true;
    setIsRestoring(true);
    cancelAi();
    try {
      clearDiet();
      await queue.current.catch(() => undefined);
      await clearState();
      const next = initialState();
      stateRef.current = next;
      setState(next);
      dataEpochRef.current += 1;
      setDataEpoch(dataEpochRef.current);
      setPopup(null);
      setEditingMeal(null);
      setMealPreset(null);
      setEditingInjection(null);
      setQuickOpen(false);
      seenReminders.current = null;
      setDate(localDate());
      router.replace("/anamnese");
      notify("Dados locais excluídos.");
    } finally {
      restoring.current = false;
      setIsRestoring(false);
    }
  }, [cancelAi, clearDiet, notify, router, dataEpoch]);

  const restore = useCallback<AppContextValue["restore"]>(
    async (backup, expectedRevision) => {
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
        notify("Backup restaurado. IA e lembretes permanecem desativados.");
        return true;
      } finally {
        restoring.current = false;
        setIsRestoring(false);
      }
    },
    [cancelAi, clearDiet, commit, notify, router],
  );

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

  if (!value) return <BootSkeleton />;

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
