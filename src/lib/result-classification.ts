import { normalizeText } from "./allergens";

/**
 * Filtro das perguntas, observações e trechos ilegíveis do laudo (ESPACO-05): o app nunca
 * classifica um resultado. Módulo folha (só ./allergens), usado por ./exam-result.
 *
 * Uma palavra como "alta" ou "baixo" só conta quando se refere a um resultado: logo depois do nome
 * de um exame, de um biomarcador (os do próprio laudo também valem) ou de "resultado", "valor",
 * "nível", "taxa"… ("glicose alta", "o LDL continua muito alto", "alto nível de ferritina"), depois
 * de "está/deu/veio/ficou…" ("deu alto") ou comparando com a referência ("acima da referência",
 * "fora da faixa", "abaixo do esperado"). "Normal", "anormal" e "alterado" classificam sempre.
 * O mesmo termo em outro sentido fica: "atividade de alta intensidade", "dieta baixa em sódio".
 */

/** Palavras e pontuação do texto já sem acentos; a pontuação separa as orações. */
const TOKEN_RE = /[a-z0-9]+|[.,;:!?()]/g;
const isBoundary = (token: string) => /^[.,;:!?()]$/.test(token);

const words = (list: string) => new Set(list.trim().split(/\s+/));

/** Classificam em qualquer contexto. */
const ALWAYS = /^(?:a?normal|a?normais|alterad\w*)$/;
/** Adjetivos e particípios que classificam quando se referem a um resultado. */
const QUALIFIER =
  /^(?:alt[oa]s?|baix[oa]s?|elevad\w*|aumentad\w*|diminuid\w*|reduzid\w*|limitrofe\w*|insuficien\w*|deficien\w*|acima|abaixo)$/;
/** Substantivos seguidos do resultado: "alteração no hemograma", "deficiência de vitamina B12". */
const CONDITION_NOUN = /^(?:alteraca\w*|alteraco\w*|insuficien\w*|deficien\w*)$/;
/** Comparação com a referência: "acima/abaixo/fora/dentro" + "da referência", "do normal"… */
const COMPARATIVE = /^(?:acima|abaixo|fora|dentro)$/;
const REFERENCE =
  /^(?:referencias?|faixas?|normal|normais|normalidade|valor|valores|limites?|intervalos?|esperad[oa]s?|ideal|ideais|padrao|padroes)$/;
const PREPOSITION = words("de do da dos das");

/** Exames, biomarcadores comuns e as palavras que nomeiam um resultado. */
const RESULT_TERMS = words(`
  resultado resultados valor valores nivel niveis taxa taxas indice indices exame exames dosagem dosagens
  concentracao contagem parametro parametros marcador marcadores hemograma lipidograma
  glicose glicemia insulina hba1c hemoglobina glicada colesterol hdl ldl vldl triglicerides triglicerideos
  trigliceridios ferritina ferro transferrina vitamina b12 folato tsh t3 t4 creatinina ureia urico tgo tgp
  ast alt ggt bilirrubina albumina pcr plaquetas leucocitos hemacias eritrocitos hematocrito linfocitos
  neutrofilos sodio potassio calcio magnesio fosforo zinco cortisol testosterona estradiol progesterona
  prolactina psa homocisteina vhs
`);
/**
 * Depois do adjetivo ("alto nível", "baixa taxa"), só estes: "baixo índice glicêmico", "baixo sódio"
 * e "alto teor" costumam descrever alimentos, não resultados.
 */
const RESULT_NOUN_AFTER = words("valor valores nivel niveis taxa taxas resultado resultados dosagem dosagens contagem");

/** Podem ficar entre o resultado e a palavra: artigos, preposições, verbos de estado, advérbios. */
const FILLERS = words(`
  a o as os um uma meu minha meus minhas seu sua seus suas esse essa esses essas este esta estes estas
  de do da dos das em no na nos nas e ou
  estao estava estavam esteve fica ficou ficaram ficam deu deram veio vieram continua continuam continuou
  permanece permanecem segue seguem parece parecem sao foi foram anda andam aparece apareceu apareceram
  saiu sairam
  muito muita pouco pouca bem mais menos meio bastante levemente ligeiramente tao ainda ja nao sempre
  demais so tambem
  jejum total livre serico serica pos prandial
`);
/** "Está/deu/veio/ficou … alto": classifica mesmo sem o nome do resultado. */
const RESULT_VERB = words("esta estao estava estavam esteve deu deram veio vieram ficou ficaram saiu sairam");
const ADVERBS = words("muito muita pouco pouca bem mais menos meio bastante levemente ligeiramente tao ainda ja nao so tambem demais um");
/** Palavras dos nomes do laudo que não identificam um resultado ("Colesterol total", "T4 livre"). */
const NAME_STOP = new Set([...FILLERS, ...words("urina sangue soro plasma fracao tempo atividade")]);

const tokens = (text: string) => normalizeText(text).match(TOKEN_RE) ?? [];

/** Palavras que identificam os resultados de um laudo (nomes e grupos impressos). */
export function resultTerms(names: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const name of names)
    for (const token of tokens(name))
      if (token.length >= 2 && !isBoundary(token) && !NAME_STOP.has(token) && !/^\d+$/.test(token)) out.add(token);
  return out;
}

type Ctx = { t: readonly string[]; isResult: (token: string) => boolean };

/** Resultado antes da palavra, com só artigos, verbos de estado ou advérbios no meio (até 5). */
function resultBefore({ t, isResult }: Ctx, i: number): boolean {
  if (t[i - 1] === "de") return false; // "de alta intensidade", "de baixo impacto": qualifica o que vem depois
  for (let j = i - 1; j >= 0 && j >= i - 5; j--) {
    const token = t[j]!;
    if (isResult(token)) return true;
    if (isBoundary(token) || !(FILLERS.has(token) || token.length === 1)) return false;
  }
  return false;
}

/** "Alto nível de ferritina", "valores baixos" já é o caso de antes: o nome do resultado logo depois. */
function resultRightAfter({ t }: Ctx, i: number): boolean {
  return t[i - 1] !== "de" && RESULT_NOUN_AFTER.has(t[i + 1] ?? "");
}

/** "Deu alto", "está muito alta"; não "está baixa em sódio" (composição, não resultado). */
function afterResultVerb({ t }: Ctx, i: number): boolean {
  if (t[i + 1] === "em") return false;
  for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
    const token = t[j]!;
    if (RESULT_VERB.has(token)) return true;
    if (!ADVERBS.has(token)) return false;
  }
  return false;
}

/** "Acima da referência", "dentro dos valores de referência", "fora da faixa", "abaixo do esperado". */
function comparesWithReference({ t }: Ctx, i: number): boolean {
  if (!PREPOSITION.has(t[i + 1] ?? "")) return false;
  const next = t[i + 2] ?? "";
  if (REFERENCE.test(next)) return true;
  return FILLERS.has(next) && REFERENCE.test(t[i + 3] ?? "");
}

/** "Alteração no hemograma", "deficiência de vitamina B12": o resultado até duas palavras depois. */
function namesResultAfter({ t, isResult }: Ctx, i: number): boolean {
  for (let j = i + 1; j < t.length && j <= i + 3; j++) {
    const token = t[j]!;
    if (isResult(token)) return true;
    if (isBoundary(token) || !FILLERS.has(token)) return false;
  }
  return false;
}

function classifiesAt(ctx: Ctx, i: number): boolean {
  const token = ctx.t[i]!;
  if (ALWAYS.test(token)) return true;
  if (COMPARATIVE.test(token) && comparesWithReference(ctx, i)) return true;
  if (CONDITION_NOUN.test(token) && namesResultAfter(ctx, i)) return true;
  if (!QUALIFIER.test(token)) return false;
  return resultBefore(ctx, i) || resultRightAfter(ctx, i) || afterResultVerb(ctx, i);
}

/**
 * O texto classifica um resultado? `names`: nomes e grupos impressos no mesmo laudo, para
 * reconhecer biomarcadores fora da lista comum ("Apolipoproteína B aumentada").
 */
export function classifiesResult(text: string, names: readonly string[] = []): boolean {
  const extra = resultTerms(names);
  const t = tokens(text);
  const ctx: Ctx = { t, isResult: (token) => RESULT_TERMS.has(token) || extra.has(token) };
  return t.some((_, i) => classifiesAt(ctx, i));
}
