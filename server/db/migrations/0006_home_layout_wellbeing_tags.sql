-- 0006: ordem das seções do Hoje ("Editar Hoje") e marcadores do bem-estar.
-- Compatível com bancos que já aplicaram 0001–0005; perfis e registros antigos ficam no padrão.
alter table webfit.profiles
  add column if not exists home_layout text not null default ''
    check (char_length(home_layout) <= 300);

alter table webfit.diary_entries
  add column if not exists tags text[]
    check (tags is null or (cardinality(tags) <= 8 and type = 'bem_estar'));
