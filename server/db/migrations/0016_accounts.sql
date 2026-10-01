-- 0016: contas para o WebFit online (vários usuários na VPS). Cadastro só por convite, senha redefinida
-- pelo dono do servidor (scripts/admin.ts), sessões por token opaco e limite diário de IA por conta.
-- O id da conta é o mesmo userId do estado do aplicativo: a cópia em webfit.users/… é da conta.
-- Tokens, convites e códigos de redefinição são guardados só como hash SHA-256 (hex).

create table if not exists webfit.accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 3 and 254 and email = lower(email) and position('@' in email) > 1),
  name text not null default '' check (char_length(name) <= 80),
  password_hash text not null check (char_length(password_hash) <= 300),
  role text not null default 'member' check (role in ('owner', 'member')),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists accounts_email_key on webfit.accounts (email);
comment on table webfit.accounts is 'Contas do WebFit online; o id é o userId do estado do aplicativo.';
create trigger accounts_set_updated_at before update on webfit.accounts
  for each row execute function webfit.set_updated_at();

create table if not exists webfit.sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  account_id uuid not null references webfit.accounts(id) on delete cascade,
  client text not null check (client in ('web', 'app')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_account_idx on webfit.sessions (account_id);
create index if not exists sessions_expires_idx on webfit.sessions (expires_at);

create table if not exists webfit.invites (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  note text not null default '' check (char_length(note) <= 120),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references webfit.accounts(id) on delete set null
);

create table if not exists webfit.password_resets (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  account_id uuid not null references webfit.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Pedidos ao agente por conta e por dia (fuso do servidor); o limite vem de WEBFIT_AI_DAILY_LIMIT.
create table if not exists webfit.ai_usage (
  account_id uuid not null references webfit.accounts(id) on delete cascade,
  day date not null,
  requests integer not null default 0 check (requests >= 0),
  primary key (account_id, day)
);
