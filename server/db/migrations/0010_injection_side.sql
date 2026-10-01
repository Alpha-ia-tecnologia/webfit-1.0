-- 0010_injection_side: lado do corpo da aplicação no mapa de rodízio (SERINGA-04).
-- Lado da pessoa (não de quem olha a figura). Registros anteriores ficam nulos: "lado não informado".
-- Frente/costas não é gravado: deriva do local (abdômen e coxa na frente, braço atrás).
-- Aplicar depois de 0001–0009.
alter table webfit.injections
  add column if not exists side text
    check (side is null or side in ('esquerdo', 'direito'));

comment on column webfit.injections.side is
  'Lado do corpo da pessoa: esquerdo ou direito; nulo em registros anteriores ao mapa de rodízio.';
