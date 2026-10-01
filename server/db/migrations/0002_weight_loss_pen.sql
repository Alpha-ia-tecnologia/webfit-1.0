-- Canetas emagrecedoras (GLP-1): uso, qual caneta, quantidade por aplicação e aplicações por mês.
-- Perfis existentes recebem 'nao_informado', o mesmo padrão aplicado pelo esquema do aplicativo.
alter table webfit.profiles
  add column weight_loss_pen text not null default 'nao_informado'
    check (weight_loss_pen in ('nao', 'sim', 'nao_informado')),
  add column weight_loss_pen_name text not null default ''
    check (char_length(weight_loss_pen_name) <= 200),
  add column weight_loss_pen_dose text not null default ''
    check (char_length(weight_loss_pen_dose) <= 100),
  add column weight_loss_pen_per_month smallint
    check (weight_loss_pen_per_month between 1 and 31),
  add constraint profiles_weight_loss_pen_details_required check (
    weight_loss_pen <> 'sim'
    or (
      char_length(btrim(weight_loss_pen_name)) > 0
      and char_length(btrim(weight_loss_pen_dose)) > 0
      and weight_loss_pen_per_month is not null
    )
  );
comment on column webfit.profiles.weight_loss_pen is 'Uso de caneta emagrecedora injetável: nao, sim ou nao_informado.';
comment on column webfit.profiles.weight_loss_pen_name is 'Nome da caneta ou do medicamento, texto livre escolhido na anamnese.';
comment on column webfit.profiles.weight_loss_pen_dose is 'Quantidade por aplicação informada pela pessoa (ex.: 0,5 mg).';
comment on column webfit.profiles.weight_loss_pen_per_month is 'Aplicações por mês (1 a 31).';
