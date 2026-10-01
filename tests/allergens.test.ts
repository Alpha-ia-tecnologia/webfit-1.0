import { test } from "node:test";
import assert from "node:assert/strict";
import { allergenIn, allergenTokens } from "../src/lib/allergens";

const hit = (text: string, details: string, mode?: "food" | "name" | "prose") =>
  allergenIn(text, allergenTokens(details), mode);

test("allergenTokens: plural declarado ganha o singular; stopwords e palavras curtas ficam de fora", () => {
  assert.deepEqual(allergenTokens("Tenho alergia a ovos, camarões, nozes e castanhas"), [
    "ovos",
    "camaroes",
    "nozes",
    "castanhas",
    "ovo",
    "camarao",
    "noz",
    "castanha",
  ]);
  assert.deepEqual(allergenTokens("Amendoins e pães"), ["amendoins", "paes", "amendoim", "pao"]);
  assert.deepEqual(allergenTokens("Ovo, Amendoim, camarão"), ["ovo", "amendoim", "camarao"]);
  // "mais" e "umas" não viram "mai" nem "uma" (que achariam "maionese").
  assert.deepEqual(allergenTokens("Camarão e mais umas coisas"), ["camarao", "coisas", "coisa"]);
  assert.deepEqual(allergenTokens("Prefiro não detalhar"), ["prefiro", "detalhar"]);
  assert.deepEqual(allergenTokens(""), []);
});

test("allergenIn: plural declarado acha o singular no texto (prefixo cobre os dois)", () => {
  assert.equal(hit("Ovo cozido", "ovos"), "ovo");
  assert.equal(hit("Camarão grelhado", "camarões"), "camarao");
  assert.equal(hit("Noz", "nozes"), "noz");
  assert.equal(hit("Castanha do Pará", "castanhas"), "castanha");
  assert.equal(hit("Pasta de amendoim", "amendoins"), "amendoim");
  assert.equal(hit("Pão francês", "pães"), "pao");
  // Singular declarado continua achando o plural no texto.
  assert.equal(hit("Ovos mexidos", "ovo"), "ovo");
  assert.equal(hit("Nozes picadas", "nozes"), "nozes");
});

test("allergenIn: sem falso positivo novo e com as regras de nome e de texto corrido", () => {
  assert.equal(hit("Arroz com feijão", "ovos, camarões, nozes"), null);
  assert.equal(hit("Maionese caseira", "Camarão e mais nada"), null);
  assert.equal(hit("Receitas sem ovo", "ovos", "name"), null);
  assert.equal(hit("Frango com ovo", "ovos", "name"), "ovo");
  assert.equal(hit("Evite camarão no almoço", "camarões", "prose"), null);
  assert.equal(hit("Coma castanha no lanche", "castanhas", "prose"), "castanha");
  assert.equal(hit("Ovo cozido", ""), null);
});
