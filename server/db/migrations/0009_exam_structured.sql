-- 0009: resultados estruturados dos laudos e perguntas marcadas (Onda 3 · Lote 2, ESPACO-05).
-- Aplicar depois de 0001–0008. Laudos antigos ficam com as colunas nulas e continuam exibindo o
-- texto de analysis.
alter table webfit.exams
  add column if not exists analysis_structured jsonb
    check (
      analysis_structured is null
      or (
        analysis is not null
        and jsonb_typeof(analysis_structured) = 'object'
        and jsonb_typeof(analysis_structured -> 'resultados') = 'array'
        and jsonb_array_length(analysis_structured -> 'resultados') <= 60
        and octet_length(analysis_structured::text) <= 100000
      )
    ),
  add column if not exists questions_done smallint[]
    check (
      questions_done is null
      or (
        analysis_structured is not null
        and cardinality(questions_done) <= 6
        and 0 <= all (questions_done)
        and 5 >= all (questions_done)
      )
    );
comment on column webfit.exams.analysis_structured is
  'Resultado validado por examResultSchema (src/lib/exam-result.ts); analysis segue sendo o texto renderizado e o que vai à dieta.';
comment on column webfit.exams.questions_done is
  'Índices de analysis_structured.perguntas marcados pela pessoa; zerado a cada nova análise.';
