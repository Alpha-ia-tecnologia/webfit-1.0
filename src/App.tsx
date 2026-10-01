import { prepareRestore } from "./lib/backup";
import { analyzeExams, ExamUrgentError } from "./lib/exams";
import { fmtShortDate } from "./lib/format";
import { agentRequestContext } from "./lib/pantry";
import { Modal } from "./components/UI";
import { ConfirmSheet, type ConfirmOptions } from "./components/ConfirmSheet";
import { encouragementFor } from "./lib/today";
import {
  createDietPlan,
  dietProfileSignature,
  DIET_PLAN_REQUEST,
} from "./lib/diet";
import { visiblePlainText } from "./lib/text";
/** Pop-up central de incentivo após registro. */
type PopupInfo = {
  title: string;
  text: string;
  percent?: number | null;
  action?: { label: string; onClick: () => void };
};
import { useState, useEffect, useRef, useCallback, Suspense, type ReactNode } from "react";
import { ArrowLeft, Bell, ChevronLeft } from "lucide-react";
import {
  agentReplySchema,
  type AppState,
  type ScreenType,
  type DiaryEntry,
  type InjectionEntry,
  type ToastAction,
  type ToastMessage,
  type ToastNote,
} from "./types";

import { CLIENT_TIMEOUT_MS } from "./lib/limits";
import type { AiProviders } from "./lib/agent-presentation";
import {
  AGENT_OFFLINE,
  AGENT_UNAVAILABLE,
  NDJSON_TYPE,
  parseJsonSafe,
  readAgentStream,
  type AgentProgress,
} from "./lib/agent-stream";
import {
  initialState,
  localDate,
  notificationsFor,
  uid,
} from "./lib/domain";
import { longDate } from "./lib/today";
import { evolutionSubtitle } from "./lib/evolution";
import { DESPENSA_TITLE, EVOLUCAO_TITLE } from "./lib/copy";
import {
  loadState,
  saveState,
  clearState,
  readRaw,
  downloadJson,
} from "./lib/storage";
import { LAUNCH_PARAM, launchShortcut } from "./lib/shortcuts";
import {
  AppContext,
  type DespensaSection,
  type EspacoTab,
  type InjectionView,
  type MealPreset,
  type MealPresetInput,
} from "./lib/context";
import { Brand, Card } from "./components/UI";
import { BottomNav } from "./components/BottomNav";
import { WeekStrip } from "./components/hoje/WeekStrip";
import { DatePickerButton } from "./components/DatePickerButton";
import {
  HeaderSlotsContext,
  mergeHeaderOptions,
  sameOptions,
  type HeaderOptions,
  type HeaderSlotsValue,
} from "./components/HeaderPortal";
import { Toast } from "./components/Toast";
import { SkeletonCard } from "./components/Skeleton";
import { QuickLogSheet } from "./components/QuickLogSheet";
// Antes das telas: fixa a ordem do CSS igual à de antes do carregamento sob demanda.
import "./components/screen-styles";
import { ScreenHoje } from "./components/ScreenHoje";
import { ScreenDiario } from "./components/ScreenDiario";
import { ScreenBoundary, ScreenFallback } from "./components/LazyScreen";
import { lazyScreen, whenIdle } from "./lib/lazy-screen";

// O primeiro desenho leva só o Hoje, o Diário e a moldura do app; as demais telas (e as
// bibliotecas que só elas usam) chegam sob demanda, com esqueleto enquanto carregam.
const Onboarding = lazyScreen(() => import("./components/OnboardingEntry"), (m) => m.OnboardingEntry);
const Agente = lazyScreen(() => import("./components/ScreenAgente"), (m) => m.ScreenAgente);
const Dieta = lazyScreen(() => import("./components/ScreenDieta"), (m) => m.ScreenDieta);
const Despensa = lazyScreen(() => import("./components/ScreenDespensa"), (m) => m.ScreenDespensa);
const Evolucao = lazyScreen(() => import("./components/ScreenEvolucao"), (m) => m.ScreenEvolucao);
const Espaco = lazyScreen(() => import("./components/ScreenEspaco"), (m) => m.ScreenEspaco);
const AdicionarRefeicao = lazyScreen(
  () => import("./components/ScreenAdicionarRefeicao"),
  (m) => m.ScreenAdicionarRefeicao,
);
const Notificacoes = lazyScreen(
  () => import("./components/ScreenNotificacoes"),
  (m) => m.ScreenNotificacoes,
);
const Injecao = lazyScreen(() => import("./components/injecao/ScreenInjecao"), (m) => m.ScreenInjecao);
/** A um toque de distância (barra inferior e "+ refeição"): aquecidas quando o navegador fica ocioso. */
const WARM_SCREENS = [Agente, Evolucao, Espaco, AdicionarRefeicao];

/** Título e subtítulo exibidos no cabeçalho fixo de cada tela (o Diário mostra a data). */
const SCREEN_TITLES: Record<ScreenType, string> = {
  hoje: "Hoje",
  diario: "Meu diário",
  agente: "Meu agente",
  dieta: "Minha dieta",
  despensa: DESPENSA_TITLE,
  evolucao: EVOLUCAO_TITLE,
  espaco: "Meu espaço",
  adicionar_refeicao: "Registrar refeição",
  notificacoes: "Lembretes",
  anamnese: "Anamnese",
  injecao: "Seringa e dose",
};
/** Abas da barra inferior: título grande e sem "voltar". As demais telas são empilhadas. */
const ROOT_SCREENS = new Set<ScreenType>([
  "hoje",
  "diario",
  "agente",
  "evolucao",
  "espaco",
]);
/** Telas em que o sino sai do cabeçalho: o Diário leva busca e calendário, a Seringa leva o (i). */
const BELL_HIDDEN = new Set<ScreenType>(["diario", "injecao", "notificacoes"]);
type HeaderOwners = Record<string, HeaderOptions & { hasCenter?: boolean }>;
const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("") || "?";

export default function App() {
  const [dataEpoch, setDataEpoch] = useState(0);
  const dataEpochRef = useRef(0);
  const restoring = useRef(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [state, setState] = useState<AppState | null>(null),
    [loadError, setLoadError] = useState(""),
    [screen, setScreen] = useState<ScreenType>("hoje"),
    [date, setDate] = useState(localDate()),
    [quick, setQuick] = useState(false),
    [quickView, setQuickView] = useState<"grid" | "agua">("grid"),
    [isScrolled, setScrolled] = useState(false),
    [agentDraft, setAgentDraft] = useState(""),
    [toast, setToast] = useState<ToastMessage | null>(null),
    [editingMeal, setEditingMeal] = useState<DiaryEntry | null>(null),
    [mealPreset, setMealPreset] = useState<MealPreset | null>(null),
    [editingInjection, setEditingInjection] = useState<InjectionEntry | null>(
      null,
    ),
    [injectionView, setInjectionView] = useState<InjectionView>("auto"),
    [espacoTab, setEspacoTab] = useState<EspacoTab | null>(null),
    [despensaSection, setDespensaSection] = useState<DespensaSection | null>(null),
    [anamneseSection, setAnamneseSection] = useState<number | null>(null),
    [aiReady, setAiReady] = useState(false),
    [aiBusy, setAiBusy] = useState(false),
    [aiStage, setAiStage] = useState<AgentProgress | null>(null),
    [aiProviders, setAiProviders] = useState<AiProviders | null>(null);
  const [clock, setClock] = useState(new Date());
  // Espaços do cabeçalho que as telas preenchem (HeaderPortal) e as opções que elas pedem.
  const [leadSlot, setLeadSlot] = useState<HTMLElement | null>(null);
  const [centerSlot, setCenterSlot] = useState<HTMLElement | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const [headerOwners, setHeaderOwners] = useState<HeaderOwners>({});
  const setHeaderOptions = useCallback<HeaderSlotsValue["setOptions"]>((owner, options) => {
    setHeaderOwners((current) => {
      if (options === null) {
        if (!(owner in current)) return current;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- tira a chave; só o resto importa
        const { [owner]: _removed, ...rest } = current;
        return rest;
      }
      return sameOptions(current[owner], options) ? current : { ...current, [owner]: options };
    });
  }, []);
  const [popup, setPopup] = useState<PopupInfo | null>(null);
  const [dietBusy, setDietBusy] = useState(false);
  const [dietSaving, setDietSaving] = useState(false);
  const [dietError, setDietError] = useState("");
  const [dietProgress, setDietProgress] = useState("");
  const dietExamIds = useRef<string[]>([]);
  const dietRun = useRef<{ saving: boolean } | null>(null);
  const examRun = useRef<object | null>(null);
  const [analyzingExamId, setAnalyzingExamId] = useState<string | null>(null);
  const [examUrgent, setExamUrgent] = useState<Record<string, string>>({});
  const closePopup = useCallback(() => setPopup(null), []);
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(
    null,
  );
  const confirmResolver = useRef<((confirmed: boolean) => void) | null>(null);
  /** Folha de confirmação do app (só para o irreversível); uma nova pergunta cancela a anterior. */
  const confirm = useCallback((options: ConfirmOptions) => {
    confirmResolver.current?.(false);
    setConfirmOptions(options);
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
    });
  }, []);
  const closeConfirm = useCallback((confirmed: boolean) => {
    const resolve = confirmResolver.current;
    confirmResolver.current = null;
    setConfirmOptions(null);
    resolve?.(confirmed);
  }, []);
  const confirmSheet = confirmOptions && (
    <ConfirmSheet options={confirmOptions} onClose={closeConfirm} />
  );
  const stateRef = useRef<AppState | null>(null),
    queue = useRef<Promise<unknown>>(Promise.resolve()),
    request = useRef<AbortController | null>(null),
    token = useRef(""),
    todayRef = useRef(localDate());
  const notify = useCallback(
    (
      message: string | ToastNote,
      type: ToastMessage["type"] = "success",
      action?: ToastAction,
    ) => {
      const note = typeof message === "string" ? { text: message } : message;
      setToast({ id: uid(), message: note.text, type, action, progress: note.progress });
    },
    [],
  );
  // O título grande das abas encolhe quando a página rola.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    let alive = true;
    loadState()
      .then((value) => {
        if (alive) {
          const next = value ?? initialState();
          stateRef.current = next;
          setState(next);
        }
      })
      .catch(() => {
        if (alive)
          setLoadError(
            "Não foi possível abrir os dados salvos. Eles foram preservados; você pode exportar uma cópia para recuperação.",
          );
      });
    return () => {
      alive = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    const check = () =>
      fetch("/api/status")
        .then((r) => r.json())
        .then((s) => {
          setAiReady(s.ready === true);
          const p = s.providers;
          setAiProviders(
            p && typeof p.deepseek === "boolean" && typeof p.openai === "boolean"
              ? { deepseek: p.deepseek, openai: p.openai }
              : null,
          );
          token.current = typeof s.token === "string" ? s.token : "";
        })
        .catch(() => {
          setAiReady(false);
          setAiProviders(null);
        });
    void check();
    const timer = setInterval(check, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      setClock(new Date());
      const today = localDate();
      if (todayRef.current !== today) {
        const previousDay = todayRef.current;
        setDate((current) => (current === previousDay ? today : current));
        todayRef.current = today;
      }
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  const hasProfile = !!state?.profile;
  // Depois do primeiro desenho, sem disputar com ele: trocar de aba não pisca o esqueleto.
  useEffect(() => {
    if (!hasProfile) return;
    return whenIdle(() => WARM_SCREENS.forEach((screen) => screen.preload()));
  }, [hasProfile]);
  const commit = useCallback(
    (
      update: (state: AppState) => AppState,
      message?: string,
      action?: ToastAction,
    ): Promise<boolean> => {
      if (restoring.current || dataEpoch !== dataEpochRef.current)
        return Promise.resolve(false);
      const task = queue.current
        .catch(() => undefined)
        .then(async () => {
          try {
            if (dataEpoch !== dataEpochRef.current) return false;
            const current = stateRef.current;
            if (!current) return false;
            const updated = update(current);
            // Nada mudou (ex.: limite da lista recusado, desfazer já aplicado): sem gravar nem revisão.
            if (updated === current) {
              if (message) notify(message, "success", action);
              return true;
            }
            const next = {
              ...updated,
              revision: current.revision + 1,
              updatedAt: new Date().toISOString(),
            };
            await saveState(next);
            stateRef.current = next;
            setState(next);
            const cheer = encouragementFor(current, next);
            // Mini anel só para água e combinados: refeições dariam uma pista de calorias.
            const progress =
              cheer && cheer.kind !== "meal" && cheer.percent !== null
                ? { percent: cheer.percent, tone: cheer.kind }
                : undefined;
            if (message) notify({ text: message, progress }, "success", action);
            else if (cheer) notify({ text: cheer.title, progress });
            return true;
          } catch (error) {
            // A validação do esquema (zod) não tem frase para pessoas: vira a mensagem genérica.
            notify(
              error instanceof Error && error.name !== "ZodError"
                ? error.message
                : "Não foi possível salvar.",
              "error",
            );
            return false;
          }
        });
      queue.current = task;
      return task;
    },
    [notify, dataEpoch],
  );
  const navigate = useCallback((next: ScreenType) => {
    setScreen(next);
    setQuick(false);
    // O Hoje mostra sempre o dia de hoje: voltar a ele descarta o dia aberto no Diário.
    if (next === "hoje") setDate(localDate());
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const editMeal = (entry: DiaryEntry | null, preset?: MealPresetInput) => {
    setEditingMeal(entry);
    setMealPreset(!entry && preset ? { ...preset, id: uid() } : null);
    navigate("adicionar_refeicao");
  };
  const openInjection = (entry: InjectionEntry | null, view: InjectionView = "auto") => {
    setEditingInjection(entry);
    setInjectionView(view);
    navigate("injecao");
  };
  const openEspaco = (tab: EspacoTab) => {
    setEspacoTab(tab);
    navigate("espaco");
  };
  const clearEspacoTab = useCallback(() => setEspacoTab(null), []);
  const openDespensa = (section: DespensaSection) => {
    setDespensaSection(section);
    navigate("despensa");
  };
  const clearDespensaSection = useCallback(() => setDespensaSection(null), []);
  // Atalhos do app instalado (manifest, HOJE-13): abrem a confirmação uma vez, nunca registram sozinhos.
  // Valem só na primeira carga: sem perfil (anamnese por fazer) o atalho é descartado, não adiado.
  const launchHandled = useRef(false);
  const isLoaded = state !== null;
  useEffect(() => {
    if (!isLoaded || launchHandled.current) return;
    launchHandled.current = true;
    const search = window.location.search;
    const shortcut = hasProfile ? launchShortcut(search) : null;
    if (new URLSearchParams(search).has(LAUNCH_PARAM))
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    if (shortcut === "refeicao") editMeal(null);
    else if (shortcut) {
      setQuickView(shortcut === "agua" ? "agua" : "grid");
      setQuickAnchor(null);
      setQuick(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez, quando o estado salvo carrega
  }, [isLoaded]);
  const openAnamneseSection = (step: number) => {
    setAnamneseSection(step);
    navigate("anamnese");
  };
  const clearAnamneseSection = useCallback(() => setAnamneseSection(null), []);
  const backGuard = useRef<(() => void) | null>(null);
  const setBackGuard = useCallback((guard: (() => void) | null) => {
    backGuard.current = guard;
  }, []);
  const cancelAi = useCallback(() => {
    examRun.current = null;
    setAnalyzingExamId(null);
    if (dietRun.current && !dietRun.current.saving) {
      dietRun.current = null;
      setDietBusy(false);
      setDietError("Geração cancelada. Você pode tentar novamente.");
    }
    request.current?.abort();
    request.current = null;
    setAiBusy(false);
    setAiStage(null);
  }, []);
  const closeQuick = useCallback(() => {
    setQuick(false);
    setQuickView("grid");
  }, []);
  /** Botão que abriu o registro rápido: no desktop, o popover nasce ao lado dele. */
  const [quickAnchor, setQuickAnchor] = useState<HTMLElement | null>(null);
  const toggleQuick = useCallback((trigger: HTMLElement) => {
    setQuickView("grid");
    setQuickAnchor(trigger);
    setQuick((open) => !open);
  }, []);
  const reset = async () => {
    if (restoring.current || dataEpoch !== dataEpochRef.current) return;
    restoring.current = true;
    setIsRestoring(true);
    try {
      cancelAi();
      dietRun.current = null;
      setDietBusy(false);
      setDietSaving(false);
      setDietError("");
      setPopup(null);
      dietExamIds.current = [];
      setDietProgress("");
      await queue.current;
      await clearState();
      const next = initialState();
      stateRef.current = next;
      setDataEpoch(++dataEpochRef.current);
      setState(next);
      setScreen("hoje");
      setQuick(false);
      setEditingMeal(null);
      setMealPreset(null);
      setEditingInjection(null);
      setInjectionView("auto");
      setEspacoTab(null);
      setDespensaSection(null);
      setAnamneseSection(null);
      setDate(localDate());
      notify("Dados locais excluídos.");
    } finally {
      restoring.current = false;
      setIsRestoring(false);
    }
  };
  const restore = async (backup: AppState, expectedRevision: number) => {
    if (restoring.current || dataEpoch !== dataEpochRef.current) return false;
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
      if (!(await pending)) return false;
      setDataEpoch(++dataEpochRef.current);
      dietRun.current = null;
      dietExamIds.current = [];
      setDietBusy(false);
      setDietSaving(false);
      setDietError("");
      setDietProgress("");
      setPopup(null);
      setEditingMeal(null);
      setMealPreset(null);
      setEditingInjection(null);
      setInjectionView("auto");
      setEspacoTab(null);
      setDespensaSection(null);
      setAnamneseSection(null);
      setQuick(false);
      setDate(localDate());
      navigate("hoje");
      notify("Backup restaurado. IA e lembretes permanecem desativados.");
      return true;
    } finally {
      restoring.current = false;
      setIsRestoring(false);
    }
  };
  const aiRequest = async (
    mode:
      | "chat"
      | "photo"
      | "exam"
      | "diet"
      | "pantry_photo"
      | "shopping_photo"
      | "recipe"
      | "rotulo"
      | "meal_text",
    text: string,
    file?: string,
    location?: "despensa" | "geladeira",
    examIds: string[] = [],
  ) => {
    const current = stateRef.current;
    if (!current?.profile?.consentAi)
      throw new Error("Autorize o uso de contexto pela IA em Meu espaço.");
    if (!aiReady)
      throw new Error(
        "O agente ainda não está conectado. Seus registros continuam disponíveis.",
      );
    if (request.current)
      throw new Error("Aguarde a solicitação atual ou cancele-a.");
    const controller = new AbortController();
    request.current = controller;
    setAiBusy(true);
    setAiStage(null);
    const timeout = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    // Fotos de despensa não passam pelo grafo; as demais respostas chegam em etapas.
    const staged = mode !== "pantry_photo" && mode !== "shopping_photo";
    // Sem rede ou servidor fora do ar; o cancelamento é trocado no catch abaixo.
    const offline = (): never => {
      throw new Error(AGENT_OFFLINE);
    };
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: staged ? `${NDJSON_TYPE}, application/json` : "application/json",
          "X-WebFit-Token": token.current,
        },
        body: JSON.stringify({
          mode,
          text,
          file,
          consent: true,
          context: {
            ...agentRequestContext(current, mode, location),
            ...(mode === "diet" && examIds.length
              ? {
                  examAnalyses: current.exams
                    .filter((exam) => examIds.includes(exam.id))
                    .map(({ name, date, analysis }) => ({
                      name,
                      date,
                      analysis,
                    })),
                }
              : {}),
          },
          history: ([
            "diet",
            "recipe",
            "pantry_photo",
            "shopping_photo",
            "rotulo",
            "meal_text",
          ].includes(mode)
            ? []
            : current.messages
          )
            .filter((m) => m.status !== "error")
            .slice(-16)
            .map(({ sender, text }) => ({ sender, text })),
        }),
        signal: controller.signal,
      }).catch(offline);
      const streamed =
        response.ok &&
        !!response.body &&
        (response.headers.get("content-type") ?? "").includes(NDJSON_TYPE);
      // Corpo que não é JSON (página de proxy, outro serviço na porta) vira null, sem SyntaxError cru.
      const data = streamed
        ? await readAgentStream(response.body!, (progress) => {
            if (request.current === controller) setAiStage(progress);
          })
        : parseJsonSafe(await response.text().catch(offline));
      if (!response.ok) {
        const error = (data as { error?: unknown } | null)?.error;
        throw new Error(
          (typeof error === "string" && error) || AGENT_UNAVAILABLE,
        );
      }
      if (!stateRef.current?.profile?.consentAi || controller.signal.aborted)
        throw new Error("Solicitação cancelada.");
      const reply = agentReplySchema.safeParse(data);
      if (!reply.success)
        throw new Error("Resposta do servidor em formato inesperado.");
      return reply.data;
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error(
          "Solicitação cancelada ou tempo de resposta excedido. Você pode tentar novamente.",
        );
      throw error;
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setAiBusy(false);
        setAiStage(null);
      }
    }
  };
  const askAgent = (prompt: string) => {
    setAgentDraft(prompt);
    navigate("agente");
  };
  const clearAgentDraft = useCallback(() => setAgentDraft(""), []);
  /** Análise de exame fora da dieta; o alerta urgente também vira aviso global, visível em qualquer tela. */
  const analyzeExam = async (id: string): Promise<void> => {
    if (examRun.current) return;
    const run = {};
    examRun.current = run;
    setAnalyzingExamId(id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- tira a chave do objeto; só o resto importa
    setExamUrgent(({ [id]: _previous, ...rest }) => rest);
    try {
      await analyzeExams({
        ids: [id],
        getState: () => stateRef.current,
        isCurrent: () => examRun.current === run,
        request: aiRequest,
        commit: (update) => commit(update, "Análise salva."),
        progress: () => undefined,
        onReply: (reply) => {
          if (reply.meta.notes.length)
            notify(reply.meta.notes.join(" "), "info");
        },
      });
    } catch (error) {
      if (error instanceof ExamUrgentError) {
        setExamUrgent((current) => ({ ...current, [id]: error.message }));
        notify(error.message, "warning");
      } else if (examRun.current === run)
        notify(
          error instanceof Error
            ? error.message
            : "Não foi possível analisar o exame.",
          "warning",
        );
    } finally {
      if (examRun.current === run) {
        examRun.current = null;
        setAnalyzingExamId(null);
      }
    }
  };
  const requestDietPlan = async (examIds?: string[]): Promise<boolean> => {
    if (dietRun.current) return false;
    const current = stateRef.current;
    if (!current?.profile) return false;
    const profile = current.profile;
    const signature = dietProfileSignature(profile);
    if (examIds !== undefined) dietExamIds.current = [...examIds];
    const selectedExams = [...dietExamIds.current];
    const run = { saving: false };
    dietRun.current = run;
    setDietBusy(true);
    setDietError("");
    try {
      setDietProgress("");
      if (selectedExams.length) {
        await analyzeExams({
          ids: selectedExams,
          getState: () => stateRef.current,
          isCurrent: () => dietRun.current === run,
          request: aiRequest,
          commit,
          progress: setDietProgress,
        });
        if (dietRun.current !== run) return false;
        setDietProgress("");
      }
      const selectedSnapshot = JSON.stringify(
        stateRef.current?.exams.filter((e) => selectedExams.includes(e.id)),
      );
      const reply = await aiRequest(
        "diet",
        DIET_PLAN_REQUEST,
        undefined,
        undefined,
        selectedExams,
      );
      if (dietRun.current !== run) return false;
      const plan = createDietPlan(reply, profile);
      // A transação local já iniciada termina antes de outras alterações na fila.
      // O cancelamento é oferecido durante a geração, antes desta fase final.
      run.saving = true;
      setDietSaving(true);
      const saved = await commit((s) => {
        if (
          dietRun.current !== run ||
          s.userId !== current.userId ||
          !s.profile?.consentAi ||
          dietProfileSignature(s.profile) !== signature ||
          JSON.stringify(
            s.exams.filter((e) => selectedExams.includes(e.id)),
          ) !== selectedSnapshot
        ) {
          throw new Error(
            "Sua anamnese ou seus exames mudaram durante a geração. Gere uma nova dieta com os dados atuais.",
          );
        }
        return {
          ...s,
          dietPlan: plan,
          messages: [
            ...s.messages.slice(-1998),
            {
              id: uid(),
              sender: "user",
              text: DIET_PLAN_REQUEST,
              timestamp: plan.createdAt,
              status: "sent",
            },
            {
              id: uid(),
              sender: "ai",
              text: plan.text,
              meta: plan.meta,
              timestamp: plan.createdAt,
              status: "sent",
            },
          ],
        };
      });
      if (!saved)
        throw new Error(
          "Não foi possível salvar a dieta. Confira os dados e tente novamente.",
        );
      if (dietRun.current === run)
        notify("Sua dieta personalizada está pronta e foi salva.");
      return true;
    } catch (error) {
      if (dietRun.current === run) {
        setDietError(
          visiblePlainText(
            error instanceof Error
              ? error.message
              : "Não foi possível gerar sua dieta. Tente novamente.",
            stateRef.current?.profile?.hideCalories ?? true,
          ),
        );
      }
      return false;
    } finally {
      if (dietRun.current === run) {
        dietRun.current = null;
        setDietBusy(false);
        setDietSaving(false);
      }
    }
  };

  if (loadError)
    return (
      <main className="recovery">
        <Brand />
        <Card>
          <h1>Seus dados precisam de atenção</h1>
          <p role="alert">{loadError}</p>
          <button
            className="btn"
            onClick={async () => {
              try {
                downloadJson(await readRaw(), "webfit-recuperacao.json");
              } catch {
                setLoadError(
                  "O navegador bloqueou a leitura. Tente reabrir no mesmo perfil.",
                );
              }
            }}
          >
            Exportar cópia para recuperação
          </button>
          <button className="btn-secondary" onClick={() => location.reload()}>
            Tentar novamente
          </button>
          <button
            className="text-btn danger"
            onClick={async () => {
              if (
                await confirm({
                  title: "Excluir dados deste navegador?",
                  message:
                    "Os dados locais serão apagados e o app recomeça do zero. Esta ação não pode ser desfeita.",
                  confirmLabel: "Excluir e recomeçar",
                  tone: "danger",
                })
              ) {
                await clearState();
                location.reload();
              }
            }}
          >
            Excluir dados e recomeçar
          </button>
        </Card>
        {confirmSheet}
      </main>
    );
  if (!state)
    return (
      <main className="app-skeleton" aria-busy="true">
        <Brand />
        <p role="status" className="sr-only">
          Abrindo seu espaço…
        </p>
        <SkeletonCard rows={1} />
        <SkeletonCard chart />
        <SkeletonCard rows={3} />
      </main>
    );
  if (isRestoring)
    return (
      <main className="recovery">
        <Brand />
        <p role="status">Atualizando seus dados…</p>
      </main>
    );
  const onboarding = !state.profile;
  const unread = notificationsFor(state, clock).filter((n) => !n.read).length;
  const firstName = state.profile?.name.trim().split(/\s+/)[0] ?? "";
  const today = localDate();
  const todayLabel = fmtShortDate(today);
  const isRoot = ROOT_SCREENS.has(screen);
  const headerTitle =
    screen === "adicionar_refeicao"
      ? editingMeal
        ? "Editar refeição"
        : "Registrar refeição"
      : screen === "injecao" && editingInjection
        ? "Editar aplicação"
        : SCREEN_TITLES[screen];
  const headerState = mergeHeaderOptions(headerOwners);
  const headerKicker = screen === "diario" ? longDate(date) : "";
  const headerSubtitle =
    screen === "evolucao" ? evolutionSubtitle(state, today) : (headerState.subtitle ?? "");
  const showBell = !headerState.hideBell && !BELL_HIDDEN.has(screen);
  const headerSlots: HeaderSlotsValue = {
    nodes: { lead: leadSlot, center: centerSlot, actions: actionsSlot },
    setOptions: setHeaderOptions,
  };
  const bell = (
    <button
      className="icon-btn notification-btn"
      aria-label={`Notificações${unread ? `, ${unread} não lidas` : ""}`}
      onClick={() => navigate("notificacoes")}
    >
      <Bell size={20} />
      {unread > 0 && <span className="notification-dot" />}
    </button>
  );
  /** Direita do cabeçalho: ações da tela (HeaderPortal), as do App e o sino. */
  const headerActions = (appActions?: ReactNode) => (
    <div className="header-actions">
      <span className="header-slot" ref={setActionsSlot} />
      {appActions}
      {showBell && bell}
    </div>
  );
  const context = {
    state,
    date,
    setDate,
    navigate,
    commit,
    notify,
    editingMeal,
    editMeal,
    mealPreset,
    editingInjection,
    openInjection,
    injectionView,
    openEspaco,
    espacoTab,
    clearEspacoTab,
    openDespensa,
    despensaSection,
    clearDespensaSection,
    openAnamneseSection,
    anamneseSection,
    clearAnamneseSection,
    setBackGuard,
    reset,
    restore,
    aiReady,
    aiRequest,
    aiBusy,
    aiStage,
    aiProviders,
    cancelAi,
    askAgent,
    confirm,
    agentDraft,
    clearAgentDraft,
    analyzeExam,
    analyzingExamId,
    examUrgent,
    requestDietPlan,
    dietBusy,
    dietSaving,
    dietError,
    dietProgress,
  };
  return (
    <AppContext.Provider value={context}>
      <HeaderSlotsContext.Provider value={headerSlots}>
        <div className={onboarding ? "onboarding-shell" : "app-shell"}>
          <header
            className={[
              "app-header",
              state.profile ? (isRoot ? "is-root" : "is-stacked") : "",
              state.profile && screen === "hoje" ? "is-home" : "",
              screen === "anamnese" ? "is-anamnese" : "",
              headerState.align === "start" ? "is-align-start" : "",
              // Pílula no centro (Registrar refeição, conceito 02): voltar e ações redondos, com a seta "←".
              headerState.hasCenter ? "has-center" : "",
              isScrolled ? "is-scrolled" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {!state.profile ? (
              <Brand />
            ) : screen === "hoje" ? (
              <>
                <div className="header-user">
                  <button
                    type="button"
                    className="avatar-ring"
                    aria-label="Meu perfil"
                    onClick={() => navigate("espaco")}
                  >
                    <span aria-hidden="true">
                      {initialsOf(state.profile.name)}
                    </span>
                  </button>
                  <div className="header-copy">
                    <span className="header-kicker">{todayLabel}</span>
                    <h1 className="header-name">Olá, {firstName}.</h1>
                  </div>
                </div>
                {headerActions()}
              </>
            ) : isRoot ? (
              <>
                <div className="header-main">
                  <span className="header-lead" ref={setLeadSlot} />
                  <div className="header-large">
                    {headerKicker && (
                      <span className="header-kicker">{headerKicker}</span>
                    )}
                    <h1 className="header-title-large">{headerTitle}</h1>
                    {headerSubtitle && (
                      <span className="header-subtitle">{headerSubtitle}</span>
                    )}
                  </div>
                </div>
                {headerActions(
                  screen === "diario" && (
                    <DatePickerButton
                      value={date}
                      max={today}
                      onChange={setDate}
                      inputLabel="Data dos registros"
                    />
                  ),
                )}
                {screen === "diario" && (
                  <div className="header-strip">
                    <WeekStrip
                      value={date}
                      onChange={setDate}
                      isBrowsable
                      variant="dots"
                      showCalendar={false}
                      inputLabel="Data dos registros"
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="icon-btn header-back"
                  aria-label={
                    screen === "anamnese"
                      ? "Voltar para Meu espaço"
                      : "Voltar para Hoje"
                  }
                  onClick={() => {
                    if (backGuard.current) backGuard.current();
                    else navigate(screen === "anamnese" ? "espaco" : "hoje");
                  }}
                >
                  {headerState.hasCenter ? <ArrowLeft size={20} /> : <ChevronLeft size={20} />}
                </button>
                <div className="header-center">
                  <h1
                    className={
                      headerState.hasCenter ? "header-title sr-only" : "header-title"
                    }
                  >
                    {headerTitle}
                  </h1>
                  <span className="header-slot" ref={setCenterSlot} />
                </div>
                {headerActions()}
              </>
            )}
          </header>
          {onboarding || screen === "anamnese" ? (
            <ScreenBoundary key={dataEpoch}>
              <Suspense
                fallback={
                  <div className="app-skeleton">
                    <ScreenFallback />
                  </div>
                }
              >
                <Onboarding.Component />
              </Suspense>
            </ScreenBoundary>
          ) : (
            <div className="app-body">
              <BottomNav
                currentScreen={screen}
                onNavigate={navigate}
                onToggleQuickMenu={toggleQuick}
                isQuickMenuOpen={quick}
              />
              <main id="main-content" className="main-content" key={screen}>
                <ScreenBoundary
                  onHome={screen === "hoje" ? undefined : () => navigate("hoje")}
                >
                  <Suspense fallback={<ScreenFallback />}>
                    {screen === "hoje" ? (
                      <ScreenHoje />
                    ) : screen === "diario" ? (
                      <ScreenDiario />
                    ) : screen === "agente" ? (
                      <Agente.Component />
                    ) : screen === "dieta" ? (
                      <Dieta.Component />
                    ) : screen === "despensa" ? (
                      <Despensa.Component />
                    ) : screen === "evolucao" ? (
                      <Evolucao.Component />
                    ) : screen === "espaco" ? (
                      <Espaco.Component />
                    ) : screen === "adicionar_refeicao" ? (
                      // Trocar de "editar" para "nova" (menu rápido) ou usar outro atalho remonta a tela.
                      <AdicionarRefeicao.Component
                        key={editingMeal?.id ?? mealPreset?.id ?? "nova"}
                      />
                    ) : screen === "injecao" ? (
                      <Injecao.Component
                        key={`${editingInjection?.id ?? "nova"}:${injectionView}`}
                      />
                    ) : (
                      <Notificacoes.Component />
                    )}
                  </Suspense>
                </ScreenBoundary>
              </main>
            </div>
          )}
          {quick && (
            <QuickLogSheet
              anchor={quickAnchor}
              // No Diário, registra no dia aberto; em qualquer outra tela, hoje.
              logDate={screen === "diario" ? date : today}
              onClose={closeQuick}
              initialView={quickView}
            />
          )}
          {toast && <Toast message={toast} onClose={() => setToast(null)} />}
          {confirmSheet}
          {popup && (
            <Modal title={popup.title} onClose={closePopup}>
              <p className="whitespace-pre-wrap">{popup.text}</p>
              {popup.percent !== null && popup.percent !== undefined && (
                <div
                  className="progress"
                  role="progressbar"
                  aria-label="Progresso em relação à meta"
                  aria-valuenow={Math.min(100, Math.round(popup.percent))}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${Math.min(100, popup.percent)}%` }} />
                </div>
              )}
              <div className="form-actions">
                {popup.action && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      closePopup();
                      popup.action?.onClick();
                    }}
                  >
                    {popup.action.label}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closePopup}
                >
                  {popup.action ? "Depois" : "Continuar"}
                </button>
              </div>
            </Modal>
          )}
        </div>
      </HeaderSlotsContext.Provider>
    </AppContext.Provider>
  );
}
