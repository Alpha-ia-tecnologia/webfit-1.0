import type { AppState } from "../types";

/** Versão que informa DeepSeek, OpenAI e eventual encaminhamento ao provedor de reserva. */
export const AI_CONSENT_VERSION = 1;

/** Uma autorização antiga apenas para OpenAI não autoriza novos provedores. */
export function reviewAiConsent(state: AppState): AppState {
  const profile =
    state.profile && state.profile.aiConsentVersion < AI_CONSENT_VERSION
      ? { ...state.profile, consentAi: false }
      : state.profile;
  const draft =
    state.draft &&
    Number(state.draft.aiConsentVersion ?? 0) < AI_CONSENT_VERSION
      ? {
          ...state.draft,
          consentAi: false,
          aiConsentVersion: AI_CONSENT_VERSION,
        }
      : state.draft;
  return { ...state, profile, draft };
}
