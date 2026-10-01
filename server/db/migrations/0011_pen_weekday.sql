-- 0011: dia da semana da aplicação semanal da caneta (opcional), informado na anamnese.
-- Aplicar depois de 0001–0010: perfis existentes ficam com nulo.
alter table webfit.profiles
  add column if not exists pen_weekday smallint
    check (pen_weekday between 0 and 6);
comment on column webfit.profiles.pen_weekday is 'Dia da semana da aplicação semanal (0 = domingo … 6 = sábado); nulo quando varia ou não se aplica.';
