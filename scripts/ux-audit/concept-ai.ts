// Respostas da IA já salvas para as capturas dos conceitos (nenhuma chamada ao modelo): dieta
// estruturada (DietPlanV2), blocos do chat, receitas v2 com ids da despensa e exame estruturado.
import {
  chatSectionsSchema,
  renderChatSections,
  SECTION_LABEL,
  type ChatSection,
} from "../../src/lib/agent-blocks";
import { DIET_PLAN_REQUEST } from "../../src/lib/diet";
import { dietPlanV2Schema, type DietPlanV2 } from "../../src/lib/diet-plan";
import { uid } from "../../src/lib/domain";
import { examResultSchema } from "../../src/lib/exam-result";
import {
  recipeSetSchema,
  type AgentMeta,
  type ChatMessage,
  type PantryItem,
  type RecipeSet,
} from "../../src/types";
import { CONCEPT_DAY, iso } from "./concept-clock";

export const META: AgentMeta = {
  specialists: ["nutricionista"],
  reviewed: true,
  revisions: 0,
  urgency: "nenhuma",
  notes: [],
  llmCalls: 3,
};

/**
 * Dieta estruturada do conceito "Minha dieta": 5 refeições com horário, porções caseiras e trocas.
 * Nomes que a TACO reconhece ("Torrada", "Maçã", "Omelete de queijo", "Café coado") no lugar de
 * "Torrada integral", "Fruta pequena", "Omelete de legumes" e "Café sem açúcar": sem eles a
 * cobertura fica abaixo de 70% e o app não mostra a estimativa da refeição.
 */
export const DIET: DietPlanV2 = dietPlanV2Schema.parse({
  resumo: {
    destaques: [
      "Cerca de 1.645 kcal por dia para chegar a 66 kg com calma, com proteína em todas as refeições.",
      "Sem amendoim e sem camarão; preparos de até 30 minutos.",
    ],
  },
  refeicoes: [
    {
      slot: "cafe_da_manha",
      horario: "07:30",
      itens: [
        { alimento: "Pão de forma integral", medidaCaseira: "2 fatias", gramas: 50, trocas: ["Tapioca (2 colheres de sopa de goma)", "Cuscuz (3 colheres de sopa)"] },
        { alimento: "Ovo cozido", medidaCaseira: "2 unidades", gramas: 100, trocas: ["Queijo minas frescal (2 fatias)"] },
        { alimento: "Café coado", medidaCaseira: "1 xícara, sem açúcar", gramas: 50, trocas: [] },
        { alimento: "Mamão formosa", medidaCaseira: "1 fatia", gramas: 150, trocas: ["Banana prata (1 unidade)"] },
      ],
    },
    {
      slot: "lanche_da_manha",
      horario: "10:00",
      itens: [
        { alimento: "Iogurte natural", medidaCaseira: "1 pote", gramas: 170, trocas: ["Leite (1 copo)"] },
        { alimento: "Aveia em flocos", medidaCaseira: "1 colher de sopa", gramas: 15, trocas: [] },
      ],
    },
    {
      slot: "almoco",
      horario: "12:30",
      itens: [
        { alimento: "Arroz integral", medidaCaseira: "4 colheres de sopa", gramas: 100, trocas: ["Batata-doce (3 colheres de sopa)", "Mandioca cozida"] },
        { alimento: "Feijão carioca", medidaCaseira: "1 concha", gramas: 100, trocas: ["Lentilha (1 concha)"] },
        { alimento: "Frango grelhado", medidaCaseira: "1 filé", gramas: 120, trocas: ["Peixe grelhado", "Carne magra"] },
        { alimento: "Salada de folhas", medidaCaseira: "à vontade", gramas: null, trocas: [] },
      ],
    },
    {
      slot: "lanche_da_tarde",
      horario: "16:00",
      itens: [
        { alimento: "Queijo branco", medidaCaseira: "1 fatia", gramas: 30, trocas: [] },
        { alimento: "Torrada", medidaCaseira: "1 unidade", gramas: 10, trocas: ["Biscoito de arroz (2 unidades)"] },
        { alimento: "Maçã", medidaCaseira: "1 unidade pequena", gramas: 100, trocas: ["Pera", "Banana prata"] },
      ],
    },
    {
      slot: "jantar",
      horario: "19:30",
      itens: [
        { alimento: "Omelete de queijo", medidaCaseira: "2 ovos", gramas: 100, trocas: ["Peixe grelhado (100 g)"] },
        { alimento: "Salada de legumes cozida no vapor", medidaCaseira: "à vontade", gramas: 150, trocas: [] },
        { alimento: "Batata-doce", medidaCaseira: "2 colheres de sopa", gramas: 80, trocas: ["Arroz integral (2 colheres de sopa)"] },
      ],
    },
  ],
  dicas: [
    "Cozinhe proteína para 2 dias no domingo e na quarta.",
    "Beba 2,5 L de água ao longo do dia; deixe uma garrafa na mesa.",
    "Use primeiro o espinafre e o frango da despensa.",
    "Leia os rótulos: evite produtos com amendoim ou traços.",
  ],
  perguntas: [],
});

const WEEK_QUESTION = "Como foi minha semana de alimentação?";
const DINNER_QUESTION = "Pode me sugerir algo prático para o jantar que não use ovos?";

/**
 * Resumo da semana (ontem, 21:40), como no conceito 05: "Boa semana!" vira o título do cartão da
 * semana (semana_7d, desenhado com os registros locais) e o combinado e a sugestão viram os chips.
 */
const WEEK_SECTIONS: ChatSection[] = chatSectionsSchema.parse([
  {
    papel: "nutricionista",
    blocos: [
      { tipo: "texto", texto: "Boa semana!" },
      { tipo: "grafico", metrica: "semana_7d" },
    ],
  },
  {
    papel: "rotina",
    blocos: [
      { tipo: "acao", acao: "criar_habito", titulo: "Garrafa de 1 L", horario: "15:00" },
      { tipo: "sugestoes", itens: ["Ovos ou iogurte no café", "Como manter a caminhada?"] },
    ],
  },
]);

/**
 * Três jantares rápidos sem ovos (hoje, 18:12): cartões selecionáveis e respostas rápidas. Todos os
 * itens têm alimento na TACO, então kcal e proteína saem sem "≈".
 */
const DINNER_SECTIONS: ChatSection[] = chatSectionsSchema.parse([
  {
    papel: null,
    blocos: [
      { tipo: "texto", texto: "Separei 3 jantares rápidos, prontos em até 20 min." },
      {
        tipo: "opcoes_refeicao",
        titulo: "Jantares rápidos",
        refeicao: "Jantar",
        opcoes: [
          {
            nome: "Wrap de frango",
            emoji: "🌯",
            minutos: 15,
            itens: [
              { alimento: "Pão integral", medidaCaseira: "1 unidade, aberto como wrap", gramas: 50 },
              { alimento: "Frango cozido", medidaCaseira: "4 colheres de sopa, desfiado", gramas: 100 },
              { alimento: "Alface", medidaCaseira: "3 folhas", gramas: 30 },
              { alimento: "Iogurte natural", medidaCaseira: "2 colheres de sopa", gramas: 40 },
            ],
          },
          {
            nome: "Peixe na frigideira",
            emoji: "🐟",
            minutos: 20,
            itens: [
              { alimento: "Merluza", medidaCaseira: "1 filé", gramas: 120 },
              { alimento: "Brócolis", medidaCaseira: "1 xícara", gramas: 90 },
              { alimento: "Batata-doce", medidaCaseira: "2 colheres de sopa", gramas: 80 },
            ],
          },
          {
            nome: "Bowl de grão-de-bico",
            emoji: "🥗",
            minutos: 10,
            itens: [
              { alimento: "Grão-de-bico", medidaCaseira: "1/2 xícara, cozido", gramas: 40 },
              { alimento: "Tomate", medidaCaseira: "1 unidade", gramas: 100 },
              { alimento: "Queijo branco", medidaCaseira: "1 fatia", gramas: 30 },
              { alimento: "Pepino", medidaCaseira: "1/2 unidade", gramas: 50 },
            ],
          },
        ],
      },
      { tipo: "sugestoes", itens: ["Receita do wrap", "Usar o espinafre que vence"] },
    ],
  },
]);

export function messages(dietText: string, dietAt: string): ChatMessage[] {
  const aiText = (sections: ChatSection[]) => renderChatSections(sections, SECTION_LABEL);
  return [
    { id: uid(), sender: "user", text: WEEK_QUESTION, timestamp: iso("2026-09-23", "21:39"), status: "sent" },
    {
      id: uid(),
      sender: "ai",
      text: aiText(WEEK_SECTIONS),
      timestamp: iso("2026-09-23", "21:40"),
      status: "sent",
      meta: { ...META, specialists: ["nutricionista", "rotina"] },
      blocks: WEEK_SECTIONS,
    },
    // A dieta de hoje entra na conversa como o app grava ("Você pediu uma nova dieta" + cartão).
    { id: uid(), sender: "user", text: DIET_PLAN_REQUEST, timestamp: dietAt, status: "sent" },
    { id: uid(), sender: "ai", text: dietText, timestamp: dietAt, status: "sent", meta: META },
    { id: uid(), sender: "user", text: DINNER_QUESTION, timestamp: iso(CONCEPT_DAY, "18:11"), status: "sent" },
    {
      id: uid(),
      sender: "ai",
      text: aiText(DINNER_SECTIONS),
      timestamp: iso(CONCEPT_DAY, "18:12"),
      status: "sent",
      meta: META,
      blocks: DINNER_SECTIONS,
    },
  ];
}

/** Receitas v2 com ids reais da despensa: "8 de 9 ingredientes em casa" e "Falta: alecrim". */
export function recipeSet(items: readonly PantryItem[]): RecipeSet {
  const home = (name: string, quantidade: string) => {
    const found = items.find((i) => i.name === name);
    if (!found) throw new Error(`Item da despensa ausente: ${name}`);
    return { pantryItemId: found.id, nome: found.name, quantidade };
  };
  return recipeSetSchema.parse({
    version: 2,
    receitas: [
      {
        nome: "Frango ao forno com legumes",
        refeicao: "Almoço",
        porcoes: 3,
        tempoMin: 35,
        compatibilidade: "Usa o frango que vence em 3 dias; proteína magra e legumes, como no almoço da sua dieta.",
        ingredientesCasa: [
          home("Peito de frango", "400 g"),
          home("Cenoura", "2 unidades"),
          home("Abobrinha", "1 unidade"),
        ],
        basicos: [
          { basico: "sal", quantidade: "a gosto" },
          { basico: "azeite", quantidade: "2 colheres de sopa" },
          { basico: "alho", quantidade: "2 dentes" },
          { basico: "limao", quantidade: "1 unidade" },
          { basico: "pimenta", quantidade: "a gosto" },
        ],
        faltaComprar: [{ nome: "Alecrim (opcional)", quantidade: "1 ramo" }],
        passos: [
          { texto: "Tempere o frango com alho, limão, sal e pimenta.", timerMin: 10, temperaturaC: null },
          { texto: "Corte a cenoura e a abobrinha em cubos e regue com o azeite.", timerMin: null, temperaturaC: null },
          { texto: "Asse tudo na mesma forma, virando na metade do tempo.", timerMin: 25, temperaturaC: 200 },
        ],
        porcao: "Sirva 1 porção e complete o prato com salada.",
      },
      {
        nome: "Omelete de forno com espinafre",
        refeicao: "Jantar",
        porcoes: 2,
        tempoMin: 20,
        compatibilidade: "Usa o espinafre que vence em 2 dias; ovos e folhas, como no jantar leve da sua dieta.",
        ingredientesCasa: [
          home("Ovos", "4 unidades"),
          home("Espinafre", "1 pacote"),
          home("Queijo branco", "50 g"),
        ],
        basicos: [
          { basico: "sal", quantidade: null },
          { basico: "pimenta", quantidade: null },
        ],
        faltaComprar: [],
        passos: [
          { texto: "Bata os ovos com uma pitada de sal e pimenta.", timerMin: null, temperaturaC: null },
          { texto: "Misture o espinafre picado e o queijo.", timerMin: null, temperaturaC: null },
          { texto: "Asse em forma untada.", timerMin: 15, temperaturaC: 180 },
        ],
        porcao: "Sirva metade da omelete com legumes cozidos.",
      },
    ],
    perguntas: [],
  });
}

export const EXAM_RESULT = examResultSchema.parse({
  data: "2026-09-10",
  resultados: [
    { grupo: "Glicemia", nome: "Glicose em jejum", valor: "92", unidade: "mg/dL", referencia: "70 a 99", marcacao: null },
    { grupo: "Glicemia", nome: "Hemoglobina glicada (HbA1c)", valor: "5,4", unidade: "%", referencia: "Até 5,6", marcacao: null },
    { grupo: "Lipídios", nome: "Colesterol total", valor: "182", unidade: "mg/dL", referencia: "< 190", marcacao: null },
    { grupo: "Lipídios", nome: "LDL", valor: "112", unidade: "mg/dL", referencia: "< 130", marcacao: null },
    { grupo: "Lipídios", nome: "HDL", valor: "54", unidade: "mg/dL", referencia: "> 40", marcacao: null },
    { grupo: "Lipídios", nome: "Triglicerídeos", valor: "98", unidade: "mg/dL", referencia: "< 150", marcacao: null },
    { grupo: "Tireoide", nome: "TSH", valor: "2,1", unidade: "µUI/mL", referencia: "0,4 a 4,0", marcacao: null },
    { grupo: "Vitaminas", nome: "Vitamina D (25-OH)", valor: "24", unidade: "ng/mL", referencia: "20 a 60", marcacao: null },
  ],
  ilegiveis: [],
  perguntas: ["A vitamina D está adequada para o meu caso?"],
  observacoes: [],
});
export const EXAM_PDF = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n% exame sintético\n%%EOF\n").toString("base64")}`;
