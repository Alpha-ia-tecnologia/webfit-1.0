-- 0014: versão da autorização de IA aceita no perfil (aiConsentVersion em src/types.ts e AI_CONSENT_VERSION
-- em src/lib/consent.ts). Uma versão menor que a atual pede a autorização de novo antes de usar a IA.
-- Aplicar depois de 0001–0013. Perfis existentes ficam com 0 (autorização a confirmar, como no aplicativo).
alter table webfit.profiles
  add column if not exists ai_consent_version integer not null default 0
    check (ai_consent_version >= 0);
comment on column webfit.profiles.ai_consent_version is
  'Versão da autorização de IA aceita pela pessoa; abaixo de AI_CONSENT_VERSION o aplicativo pede de novo antes de enviar dados.';
