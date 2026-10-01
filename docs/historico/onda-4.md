# Expansão de recursos: Onda 4 — 28 e 29/09/2026

Conclusão do roteiro visual com os 19 itens da Onda 4: 12 implementados, 5 implementados em parte e 2 adiados. Quatro lotes: Cozinha, Evolução e semana, Tratamento, Registro e privacidade. Web e app nativo avançaram juntos, com as regras em `src/lib/` compartilhadas pelo alias `@shared`. As migrações novas (`0012` e `0013`) foram só escritas, o teste pago dos esquemas estritos não foi rodado e não há commit. As revisões de saúde, web, app nativo e segurança levaram a correções antes da verificação final; o que depende de decisão está em [Decisões pendentes](#decisões-pendentes).

## Onda 4

| Lote | Entregue |
| --- | --- |
| 1 · Cozinha | Minha dieta: "Comi esta" registra a refeição do plano com "Desfazer" quando todo item tem alimento na TACO e nenhum é alérgeno declarado; senão, "Ajustar" abre o prato para conferir. "Trocar" alterna as trocas já revisadas do plano e "Pedir outra opção" só preenche o chat. Semana do plano (S–D) com as trocas revisadas em rodízio, sem nova chamada de IA. Lista de compras do plano e das receitas → checklist → despensa. "Use primeiro" na Despensa e no Hoje, com lembrete às 10:00. Modo preparo em tela cheia com timers, tela acesa e "Descontar da despensa" |
| 2 · Evolução e semana | Destaques calculados no aparelho nos mini gráficos (chips como "94% da meta") e a folha "Como calculamos". Bem-estar e sono: semana em 7 colunas com rosto e cápsula de sono, mapa de 28 dias e leitura cruzada descritiva a partir de 4 dias com humor e sono. "Sua semana": cartão no Hoje só às segundas, entrada fixa na Evolução e stories de 5 partes; no web, imagem opcional desenhada no navegador; no app, resumo em texto pela folha de compartilhamento |
| 3 · Tratamento | Efeitos percebidos no bem-estar com intensidade (Leve, Moderada, Forte); "Como ficou?" nas refeições do Diário; grade "Seu ciclo" (D0–D6) na Evolução. Estoque do frasco ou caneta: doses restantes pelas aplicações registradas e "usar até" informado pela pessoa. "Seu ciclo da semana": dicas locais e revisadas por fase (dias 0 a 2, 3 a 5, 6 e 7), com "+ Combinado" em um toque. Leitura do rótulo do frasco por foto, com confirmação da pessoa; a foto não é salva. Migração `0012` |
| 4 · Registro e privacidade | "Descrever refeição" por texto, no web e no app, ou por ditado no app Android quando o reconhecimento em pt-BR está instalado no aparelho → itens para conferir com alimentos da TACO, com "Falta porção" quando a quantidade não foi dita. "Qualidade do dia" no Diário: anel de variedade com 7 grupos, sem calorias. Cartão "Essencial" e "Relatório para consulta", montados no aparelho: no web, impressão em A4 pelo navegador (`window.print()`), que também salva em PDF; no app, um arquivo HTML compartilhado pela folha do sistema. "Ocultar números do corpo" (`hideBodyNumbers`) em Meu espaço › Preferências e dados › "Suas escolhas". App instalável no navegador, com atalhos para água, refeição e registro rápido. Migração `0013` |

Guias atualizados: [Saídas estruturadas da IA](../guias/ia-estruturada.md) e [Testes e verificações](../guias/testes.md).

## Itens em parte e adiados

Implementados em parte:

- **EVOL-06:** só a fase 1, com os destaques calculados no aparelho. A fase 2, com um modo `progress` no servidor, foi adiada.
- **DIARIO-12:** só o anel de variedade. Fibra e sódio foram adiados porque `src/data/foods.json` não tem esses dados da TACO, e o importador precisa de Python. O cartão já tem lugar para eles.
- **ESPACO-08:** não há PDF nativo, porque o `expo-print` não está instalado. O web imprime pelo navegador; o app gera o HTML no aparelho e o entrega pelo `expo-sharing`. Nada passa pela IA nem pelo servidor.
- **ESPACO-13:** só a opção `hideBodyNumbers`. Bloqueio por biometria, proteção contra captura de tela e PIN no web foram adiados (dependências novas).
- **HOJE-13:** só os atalhos do manifest do web. Widgets Android e notificações acionáveis foram adiados (biblioteca nativa nova e teste em aparelho).

Adiados por inteiro:

- **DIARIO-06:** código de barras com o Open Food Facts (`expo-camera` e um proxy no servidor; cobertura no Brasil não confirmada).
- **HOJE-14:** Health Connect, com pesagens e passos (biblioteca a escolher, permissões e APK novo).

## Decisões tomadas

- **Sem modo `diet_meal`:** "Trocar" alterna as `trocas` revisadas do plano (`src/lib/diet-week.ts`) e não chama a IA.
- **Lista de compras** fica no aparelho, como a despensa e as receitas; não há tabela no banco.
- **Tela acesa no app:** o `expo-keep-awake` (dependência do Expo 57) é carregado com `require` só no primeiro uso (`mobile/src/components/despensa/use-keep-awake.ts`), sem mudança no `package.json`. O APK gerado de novo já o inclui. No web, vale a Screen Wake Lock API, com aviso discreto quando o navegador não oferece.
- **"Sua semana":** cartão no Hoje só às segundas; peso nunca entra na imagem nem no texto compartilhado.
- **Dicas do ciclo (SERINGA-11):** lista local e revisada (`src/lib/cycle-tips.ts`), sem modo de IA. Só aparecem com caneta de aplicação semanal, 18 anos ou mais e a resposta "não" sobre gestação e amamentação.
- **Ditado:** só no aparelho. O app usa o ditado no Android com o pt-BR instalado (`mobile/src/lib/dictation.ts`). No iOS não há botão de microfone: o `expo-speech-recognition` descarta em silêncio o pedido de reconhecimento no aparelho quando o pt-BR não tem modelo local, e o áudio iria a um servidor sem aviso. No web, só texto.
- **Atalhos do app instalável:** `?atalho=agua|refeicao|registro` abre a folha da água, o registro de refeição ou a grade do registro rápido. Nada é registrado sem a pessoa salvar, e o endereço é limpo.
- **App instalável no web** mantido, com o manifest e os ícones servidos pelo próprio app.

## Última verificação registrada

Rodada final de 29/09 (depois das revisões e das correções na quantidade dita da descrição e no trecho do rótulo):

- `npm run lint`, `npm run lint:react` (ESLint sem descobertas) e `npm run check:repo` (947 arquivos) sem problemas.
- `npm test`: 958 aprovados.
- `npm run build` e Playwright completo: 209 de 209.
- Verificação visual clara e escura: `"errors": []`.
- App nativo: tipos sem erro, export web e as 24 verificações do app aprovadas, com 1385 linhas `PASS`. As da Onda 4 usam as portas 3230 (`o4l1`), 3235 (`o4l2`), 3236 (`o4l3`) e 3237 (`o4l4`).
- `scripts/strict-schema-smoke.ts` não foi rodado. Se o provedor recusar um esquema, vale a reserva em texto: a descrição da refeição vira um aviso para buscar os alimentos, e o rótulo mostra "Não encontrei a concentração", com o botão "Digitar a concentração".

O APK de release foi gerado de novo em 29/09/2026 (`mobile/dist/WebFit-0.1.0-release.apk`). Não houve teste em aparelho.

## Decisões pendentes

1. **Commit:** o repositório ainda não tem commits. Revisar o diff antes do primeiro.
2. **Migrações `0006`–`0013`:** escritas e não aplicadas. Revisar e aplicar em ordem com `npm run db:migrate` no banco pretendido (schema `webfit`). As da Onda 4:
   - `0012_treatment_o4l3.sql`: `diary_entries.symptoms` (efeitos percebidos) e `diary_entries.satiety` ("Como ficou?"), a tabela `treatment_stock` e o modo `rotulo` na restrição de modos de `agent_runs`.
   - `0013_hide_body_numbers.sql`: `profiles.hide_body_numbers` e a lista completa de modos de `agent_runs`, agora com `meal_text`.
3. **`scripts/strict-schema-smoke.ts`:** 7 chamadas pagas à OpenAI para confirmar os esquemas estritos (`chat_blocos`, `chat_blocos` sensível, `dieta_v2`, `foto_itens`, `exame_resultados`, `refeicao_texto` e `rotulo_leitura`); só com autorização.
4. **Revisão profissional:** textos de saúde e regras de cautela, efeitos percebidos, dicas do ciclo, "Qualidade do dia", cartão "Essencial" e relatório para consulta, por profissional habilitado.
5. **Tema escuro do app nativo:** ligar `RN_DARK_MODE_ENABLED` segue a lista em `mobile/src/theme/theme.tsx` e exige teste em aparelho.
6. **Números do corpo no servidor:** com "Ocultar números do corpo", a anamnese e as pesagens continuam no contexto enviado ao agente; só a resposta é mascarada. Decidir se os campos numéricos saem do contexto.
7. **Meta de proteína em gramas:** a meta automática (1,2 ou 1,6 g por kg) continua visível com os números ocultos e permite deduzir o peso.
8. **Limite do `/api/agent` e pareamento na rede:** o limite (10 pedidos por minuto, 2 ao mesmo tempo) vale para o servidor todo, não por aparelho. Com `--lan`, qualquer aparelho da rede recebe o token em `/api/status`.
9. **Texto do microfone no `mobile/app.json`:** a permissão ainda diz que o microfone serve só para ditar mensagens ao agente, mas o ditado da refeição também o usa. Mudar exige um APK novo.
10. **Máscara de números do corpo na tela:** os rascunhos da descrição e da foto, as receitas e, no app, as análises de exame ainda não passam pela máscara no cliente. O servidor mascara as respostas novas, mas receitas e análises salvas antes de ligar a opção aparecem com os números.
11. **Validação em aparelho:** ditado no Android, tela acesa no modo preparo, TalkBack, compartilhamento do relatório e remoção dos arquivos da foto do rótulo do cache.

## Mudanças por espaço

Cerca de 300 arquivos mudaram em `src/`, `server/`, `mobile/src/`, `mobile/scripts/` e `tests/`. As regras novas ficam em `src/lib/`, compartilhadas pelo web e pelo app:

- **Cozinha:** `diet-week`, `shopping-list`, `shopping-schema`, `use-first`, `pantry-deduct` e `cook-timer`.
- **Evolução e semana:** `progress-insights`, `wellbeing-trend`, `week-recap` e `week-share`. A imagem do web é desenhada por `src/components/semana/week-share-image.ts`.
- **Tratamento:** `symptoms`, `cycle-tips`, `treatment-stock`, `label-read` e `label-review`. No app, `mobile/src/lib/ephemeral-photo.ts` apaga do cache os arquivos da foto do rótulo.
- **Registro e privacidade:** `meal-text`, `food-groups`, `essential`, `report`, `report-html` e `body-privacy`. No app, `mobile/src/lib/dictation.ts` decide se há ditado.
- **Compartilhado:** `maskBodyNumbers` e `hasBodyNumbers` em `src/lib/text.ts`, `bodyNumbers` em `src/lib/space.ts` e a opção `hideBodyNumbers` de `maskStructured` em `src/lib/structured.ts`. Os atalhos ficam em `public/manifest.webmanifest` e `launchShortcut` (`src/lib/shortcuts.ts`).
- **Agente:** modos `meal_text` (`refeicao_texto`) e `rotulo` (`rotulo_leitura`) em `server/graph/structured-specs.ts`, com os adendos em `server/graph/prompts.ts`; máscara de números do corpo em `server/graph/finalize.ts`; `store: false` nas chamadas à OpenAI (`server/model.ts`).
- **Design:** nenhum token novo.
