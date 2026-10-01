-- 0007_injection_method: modo de aplicação (frasco e seringa, caneta com seletor ou caneta de dose única).
-- Canetas registram só a dose em mg: concentração, seringa, unidades e volume passam a aceitar nulo.
-- Aplicar depois de 0001–0006: registros existentes ficam como 'frasco' com todos os valores.
alter table webfit.injections
  add column if not exists method text not null default 'frasco'
    check (method in ('frasco', 'caneta', 'dose_unica')),
  alter column concentration_mg_per_ml drop not null,
  alter column syringe_units drop not null,
  alter column units drop not null,
  alter column volume_ml drop not null,
  -- 4 casas: 19 UI a 1,34 mg/ml = 0,2546 mg (com 3 casas viraria 0,255 e seria exibida como 0,26).
  alter column dose_mg type numeric(8,4);

alter table webfit.injections
  add constraint injections_method_fields check (
    (method = 'frasco'
      and concentration_mg_per_ml is not null and syringe_units is not null
      and units is not null and volume_ml is not null)
    or (method <> 'frasco'
      and concentration_mg_per_ml is null and syringe_units is null
      and units is null and volume_ml is null)
  );

comment on column webfit.injections.method is 'Como a pessoa aplica: frasco (seringa de insulina), caneta (seletor de dose) ou dose_unica.';
comment on column webfit.injections.units is 'Unidades (UI) aspiradas; 100 UI = 1 ml. Nulo nas canetas.';
comment on column webfit.injections.dose_mg is 'Dose em mg: volume_ml × concentration_mg_per_ml no frasco; informada pela pessoa na caneta.';
