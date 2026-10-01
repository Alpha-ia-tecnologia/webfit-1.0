-- Novos modos do agente; o cadastro de alimentos e receitas permanece local.
alter table webfit.agent_runs
  drop constraint agent_runs_mode_check,
  add constraint agent_runs_mode_check
    check (mode in ('chat', 'photo', 'exam', 'diet', 'pantry_photo', 'shopping_photo', 'recipe'));
