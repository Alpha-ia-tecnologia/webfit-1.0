# Retomada — 15/09/2026

A retomada encontrou `src/lib/exams.ts` e `src/components/anamnese/ExamAttachments.tsx` como alterações mais recentes, ainda sem integração. O pedido de continuação não incluía o histórico anterior; a conclusão abaixo foi inferida desses arquivos.

## Concluído nesta retomada

- Integração dos anexos opcionais na revisão da anamnese web.
- Análise sequencial dos arquivos selecionados antes da dieta, com progresso, cancelamento e nova tentativa.
- Envio das transcrições selecionadas no contexto da dieta, sem reenviar seus arquivos.
- Preservação de anexos e análises concluídas em caso de falha; respostas tardias não restauram exames excluídos.
- Correção da comparação de urgência que impedia a checagem de tipos.
- Documentação no README e testes de regressão.

## Verificação

- TypeScript: aprovado.
- Build web: aprovado; avisos existentes de tamanho de bundle e anotações de dependências.
- Testes unitários: 137 aprovados.
- Primeira suíte E2E completa: 22 aprovados e 1 falha no seletor do novo teste de cancelamento. Seletor corrigido; suíte de dieta repetida após os ajustes finais: 9/9 aprovados. As outras 14 jornadas passaram na execução completa.
- Captura móvel dos anexos inspecionada; largura de 390 px sem transbordamento horizontal.
- IA simulada nos testes; não houve envio real de laudos a provedores.

## Limites desta entrega

Esta integração da anamnese foi concluída na versão web. O fluxo correspondente em React Native e um novo APK não foram gerados nesta retomada. Não houve publicação, alteração de banco ou chamadas reais pagas à IA.

## Atualização solicitada: Android

O cartão de exames foi incluído no final da revisão da anamnese Android. A análise sequencial compartilha src/lib/exams.ts com o web. O fluxo oferece progresso, cancelamento, nova tentativa e persistência no SQLite. O seletor de documentos também normaliza a data URL retornada no export web do Expo.

Validações concluídas: TypeScript mobile, export Android (Hermes) e web, 7 testes compartilhados de exames, jornada Expo com SQLite real (anexo, recarga, seleção, análise antes da dieta, falha, nova tentativa e cancelamento), comparação visual web × Expo pelas capturas do script de paridade e inspeção do cartão de exames em 390 px. Não havia aparelho conectado via ADB; não foi realizado teste físico. A IA usada nas jornadas é simulada.


## 2026-09-16 — envio de mensagens ao agente no Android

- Diagnóstico: backend desligado (ECONNREFUSED em 127.0.0.1:3000); o botão também ficava desabilitado por aiReady/consentimento, com orientação fora do campo de mensagem.
- Servidor iniciado em modo LAN. /api/status respondeu ready:true via localhost e IP Wi-Fi 192.168.100.9:3000. O computador e o processo servidor precisam permanecer ligados; use npm run dev:lan após encerrar/reiniciar.
- O botão agora aceita a tentativa com texto quando não há outra operação em curso, verifica a conexão novamente e explica o impedimento junto ao composer. Preserva o rascunho quando offline/sem consentimento; permite abrir diretamente Preferências. Status ready:false explica falta de configuração da IA.
- Status/token atualizados antes da resolução de refreshAgent, evitando estado antigo no primeiro envio após reconectar. Consentimento continua obrigatório e é revalidado após operações assíncronas.
- Validação: TypeScript mobile e export Android+web aprovados; node --import tsx mobile/scripts/agent-check.mjs passou os 3 cenários com SQLite real isolado e API simulada (offline→reconexão/persistência, sem consentimento, servidor sem IA configurada).
- Um único teste real /api/agent com saudação sintética, contexto vazio e sem dados pessoais retornou HTTP 200 em 17,7 s, resposta reviewed:true. Não houve teste em aparelho físico.
- APK corrigido gerado com sucesso (Gradle assembleRelease, 30m09s): mobile/dist/WebFit-0.1.0-agente-corrigido.apk; assinatura v2, bundle incorporado e copia SHA256 verificados. SHA256: 6AEDCC9BCB891A314ADFCF8F97711DE4004BC04D9B5BB4CC599DEA9D218C077D. O caminho WebFit-0.1.0-release.apk tambem foi atualizado.

- Verificação final: o servidor de desenvolvimento encerrou com EBUSY do watcher ao monitorar mobile/.gradle-agent-threads.log durante o build. Foi reiniciado em modo de produção (--production --lan), sem watcher do Vite. Ambos os endereços (127.0.0.1 e 192.168.100.9, porta3000) retornaram HTTP200/ready:true. Para uso do APK após reiniciar o computador, preferir npm run start:lan; manter computador e servidor ligados e celular na mesma Wi-Fi.
