import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseRichText, plainText } from "../src/lib/rich-text";
import {
  HIDDEN_BODY_NUMBER,
  hasBodyNumbers,
  maskBodyNumbers,
  visiblePlainText,
  visibleText,
} from "../src/lib/text";

test("negrito vira trecho forte e asteriscos soltos somem", () => {
  assert.deepEqual(parseInline("Coma **2 ovos** e *fruta* **"), [
    { kind: "text", text: "Coma " },
    { kind: "strong", text: "2 ovos" },
    { kind: "text", text: " e fruta" },
  ]);
});

test("calorias ocultas viram um trecho próprio, sem colchetes no texto", () => {
  const inlines = parseInline(visibleText("Estimativa: 1800 kcal.", true));
  assert.deepEqual(inlines, [
    { kind: "text", text: "Estimativa: " },
    { kind: "hidden" },
    { kind: "text", text: "." },
  ]);
  assert.equal(plainText(inlines), "Estimativa: calorias ocultas.");
});

test("links e código não viram marcação, só texto", () => {
  assert.deepEqual(parseInline("Veja [a tabela](https://exemplo.com) e `x`"), [
    { kind: "text", text: "Veja a tabela e x" },
  ]);
});

test("títulos ## abrem seções e ### ou linha em negrito viram subtítulo", () => {
  const sections = parseRichText(
    "Intro curta.\n\n## Receita 1\n**Modo de preparo**\n1. Corte.\n2) Asse.\n\n## Receita 2\n### Dica\n- Sirva quente",
  );
  assert.equal(sections.length, 3);
  assert.equal(sections[0].title, null);
  assert.deepEqual(sections[0].blocks, [
    { kind: "paragraph", inlines: [{ kind: "text", text: "Intro curta." }] },
  ]);
  assert.deepEqual(sections[1].title, [{ kind: "text", text: "Receita 1" }]);
  assert.deepEqual(sections[1].blocks, [
    { kind: "heading", inlines: [{ kind: "text", text: "Modo de preparo" }] },
    {
      kind: "steps",
      start: 1,
      items: [
        [{ kind: "text", text: "Corte." }],
        [{ kind: "text", text: "Asse." }],
      ],
    },
  ]);
  assert.deepEqual(sections[2].blocks, [
    { kind: "heading", inlines: [{ kind: "text", text: "Dica" }] },
    { kind: "bullets", items: [[{ kind: "text", text: "Sirva quente" }]] },
  ]);
});

test("linha de rótulos em negrito vira metadados", () => {
  const [section] = parseRichText(
    "**Rendimento:** 3 porções · **Tempo:** 35 min\n**Refeição da dieta:** Almoço",
  );
  assert.deepEqual(section.blocks, [
    {
      kind: "meta",
      items: [
        { label: "Rendimento", value: [{ kind: "text", text: "3 porções" }] },
        { label: "Tempo", value: [{ kind: "text", text: "35 min" }] },
      ],
    },
    {
      kind: "meta",
      items: [
        { label: "Refeição da dieta", value: [{ kind: "text", text: "Almoço" }] },
      ],
    },
  ]);
});

test("listas separadas por linha em branco continuam a mesma lista", () => {
  const [section] = parseRichText("- a\n\n- b\ntexto\n- c");
  assert.deepEqual(section.blocks, [
    {
      kind: "bullets",
      items: [[{ kind: "text", text: "a" }], [{ kind: "text", text: "b" }]],
    },
    { kind: "paragraph", inlines: [{ kind: "text", text: "texto" }] },
    { kind: "bullets", items: [[{ kind: "text", text: "c" }]] },
  ]);
});

test("texto simples preserva uma linha por parágrafo e ignora CRLF e réguas", () => {
  const [section] = parseRichText("Linha 1\r\nLinha 2\r\n---\r\n\r\n");
  assert.deepEqual(
    section.blocks.map((b) => (b.kind === "paragraph" ? plainText(b.inlines) : b.kind)),
    ["Linha 1", "Linha 2"],
  );
});

test("numeração que não começa em 1 é preservada", () => {
  const [section] = parseRichText("3. Terceiro passo\n4. Quarto passo");
  assert.equal(section.blocks[0].kind, "steps");
  assert.equal(section.blocks[0].kind === "steps" && section.blocks[0].start, 3);
});

test("texto vazio gera uma seção sem blocos", () => {
  assert.deepEqual(parseRichText("  \n "), [{ title: null, blocks: [] }]);
});

test("calorias ocultas dentro de negrito mantêm o negrito do resto da frase", () => {
  assert.deepEqual(parseInline(visibleText("Você deve consumir **1800 kcal** por dia.", true)), [
    { kind: "text", text: "Você deve consumir " },
    { kind: "hidden" },
    { kind: "text", text: " por dia." },
  ]);
  assert.deepEqual(parseInline(visibleText("**Meta: 1800 kcal por dia**", true)), [
    { kind: "strong", text: "Meta: " },
    { kind: "hidden" },
    { kind: "strong", text: " por dia" },
  ]);
});

test("texto corrido mostra calorias ocultas sem colchetes; visível quando não ocultas", () => {
  const note = "Evite passar de 1800 kcal no jantar.";
  assert.equal(visiblePlainText(note, true), "Evite passar de calorias ocultas no jantar.");
  assert.equal(visiblePlainText(note, false), note);
  assert.equal(visiblePlainText("Sem números.", true), "Sem números.");
});

test("números do corpo ocultos: peso, IMC e medidas somem do texto do agente", () => {
  const hide = (text: string) => visibleText(text, false, true);
  assert.equal(
    hide("Seu peso caiu de 74,0 para 72,6 kg."),
    "Seu peso caiu de número oculto para número oculto.",
  );
  assert.equal(hide("Porções pensadas para seus 72 kg."), "Porções pensadas para seus número oculto.");
  assert.equal(hide("Seu IMC é 27,3."), "Seu IMC é número oculto.");
  assert.equal(hide("Índice de massa corporal de 27."), "Índice de massa corporal de número oculto.");
  assert.equal(hide("Cintura de 84 cm e quadril 102 cm."), "Cintura de número oculto e quadril número oculto.");
  assert.equal(hide("Você tem 1,70 m de altura."), "Você tem número oculto de altura.");
  assert.equal(hide("Você perdeu 3 kg no mês."), "Você perdeu número oculto no mês.");
  assert.equal(hide("Seu peso atual é 82,5 kg; pesa 60."), "Seu peso atual é número oculto; pesa número oculto.");
  assert.equal(hide("Gordura corporal: 28%."), "Gordura corporal: número oculto.");
  assert.equal(hide("Relação cintura-quadril 0,85."), "Relação cintura-quadril número oculto.");
  assert.doesNotMatch(hide("Meta de peso: 65 kg, IMC 24 e 84 cm de cintura."), /\d/);
});

test("números do corpo ocultos: quantidades de comida e treino ficam", () => {
  const hide = (text: string) => visibleText(text, false, true);
  for (const text of [
    "Use 1 kg de frango e 200 g de arroz.",
    "Faça 3 séries de 12 repetições.",
    "Leite com 3% de gordura.",
    "Corte em cubos de 2 cm.",
    "Beba 2 litros de água.",
    "O peso das porções: 100 g de arroz.",
    "Levante os braços 10 vezes.",
  ])
    assert.equal(hide(text), text);
});

test("números do corpo: desligado não muda nada; calorias seguem pelo mesmo caminho", () => {
  const text = "Seu peso é 72 kg e a meta é 1800 kcal.";
  assert.equal(visibleText(text, false), text);
  assert.equal(visibleText(text, false, false), text);
  assert.equal(visibleText(text, true), "Seu peso é 72 kg e a meta é [calorias ocultas].");
  assert.equal(
    visibleText(text, true, true),
    "Seu peso é número oculto e a meta é [calorias ocultas].",
  );
  assert.equal(
    visiblePlainText(text, true, true),
    "Seu peso é número oculto e a meta é calorias ocultas.",
  );
  assert.equal(hasBodyNumbers("IMC de 27"), true);
  assert.equal(hasBodyNumbers("Arroz e feijão"), false);
  assert.equal(maskBodyNumbers("IMC de 27"), `IMC de ${HIDDEN_BODY_NUMBER}`);
});

test("negrito no início da frase continua parágrafo: sem dois-pontos não há metadado", () => {
  const [section] = parseRichText("**Boa semana!** De 17 a 23 de setembro");
  assert.deepEqual(section.blocks, [
    {
      kind: "paragraph",
      inlines: [
        { kind: "strong", text: "Boa semana!" },
        { kind: "text", text: " De 17 a 23 de setembro" },
      ],
    },
  ]);
});

test("metadado aceita os dois-pontos dentro ou fora do negrito", () => {
  for (const line of ["**Tempo**: 35 min", "**Tempo:** 35 min"]) {
    const [section] = parseRichText(line);
    assert.deepEqual(
      section.blocks,
      [{ kind: "meta", items: [{ label: "Tempo", value: [{ kind: "text", text: "35 min" }] }] }],
      line,
    );
  }
  const [pair] = parseRichText("**Tempo:** 35 min · **Rendimento:** 3 porções");
  assert.equal(pair.blocks[0].kind, "meta");
  assert.equal(pair.blocks[0].kind === "meta" && pair.blocks[0].items.length, 2);
});

test("rótulo longo ou com cara de frase não vira metadado", () => {
  const [long] = parseRichText("**Muito importante hoje e amanhã, de verdade:** x");
  assert.equal(long.blocks[0].kind, "paragraph");
  assert.equal(
    long.blocks[0].kind === "paragraph" && plainText(long.blocks[0].inlines),
    "Muito importante hoje e amanhã, de verdade: x",
  );
  const [sentence] = parseRichText("**Parabéns!**: você registrou 5 dias");
  assert.equal(sentence.blocks[0].kind, "paragraph");
});
