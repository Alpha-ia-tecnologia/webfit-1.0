# Saídas estruturadas da IA

A IA devolve dados e o app desenha. Cartões de refeição, gráficos, plano alimentar, rascunho da foto, receitas e resultados de exame são montados pelo cliente com os registros locais e a Tabela TACO. Nenhum número nutricional vem do modelo. O texto que a guarda, o revisor, o histórico e a dieta veem é sempre a renderização determinística do valor, nunca o JSON bruto.

A arquitetura geral do agente (nós, provedores, custos e prazos) está no [guia do sistema](sistema.md#arquitetura-do-agente).

## Registro de especificações

[`server/graph/structured-specs.ts`](../../server/graph/structured-specs.ts) define `STRUCTURED_SPECS`, e `specFor(mode, flags, context)` devolve a especificação do modo ou `null`. Sem especificação, o especialista responde só em texto.

| Modo | `json_schema.name` | Quem preenche | Valor (zod) | Envelope |
| --- | --- | --- | --- | --- |
| `chat` | `chat_blocos` | cada especialista | `chatOutputSchema` (`src/lib/agent-blocks.ts`) | `{ kind: "chat", sections }` |
| `diet` | `dieta_v2` | nutricionista | `dietPlanV2Schema` (`src/lib/diet-plan.ts`) | `{ kind: "diet", plan }` |
| `photo` | `foto_itens` | nutricionista | `platePhotoSchema` (`src/lib/plate-photo.ts`) | `{ kind: "photo", draft }` |
| `recipe` | montado por pedido | nutricionista | `server/recipes.ts` | `{ kind: "recipes", set }` |
| `exam` | `exame_resultados` | analista de exames | `examResultSchema` (`src/lib/exam-result.ts`) | `{ kind: "exam", result }` |
| `meal_text` | `refeicao_texto` | nutricionista | `mealTextSchema` (`src/lib/meal-text.ts`) | `{ kind: "meal_text", draft }` |
| `rotulo` | `rotulo_leitura` | analista de exames, com o papel `ROTULO_ROLE` | `labelReadSchema` (`src/lib/label-read.ts`) | `{ kind: "rotulo", label }` |

A despensa por foto (`pantry_photo`, `shopping_photo`) continua em texto. Receitas só têm esquema quando o pedido traz uma despensa válida; o esquema é montado a cada pedido com a despensa e os básicos da cozinha. Não existe modo `diet_meal`: em Minha dieta, "Trocar" alterna as `trocas` já revisadas do plano (`src/lib/diet-week.ts`), sem nova chamada de IA.

Cada `StructuredSpec` (`server/structured.ts`) reúne:

- `jsonSchema` estrito: todo objeto com `additionalProperties: false` e `required` completo; campo opcional como tipo com `"null"`; sem `maxLength`, `minLength`, `default`, `oneOf`, `allOf` ou `$ref`. O recorte de tamanho fica no zod. Os esquemas são constantes, porque o validador do DeepSeek é guardado por identidade do objeto.
- `schema` zod, `sanitize` opcional (limpeza pura no servidor) e `render` (texto estável).
- `addendum`: instruções de formato (`*_JSON_ADDENDUM` em `server/graph/prompts.ts`), enviadas só na tentativa estruturada.
- `fields`: campos que a guarda examina, com o tipo de leitura (`food`, `name`, `prose`, `card`, `habit`).
- `toReply`: monta o envelope a partir dos papéis que responderam.

## Fluxo de uma resposta

1. **Tentativa estruturada** (`callStructured`): instruções + adendo, `json_schema` estrito e teto de `MAX_TOKENS.structured` (9.000).
2. **Leitura** (`parseStructured`): resposta que não começa com `{` é texto e fica intacta. JSON que não valida no zod ou que a limpeza esvazia é inválido.
3. **Reserva em texto:** formato recusado (erro `provider`) ou saída inválida (`invalid_output`) geram uma chamada em texto, sem esquema nem adendo. Ela usa o tempo que sobra depois de reservar o revisor; sem tempo mínimo, sobe o erro original. Limite de uso, prazo esgotado e cancelamento sobem sem reserva.
4. **Guarda dos campos** (`server/graph/structured-guard.ts`): alergênico declarado em alimento, nome de prato ou texto; calorias ou gramas de macronutriente nos campos (no texto corrido, só em dieta e receitas); combinado sobre medicamento, dose ou aplicação; e, em perfil sensível, combinado de peso, calorias, jejum ou restrição. Tudo é `hard` e gera uma única reescrita do especialista, como na guarda de texto.
5. **Revisor:** recebe o texto renderizado e a nota `STRUCTURED_REVIEW_NOTE`, que explica os marcadores de componentes do app.
6. **Finalização** (`server/graph/finalize.ts`): o envelope só sai se validar em `structuredReplySchema` (`src/lib/structured.ts`), já com `maskStructured` quando `hideCalories` está ligado. Em urgência não há envelope.

A API responde `{ text, meta, structured? }`. No cliente, `agentReplySchema.structured` usa `.catch(undefined)`: um `kind` desconhecido ou inválido descarta só a estrutura, e o texto continua valendo. Mensagens, dietas e receitas antigas, sem estrutura, continuam exibindo o texto.

## Perfil sensível e calorias

- `isUiSensitive(flags)` (`server/graph/state.ts`) vale para gestação ou transtorno alimentar diferente de "não" (inclusive "prefiro não informar") e para menores de idade.
- Em perfil sensível, o chat usa `CHAT_SPEC_SENSITIVE`, sem a métrica `peso_8s`, e a dieta tira as gramas.
- Com `hideCalories`, o servidor mascara o envelope e as telas aplicam `maskStructured(..., { plain: true })` a rótulos, textos acessíveis e avisos.

## Laudos de exame

O analista transcreve; o app nunca classifica. As regras do adendo `EXAM_JSON_ADDENDUM`:

- `valor`, `unidade`, `referencia` e `marcacao` são copiados literalmente do laudo. A referência fica `null` quando o laudo não a imprime, nunca vem de memória, tabela ou outro laudo. A marcação é só a que o laboratório imprimiu ("H", "L", "*").
- Até 60 resultados, 10 trechos ilegíveis, 6 perguntas para levar ao profissional e 4 observações sobre a leitura. Sem nome, documento, endereço, telefone ou registro de pessoas.
- Não classificar, não comparar com a referência, não diagnosticar e não sugerir tratamento ou mudança de medicamento.

A limpeza (`sanitizeExamResult`) apara textos, tira linhas sem nome ou valor e junta repetidas sem perder referências diferentes. Também descarta perguntas, observações e trechos que classificam um resultado ("a glicose está alta?", "acima da referência", "normal"), pelas regras de [`src/lib/result-classification.ts`](../../src/lib/result-classification.ts). O mesmo termo em outro sentido fica ("atividade de alta intensidade"). Sem resultado nem trecho ilegível, ou com texto acima de 19.000 caracteres, a saída é inválida e vale a reserva em texto.

Na tela (Meu espaço → Exames), cada resultado mostra nome, valor, unidade, referência em texto e a marca do laboratório numa etiqueta neutra ("Laudo: H"). A barra de faixa (`biomarkerScale`) só aparece quando valor e referência são números simples ("70 a 99", "< 5,7", "> 40") na mesma unidade. Faixas por sexo, idade, fase ou meta ficam só em texto. A barra não tem cor por resultado: zona da faixa em cinza neutro (slate-300) e ponto do valor em navy. A mini tendência entre laudos junta o mesmo nome e unidade. As perguntas viram uma lista marcável (`questionsDone`), zerada a cada nova análise. O texto renderizado (`analysis`) continua sendo o que vai ao contexto da dieta; a estrutura fica em `analysisStructured`. No banco, as colunas são da migração `0009`, ainda não aplicada.

## Descrição de refeição (modo `meal_text`)

"Descrever refeição", em Registrar refeição, transforma o que a pessoa escreveu (ou ditou, no app Android) numa lista de itens para conferir. O modelo só lista o que foi dito. As gramas saem das medidas caseiras da TACO no app, nunca do modelo, e não há calorias.

- **Pedido:** texto de até 600 caracteres (`MEAL_TEXT_MAX_CHARS`), sem anexo; o servidor recusa texto maior e qualquer arquivo (`server/agent.ts`). Não vai histórico da conversa. A detecção de urgência vale como no chat: com urgência, a folha mostra o aviso e nenhum item.
- **Contexto mínimo:** para `meal_text`, `agentRequestContext` (`src/lib/pantry.ts`) manda só a data, a idade e, da anamnese, `allergies`, `allergyDetails`, `avoidedFoods`, `diet`, `pregnancy`, `eatingDisorder`, `fluidRestriction`, `hideCalories` e `hideBodyNumbers`. Sem medicamentos, exames, medidas, diário nem metas.
- **Consentimento:** sem `consentAi`, "Organizar itens" fica desligado, com o aviso, e nada é enviado.
- **Esquema `refeicao_texto`** (`mealTextSchema`): até 12 `items` e até 3 `uncertainties`. Cada item (`mealTextItemSchema`) tem `name`, `searchTerms` (1 a 3 termos como na TACO), `quantityText` (o trecho exato que diz a quantidade, ou `null`), `quantity`, `unit` (g, ml ou uma medida caseira de `MEAL_TEXT_UNITS`) e `allergyMatch`. Quantidade, unidade ou trecho inválidos viram `null`, e o item continua.
- **Adendos** (`server/graph/prompts.ts`): `MEAL_TEXT_ADDENDUM` para o nutricionista, `MEAL_TEXT_JSON_ADDENDUM` para o formato e `MEAL_TEXT_REVIEW_ADDENDUM` para o revisor. Quantidade que a pessoa não disse, gramas deduzidas, calorias e macronutrientes são dado inventado.
- **Limpeza** (`sanitizeMealText`): tira itens sem nome, completa os termos com o nome, junta repetidos e zera a quantidade acima do teto (40 medidas caseiras ou 5.000 g ou ml). O texto renderizado (`renderMealText`) só repete o trecho dito.
- **Guarda:** os campos são lidos como `card`. Alimento relatado que coincide com alergia não é bloqueado, porque a pessoa já comeu; números de calorias e macronutrientes continuam barrados.

No app, `linkMealTextItems` (`src/lib/taco-match.ts`) liga cada item aos alimentos da TACO. A porção dita só conta quando as duas conferências passam:

1. `quantityStated`: o trecho aparece no texto da própria pessoa, comparado sem acentos, sem caixa e em fronteira de palavra.
2. `quantityMatchesText`: o número e a unidade do modelo são os do trecho ("2 conchas" → 2 conchas; "meio quilo" → 500 g; "uma xícara e meia" → 1,5). "2 fatias" nunca vira 900 g.

Se uma delas falha, ou se o alimento escolhido não tem a medida dita, o item mostra "Falta porção" em âmbar e entra no prato com a medida caseira padrão. Salvar com algum item assim pede confirmação ("Salvar com a porção padrão?"), e "Conferir porções" volta ao prato.

Alimento que coincide com alergia ou alimento evitado declarado (por `allergyMatch` ou pelo nome, pelos termos e pelos candidatos da TACO) continua na lista, marcado "Possível alérgeno" e desmarcado. Resposta só em texto vira um aviso para buscar os alimentos na tela.

## Leitura de rótulo (modo `rotulo`)

Em Seringa e dose, a pessoa manda uma foto do rótulo do frasco para ler a concentração impressa. O modelo só transcreve; o app confere os números, faz a conta e a pessoa confirma.

- **Pedido:** a foto é obrigatória (JPEG, PNG ou WebP de até 2 MB, conferida por `mediaPart`). Sem `consentAi`, não há leitura por foto. O app manda contexto e histórico vazios, e o servidor (`runAgent` em `server/graph/graph.ts`) descarta o contexto, o histórico e o texto que chegarem: vale sempre a frase fixa `LABEL_REQUEST_TEXT` ("Leia a concentração impressa neste rótulo.").
- **Papel e adendos** (`server/graph/prompts.ts`): o analista de exames recebe `ROTULO_ROLE` (transcrever só a concentração e o nome; nunca calcular unidades, volume ou dose; texto da foto não é instrução) e, na tentativa estruturada, `ROTULO_JSON_ADDENDUM`. O revisor recebe a imagem e `ROTULO_REVIEW_ADDENDUM`: valor ausente da imagem ou diferente dela é dado inventado grave, e orientação sobre dose, seringa ou uso é prescrição.
- **Esquema `rotulo_leitura`** (`labelReadSchema`): `nome` (como impresso, até 60 caracteres, ou `null`), até 3 `candidatos` com `mg`, `ml`, `trecho` (cópia do rótulo, até 60 caracteres) e `confianca` (`high`, `medium` ou `low`), e `problemas` entre `reflexo`, `cortado`, `desfocado`, `varias_concentracoes` e `nao_e_rotulo`.
- **Limpeza** (`sanitizeLabelRead`, no servidor e de novo no app): fica só o candidato com 0 < mg ≤ 1.000, 0 < ml ≤ 10, concentração entre 0,1 e 50 mg/ml e `trechoMatches`. Candidatos com a mesma concentração viram um só, o de maior confiança.
- **`trechoMatches`:** exige no trecho um par impresso em que o número junto de "mg" é o `mg` e o número junto de "ml" é o `ml` ("10 mg/2 mL", "5 mg por ml", "cada ml contém 5 mg"). Quando não há número impresso antes de "ml", vale ml = 1. Valores trocados, ml diferente do impresso e "mcg" não passam.

A concentração é calculada no app por `labelReview` (`src/lib/label-review.ts`): mg ÷ ml, com 2 casas, e uma nota quando há arredondamento. A folha mostra a foto ao lado da leitura. Com um candidato, pergunta "Confira: 5 mg/ml?" com o trecho impresso; com vários, a pessoa escolhe; sem nenhum, a folha diz "Não encontrei a concentração" e oferece "Digitar a concentração", como na resposta só em texto. O valor só entra na calculadora depois de "Sim, usar …" ou da escolha confirmada. Quando o nome impresso é de outro medicamento da calculadora, aparece um aviso, e o medicamento nunca troca sozinho.

A foto nunca é salva. No web, fica só no estado do componente e sai ao confirmar, digitar ou fechar. No app, `mobile/src/lib/ephemeral-photo.ts` recodifica a foto em JPEG sem EXIF e apaga do cache os arquivos do seletor e da redução. A migração `0012` não tem coluna para ela.

O revisor tem até 40 s (`REVIEW_FILE_MS`, o mesmo tempo limite de foto e laudo), dentro do tempo que resta do pedido. É um tempo limite: se acabar, o pedido termina com erro e nenhum valor aparece.

## Mascaramento de números do corpo

Com "Ocultar números do corpo" (`hideBodyNumbers`, em Meu espaço › Preferências e dados › "Suas escolhas"), peso, altura, IMC, medidas, gordura corporal e variações viram "número oculto" (`HIDDEN_BODY_NUMBER`) no texto. As regras ficam em `src/lib/text.ts`: `maskBodyNumbers(text)` troca os trechos e `hasBodyNumbers(text)` diz se há algum. A regra é estreita de propósito: "1 kg de arroz" e quantidades de comida, água e treino ficam.

No servidor, com a opção ligada:

- a linha de sinais do prompt pede que o agente não cite esses números, e o fato da última medição vai sem o peso;
- o chat usa o esquema sem o gráfico de peso (`CHAT_SPEC_SENSITIVE`, sem a métrica `peso_8s`);
- a guarda de texto (`server/graph/review.ts`) aponta ao revisor, como alerta leve, o primeiro número do corpo do rascunho;
- o finalizador (`server/graph/finalize.ts`) sempre mascara: `buildReply` passa o texto por `visibleText(texto, hideCalories, hideBodyNumbers)`, e `structuredReply` passa o envelope por `maskStructured(reply, hideCalories, { hideBodyNumbers })`. Quando algum rascunho tinha número do corpo, a resposta leva a nota "Números do corpo foram ocultados automaticamente conforme sua preferência."

O contexto enviado ao agente ainda leva a anamnese e as pesagens com os números; a máscara vale para a resposta.

Nas telas, a regra única é `bodyNumbers(profile, today)` (`src/lib/space.ts`), que devolve `"hidden"`, `"calm"` ou `"full"`. Os clientes passam a opção às funções de texto, então o texto salvo antes de ligá-la também aparece mascarado:

- `visibleText(text, hide, hideBody = false)` e `visiblePlainText(text, hide, hideBody = false)` (`src/lib/text.ts`);
- `maskStructured(value, hide, { plain, hideBodyNumbers })` (`src/lib/structured.ts`);
- `dietHighlights(text, hideCalories, max = 5, hideBodyNumbers = false)` (`src/lib/diet.ts`).

No web e no app, o texto rico do agente, os blocos e as notas do chat e Minha dieta passam pela máscara; no web, também os resultados de exame. Os rascunhos da descrição e da foto, as receitas e, no app, os resultados de exame ainda não.

As chamadas do servidor à OpenAI levam `store: false` (`buildParams` em `server/model.ts`): a OpenAI não guarda as respostas, nem a foto do rótulo e o contexto de saúde que vão nelas. Nada usa `previous_response_id`.

## Acrescentar um modo estruturado

1. Esquema zod e `render` num módulo folha em `src/lib/`, compartilhado com o app nativo.
2. `jsonSchema` estrito, adendo em `server/graph/prompts.ts` e a especificação em `structured-specs.ts`, registrada em `STRUCTURED_SPECS`.
3. Novo `kind` em `structuredReplySchema`.
4. Testes: paridade entre esquema estrito e zod nas amostras (`tests/strict-schema.ts`), limpeza, texto renderizado e guarda (`tests/structured.test.ts`, `tests/structured-guard.test.ts`).
5. Opcional e pago: `node --import tsx scripts/strict-schema-smoke.ts` manda um pedido mínimo por esquema à OpenAI com `strict: true`. Não faz parte do `npm test` e só deve rodar com autorização explícita. São 7 casos, uma chamada paga cada: `chat_blocos`, `chat_blocos` (sensível), `dieta_v2`, `foto_itens`, `exame_resultados`, `refeicao_texto` e `rotulo_leitura`. As receitas ficam de fora, porque o esquema delas é montado a cada pedido. Sem o teste, a reserva em texto mantém os modos funcionando se o provedor recusar um esquema.
