-- 0001_initial: esquema completo do WebFit (espelha src/types.ts).
-- Tudo fica no schema "webfit", sempre qualificado explicitamente, para não colidir com outras aplicações que usem o mesmo banco.
-- Datas de calendário do usuário ficam em DATE (YYYY-MM-DD); horários em TIME; eventos em TIMESTAMPTZ.
create schema if not exists webfit;

create or replace function webfit.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- Usuário do aplicativo (hoje um único usuário local; id igual ao userId do estado).
create table webfit.users (
  id uuid primary key default gen_random_uuid(),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table webfit.users is 'Dono dos dados. revision acompanha o número de gravações do estado.';
create trigger users_set_updated_at before update on webfit.users
  for each row execute function webfit.set_updated_at();

-- Anamnese completa (8 etapas). Um perfil por usuário.
create table webfit.profiles (
  user_id uuid primary key references webfit.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  birth_date date not null check (birth_date between date '1900-01-01' and current_date),
  sex text not null check (sex in ('masculino', 'feminino', 'nao_informado')),
  occupation text not null check (char_length(occupation) between 1 and 2000),
  routine text not null check (char_length(routine) between 1 and 2000),
  weight numeric(5,1) not null check (weight between 20 and 350),
  height numeric(5,1) not null check (height between 100 and 250),
  target_weight numeric(5,1) check (target_weight between 20 and 350),
  waist numeric(5,1) check (waist between 30 and 250),
  hip numeric(5,1) check (hip between 30 and 250),
  body_fat numeric(4,1) check (body_fat between 1 and 75),
  measurement_date date not null check (measurement_date <= current_date),
  measurement_method text not null check (char_length(measurement_method) between 1 and 2000),
  conditions text not null check (char_length(conditions) between 1 and 2000),
  medications text not null check (char_length(medications) between 1 and 2000),
  supplements text not null check (char_length(supplements) between 1 and 2000),
  surgeries text not null check (char_length(surgeries) between 1 and 2000),
  family_history text not null check (char_length(family_history) between 1 and 2000),
  pregnancy text not null check (pregnancy in ('nao', 'gestacao', 'amamentacao', 'nao_informado')),
  fluid_restriction text not null check (fluid_restriction in ('nao', 'sim', 'nao_sei')),
  eating_disorder text not null check (eating_disorder in ('nao', 'sim', 'nao_informado')),
  allergies text not null check (allergies in ('nao', 'sim', 'nao_sei')),
  allergy_details text not null default '' check (char_length(allergy_details) <= 2000),
  diet text not null check (char_length(diet) between 1 and 2000),
  avoided_foods text not null check (char_length(avoided_foods) between 1 and 2000),
  favorite_foods text not null check (char_length(favorite_foods) between 1 and 2000),
  meal_routine text not null check (char_length(meal_routine) between 1 and 2000),
  meals_per_day smallint not null check (meals_per_day between 1 and 12),
  usual_water integer check (usual_water between 0 and 10000),
  digestive_symptoms text not null check (char_length(digestive_symptoms) between 1 and 2000),
  bowel_habit text not null check (char_length(bowel_habit) between 1 and 2000),
  alcohol text not null check (char_length(alcohol) between 1 and 2000),
  tobacco text not null check (char_length(tobacco) between 1 and 2000),
  sleep_hours numeric(4,1) not null check (sleep_hours between 0 and 24),
  sleep_quality text not null check (sleep_quality in ('boa', 'regular', 'ruim', 'nao_informado')),
  stress text not null check (stress in ('baixo', 'moderado', 'alto', 'nao_informado')),
  activity_level text not null check (activity_level in ('sedentario', 'leve', 'moderado', 'intenso')),
  exercise_type text not null check (char_length(exercise_type) between 1 and 2000),
  exercise_days smallint not null check (exercise_days between 0 and 7),
  exercise_minutes numeric(5,1) not null check (exercise_minutes between 0 and 600),
  sedentary_hours numeric(4,1) not null check (sedentary_hours between 0 and 24),
  wake_time time not null,
  sleep_time time not null,
  goal text not null check (goal in ('organizar', 'manter', 'perder', 'ganhar')),
  motivation text not null check (char_length(motivation) between 1 and 2000),
  barriers text not null check (char_length(barriers) between 1 and 2000),
  food_budget text not null check (char_length(food_budget) between 1 and 2000),
  cooking_time text not null check (char_length(cooking_time) between 1 and 2000),
  professional_plan text not null check (char_length(professional_plan) between 1 and 2000),
  manual_calories integer check (manual_calories between 500 and 7000),
  manual_water integer check (manual_water between 100 and 10000),
  manual_protein numeric(6,1) check (manual_protein between 1 and 500),
  manual_carbs numeric(7,1) check (manual_carbs between 1 and 1000),
  manual_fat numeric(6,1) check (manual_fat between 1 and 400),
  consent_local boolean not null check (consent_local),
  consent_ai boolean not null default false,
  hide_calories boolean not null default false,
  reminders_enabled boolean not null default false,
  quiet_start time not null,
  quiet_end time not null,
  hydration_interval smallint not null check (hydration_interval between 30 and 480),
  breakfast_time time not null,
  lunch_time time not null,
  dinner_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_measurement_after_birth check (measurement_date >= birth_date),
  constraint profiles_allergy_details_required check (allergies <> 'sim' or char_length(btrim(allergy_details)) > 0)
);
comment on table webfit.profiles is 'Anamnese obrigatória; medidas atuais refletem a última medição.';
create trigger profiles_set_updated_at before update on webfit.profiles
  for each row execute function webfit.set_updated_at();

-- Rascunho da anamnese antes da conclusão (respostas parciais em JSON).
create table webfit.profile_drafts (
  user_id uuid primary key references webfit.users(id) on delete cascade,
  step smallint not null default 0 check (step between 0 and 7),
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger profile_drafts_set_updated_at before update on webfit.profile_drafts
  for each row execute function webfit.set_updated_at();

-- Histórico de metas: snapshot do perfil vigente a partir de uma data.
create table webfit.goal_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references webfit.users(id) on delete cascade,
  effective_date date not null,
  profile_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, effective_date)
);

-- Pesagens e medidas datadas.
create table webfit.measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references webfit.users(id) on delete cascade,
  date date not null,
  weight numeric(5,1) not null check (weight between 20 and 350),
  height numeric(5,1) not null check (height between 100 and 250),
  waist numeric(5,1) check (waist between 30 and 250),
  hip numeric(5,1) check (hip between 30 and 250),
  body_fat numeric(4,1) check (body_fat between 1 and 75),
  method text not null check (char_length(method) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- Catálogo de alimentos: TACO (user_id nulo) e alimentos de rótulo cadastrados pelo usuário.
create table webfit.foods (
  id text primary key check (char_length(id) between 1 and 100),
  user_id uuid references webfit.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  category text not null default '' check (char_length(category) <= 100),
  calories_per_100g numeric(7,3) not null check (calories_per_100g between 0 and 1000),
  protein_per_100g numeric(6,3) not null check (protein_per_100g between 0 and 100),
  carbs_per_100g numeric(6,3) not null check (carbs_per_100g between 0 and 100),
  fat_per_100g numeric(6,3) not null check (fat_per_100g between 0 and 100),
  source text not null check (char_length(source) between 1 and 500),
  source_url text check (char_length(source_url) <= 500),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
comment on table webfit.foods is 'Valores por 100 g com três casas decimais; arredondamento só no total da refeição.';
create index foods_user_idx on webfit.foods (user_id);
create index foods_name_idx on webfit.foods (lower(name));

-- Diário: refeições, água e bem-estar por data.
create table webfit.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references webfit.users(id) on delete cascade,
  date date not null,
  time time not null,
  type text not null check (type in ('refeicao', 'agua', 'bem_estar')),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  category_tag text check (char_length(category_tag) <= 50),
  calories integer check (calories between 0 and 50000),
  protein numeric(7,1) check (protein between 0 and 5000),
  carbs numeric(7,1) check (carbs between 0 and 10000),
  fat numeric(7,1) check (fat between 0 and 5000),
  image_url text check (image_url is null or image_url like 'data:image/%'),
  amount_ml integer check (amount_ml between 1 and 5000),
  rating smallint check (rating between 1 and 5),
  sleep_hours numeric(4,1) check (sleep_hours between 0 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diary_water_requires_amount check (type <> 'agua' or amount_ml is not null),
  constraint diary_wellbeing_requires_rating check (type <> 'bem_estar' or rating is not null),
  constraint diary_image_size check (image_url is null or octet_length(image_url) <= 3000000),
  constraint diary_image_only_for_meal check (image_url is null or type = 'refeicao')
);
comment on column webfit.diary_entries.image_url is 'Data URL (image/jpeg|png|webp) de até 3 MB; só para refeições.';
create index diary_entries_user_date_idx on webfit.diary_entries (user_id, date desc, time desc);
create trigger diary_entries_set_updated_at before update on webfit.diary_entries
  for each row execute function webfit.set_updated_at();

-- Ingredientes de uma refeição com snapshot nutricional (preserva o histórico se o catálogo mudar).
create table webfit.diary_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references webfit.diary_entries(id) on delete cascade,
  position smallint not null check (position between 0 and 99),
  food_id text references webfit.foods(id) on delete set null,
  food_name text not null check (char_length(food_name) between 1 and 200),
  food_category text not null default '',
  calories_per_100g numeric(7,3) not null check (calories_per_100g between 0 and 1000),
  protein_per_100g numeric(6,3) not null check (protein_per_100g between 0 and 100),
  carbs_per_100g numeric(6,3) not null check (carbs_per_100g between 0 and 100),
  fat_per_100g numeric(6,3) not null check (fat_per_100g between 0 and 100),
  source text not null check (char_length(source) between 1 and 500),
  grams numeric(6,1) not null check (grams > 0 and grams <= 5000),
  unique (entry_id, position)
);
create index diary_items_food_idx on webfit.diary_items (food_id);

-- Hábitos e conclusões por data.
create table webfit.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references webfit.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 150),
  time_of_day time not null,
  created_date date not null,
  created_at timestamptz not null default now()
);
create index habits_user_idx on webfit.habits (user_id);

create table webfit.habit_completions (
  habit_id uuid not null references webfit.habits(id) on delete cascade,
  date date not null,
  completed_at timestamptz not null default now(),
  primary key (habit_id, date)
);

-- Conversa com o agente; meta guarda especialistas, revisão e avisos.
create table webfit.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references webfit.users(id) on delete cascade,
  sender text not null check (sender in ('ai', 'user')),
  text text not null check (char_length(text) <= 20000),
  sent_at timestamptz not null default now(),
  status text check (status in ('sent', 'error')),
  meta jsonb,
  created_at timestamptz not null default now()
);
create index chat_messages_user_sent_idx on webfit.chat_messages (user_id, sent_at);

-- Laudos de exame: arquivo binário validado por tipo e tamanho (5 MB).
create table webfit.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references webfit.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  date date not null,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  file_data bytea not null check (octet_length(file_data) between 1 and 5242880),
  notes text not null default '' check (char_length(notes) <= 2000),
  analysis text check (char_length(analysis) <= 20000),
  created_at timestamptz not null default now()
);
comment on table webfit.exams is 'Limite de 30 laudos por usuário é aplicado pela aplicação.';
-- Formatos já comprimidos: evita a compressão TOAST inútil a cada gravação.
alter table webfit.exams alter column file_data set storage external;
create index exams_user_date_idx on webfit.exams (user_id, date desc);

-- Consultas já combinadas com um profissional (link HTTPS externo).
create table webfit.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references webfit.users(id) on delete cascade,
  professional text not null check (char_length(professional) between 2 and 200),
  registration text not null default '' check (char_length(registration) <= 100),
  date date not null,
  time time not null,
  url text not null check (char_length(url) <= 2000 and url like 'https://%'),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create index appointments_user_date_idx on webfit.appointments (user_id, date, time);

-- Lembretes lidos (id do lembrete é derivado: data:chave).
create table webfit.notifications_read (
  user_id uuid not null references webfit.users(id) on delete cascade,
  notification_id text not null check (char_length(notification_id) between 1 and 200),
  read_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);

-- Telemetria do agente sem conteúdo: apenas metadados de execução.
create table webfit.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references webfit.users(id) on delete set null,
  mode text not null check (mode in ('chat', 'photo', 'exam')),
  specialists text[] not null default '{}'
    check (cardinality(specialists) <= 3 and specialists <@ array['nutricionista', 'rotina', 'analista_exames']),
  reviewed boolean not null default false,
  revisions smallint not null default 0 check (revisions >= 0),
  urgency text not null default 'nenhuma' check (urgency in ('nenhuma', 'atencao', 'imediata')),
  llm_calls smallint not null default 0 check (llm_calls >= 0),
  duration_ms integer not null check (duration_ms >= 0),
  outcome text not null check (char_length(outcome) between 1 and 40),
  created_at timestamptz not null default now()
);
comment on table webfit.agent_runs is 'Nunca guarda textos, contexto ou arquivos; só métricas e o código de resultado.';
create index agent_runs_user_created_idx on webfit.agent_runs (user_id, created_at desc);
