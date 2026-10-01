-- 0013: "Ocultar números do corpo" (Onda 4 · Lote 4, ESPACO-13), preferência de exibição do Meu espaço,
-- e o modo "meal_text" (descrição de refeição, DIARIO-07) na telemetria do agente.
-- Aplicar depois de 0001–0012. Perfis existentes ficam com false (números visíveis, como antes).
alter table webfit.profiles
  add column if not exists hide_body_numbers boolean not null default false;
comment on column webfit.profiles.hide_body_numbers is
  'Oculta peso, altura, IMC, medidas e variações nas telas e nas respostas do agente; no relatório a seção Medidas vem desmarcada. O dado continua salvo e no backup.';

-- Modo do agente: lista completa até esta migração (a 0012 acrescentou "rotulo").
alter table webfit.agent_runs
  drop constraint if exists agent_runs_mode_check,
  add constraint agent_runs_mode_check
    check (mode in ('chat', 'photo', 'exam', 'diet', 'pantry_photo', 'shopping_photo', 'recipe', 'rotulo', 'meal_text'));
