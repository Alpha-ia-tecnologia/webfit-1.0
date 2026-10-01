import type { LabelRead } from "../src/lib/label-read";

/** Leituras do rótulo (INJECAO-X2) no formato do esquema estrito, sem o envelope AgentReply. */
export const LABEL_READ: LabelRead = {
  nome: "Tirzepatida",
  candidatos: [{ mg: 10, ml: 2, trecho: "10 mg/2 mL", confianca: "high" }],
  problemas: [],
};

export const LABEL_READ_MULTI: LabelRead = {
  nome: null,
  candidatos: [
    { mg: 5, ml: 1, trecho: "5 mg/mL", confianca: "medium" },
    { mg: 2.5, ml: 1, trecho: "2,5 mg/mL", confianca: "low" },
  ],
  problemas: ["reflexo"],
};

export const LABEL_READ_NONE: LabelRead = {
  nome: null,
  candidatos: [],
  problemas: ["desfocado", "cortado"],
};
