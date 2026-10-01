/**
 * Textos do "Relatório para consulta" (ESPACO-08), à parte do modelo (report.ts): quem só mostra o
 * botão (Evolução) não carrega o modelo nem o desenho do relatório antes de ele abrir.
 */
export const REPORT_COPY = {
  title: "Relatório para consulta",
  intro:
    "Monte um resumo para levar à consulta. Ele é montado neste aparelho e não passa pela IA.",
  period: "Período do relatório",
  sections: "O que entra",
  questions: "Suas perguntas (uma por linha)",
  print: "Imprimir ou salvar PDF",
  share: "Compartilhar relatório",
  shareHint: "O arquivo abre no navegador; de lá você imprime ou salva em PDF.",
  shared: "Relatório pronto para compartilhar.",
  shareFailed: "Não foi possível abrir o compartilhamento neste aparelho.",
  unavailable: "Sem registros no período",
  hiddenNote: "Inclui os números do corpo que você ocultou nas telas.",
  noQuestions: "Nenhuma pergunta anotada.",
} as const;
