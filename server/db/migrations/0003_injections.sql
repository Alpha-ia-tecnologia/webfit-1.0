-- 0003_injections: aplicações de medicamento injetável registradas pela calculadora de seringa e dose
-- (espelha injectionSchema em src/types.ts). Seringas de insulina: 100 UI = 1 ml; a dose em mg deriva do
-- volume aspirado e da concentração do frasco. Registro informado pela pessoa, sem validação clínica.
create table webfit.injections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references webfit.users(id) on delete cascade,
  date date not null,
  time time not null,
  medication text not null check (char_length(medication) between 1 and 120),
  concentration_mg_per_ml numeric(6,2) not null check (concentration_mg_per_ml > 0 and concentration_mg_per_ml <= 100),
  syringe_units smallint not null check (syringe_units in (30, 50, 100)),
  units smallint not null check (units between 1 and 100),
  volume_ml numeric(4,2) not null check (volume_ml > 0 and volume_ml <= 1),
  dose_mg numeric(7,3) not null check (dose_mg > 0 and dose_mg <= 100),
  site text not null check (site in ('abdomen', 'coxa', 'braco')),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint injections_units_within_syringe check (units <= syringe_units),
  constraint injections_volume_matches_units check (abs(volume_ml - units / 100.0) < 0.005)
);
comment on table webfit.injections is 'Aplicações de injetáveis (canetas ou frascos com seringa de insulina) informadas pela pessoa na calculadora de seringa e dose.';
comment on column webfit.injections.concentration_mg_per_ml is 'Concentração do frasco em mg/ml, conforme o rótulo informado pela pessoa.';
comment on column webfit.injections.syringe_units is 'Escala da seringa de insulina usada: 30, 50 ou 100 UI.';
comment on column webfit.injections.units is 'Unidades (UI) aspiradas; 100 UI = 1 ml.';
comment on column webfit.injections.dose_mg is 'Dose equivalente em mg = volume_ml × concentration_mg_per_ml.';
comment on column webfit.injections.site is 'Local subcutâneo: abdomen, coxa ou braco.';
create index injections_user_date_idx on webfit.injections (user_id, date desc, time desc);
create trigger injections_set_updated_at before update on webfit.injections
  for each row execute function webfit.set_updated_at();
