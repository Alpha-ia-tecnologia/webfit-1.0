-- 0017: condições de saúde estruturadas da anamnese (conditionTags em src/types.ts; chaves em
-- CONDITION_TAGS de src/lib/conditions.ts). O texto livre "conditions" continua, agora como detalhes /
-- outra condição: pode ficar vazio quando há condição marcada na lista, e é obrigatório com "outra".
-- Aplicar depois de 0001–0016. Perfis existentes ficam com lista vazia (o app mantém a regra antiga do
-- texto livre até a pessoa escolher na lista). As chaves são validadas pelo aplicativo (stateSchema).
-- Idempotente: pode ser reaplicada sem efeito.
alter table webfit.profiles
  add column if not exists condition_tags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(condition_tags) = 'array' and jsonb_array_length(condition_tags) <= 12);
comment on column webfit.profiles.condition_tags is
  'Condições de saúde marcadas na anamnese (lista de chaves de CONDITION_TAGS, até 12); "nenhuma" é exclusiva. Lista vazia = perfil antigo, só com o texto livre de conditions.';

-- Mesmas regras do profileSchema: texto obrigatório só sem lista ou com "outra"; "nenhuma" sozinha.
alter table webfit.profiles
  drop constraint if exists profiles_conditions_check,
  add constraint profiles_conditions_check
    check (char_length(conditions) <= 2000 and (char_length(conditions) >= 1 or jsonb_array_length(condition_tags) > 0)),
  drop constraint if exists profiles_conditions_other_check,
  add constraint profiles_conditions_other_check
    check (not condition_tags @> '["outra"]'::jsonb or char_length(conditions) >= 1),
  drop constraint if exists profiles_condition_tags_none_check,
  add constraint profiles_condition_tags_none_check
    check (not condition_tags @> '["nenhuma"]'::jsonb or jsonb_array_length(condition_tags) = 1);
comment on column webfit.profiles.conditions is
  'Detalhes das condições de saúde ou a outra condição (texto livre); obrigatório sem condição marcada em condition_tags ou com "outra".';
