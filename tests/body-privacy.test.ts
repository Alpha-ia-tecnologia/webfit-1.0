import { test } from "node:test";
import assert from "node:assert/strict";
import { BODY_PRIVACY_COPY, hiddenJourneyText } from "../src/lib/body-privacy";

test("jornada oculta: só a contagem de pesagens, no singular e no plural", () => {
  assert.equal(hiddenJourneyText(1), "Números do corpo ocultos · 1 pesagem registrada");
  assert.equal(hiddenJourneyText(8), "Números do corpo ocultos · 8 pesagens registradas");
});

test("textos do modo oculto não trazem número do corpo nem unidade", () => {
  const { weightPlaceholder, ...rest } = BODY_PRIVACY_COPY;
  // O exemplo do campo vazio é a única cifra, e só como dica de formato.
  assert.equal(weightPlaceholder, "Ex.: 70,5");
  for (const text of Object.values(rest)) assert.doesNotMatch(text, /\d|kg|cm|IMC/);
  assert.equal(BODY_PRIVACY_COPY.weightSaved, "Peso salvo.");
});
