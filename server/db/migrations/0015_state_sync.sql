-- 0015: sincronização do aplicativo com o banco (server/db/state-repo.ts e /api/sync).
-- O aparelho continua sendo a fonte do dia a dia; o servidor guarda uma cópia completa por pessoa e
-- devolve o mesmo estado ao restaurar. Aplicar depois de 0001–0014.

-- Coleções que não têm tabela própria (dieta, despensa, receitas, básicos de cozinha, lista de compras,
-- pratos salvos): ficam num documento por pessoa, validado pelo stateSchema antes de gravar.
create table if not exists webfit.device_data (
  user_id uuid primary key references webfit.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 8000000),
  updated_at timestamptz not null default now()
);
comment on table webfit.device_data is
  'Partes do estado do aplicativo sem tabela própria; o restante do estado mora nas tabelas normalizadas.';
create trigger device_data_set_updated_at before update on webfit.device_data
  for each row execute function webfit.set_updated_at();

-- A ordem das listas no aparelho volta igual ao restaurar.
alter table webfit.diary_entries add column if not exists position integer not null default 0 check (position >= 0);
alter table webfit.measurements add column if not exists position integer not null default 0 check (position >= 0);
alter table webfit.habits add column if not exists position integer not null default 0 check (position >= 0);
alter table webfit.chat_messages add column if not exists position integer not null default 0 check (position >= 0);
alter table webfit.exams add column if not exists position integer not null default 0 check (position >= 0);
alter table webfit.appointments add column if not exists position integer not null default 0 check (position >= 0);
alter table webfit.goal_history add column if not exists position integer not null default 0 check (position >= 0);
alter table webfit.notifications_read add column if not exists position integer not null default 0 check (position >= 0);
alter table webfit.injections add column if not exists position integer not null default 0 check (position >= 0);
-- Alimentos cadastrados pela pessoa (o catálogo TACO tem user_id nulo e fica sem posição).
alter table webfit.foods add column if not exists position integer check (position is null or position >= 0);

-- O alimento de cada item do diário guarda também a fonte e a observação (ex.: traços, NA). food_ref
-- é o id do alimento no aparelho, mesmo fora do catálogo (estimado pelo agente, receita); food_id só
-- aponta para foods quando o alimento existe lá.
alter table webfit.diary_items
  add column if not exists food_ref text check (food_ref is null or char_length(food_ref) <= 100),
  add column if not exists food_source_url text check (food_source_url is null or char_length(food_source_url) <= 500),
  add column if not exists food_note text check (food_note is null or char_length(food_note) <= 500);
alter table webfit.habit_completions add column if not exists position integer not null default 0 check (position >= 0);

comment on column webfit.profile_drafts.answers is 'Respostas do rascunho; JSON null quando só a etapa foi guardada.';
