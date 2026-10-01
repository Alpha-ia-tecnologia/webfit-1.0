import {
  renderChatSections,
  renderChatText,
  type ChatOutput,
  type ChatRole,
  type ChatSection,
} from "../src/lib/agent-blocks";
import {
  renderDietText,
  sanitizeDietPlan,
  type DietPlanV2,
} from "../src/lib/diet-plan";
import { renderExamText, type ExamResult } from "../src/lib/exam-result";
import { renderMealText, type MealText } from "../src/lib/meal-text";
import { renderPhotoText, type PlatePhoto } from "../src/lib/plate-photo";
import type { AgentReply } from "../src/types";

/**
 * Respostas estruturadas de exemplo (SIS-02, AGENTE-02, DIARIO-04), compartilhadas pelos testes
 * de unidade, pelo E2E web e pela checagem do app nativo. Só importa módulos folha de src/lib.
 * Os textos são sempre a renderização determinística, como o servidor entrega.
 */

export const REPLY_META: AgentReply["meta"] = {
  specialists: ["nutricionista"],
  reviewed: true,
  revisions: 0,
  urgency: "nenhuma",
  notes: [],
  llmCalls: 3,
};
/** Títulos das seções no texto salvo (os do servidor, SPECIALIST_TITLES). */
export const SERVER_SECTION_TITLES: Record<ChatRole, string> = {
  nutricionista: "Alimentação e hidratação",
  rotina: "Rotina, sono e hábitos",
  analista_exames: "Sobre os exames",
};

const TEXT_BLOCK = {
  tipo: "texto",
  texto: "Aqui vão duas ideias de jantar rápidas, com o que costuma ter em casa.",
} as const;
const DINNER_OPTIONS = {
  tipo: "opcoes_refeicao",
  titulo: null,
  refeicao: "Jantar",
  opcoes: [
    {
      nome: "Frango com arroz e salada",
      emoji: "🍗",
      minutos: 20,
      itens: [
        { alimento: "frango grelhado", medidaCaseira: "1 filé", gramas: 100 },
        { alimento: "arroz cozido", medidaCaseira: "4 colheres de sopa", gramas: 100 },
        { alimento: "alface", medidaCaseira: "3 folhas", gramas: 30 },
      ],
    },
    {
      nome: "Cuscuz com ovo",
      emoji: "🍳",
      minutos: 15,
      itens: [
        { alimento: "cuscuz", medidaCaseira: "1 pedaço médio", gramas: 120 },
        { alimento: "ovo cozido", medidaCaseira: "1 unidade", gramas: 50 },
      ],
    },
  ],
} as const;
const WATER_CHART = { tipo: "grafico", metrica: "agua_7d" } as const;
const WATER_HABIT = {
  tipo: "acao",
  acao: "criar_habito",
  titulo: "Beber água ao acordar",
  horario: "07:00",
} as const;
const SUGGESTIONS = ["Quero ideias de lanche", "Como organizar o almoço?"];

/** Saída do modelo no esquema "chat_blocos" (antes da limpeza por papel). */
export const CHAT_OUTPUT: ChatOutput = {
  blocos: [
    TEXT_BLOCK,
    {
      ...DINNER_OPTIONS,
      opcoes: DINNER_OPTIONS.opcoes.map((o) => ({ ...o, itens: [...o.itens] })),
    },
    WATER_CHART,
    WATER_HABIT,
    { tipo: "sugestoes", itens: SUGGESTIONS },
  ],
};

const chatReply = (sections: ChatSection[], text: string): AgentReply => ({
  text,
  meta: REPLY_META,
  structured: { kind: "chat", sections },
});

export const CHAT_REPLY: AgentReply = chatReply(
  [{ papel: null, blocos: CHAT_OUTPUT.blocos }],
  renderChatText(CHAT_OUTPUT.blocos),
);

/**
 * Resposta que vazou o que um perfil sensível não pode ver (servidor antigo ou falha): gráfico de
 * peso, combinado "Pesar-se toda manhã" e a sugestão "Como perder peso rápido?". Duas seções,
 * porque cada seção tem no máximo 6 blocos.
 */
const LEAK_SECTIONS: ChatSection[] = [
  {
    papel: "nutricionista",
    blocos: [
      TEXT_BLOCK,
      CHAT_OUTPUT.blocos[1],
      WATER_CHART,
      { tipo: "grafico", metrica: "peso_8s" },
      { tipo: "sugestoes", itens: [...SUGGESTIONS, "Como perder peso rápido?"] },
    ],
  },
  {
    papel: "rotina",
    blocos: [
      { tipo: "texto", texto: "Combinados curtos ajudam a manter a rotina." },
      WATER_HABIT,
      { tipo: "acao", acao: "criar_habito", titulo: "Pesar-se toda manhã", horario: "07:00" },
    ],
  },
];
export const CHAT_REPLY_SENSITIVE_LEAK: AgentReply = chatReply(
  LEAK_SECTIONS,
  renderChatSections(LEAK_SECTIONS, SERVER_SECTION_TITLES),
);

const KCAL_BLOCKS: ChatOutput["blocos"] = [
  { tipo: "texto", texto: "Um lanche de cerca de 500 kcal pode juntar fruta e iogurte." },
  {
    tipo: "opcoes_refeicao",
    titulo: null,
    refeicao: "Lanche",
    opcoes: [
      {
        nome: "Prato de 500 kcal",
        emoji: "🍌",
        minutos: 5,
        itens: [
          { alimento: "banana prata", medidaCaseira: "1 unidade", gramas: 70 },
          { alimento: "iogurte natural", medidaCaseira: "1 pote", gramas: 170 },
        ],
      },
    ],
  },
];
/** Calorias no texto e no nome da opção: com hideCalories, a tela precisa ocultar as duas. */
export const CHAT_REPLY_KCAL: AgentReply = chatReply(
  [{ papel: null, blocos: KCAL_BLOCKS }],
  renderChatText(KCAL_BLOCKS),
);

/** Blocos com tipo desconhecido: agentReplySchema descarta `structured` e a tela mostra o texto. */
export const CHAT_REPLY_INVALID = {
  text: "Resposta em texto porque os blocos vieram num formato desconhecido.",
  meta: REPLY_META,
  structured: {
    kind: "chat",
    sections: [{ papel: null, blocos: [{ tipo: "foo", texto: "x" }] }],
  },
} as const;

export const DIET_PLAN_V2: DietPlanV2 = {
  resumo: {
    destaques: [
      "Plano para manter o peso com refeições simples e até 30 minutos de preparo.",
      "Respeita sua alergia e os alimentos que você evita.",
    ],
  },
  refeicoes: [
    {
      slot: "cafe_da_manha",
      horario: "07:30",
      itens: [
        { alimento: "pão francês", medidaCaseira: "1 unidade", gramas: 50, trocas: [] },
        { alimento: "ovo cozido", medidaCaseira: "1 unidade", gramas: 50, trocas: [] },
        { alimento: "café com leite", medidaCaseira: "1 xícara", gramas: 150, trocas: [] },
      ],
    },
    {
      slot: "almoco",
      horario: "12:00",
      itens: [
        {
          alimento: "arroz branco cozido",
          medidaCaseira: "4 colheres de sopa",
          gramas: 100,
          trocas: ["arroz integral cozido", "batata cozida"],
        },
        {
          alimento: "feijão carioca cozido",
          medidaCaseira: "1 concha",
          gramas: 100,
          trocas: ["lentilha cozida"],
        },
        { alimento: "frango grelhado", medidaCaseira: "1 filé", gramas: 100, trocas: [] },
        { alimento: "alface", medidaCaseira: "3 folhas", gramas: 30, trocas: [] },
      ],
    },
    {
      slot: "lanche_da_tarde",
      horario: "16:00",
      itens: [
        { alimento: "banana prata", medidaCaseira: "1 unidade", gramas: 70, trocas: [] },
        { alimento: "iogurte natural", medidaCaseira: "1 pote", gramas: 170, trocas: [] },
      ],
    },
    {
      slot: "jantar",
      horario: "19:30",
      itens: [
        { alimento: "homus caseiro", medidaCaseira: "2 colheres de sopa", gramas: 60, trocas: [] },
        { alimento: "tomate", medidaCaseira: "3 fatias", gramas: 45, trocas: [] },
      ],
    },
  ],
  dicas: [
    "Cozinhe o feijão da semana de uma vez e congele em porções.",
    "Deixe frutas lavadas à vista para os lanches.",
  ],
  perguntas: ["Você costuma almoçar em casa ou fora nos dias de trabalho?"],
};

export const DIET_REPLY_META: AgentReply["meta"] = { ...REPLY_META, llmCalls: 2 };
const dietReply = (plan: DietPlanV2): AgentReply => ({
  text: renderDietText(plan),
  meta: DIET_REPLY_META,
  structured: { kind: "diet", plan },
});
export const DIET_REPLY: AgentReply = dietReply(DIET_PLAN_V2);
export const DIET_PLAN_V2_SENSITIVE: DietPlanV2 = sanitizeDietPlan(DIET_PLAN_V2, {
  sensitive: true,
});
export const DIET_REPLY_SENSITIVE: AgentReply = dietReply(DIET_PLAN_V2_SENSITIVE);
export const DIET_PLAN_V2_KCAL: DietPlanV2 = {
  ...DIET_PLAN_V2,
  dicas: [DIET_PLAN_V2.dicas[0]!, "Evite passar de 500 kcal no lanche"],
};
export const DIET_REPLY_KCAL: AgentReply = dietReply(DIET_PLAN_V2_KCAL);

export const PHOTO_DRAFT: PlatePhoto = {
  items: [
    {
      name: "Arroz branco",
      searchTerms: ["arroz branco cozido"],
      confidence: "high",
      allergyMatch: false,
    },
    {
      name: "Feijão",
      searchTerms: ["feijão carioca cozido"],
      confidence: "medium",
      allergyMatch: false,
    },
    {
      name: "Paçoca",
      searchTerms: ["paçoca de amendoim"],
      confidence: "low",
      allergyMatch: false,
    },
  ],
  uncertainties: ["A foto não mostra se há molho ou tempero no feijão."],
};
export const PHOTO_REPLY: AgentReply = {
  text: renderPhotoText(PHOTO_DRAFT),
  meta: { ...REPLY_META, llmCalls: 2 },
  structured: { kind: "photo", draft: PHOTO_DRAFT },
};

/** Descrição de refeição (DIARIO-07): o texto que a pessoa escreveu ou ditou e o rascunho do modelo. */
export const MEAL_TEXT_SOURCE =
  "Almocei 4 colheres de arroz, duas conchas de feijão, frango grelhado e uma paçoca de sobremesa.";
/** Frango sem porção dita ("Falta porção"); paçoca coincide com a alergia a amendoim. */
export const MEAL_TEXT_DRAFT: MealText = {
  items: [
    {
      name: "Arroz branco",
      searchTerms: ["arroz tipo 1 cozido"],
      quantityText: "4 colheres",
      quantity: 4,
      unit: "colher-sopa",
      allergyMatch: false,
    },
    {
      name: "Feijão",
      searchTerms: ["feijão carioca cozido"],
      quantityText: "duas conchas",
      quantity: 2,
      unit: "concha",
      allergyMatch: false,
    },
    {
      name: "Frango grelhado",
      searchTerms: ["frango grelhado"],
      quantityText: null,
      quantity: null,
      unit: null,
      allergyMatch: false,
    },
    {
      name: "Paçoca",
      searchTerms: ["paçoca amendoim"],
      quantityText: "uma paçoca",
      quantity: 1,
      unit: "unidade",
      allergyMatch: true,
    },
  ],
  uncertainties: ["Não ficou claro se o frango tinha molho."],
};
export const MEAL_TEXT_REPLY: AgentReply = {
  text: renderMealText(MEAL_TEXT_DRAFT),
  meta: { ...REPLY_META, specialists: ["nutricionista"], reviewed: true },
  structured: { kind: "meal_text", draft: MEAL_TEXT_DRAFT },
};

/**
 * Laudo transcrito (ESPACO-05): referência simples com marca do laboratório (Glicose), só teto
 * (HbA1c), só piso (HDL), faixa por meta que fica só em texto (Triglicerídeos) e um resultado
 * sem grupo nem número (Vitamina D).
 */
export const EXAM_RESULT: ExamResult = {
  data: "2026-08-10",
  resultados: [
    {
      grupo: "Bioquímica",
      nome: "Glicose",
      valor: "102",
      unidade: "mg/dL",
      referencia: "70 a 99 mg/dL",
      marcacao: "H",
    },
    {
      grupo: "Bioquímica",
      nome: "Hemoglobina glicada",
      valor: "5,4",
      unidade: "%",
      referencia: "< 5,7",
      marcacao: null,
    },
    {
      grupo: "Lipídios",
      nome: "Colesterol HDL",
      valor: "52",
      unidade: "mg/dL",
      referencia: "> 40 mg/dL",
      marcacao: null,
    },
    {
      grupo: "Lipídios",
      nome: "Triglicerídeos",
      valor: "140",
      unidade: "mg/dL",
      referencia: "Desejável: < 150",
      marcacao: null,
    },
    {
      grupo: null,
      nome: "Vitamina D",
      valor: "Ver laudo anexo",
      unidade: null,
      referencia: null,
      marcacao: null,
    },
  ],
  ilegiveis: ["Rodapé da página 2, coberto por um carimbo"],
  perguntas: [
    "O valor de glicose pede repetir o exame?",
    "Com que frequência devo refazer estes exames?",
  ],
  observacoes: ["Leitura feita a partir de uma foto inclinada do laudo."],
};
export const EXAM_REPLY_META: AgentReply["meta"] = {
  ...REPLY_META,
  specialists: ["analista_exames"],
  notes: [
    "Transcrição automática do laudo: confira cada valor com o documento original e discuta a interpretação com um profissional.",
  ],
  llmCalls: 2,
};
export const EXAM_REPLY: AgentReply = {
  text: renderExamText(EXAM_RESULT),
  meta: EXAM_REPLY_META,
  structured: { kind: "exam", result: EXAM_RESULT },
};
/** Alerta de segurança: o app mostra o texto e nunca salva como análise (ExamUrgentError). */
export const EXAM_URGENT_REPLY: AgentReply = {
  text: "Procure atendimento de urgência agora. Ligue 192 (SAMU) se os sintomas forem graves.",
  meta: { ...EXAM_REPLY_META, urgency: "imediata", specialists: [], reviewed: false, notes: [] },
};
