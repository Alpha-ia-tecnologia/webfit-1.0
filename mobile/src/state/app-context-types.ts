import type { AiProviders } from "@shared/lib/agent-presentation";
import type { AgentProgress } from "@shared/lib/agent-stream";
import type { DiscoveryOutcome } from "@shared/lib/server-discovery";
import type {
  AgentReply,
  AppState,
  DiaryEntry,
  InjectionEntry,
  MealItem,
  ToastAction,
  ToastMessage,
  ToastNote,
} from "@shared/types";
import type { PopupContent } from "@/components/ui/popup";
import type { AgentStatus } from "@/lib/api";

/** Atalho que abre uma refeição nova já com o tipo (ex.: "+ Jantar") ou a foto do prato. */
export interface MealPresetInput {
  category?: string;
  /** Foto já escolhida e reduzida (data URL), com as mesmas regras do anexo da tela de refeição. */
  photo?: string;
  /** Itens sugeridos (plano, opção do chat) já no prato; a pessoa confere e salva. */
  items?: MealItem[];
  /** Aviso mostrado e anunciado ao abrir (ex.: itens não encontrados na TACO). */
  note?: string;
  /** Pede a análise da foto assim que ela carregar (atalho "+ → Foto do prato" do chat). */
  analyze?: boolean;
}
/** "form" abre direto a calculadora; "auto" mostra a dose de sempre quando houver. */
export type InjectionView = "auto" | "form";
export interface MealPreset extends MealPresetInput {
  /** Muda a cada atalho para a tela recomeçar com o preset novo. */
  id: string;
}

export interface AppContextValue {
  state: AppState;
  dataEpoch: number;
  /** Data selecionada no Diário (AAAA-MM-DD). */
  date: string;
  setDate: (date: string) => void;
  /** Relógio atualizado a cada 30 s (lembretes e virada do dia). */
  clock: Date;
  unread: number;
  /** Grava o estado; `action` vira um botão no aviso (ex.: "Desfazer"), só quando há `message`. */
  commit: (
    update: (state: AppState) => AppState,
    message?: string,
    action?: ToastAction,
  ) => Promise<boolean>;
  /** Aviso temporário; com `ToastNote`, o texto pode levar o mini anel de progresso (água, combinados). */
  notify: (
    message: string | ToastNote,
    type?: ToastMessage["type"],
    action?: ToastAction,
  ) => void;
  /** Abre o agente com a pergunta pronta na caixa de mensagem (a pessoa revisa antes de enviar). */
  askAgent: (prompt: string) => void;
  /** Pergunta pendente vinda de outra tela; o agente a copia para a caixa uma vez e a limpa. */
  agentDraft: string;
  clearAgentDraft: () => void;
  editingMeal: DiaryEntry | null;
  /** Abre a tela de refeição; numa nova, o preset já escolhe o tipo ou anexa a foto do prato. */
  editMeal: (entry: DiaryEntry | null, preset?: MealPresetInput) => void;
  /** Tipo ou foto escolhidos antes de abrir uma refeição nova (null na edição ou sem atalho). */
  mealPreset: MealPreset | null;
  editingInjection: InjectionEntry | null;
  openInjection: (entry: InjectionEntry | null, view?: InjectionView) => void;
  injectionView: InjectionView;
  isQuickOpen: boolean;
  setQuickOpen: (open: boolean) => void;
  reset: () => Promise<void>;
  restore: (backup: AppState, expectedRevision: number) => Promise<boolean>;
  aiReady: boolean;
  /** Atualiza a conexão antes de tentar novamente, sem esperar a consulta periódica. */
  refreshAgent: () => Promise<AgentStatus>;
  aiBusy: boolean;
  /** Etapa real do grafo durante a solicitação atual (null antes da 1ª etapa ou sem stream). */
  aiStage: AgentProgress | null;
  /** Provedores configurados no servidor (para explicar quem processa o pedido). */
  aiProviders: AiProviders | null;
  aiRequest: (
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
    examIds?: string[],
  ) => Promise<AgentReply>;
  cancelAi: () => void;
  /** Endereço do servidor do agente em uso (configurável em Meu espaço). */
  apiUrl: string;
  /** Grava um novo endereço, testa a conexão e atualiza o estado do agente. */
  updateApiUrl: (url: string) => Promise<AgentStatus>;
  /** Mensagem da última falha ao consultar o servidor; null quando conectado. */
  apiError: string | null;
  /**
   * Procura o servidor na rede do aparelho; grava e testa o endereço encontrado. Um conhecido entra sozinho;
   * um achado só na varredura da sub-rede pede confirmação ("declined" quando a pessoa recusa).
   */
  discoverServer: () => Promise<DiscoveryOutcome>;
  /** Abre o pop-up central (incentivos, alertas, resumo do agente). */
  showPopup: (popup: PopupContent) => void;
  /** Analisa um exame salvo pelo fluxo seguro; o estado vive no app e sobrevive à troca de tela. */
  analyzeExam: (id: string) => Promise<void>;
  analyzingExamId: string | null;
  /** Alertas urgentes recebidos na análise de exames, por id do exame (nunca salvos como análise). */
  examUrgent: Record<string, string>;
  /** Gera e salva a dieta a partir da anamnese atual. */
  requestDietPlan: (examIds?: string[]) => Promise<boolean>;
  dietProgress: string;
  /**
   * Distância do aviso até a base da tela enquanto uma tela tem uma barra fixa própria
   * (ex.: a bandeja de "Registrar refeição"); null volta à posição acima da barra inferior.
   */
  setToastBottom: (bottom: number | null) => void;
  dietBusy: boolean;
  dietSaving: boolean;
  dietError: string | null;
}
