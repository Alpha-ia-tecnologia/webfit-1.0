-- Usuário do banco só para o WebFit: altera apenas o schema webfit do banco compartilhado "nutri"
-- (nada no public nem em outros schemas). Rodar uma vez, como administrador do PostgreSQL, DEPOIS de
-- aplicar as migrações (npm run db:migrate com o usuário administrador):
--
--   psql -U postgres -d nutri -v senha="'uma-senha-longa-e-aleatoria'" -f db-role.sql
--
-- Depois use esse usuário no DATABASE_URL de deploy/.env.production.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'webfit_app') then
    create role webfit_app login;
  end if;
end $$;
alter role webfit_app with password :senha;
-- O search_path do app aponta para webfit (server/db/client.ts).
alter role webfit_app set search_path = webfit, public;

grant usage on schema webfit to webfit_app;
grant select, insert, update, delete on all tables in schema webfit to webfit_app;
grant usage, select on all sequences in schema webfit to webfit_app;
-- Tabelas de migrações futuras (criadas pelo administrador) já nascem liberadas para o app.
alter default privileges in schema webfit grant select, insert, update, delete on tables to webfit_app;
alter default privileges in schema webfit grant usage, select on sequences to webfit_app;
