import { createContext, useContext } from "react";
import type {
  AppState,
  ScreenType,
  DiaryEntry,
  AgentReply,
  InjectionEntry,
  MealItem,
  ToastAction,
  ToastMessage,
  ToastNote,
  ConfirmOptions,
} from "../types";
import type { AgentProgress } from "./agent-stream";
import type { AiProviders } from "./agent-presentation";
import type { ServerSyncControls } from "./server-sync";
import type { AccountControls } from "./account";
/** Atalho que abre uma refeição nova já com o tipo (ex.: "+ Jantar") ou a foto do prato. */
export interface MealPresetInput {
  category?: string;
  photo?: File;
  /** Itens sugeridos (plano, opção do chat) já no prato; a pessoa confere e salva. */
  items?: MealItem[];
  /** Aviso mostrado e anunciado ao abrir (ex.: itens não encontrados na TACO). */
  note?: string;
  /** Pede a análise da foto assim que ela carregar (atalho "+ → Foto do prato" do chat). */
  analyze?: boolean;
}
/** "form" abre direto a calculadora; "auto" mostra a dose de sempre quando houver. */
export type InjectionView = "auto" | "form";
export type EspacoTab = "perfil" | "documentos" | "preferencias";
/** Seção da Despensa aberta por um atalho (Hoje "Receitas com eles", Dieta "Ver lista"): o cartão recebe o foco. */
export type DespensaSection = "usar_primeiro" | "compras";
export interface MealPreset extends MealPresetInput {
  /** Muda a cada atalho para a tela recomeçar com o preset novo. */
  id: string;
}
export interface AppContextValue {
  state: AppState;
  date: string;
  setDate: (date: string) => void;
  navigate: (screen: ScreenType) => void;
  /** Salva a mudança; a mensagem vira aviso, opcionalmente com uma ação como "Desfazer". */
  commit: (
    update: (state: AppState) => AppState,
    message?: string,
    action?: ToastAction,
  ) => Promise<boolean>;
  notify: (
    message: string | ToastNote,
    type?: ToastMessage["type"],
    action?: ToastAction,
  ) => void;
  /** Abre a tela de refeição; numa nova, o preset já escolhe o tipo ou anexa a foto do prato. */
  editMeal: (entry: DiaryEntry | null, preset?: MealPresetInput) => void;
  editingMeal: DiaryEntry | null;
  /** Tipo ou foto escolhidos antes de abrir uma refeição nova (null na edição ou sem atalho). */
  mealPreset: MealPreset | null;
  /** Abre a calculadora de seringa e dose, vazia ou para editar uma aplicação. */
  openInjection: (entry: InjectionEntry | null, view?: InjectionView) => void;
  editingInjection: InjectionEntry | null;
  injectionView: InjectionView;
  /** Abre Meu espaço numa aba (ex.: "+ → Exame" do chat abre Documentos). */
  openEspaco: (tab: EspacoTab) => void;
  espacoTab: EspacoTab | null;
  clearEspacoTab: () => void;
  /** Abre a Despensa numa seção ("Use primeiro" ou "Lista de compras"). */
  openDespensa: (section: DespensaSection) => void;
  despensaSection: DespensaSection | null;
  clearDespensaSection: () => void;
  /** Abre a anamnese só numa seção (hub "Seu perfil de saúde"); perfil novo segue o fluxo linear. */
  openAnamneseSection: (step: number) => void;
  anamneseSection: number | null;
  clearAnamneseSection: () => void;
  /** A tela aberta assume o "Voltar" do cabeçalho (ex.: o editor de seção pede para descartar); null devolve o padrão. */
  setBackGuard: (guard: (() => void) | null) => void;
  reset: () => Promise<void>;
  restore: (backup: AppState, expectedRevision: number) => Promise<boolean>;
  /** Cópia no servidor (PostgreSQL), opcional e desligada por padrão. */
  sync: ServerSyncControls;
  /** Conta do servidor online (VPS); null no modo local. */
  account: AccountControls | null;
  aiReady: boolean;
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
  ) => Promise<AgentReply>;
  aiBusy: boolean;
  /** Etapa real do grafo durante a solicitação atual (null antes da 1ª etapa ou sem stream). */
  aiStage: AgentProgress | null;
  /** Provedores configurados no servidor (para explicar quem processa o pedido). */
  aiProviders: AiProviders | null;
  cancelAi: () => void;
  /** Pergunta na folha de confirmação do app (só para o irreversível); resolve true ao confirmar. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Abre o chat do agente com uma pergunta já escrita (a pessoa revisa antes de enviar). */
  askAgent: (prompt: string) => void;
  agentDraft: string;
  clearAgentDraft: () => void;
  /** Analisa um exame salvo pelo fluxo seguro; o estado vive no app e sobrevive à troca de tela. */
  analyzeExam: (id: string) => Promise<void>;
  analyzingExamId: string | null;
  /** Alertas urgentes recebidos na análise de exames, por id do exame (nunca salvos como análise). */
  examUrgent: Record<string, string>;
  /** Gera e salva a dieta usando as respostas atuais da anamnese. */
  requestDietPlan: (examIds?: string[]) => Promise<boolean>;
  dietProgress: string;
  dietBusy: boolean;
  dietSaving: boolean;
  dietError: string;
}
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("Contexto WebFit ausente.");
  return context;
}
