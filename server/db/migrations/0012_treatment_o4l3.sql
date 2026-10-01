-- 0012_treatment_o4l3: efeitos percebidos no bem-estar e "Como ficou?" nas refeições (SERINGA-07),
-- estoque do frasco ou caneta (SERINGA-12) e o modo "rotulo" na telemetria do agente (INJECAO-X2).
-- Registros antigos ficam nulos. A foto do rótulo nunca é gravada: não existe coluna para ela.
-- Aplicar depois de 0001–0011.
alter table webfit.diary_entries
  add column if not exists symptoms jsonb
    check (symptoms is null or (type = 'bem_estar' and case when jsonb_typeof(symptoms) = 'array'
      then jsonb_array_length(symptoms) between 1 and 6 else false end)),
  add column if not exists satiety text
    check (satiety is null or (type = 'refeicao'
      and satiety in ('ainda_fome', 'na_medida', 'rapida', 'pouca_fome', 'desconforto')));

comment on column webfit.diary_entries.symptoms is
  'Efeitos percebidos: [{"key": "nausea", "intensity": 1..3}], chaves de SYMPTOM_KEYS (src/types.ts); só no bem-estar.';
comment on column webfit.diary_entries.satiety is
  '"Como ficou?" depois da refeição (SATIETY_KEYS em src/types.ts); só em refeição.';

create table if not exists webfit.treatment_stock (
  user_id uuid primary key references webfit.users(id) on delete cascade,
  method text not null check (method in ('frasco', 'caneta', 'dose_unica')),
  volume_ml numeric(4,2) check (volume_ml > 0 and volume_ml <= 10),
  doses smallint check (doses between 1 and 60),
  opened_on date not null,
  use_by date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint treatment_stock_quantity check (
    (method = 'frasco' and volume_ml is not null and doses is null)
    or (method <> 'frasco' and doses is not null and volume_ml is null)),
  constraint treatment_stock_use_by check (use_by is null or use_by >= opened_on)
);
comment on table webfit.treatment_stock is
  'Estoque do frasco ou caneta em uso, informado pela pessoa (um por pessoa). Nada é sugerido a partir dele: o consumo vem das aplicações registradas.';
comment on column webfit.treatment_stock.use_by is '"Usar até" digitado pela pessoa; nunca lido de outro lugar.';
create trigger treatment_stock_set_updated_at before update on webfit.treatment_stock
  for each row execute function webfit.set_updated_at();

-- Modo do agente: lista completa até esta migração. A 0013 (Onda 4 · Lote 4) acrescenta "meal_text"
-- e precisa repetir a lista inteira, inclusive "rotulo".
alter table webfit.agent_runs
  drop constraint if exists agent_runs_mode_check,
  add constraint agent_runs_mode_check
    check (mode in ('chat', 'photo', 'exam', 'diet', 'pantry_photo', 'shopping_photo', 'recipe', 'rotulo'));
