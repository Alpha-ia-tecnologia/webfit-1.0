/** Controles compostos: várias perguntas desenhadas como um só bloco. */
export type WidgetKey =
  | "dayTimeline"
  | "goals"
  | "water"
  | "quietHours"
  | "penSchedule"
  | "numbersChoice"
  | "conditions";
export interface Question {
  key: string;
  label: string;
  /**
   * Título exibido como pergunta ("Tem algum diagnóstico de saúde?"). O `label` continua sendo o
   * nome do grupo para leitores de tela, a revisão e o contexto do agente.
   */
  prompt?: string;
  type?:
    "text" | "textarea" | "number" | "date" | "time" | "select" | "checkbox";
  hint?: string;
  options?: [string, string][];
  optional?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** Só aparece (e só é obrigatório) quando a resposta de outra pergunta é igual ao valor. */
  showWhen?: [key: string, value: string];
  /** Opcional que vira obrigatório quando a lista de outra resposta (texto "a,b") inclui o valor. */
  requiredWhen?: [key: string, value: string];
  /** Controle composto: várias chaves com o mesmo widget são desenhadas uma vez, na primeira visível. */
  widget?: WidgetKey;
}
const yesNo: [string, string][] = [
  ["nao", "Não"],
  ["sim", "Sim"],
  ["nao_informado", "Prefiro não informar"],
];
export const questionnaire: {
  title: string;
  /** Nome curto na barra de etapa ("Etapa 8 de 8 · Seu plano"); sem ele, o título. */
  short?: string;
  /** Até 12 palavras, sob o título; o texto completo fica em `description`, atrás do (i). */
  summary: string;
  description: string;
  fields: Question[];
}[] = [
  {
    title: "Vamos conhecer você",
    summary: "O básico sobre você e sua rotina. Dá para revisar depois.",
    description:
      "Este é seu espaço individual. A anamnese orienta o acompanhamento e pode ser revisada depois.",
    fields: [
      { key: "name", label: "Como você se chama?" },
      { key: "birthDate", label: "Data de nascimento", type: "date" },
      {
        key: "sex",
        label: "Sexo biológico para estimativas",
        type: "select",
        options: [
          ["masculino", "Masculino"],
          ["feminino", "Feminino"],
          ["nao_informado", "Prefiro não informar"],
        ],
      },
      {
        key: "goal",
        label: "Objetivo principal",
        type: "select",
        options: [
          ["organizar", "Organizar minha alimentação e rotina"],
          ["manter", "Manter meu peso"],
          ["perder", "Reduzir meu peso com acompanhamento"],
          ["ganhar", "Ganhar peso ou massa com acompanhamento"],
        ],
      },
      {
        key: "occupation",
        label: "Ocupação e rotina de trabalho ou estudo",
        type: "textarea",
      },
      {
        key: "routine",
        label: "Como é um dia típico para você?",
        type: "textarea",
        hint: "Inclua turnos, deslocamentos, horários variáveis e responsabilidades.",
      },
      {
        key: "consentLocal",
        label:
          "Concordo em salvar minhas respostas e registros neste navegador.",
        type: "checkbox",
        hint: "Os dados não têm sincronização com conta. Quem acessar este perfil do navegador pode vê-los. Você pode exportar ou excluir tudo em Meu espaço. O rascunho só é salvo após esta escolha.",
      },
    ],
  },
  {
    title: "Cuidados importantes",
    summary: "Antes das medidas, o que pede um cuidado especial.",
    description:
      "Estas respostas vêm antes das medidas para o app saber o que mostrar e o que evitar. Algumas condições de saúde ajustam as metas com cuidados na alimentação; outras pedem avaliação individual antes de qualquer meta automática. Você pode preferir não informar; uma resposta omitida não é interpretada como ausência de condição.",
    fields: [
      {
        key: "pregnancy",
        label: "Gestação ou amamentação",
        type: "select",
        options: [
          ["nao", "Não / Não se aplica"],
          ["gestacao", "Gestação"],
          ["amamentacao", "Amamentação"],
          ["nao_informado", "Prefiro não informar"],
        ],
      },
      {
        key: "eatingDisorder",
        label:
          "Histórico de transtorno alimentar ou acompanhamento por dificuldades com a alimentação",
        prompt: "Tem histórico de transtorno alimentar?",
        hint: "Inclui acompanhamento por dificuldades com a alimentação.",
        type: "select",
        options: yesNo,
      },
      {
        key: "fluidRestriction",
        label: "Possui orientação para restringir líquidos?",
        type: "select",
        options: [
          ["nao", "Não"],
          ["sim", "Sim"],
          ["nao_sei", "Não sei"],
        ],
      },
      // Condições da lista fechada (lib/conditions) e, no mesmo bloco, os detalhes ou a outra condição.
      {
        key: "conditionTags",
        label: "Condições de saúde e diagnósticos conhecidos",
        prompt: "Tem algum diagnóstico de saúde?",
        widget: "conditions",
      },
      {
        key: "conditions",
        label: "Detalhes ou outra condição",
        type: "textarea",
        optional: true,
        requiredWhen: ["conditionTags", "outra"],
        hint: "Obrigatório quando você marca “Outra”.",
        widget: "conditions",
      },
      {
        key: "hideCalories",
        label: "Como prefere ver números?",
        type: "checkbox",
        widget: "numbersChoice",
        hint: "Dá para mudar depois em Meu espaço.",
        options: [
          ["false", "Mostrar calorias"],
          ["true", "Ocultar calorias"],
        ],
      },
    ],
  },
  {
    title: "Seu ponto de partida",
    summary: "Suas medidas de hoje. As opcionais podem ficar em branco.",
    description:
      "Informe medidas reais. Campos opcionais podem ficar em branco; não vamos estimar gordura corporal sem uma medição.",
    fields: [
      {
        key: "weight",
        label: "Peso atual (kg)",
        type: "number",
        min: 20,
        max: 350,
        step: 0.1,
      },
      {
        key: "height",
        label: "Altura (cm)",
        type: "number",
        min: 100,
        max: 250,
        step: 0.1,
      },
      { key: "measurementDate", label: "Data da medição", type: "date" },
      {
        key: "measurementMethod",
        label: "Como as medidas foram obtidas?",
      },
      {
        key: "waist",
        label: "Cintura (cm)",
        type: "number",
        optional: true,
        min: 30,
        max: 250,
        step: 0.1,
      },
      {
        key: "hip",
        label: "Quadril (cm)",
        type: "number",
        optional: true,
        min: 30,
        max: 250,
        step: 0.1,
      },
      {
        key: "bodyFat",
        label: "Gordura corporal medida (%)",
        type: "number",
        optional: true,
        min: 1,
        max: 75,
        step: 0.1,
      },
    ],
  },
  {
    title: "Histórico de saúde",
    summary: "Conte o que souber. Você pode preferir não informar.",
    description:
      "Responda com suas informações conhecidas. Você pode escrever “Não”, “Não sei” ou “Prefiro não informar”. Uma informação omitida não será interpretada como ausência de condição.",
    fields: [
      {
        key: "medications",
        label: "Medicamentos em uso",
        prompt: "Usa algum medicamento?",
        type: "textarea",
        hint: "Nome, dose e frequência, se souber.",
      },
      {
        key: "weightLossPen",
        label: "Faz uso de canetas emagrecedoras?",
        prompt: "Usa caneta para emagrecer?",
        type: "select",
        options: yesNo,
        hint: "GLP-1, como Ozempic, Mounjaro ou Saxenda.",
      },
      {
        key: "weightLossPenName",
        label: "Qual caneta?",
        showWhen: ["weightLossPen", "sim"],
      },
      {
        key: "weightLossPenDose",
        label: "Quantidade por aplicação",
        showWhen: ["weightLossPen", "sim"],
        hint: "A dose que consta na caneta ou na prescrição.",
      },
      {
        key: "weightLossPenPerMonth",
        label: "Frequência das aplicações",
        type: "number",
        min: 1,
        max: 31,
        showWhen: ["weightLossPen", "sim"],
        widget: "penSchedule",
      },
      {
        key: "penWeekday",
        label: "Dia da aplicação",
        optional: true,
        showWhen: ["weightLossPen", "sim"],
        widget: "penSchedule",
        options: [
          ["0", "Domingo"],
          ["1", "Segunda-feira"],
          ["2", "Terça-feira"],
          ["3", "Quarta-feira"],
          ["4", "Quinta-feira"],
          ["5", "Sexta-feira"],
          ["6", "Sábado"],
        ],
      },
      {
        key: "supplements",
        label: "Suplementos em uso",
        prompt: "Usa algum suplemento?",
        type: "textarea",
      },
      {
        key: "surgeries",
        label: "Cirurgias, internações e mudanças recentes de saúde",
        type: "textarea",
      },
      {
        key: "familyHistory",
        label: "Histórico de saúde familiar relevante",
        type: "textarea",
      },
    ],
  },
  {
    title: "Sua alimentação",
    summary: "Suas escolhas e restrições guiam as sugestões do agente.",
    description:
      "Estas respostas ajudam o agente a respeitar suas escolhas e identificar informações que precisam de esclarecimento.",
    fields: [
      {
        key: "allergies",
        label: "Alergias ou intolerâncias alimentares conhecidas",
        type: "select",
        options: [
          ["nao", "Não"],
          ["sim", "Sim"],
          ["nao_sei", "Não sei / Prefiro não informar"],
        ],
      },
      {
        key: "allergyDetails",
        label: "Quais alergias ou intolerâncias?",
        type: "textarea",
        showWhen: ["allergies", "sim"],
        hint: "Inclua alimentos e reações conhecidas.",
      },
      {
        key: "diet",
        label: "Padrão alimentar e restrições",
      },
      {
        key: "avoidedFoods",
        label: "Alimentos que evita ou não gosta",
        type: "textarea",
      },
      {
        key: "favoriteFoods",
        label: "Alimentos e preparações de que gosta",
        type: "textarea",
      },
      {
        key: "mealRoutine",
        label: "Horários, alimentos e porções de um dia habitual",
        type: "textarea",
        hint: "Inclua lanches, bebidas e refeições fora de casa.",
      },
      {
        key: "usualWater",
        label: "Consumo habitual de água (ml/dia)",
        type: "number",
        optional: true,
        min: 0,
        max: 10000,
      },
      {
        key: "digestiveSymptoms",
        label: "Sintomas digestivos ou dificuldades ao comer",
        type: "textarea",
      },
      {
        key: "bowelHabit",
        label: "Funcionamento intestinal habitual",
        type: "textarea",
      },
      { key: "alcohol", label: "Consumo de bebidas alcoólicas e frequência" },
      { key: "tobacco", label: "Tabaco ou outros produtos com nicotina" },
    ],
  },
  {
    title: "Sono, movimento e bem-estar",
    summary: "Seu dia, do acordar ao dormir, e seu movimento.",
    description:
      "Os horários do seu dia orientam lembretes e sugestões; o movimento ajuda a estimar o gasto.",
    fields: [
      {
        key: "wakeTime",
        label: "Horário habitual de acordar",
        type: "time",
        widget: "dayTimeline",
      },
      {
        key: "breakfastTime",
        label: "Horário do café da manhã",
        type: "time",
        widget: "dayTimeline",
      },
      {
        key: "lunchTime",
        label: "Horário do almoço",
        type: "time",
        widget: "dayTimeline",
      },
      {
        key: "dinnerTime",
        label: "Horário do jantar",
        type: "time",
        widget: "dayTimeline",
      },
      {
        key: "sleepTime",
        label: "Horário habitual de dormir",
        type: "time",
        widget: "dayTimeline",
      },
      {
        key: "mealsPerDay",
        label: "Refeições por dia",
        type: "number",
        min: 1,
        max: 12,
        hint: "Café, almoço e jantar contam como 3; some os lanches.",
        widget: "dayTimeline",
      },
      {
        key: "sleepHours",
        label: "Horas de sono por noite",
        type: "number",
        min: 0,
        max: 24,
        step: 0.5,
        widget: "dayTimeline",
      },
      {
        key: "sleepQuality",
        label: "Qualidade do sono",
        type: "select",
        options: [
          ["boa", "Boa"],
          ["regular", "Regular"],
          ["ruim", "Ruim"],
          ["nao_informado", "Prefiro não informar"],
        ],
      },
      {
        key: "stress",
        label: "Nível de estresse percebido",
        type: "select",
        options: [
          ["baixo", "Baixo"],
          ["moderado", "Moderado"],
          ["alto", "Alto"],
          ["nao_informado", "Prefiro não informar"],
        ],
      },
      {
        key: "exerciseDays",
        label: "Dias de exercício por semana",
        type: "number",
        min: 0,
        max: 7,
      },
      {
        key: "exerciseType",
        label: "Atividades, intensidade e limitações físicas",
        type: "textarea",
      },
      {
        key: "exerciseMinutes",
        label: "Duração habitual do exercício (minutos)",
        type: "number",
        min: 0,
        max: 600,
      },
      {
        key: "activityLevel",
        label: "Nível habitual de atividade",
        type: "select",
        options: [
          ["sedentario", "Sedentário — pouco movimento"],
          ["leve", "Leve — exercícios 1 a 3 dias/semana"],
          ["moderado", "Moderado — exercícios 3 a 5 dias/semana"],
          ["intenso", "Intenso — exercícios 6 a 7 dias/semana"],
        ],
      },
      {
        key: "sedentaryHours",
        label: "Horas sentado por dia",
        type: "number",
        min: 0,
        max: 24,
        step: 0.5,
      },
    ],
  },
  {
    title: "Objetivos e metas",
    summary: "O que importa para você, suas metas e o uso da IA.",
    description:
      "Metas específicas são opcionais: a recomendação usa suas respostas, o objetivo escolhido, seu IMC, seu nível de atividade, as condições de saúde marcadas e o uso de caneta emagrecedora. Outros medicamentos não alteram essas estimativas. A meta de água é informada por você ou por um profissional.",
    fields: [
      {
        key: "targetWeight",
        label: "Peso desejado (kg)",
        type: "number",
        optional: true,
        min: 20,
        max: 350,
        step: 0.1,
      },
      {
        key: "motivation",
        label: "O que você deseja melhorar e por quê?",
        type: "textarea",
      },
      {
        key: "barriers",
        label: "Principais dificuldades e experiências anteriores",
        type: "textarea",
      },
      {
        key: "foodBudget",
        label: "Orçamento e acesso aos alimentos",
        type: "textarea",
      },
      {
        key: "cookingTime",
        label: "Tempo, equipamentos e apoio para cozinhar",
        type: "textarea",
      },
      {
        key: "professionalPlan",
        label: "Acompanhamento e orientações profissionais atuais",
        type: "textarea",
        hint: "Não é necessário informar nome ou contato do profissional.",
      },
      // Proteína primeiro: o início do bloco nunca cai numa chave que "Ocultar calorias" esconde.
      {
        key: "manualProtein",
        label: "Meta de proteínas (g/dia)",
        type: "number",
        optional: true,
        min: 1,
        max: 500,
        widget: "goals",
      },
      {
        key: "manualCarbs",
        label: "Meta de carboidratos (g/dia)",
        type: "number",
        optional: true,
        min: 1,
        max: 1000,
        widget: "goals",
      },
      {
        key: "manualFat",
        label: "Meta de gorduras (g/dia)",
        type: "number",
        optional: true,
        min: 1,
        max: 400,
        widget: "goals",
      },
      {
        key: "manualCalories",
        label: "Meta calórica informada (kcal/dia)",
        type: "number",
        optional: true,
        min: 500,
        max: 7000,
        widget: "goals",
      },
      {
        key: "manualWater",
        label: "Meta de água informada (ml/dia)",
        type: "number",
        optional: true,
        min: 100,
        max: 10000,
        widget: "water",
      },
      {
        key: "remindersEnabled",
        label: "Ativar lembretes dentro da plataforma",
        type: "checkbox",
        hint: "Os lembretes são atualizados enquanto o aplicativo está aberto. Não há notificações externas.",
      },
      {
        key: "hydrationInterval",
        label: "Intervalo do lembrete de água (minutos)",
        type: "number",
        min: 30,
        max: 480,
      },
      {
        key: "quietStart",
        label: "Início do horário de silêncio",
        type: "time",
        widget: "quietHours",
      },
      {
        key: "quietEnd",
        label: "Fim do horário de silêncio",
        type: "time",
        widget: "quietHours",
      },
      {
        key: "consentAi",
        label:
          "Permitir o envio de contexto à DeepSeek e/ou à OpenAI quando eu usar recursos de IA",
        type: "checkbox",
        hint: "Ao solicitar recursos de IA, suas mensagens, respostas de saúde e rotina, registros recentes e arquivos selecionados podem ser enviados à DeepSeek e/ou à OpenAI, conforme a configuração do serviço. Quando ambos estiverem configurados, a OpenAI poderá receber o mesmo conteúdo como alternativa se a DeepSeek falhar ou não aceitar o arquivo. Nome e data de nascimento são removidos do contexto estruturado; evite identificadores nos textos e arquivos. Você pode revogar esta escolha em Meu espaço.",
      },
    ],
  },
  {
    title: "Revise sua anamnese",
    short: "Seu plano",
    summary: "Confira suas respostas antes de entrar.",
    description:
      "Confira suas respostas antes de entrar. Seu agente usará este contexto apenas quando você autorizar e solicitar uma interação.",
    fields: [],
  },
];
