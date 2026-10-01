/**
 * Glossário de UI: um nome e um verbo por conceito, o mesmo no web e no app.
 * - A IA é "o agente"; a aba e a conversa se chamam "Meu agente". "IA" fica para
 *   privacidade e provedores (o que é enviado, para quem).
 * - Os compromissos do dia são "combinados" (nos dados: habits).
 * - Peso e medidas corporais se registram com "Registrar medidas".
 * tests/copy.test.ts barra os sinônimos nas telas.
 */
export const COPY = {
  agent: "Meu agente",
  askAgent: "Perguntar ao agente",
  combinados: "Combinados",
  measure: "Registrar medidas",
  measurements: "Medidas",
  quickLog: "Registro rápido",
} as const;

/* Nomes de tela e rótulos renomeados na rodada de fidelidade visual (conceitos 06, 08, 09 e 11).
   Web, app e testes importam daqui para não divergir. */
/** Título da tela da despensa. O atalho "Abrir despensa e receitas" continua com o nome longo. */
export const DESPENSA_TITLE = "Despensa";
/** Título da aba Evolução (antes "Minha evolução"). */
export const EVOLUCAO_TITLE = "Evolução";
/** Botão da última etapa da anamnese (antes "Concluir anamnese e entrar"). */
export const ANAMNESE_FINISH_LABEL = "Começar meu dia";
/** Dicas do painel "Por quê?" de cada etapa da anamnese (conceito 07). */
export const ANAMNESE_ABOUT_TIPS =
  'Toque nas opções para escolher, arraste as réguas para ajustar valores e use "Outros" para escrever algo que não está na lista. Nas perguntas de saúde, você pode escolher "Prefiro não informar".';
/** Terceira aba de Meu espaço: rótulo curto visível e nome acessível que o contém. */
export const SETTINGS_TAB = { label: "Ajustes", ariaLabel: "Ajustes e dados" } as const;
