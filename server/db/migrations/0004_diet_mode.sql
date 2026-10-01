-- 0004_diet_mode: inclui a criação de dieta nos modos aceitos pela telemetria.
-- Compatível com bancos que já aplicaram 0001_initial.
alter table webfit.agent_runs
  drop constraint agent_runs_mode_check,
  add constraint agent_runs_mode_check
    check (mode in ('chat', 'photo', 'exam', 'diet'));
