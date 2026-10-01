import type {
  ChoiceConfig,
  ChoiceIconKey,
  RulerConfig,
} from "../components/anamnese/inputs";

const NONE = (value: string, aliases: string[] = []) => ({
  value,
  none: true,
  icon: "circleSlash" as const,
  aliases: [
    "não",
    "nao",
    "nenhum",
    "nenhuma",
    "não tenho",
    "nao tenho",
    ...aliases,
  ],
});
const PRIVATE = {
  value: "Prefiro não informar",
  // Excludente: marcar limpa as demais, como "Nenhuma".
  none: true,
  icon: "lock" as const,
  aliases: ["prefiro nao informar", "não sei", "nao sei"],
};

/** Campos de texto que viram chips. O texto salvo continua sendo uma frase separada por vírgulas. */
export const CHOICE_FIELDS: Record<string, ChoiceConfig> = {
  occupation: {
    mode: "single",
    options: [
      { value: "Trabalho em escritório", hint: "Muito tempo sentado(a)" },
      { value: "Trabalho em casa", hint: "Home office ou estudo remoto" },
      {
        value: "Trabalho em pé ou em movimento",
        hint: "Comércio, saúde, serviços",
      },
      { value: "Trabalho físico pesado", hint: "Obra, carga, campo" },
      { value: "Turnos ou escalas variáveis", hint: "Noites e plantões" },
      { value: "Estudante" },
      { value: "Cuido da casa e da família" },
      { value: "Aposentado(a)" },
      { value: "Sem ocupação fixa no momento" },
    ],
    otherPlaceholder: "Descreva sua ocupação",
  },
  routine: {
    mode: "multi",
    options: [
      { value: "Acordo cedo" },
      { value: "Durmo tarde" },
      { value: "Dias muito corridos" },
      { value: "Rotina previsível" },
      { value: "Passo muito tempo sentado(a)" },
      { value: "Faço muitas refeições fora" },
      { value: "Cozinho em casa" },
      { value: "Viajo com frequência" },
      { value: "Cuido de crianças ou familiares" },
      { value: "Estudo ou trabalho à noite" },
    ],
    otherPlaceholder: "Conte algo do seu dia que não está na lista",
  },
  measurementMethod: {
    mode: "single",
    options: [
      { value: "Balança em casa", aliases: ["balança e fita em casa"] },
      { value: "Balança de farmácia" },
      { value: "Consultório ou clínica" },
      { value: "Academia" },
      { value: "Bioimpedância" },
      { value: "Estimativa, sem medir recentemente" },
    ],
  },
  // As 8 mais comuns primeiro (ficam à vista), com ícone e texto curto; o valor gravado não muda.
  conditions: {
    mode: "multi",
    options: [
      NONE("Nenhuma", ["sem doenças", "sem condições", "nenhuma condição"]),
      { value: "Hipertensão", icon: "heartPulse" },
      { value: "Ansiedade ou depressão", icon: "brain" },
      { value: "Diabetes tipo 2", icon: "droplet" },
      {
        value: "Síndrome dos ovários policísticos",
        short: "Ovários policísticos",
        icon: "flower",
      },
      {
        value: "Colesterol ou triglicerídeos altos",
        short: "Colesterol alto",
        icon: "testTube",
      },
      { value: "Gastrite ou refluxo", icon: "flame" },
      {
        value: "Pré-diabetes ou resistência à insulina",
        short: "Pré-diabetes",
        icon: "droplets",
      },
      { value: "Hipotireoidismo", icon: "gauge" },
      { value: "Diabetes tipo 1", icon: "droplet" },
      { value: "Hipertireoidismo", icon: "gauge" },
      { value: "Síndrome do intestino irritável", icon: "activity" },
      { value: "Doença renal", icon: "bean" },
      { value: "Doença hepática", icon: "activity" },
      { value: "Anemia", icon: "droplets" },
      PRIVATE,
    ],
    otherLabel: "Outra",
    otherPlaceholder: "Outra condição ou diagnóstico",
  },
  medications: {
    mode: "multi",
    options: [
      NONE("Não uso medicamentos", ["não uso", "nao uso"]),
      { value: "Anti-hipertensivo" },
      { value: "Metformina ou outro para diabetes" },
      { value: "Insulina" },
      { value: "Levotiroxina (tireoide)" },
      { value: "Anticoncepcional" },
      { value: "Antidepressivo ou ansiolítico" },
      { value: "Anti-inflamatório frequente" },
      { value: "Corticoide" },
      { value: "Medicamento para emagrecer" },
      PRIVATE,
    ],
    otherPlaceholder: "Nome, dose e frequência, se souber",
  },
  weightLossPenName: {
    mode: "single",
    options: [
      { value: "Ozempic (semaglutida)", aliases: ["ozempic", "semaglutida"] },
      { value: "Wegovy (semaglutida)", aliases: ["wegovy"] },
      { value: "Mounjaro (tirzepatida)", aliases: ["mounjaro", "tirzepatida"] },
      { value: "Saxenda (liraglutida)", aliases: ["saxenda", "liraglutida"] },
      { value: "Victoza (liraglutida)", aliases: ["victoza"] },
      {
        value: "Trulicity (dulaglutida)",
        aliases: ["trulicity", "dulaglutida"],
      },
      { value: "Não sei o nome", aliases: ["não sei", "nao sei"] },
    ],
    otherLabel: "Outra caneta",
    otherPlaceholder: "Nome da caneta ou do medicamento manipulado",
  },
  supplements: {
    mode: "multi",
    options: [
      NONE("Não uso suplementos", ["não uso", "nao uso"]),
      { value: "Whey protein" },
      { value: "Creatina" },
      { value: "Vitamina D" },
      { value: "Ômega 3" },
      { value: "Multivitamínico" },
      { value: "Ferro" },
      { value: "Vitamina B12" },
      { value: "Cafeína ou pré-treino" },
      { value: "Colágeno" },
      { value: "Probióticos" },
    ],
  },
  surgeries: {
    mode: "multi",
    options: [
      NONE("Nenhuma"),
      { value: "Cirurgia bariátrica" },
      { value: "Vesícula" },
      { value: "Apendicite" },
      { value: "Cesariana" },
      { value: "Hérnia" },
      { value: "Ortopédica" },
      { value: "Tireoide" },
      { value: "Internação recente" },
      PRIVATE,
    ],
  },
  familyHistory: {
    mode: "multi",
    options: [
      NONE("Nenhum conhecido"),
      { value: "Diabetes" },
      { value: "Hipertensão" },
      { value: "Infarto ou AVC" },
      { value: "Obesidade" },
      { value: "Colesterol alto" },
      { value: "Câncer" },
      { value: "Doença da tireoide" },
      PRIVATE,
    ],
  },
  allergyDetails: {
    mode: "multi",
    options: [
      { value: "Leite e derivados", emoji: "🥛" },
      { value: "Glúten ou trigo", emoji: "🌾" },
      { value: "Ovo", emoji: "🥚" },
      { value: "Amendoim", emoji: "🥜" },
      { value: "Castanhas e nozes", emoji: "🌰" },
      { value: "Frutos do mar", emoji: "🦐" },
      { value: "Peixe", emoji: "🐟" },
      { value: "Soja", emoji: "🫘" },
      { value: "Corantes ou conservantes", emoji: "🧪" },
      { value: "Prefiro não detalhar", none: true, icon: "lock" },
    ],
    otherPlaceholder: "Alimento e reação conhecida",
  },
  diet: {
    mode: "single",
    options: [
      {
        value: "Alimentação variada, sem restrições",
        aliases: ["alimentação variada"],
      },
      { value: "Vegetariana" },
      { value: "Vegana" },
      { value: "Low carb" },
      { value: "Sem glúten" },
      { value: "Sem lactose" },
      { value: "Cetogênica" },
      { value: "Jejum intermitente" },
      { value: "Restrições religiosas" },
      { value: "Plano orientado por profissional" },
    ],
  },
  avoidedFoods: {
    mode: "multi",
    options: [
      NONE("Nada em especial"),
      { value: "Carne vermelha", emoji: "🥩" },
      { value: "Frango", emoji: "🍗" },
      { value: "Peixe e frutos do mar", emoji: "🐟" },
      { value: "Leite e derivados", emoji: "🥛" },
      { value: "Ovos", emoji: "🥚" },
      { value: "Glúten", emoji: "🌾" },
      { value: "Açúcar e doces", emoji: "🍬" },
      { value: "Frituras", emoji: "🍟" },
      { value: "Ultraprocessados", emoji: "🥫" },
      { value: "Refrigerantes", emoji: "🥤" },
      { value: "Pimenta e temperos fortes", emoji: "🌶️" },
    ],
  },
  favoriteFoods: {
    mode: "multi",
    options: [
      { value: "Arroz e feijão", emoji: "🍚" },
      { value: "Massas", emoji: "🍝" },
      { value: "Carnes", emoji: "🥩" },
      { value: "Frango", emoji: "🍗" },
      { value: "Peixes", emoji: "🐟" },
      { value: "Saladas e legumes", emoji: "🥗" },
      { value: "Frutas", emoji: "🍎" },
      { value: "Pães e bolos", emoji: "🍞" },
      { value: "Doces", emoji: "🍰" },
      { value: "Queijos", emoji: "🧀" },
      { value: "Ovos", emoji: "🥚" },
      { value: "Comida japonesa", emoji: "🍣" },
      { value: "Lanches e fast food", emoji: "🍔" },
    ],
  },
  mealRoutine: {
    mode: "single",
    options: [
      { value: "Café, almoço e jantar em horários fixos" },
      { value: "Horários variam bastante" },
      { value: "Pulo o café da manhã" },
      { value: "Vários lanches ao longo do dia" },
      { value: "Como mais à noite" },
      { value: "Refeições rápidas no trabalho" },
      { value: "Almoço fora, jantar em casa" },
    ],
    otherPlaceholder: "Descreva um dia habitual",
  },
  digestiveSymptoms: {
    mode: "multi",
    options: [
      NONE("Nenhum"),
      { value: "Azia ou refluxo" },
      { value: "Estufamento e gases" },
      { value: "Constipação" },
      { value: "Diarreia frequente" },
      { value: "Náuseas" },
      { value: "Dor abdominal" },
      { value: "Intolerância à lactose" },
    ],
  },
  bowelHabit: {
    mode: "single",
    options: [
      { value: "Regular, todos os dias", aliases: ["regular"] },
      { value: "A cada dois dias" },
      { value: "Irregular" },
      { value: "Constipação frequente" },
      { value: "Intestino solto com frequência" },
      PRIVATE,
    ],
  },
  alcohol: {
    mode: "single",
    options: [
      { value: "Não bebo", aliases: ["não", "nao"] },
      { value: "Raramente, em eventos" },
      { value: "1 a 2 vezes por semana" },
      { value: "3 ou mais vezes por semana" },
      { value: "Diariamente" },
      PRIVATE,
    ],
  },
  tobacco: {
    mode: "single",
    options: [
      { value: "Não fumo", aliases: ["não", "nao"] },
      { value: "Ex-fumante" },
      { value: "Fumo ocasionalmente" },
      { value: "Fumo diariamente" },
      { value: "Uso cigarro eletrônico" },
      PRIVATE,
    ],
  },
  exerciseType: {
    mode: "multi",
    options: [
      NONE("Nenhum no momento"),
      { value: "Caminhada", emoji: "🚶" },
      { value: "Corrida", emoji: "🏃" },
      { value: "Musculação", emoji: "🏋️" },
      { value: "Funcional ou crossfit", emoji: "🤸" },
      { value: "Ciclismo", emoji: "🚴" },
      { value: "Natação", emoji: "🏊" },
      { value: "Pilates ou yoga", emoji: "🧘" },
      { value: "Dança", emoji: "💃" },
      { value: "Esportes coletivos", emoji: "⚽" },
      { value: "Lutas", emoji: "🥋" },
      { value: "Tenho limitação física", emoji: "🩹" },
    ],
    otherPlaceholder: "Atividade, intensidade ou limitação",
  },
  motivation: {
    mode: "multi",
    options: [
      { value: "Ter mais saúde e disposição" },
      { value: "Emagrecer" },
      { value: "Ganhar massa muscular" },
      {
        value: "Organizar a rotina alimentar",
        aliases: ["organizar minha rotina"],
      },
      { value: "Melhorar exames" },
      { value: "Dormir melhor" },
      { value: "Reduzir a ansiedade com comida" },
      { value: "Preparar-me para um evento" },
      { value: "Seguir uma orientação profissional" },
    ],
    otherPlaceholder: "O que você quer melhorar e por quê",
  },
  barriers: {
    mode: "multi",
    options: [
      NONE("Nenhuma no momento"),
      { value: "Falta de tempo", aliases: ["tempo para cozinhar"] },
      { value: "Custo dos alimentos" },
      { value: "Não gosto de cozinhar" },
      { value: "Beliscar ou compulsão" },
      { value: "Comer fora com frequência" },
      { value: "Trabalho em turnos" },
      { value: "Família com hábitos diferentes" },
      { value: "Sono ruim" },
      { value: "Estresse" },
      { value: "Já tentei dietas e desisti" },
    ],
  },
  foodBudget: {
    mode: "single",
    options: [
      { value: "Bem apertado" },
      { value: "Moderado" },
      { value: "Confortável" },
      { value: "Pouco acesso a alimentos frescos" },
      PRIVATE,
    ],
  },
  cookingTime: {
    mode: "single",
    options: [
      { value: "Quase nenhum, uso pratos prontos" },
      { value: "Até 15 minutos por dia" },
      { value: "30 minutos por dia" },
      { value: "1 hora ou mais por dia" },
      { value: "Cozinho em lote no fim de semana" },
      { value: "Outra pessoa cozinha para mim" },
    ],
  },
  professionalPlan: {
    mode: "single",
    options: [
      { value: "Não tenho", aliases: ["não", "nao"] },
      { value: "Sigo plano de nutricionista" },
      { value: "Sigo orientação médica" },
      { value: "Tenho plano de treino de educador físico" },
      { value: "Já tive, não sigo mais" },
    ],
  },
};

/** Campos numéricos que viram régua arrastável com ajuste fino. */
export const RULER_FIELDS: Record<string, RulerConfig> = {
  weight: {
    min: 30,
    max: 200,
    step: 0.1,
    tickStep: 0.2,
    majorEvery: 5,
    fineStep: 0.5,
    unit: "kg",
    decimals: 1,
    initial: 70,
  },
  height: {
    min: 120,
    max: 220,
    step: 1,
    tickStep: 1,
    majorEvery: 5,
    fineStep: 1,
    unit: "cm",
    decimals: 0,
    initial: 165,
  },
  targetWeight: {
    min: 30,
    max: 200,
    step: 0.1,
    tickStep: 0.2,
    majorEvery: 5,
    fineStep: 0.5,
    unit: "kg",
    decimals: 1,
    initial: 65,
    allowNone: true,
  },
  waist: {
    min: 40,
    max: 200,
    step: 0.5,
    tickStep: 1,
    majorEvery: 5,
    fineStep: 0.5,
    unit: "cm",
    decimals: 1,
    initial: 80,
    allowNone: true,
  },
  hip: {
    min: 40,
    max: 200,
    step: 0.5,
    tickStep: 1,
    majorEvery: 5,
    fineStep: 0.5,
    unit: "cm",
    decimals: 1,
    initial: 95,
    allowNone: true,
  },
  bodyFat: {
    min: 3,
    max: 60,
    step: 0.1,
    tickStep: 0.2,
    majorEvery: 5,
    fineStep: 0.5,
    unit: "%",
    decimals: 1,
    initial: 25,
    allowNone: true,
  },
  usualWater: {
    min: 0,
    max: 6000,
    step: 50,
    tickStep: 100,
    majorEvery: 5,
    fineStep: 100,
    unit: "ml",
    decimals: 0,
    initial: 1500,
    allowNone: true,
  },
  // Horas de sono não têm régua: vêm dos horários de dormir e acordar (linha do dia).
  exerciseMinutes: {
    min: 0,
    max: 240,
    step: 5,
    tickStep: 5,
    majorEvery: 6,
    fineStep: 5,
    unit: "min",
    decimals: 0,
    initial: 45,
  },
  sedentaryHours: {
    min: 0,
    max: 18,
    step: 0.5,
    tickStep: 0.25,
    majorEvery: 4,
    fineStep: 0.5,
    unit: "h",
    decimals: 1,
    initial: 8,
  },
  manualCalories: {
    min: 800,
    max: 5000,
    step: 25,
    tickStep: 50,
    majorEvery: 10,
    fineStep: 50,
    unit: "kcal",
    decimals: 0,
    initial: 1800,
    allowNone: true,
  },
  manualWater: {
    min: 500,
    max: 6000,
    step: 50,
    tickStep: 100,
    majorEvery: 5,
    fineStep: 100,
    unit: "ml",
    decimals: 0,
    initial: 2000,
    allowNone: true,
  },
  manualProtein: {
    min: 20,
    max: 400,
    step: 5,
    tickStep: 5,
    majorEvery: 10,
    fineStep: 5,
    unit: "g",
    decimals: 0,
    initial: 100,
    allowNone: true,
  },
  manualCarbs: {
    min: 20,
    max: 800,
    step: 5,
    tickStep: 10,
    majorEvery: 10,
    fineStep: 5,
    unit: "g",
    decimals: 0,
    initial: 200,
    allowNone: true,
  },
  manualFat: {
    min: 10,
    max: 300,
    step: 5,
    tickStep: 5,
    majorEvery: 10,
    fineStep: 5,
    unit: "g",
    decimals: 0,
    initial: 60,
    allowNone: true,
  },
};

/** Doses por aplicação habituais de cada caneta; "Outra quantidade" cobre o restante. */
const PEN_DOSES: Record<string, string[]> = {
  "Ozempic (semaglutida)": ["0,25 mg", "0,5 mg", "1 mg", "2 mg"],
  "Wegovy (semaglutida)": ["0,25 mg", "0,5 mg", "1 mg", "1,7 mg", "2,4 mg"],
  "Mounjaro (tirzepatida)": [
    "2,5 mg",
    "5 mg",
    "7,5 mg",
    "10 mg",
    "12,5 mg",
    "15 mg",
  ],
  "Saxenda (liraglutida)": ["0,6 mg", "1,2 mg", "1,8 mg", "2,4 mg", "3 mg"],
  "Victoza (liraglutida)": ["0,6 mg", "1,2 mg", "1,8 mg"],
  "Trulicity (dulaglutida)": ["0,75 mg", "1,5 mg", "3 mg", "4,5 mg"],
};
const GENERIC_PEN_DOSES = [
  "0,25 mg",
  "0,5 mg",
  "1 mg",
  "2 mg",
  "2,5 mg",
  "5 mg",
  "7,5 mg",
  "10 mg",
];

/** Opções de quantidade por aplicação conforme a caneta escolhida (ou lista genérica). */
export function penDoseConfig(penName: string): ChoiceConfig {
  const known = Object.entries(PEN_DOSES).find(
    ([name]) => name.toLowerCase() === penName.trim().toLowerCase(),
  );
  return {
    mode: "single",
    options: [
      ...(known ? known[1] : GENERIC_PEN_DOSES).map((value) => ({ value })),
      { value: "Não sei a dose", aliases: ["não sei", "nao sei"] },
    ],
    otherLabel: "Outra quantidade",
    otherPlaceholder: "Ex.: 0,75 mg, 12 unidades ou 3 cliques",
  };
}

export interface StepperConfig {
  min: number;
  max: number;
  step: number;
  unit: string;
  initial: number;
  quick: number[];
  /** Legenda curta sob os atalhos (ex.: 4 → "semanal"). */
  quickLabels?: Record<number, string>;
}
/** Inteiros pequenos: chips rápidos mais botões de menos e mais. */
export const STEPPER_FIELDS: Record<string, StepperConfig> = {
  mealsPerDay: {
    min: 1,
    max: 12,
    step: 1,
    unit: "refeições",
    initial: 3,
    quick: [2, 3, 4, 5, 6],
  },
  exerciseDays: {
    min: 0,
    max: 7,
    step: 1,
    unit: "dias",
    initial: 3,
    quick: [0, 1, 2, 3, 4, 5, 6, 7],
  },
  hydrationInterval: {
    min: 30,
    max: 480,
    step: 15,
    unit: "min",
    initial: 120,
    quick: [60, 90, 120, 180],
  },
  weightLossPenPerMonth: {
    min: 1,
    max: 31,
    step: 1,
    unit: "aplicações por mês",
    initial: 4,
    quick: [1, 2, 4, 30],
    quickLabels: { 1: "mensal", 2: "quinzenal", 4: "semanal", 30: "diária" },
  },
};

/** Horários sugeridos por campo; "Outro horário" abre as rodas. */
export const TIME_PRESETS: Record<string, string[]> = {
  wakeTime: [
    "05:00",
    "05:30",
    "06:00",
    "06:30",
    "07:00",
    "07:30",
    "08:00",
    "09:00",
  ],
  sleepTime: [
    "21:00",
    "21:30",
    "22:00",
    "22:30",
    "23:00",
    "23:30",
    "00:00",
    "01:00",
  ],
  quietStart: ["20:00", "21:00", "22:00", "23:00"],
  quietEnd: ["06:00", "07:00", "08:00", "09:00"],
  breakfastTime: ["06:00", "06:30", "07:00", "07:30", "08:00", "09:00"],
  lunchTime: ["11:30", "12:00", "12:30", "13:00", "13:30", "14:00"],
  dinnerTime: ["18:00", "18:30", "19:00", "19:30", "20:00", "21:00"],
};

/** Descrições curtas exibidas sob as opções de escolha única (enums do perfil). */
// Descrevem a opção para a pessoa; o que muda no app aparece como eco depois da resposta (echoes.ts).
export const SELECT_HINTS: Record<string, Record<string, string>> = {
  activityLevel: {
    sedentario: "Quase nenhum exercício na semana",
    leve: "Caminhadas ou treinos leves",
    moderado: "Treinos regulares na semana",
    intenso: "Treinos quase todos os dias",
  },
  goal: {
    organizar: "Rotina, horários e escolhas mais conscientes",
    manter: "Sustentar o peso atual com equilíbrio",
    perder: "Redução gradual e sustentável",
    ganhar: "Ganho gradual e sustentável",
  },
  allergies: { sim: "Você poderá detalhar em seguida" },
  weightLossPen: { sim: "Depois: caneta e dose" },
  hideCalories: {
    false: "Metas e registros com calorias",
    true: "Só gramas, água e horários, também nas respostas do agente",
  },
};

/** Escolha única desenhada como 2 blocos grandes lado a lado (Sim/Não) mais "Prefiro não informar" em texto. */
export const SELECT_LAYOUT: Record<string, "binary"> = {
  weightLossPen: "binary",
};
/** Ícones dos blocos Sim/Não (decorativos). */
export const SELECT_ICONS: Record<string, Record<string, ChoiceIconKey>> = {
  weightLossPen: { sim: "syringe", nao: "x" },
};

/** Rostos neutros (nunca vermelho ou âmbar) nas escolhas de sono e estresse. */
export const SELECT_FACES: Record<
  string,
  Record<string, "smile" | "meh" | "frown">
> = {
  sleepQuality: { boa: "smile", regular: "meh", ruim: "frown" },
  stress: { baixo: "smile", moderado: "meh", alto: "frown" },
};

/** Ícones das etapas e dos grupos; web e app traduzem para os componentes de ícone. */
export type GroupIcon =
  | "user"
  | "sparkles"
  | "shield"
  | "ruler"
  | "clipboard"
  | "heart"
  | "pill"
  | "leaf"
  | "pot"
  | "moon"
  | "clock"
  | "target"
  | "droplets"
  | "bell"
  | "settings"
  | "check";
/** Ícone de cada etapa, na ordem do questionário. */
export const STAGE_ICONS: readonly GroupIcon[] = [
  "user",
  "shield",
  "ruler",
  "heart",
  "leaf",
  "moon",
  "target",
  "check",
];
/** Pergunta que abre um grupo dentro da etapa: título e ícone do grupo. */
export const ANAMNESE_GROUPS: Record<string, { title: string; icon: GroupIcon }> = {
  name: { title: "Um pouco sobre você", icon: "user" },
  goal: { title: "A direção da sua jornada", icon: "target" },
  occupation: { title: "Sua rotina tem espaço aqui", icon: "sparkles" },
  consentLocal: { title: "Suas escolhas de privacidade", icon: "shield" },
  pregnancy: { title: "Cuidados que precisam de atenção", icon: "shield" },
  conditions: { title: "Seu histórico e seus cuidados", icon: "heart" },
  hideCalories: { title: "Uma experiência do seu jeito", icon: "settings" },
  weight: { title: "As medidas de hoje", icon: "ruler" },
  waist: { title: "Outras medidas, se você tiver", icon: "clipboard" },
  medications: { title: "Medicamentos e tratamentos", icon: "pill" },
  surgeries: { title: "Contexto pessoal e familiar", icon: "user" },
  allergies: { title: "Preferências e necessidades", icon: "leaf" },
  mealRoutine: { title: "A alimentação no seu dia", icon: "pot" },
  digestiveSymptoms: { title: "Como seu corpo responde", icon: "heart" },
  alcohol: { title: "Outros hábitos", icon: "clipboard" },
  wakeTime: { title: "A linha do seu dia", icon: "clock" },
  sleepQuality: { title: "Seu descanso e bem-estar", icon: "moon" },
  exerciseDays: { title: "Movimento na sua rotina", icon: "heart" },
  targetWeight: { title: "Seu peso desejado", icon: "target" },
  motivation: { title: "O que importa para você", icon: "sparkles" },
  foodBudget: { title: "O que funciona na sua realidade", icon: "pot" },
  manualProtein: { title: "Recomendado para você", icon: "target" },
  manualWater: { title: "Água no seu dia", icon: "droplets" },
  remindersEnabled: { title: "Lembretes no seu ritmo", icon: "bell" },
  consentAi: { title: "Você escolhe como usar a IA", icon: "shield" },
};

/** Consentimentos em linguagem curta; o texto integral (hint da pergunta) abre em "Ler termos completos". */
export const CONSENT_DETAILS: Record<
  "consentLocal" | "consentAi",
  { points: string[]; sends?: string[]; to?: string[] }
> = {
  consentLocal: {
    points: [
      "Fica só neste navegador, sem conta nem sincronização.",
      "Quem usar este navegador pode ver seus dados.",
      "Exporte ou exclua tudo em Meu espaço.",
    ],
  },
  consentAi: {
    sends: ["Mensagens", "Respostas de saúde", "Registros recentes", "Arquivos que você escolher"],
    to: ["DeepSeek", "OpenAI"],
    points: [
      "Só quando você usa um recurso de IA.",
      "Nome e nascimento saem do contexto; evite-os em textos e arquivos.",
      "Você pode revogar em Meu espaço.",
    ],
  },
};
