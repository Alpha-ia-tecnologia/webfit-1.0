-- 0008: blocos visuais das respostas do agente no chat (Onda 2 · Lote 6, SIS-02).
-- Compatível com bancos que já aplicaram 0001–0007; mensagens antigas ficam com blocks nulo e
-- continuam exibindo o texto. Dietas, receitas e rascunhos de foto seguem só no aparelho.
alter table webfit.chat_messages
  add column if not exists blocks jsonb
    check (
      blocks is null
      or (
        sender = 'ai'
        and jsonb_typeof(blocks) = 'array'
        and jsonb_array_length(blocks) between 1 and 3
        and octet_length(blocks::text) <= 100000
      )
    );
comment on column webfit.chat_messages.blocks is
  'Seções validadas por chatSectionsSchema (src/lib/agent-blocks.ts); text continua sendo a versão legível e o histórico enviado ao modelo.';
