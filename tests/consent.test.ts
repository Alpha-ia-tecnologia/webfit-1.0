import test from "node:test";
import assert from "node:assert/strict";
import { reviewAiConsent, AI_CONSENT_VERSION } from "../src/lib/consent";
import { stateFixture } from "./fixtures";

test("autorizações antigas não habilitam provedores adicionais", () => {
  const state = stateFixture();
  state.profile!.consentAi = true;
  state.profile!.aiConsentVersion = 0;
  state.draft = { consentAi: true };
  const upgraded = reviewAiConsent(state);
  assert.equal(upgraded.profile!.consentAi, false);
  assert.equal(upgraded.draft!.consentAi, false);
  assert.equal(state.profile!.consentAi, true);
  state.profile!.aiConsentVersion = AI_CONSENT_VERSION;
  assert.equal(reviewAiConsent(state).profile!.consentAi, true);
});
