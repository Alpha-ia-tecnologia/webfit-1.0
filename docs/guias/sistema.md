# Guia funcional e técnico do WebFit

Os caminhos e comandos deste guia são relativos à raiz do repositório. Consulte também o [guia de publicação](github.md), os [limites de produção](producao.md), [testes e verificações](testes.md), [tokens e tema escuro](tokens-e-tema.md) e [saídas estruturadas da IA](ia-estruturada.md).

Aplicação pessoal de alimentação, hidratação, hábitos e medidas. O primeiro acesso oferece uma entrada breve para hábitos e água; a personalização alimentar exige uma anamnese de oito etapas; não existem pacientes de demonstração, valores de consumo iniciais ou respostas de IA simuladas.

## Escopo desta versão

- **Público-alvo:** uso individual, por uma única pessoa, no próprio computador. Não há contas, perfis múltiplos, acompanhamento por profissionais nem publicação externa.
- **Porta de entrada:** nome, objetivo, consentimento local e um hábito opcional permitem começar com registros de água e hábitos. Saúde e biometria permanecem sem resposta e o perfil continua incompleto. A anamnese de oito etapas é necessária antes de metas e IA personalizadas; pode ser retomada preservando os registros iniciais.
- **Fonte única de verdade:** perfil, metas, totais e lembretes derivam do mesmo estado (`src/lib/domain.ts`). Nenhuma tela guarda valores próprios.
- **Critério de conclusão de uma funcionalidade:** persiste no IndexedDB, sobrevive a recarga, tem validação de esquema, não simula operação externa e está coberta por teste de domínio ou de jornada em `tests/`.
- **Fora de escopo:** autenticação, sincronização entre aparelhos (a [cópia no servidor](#cópia-no-servidor-opcional) é opcional, de um aparelho só), sala de vídeo, agendamento com terceiros, estimativa de gordura corporal, validação clínica das estimativas e alegações clínicas ou de conformidade.

## Executar no Windows, macOS ou Linux

Requer Node.js 22.12 ou superior e npm. Os comandos usam os executáveis JavaScript diretamente para funcionar também em pastas com `&` no Windows.

```sh
npm install
npm run dev
```

Abra **http://127.0.0.1:3000**. O servidor aceita conexões somente deste computador. Para testar o app nativo no celular pela mesma rede Wi-Fi, use `npm run dev:lan`: o servidor passa a aceitar também o endereço IP deste computador (mostrado no terminal), ainda protegido pelo token de sessão. Não há publicação externa, conta de usuário nem sincronização em nuvem nesta versão individual.

Para executar a versão de produção local:

```sh
npm run build
npm start
```

O `npm run preview` também serve a versão de produção com a API local. A porta pode ser alterada por `PORT` no `.env.local`.

## Configurar o agente

Copie `.env.example` para `.env.local` e preencha ao menos uma das chaves; basta uma delas para o agente funcionar. **DEEPSEEK_API_KEY** ativa o DeepSeek como provedor principal (**DEEPSEEK_MODEL**, padrão `deepseek-chat`; a conta pode listar também `deepseek-flash` e `deepseek-v4-pro`). Para **DEEPSEEK_VISION_MODEL** use `deepseek-flash`: em teste com uma foto de prato ele descreveu os alimentos corretamente, enquanto o `deepseek-v4-pro` respondeu inventando itens que não estavam na imagem. Por padrão o agente pede respostas sem o modo de raciocínio do DeepSeek, que demora vários segundos por nó e consome o orçamento de tokens; **DEEPSEEK_THINKING=1** o reativa. **OPENAI_API_KEY** e **OPENAI_MODEL** ativam a OpenAI, usada como reserva quando o DeepSeek falha (erro do provedor, limite de uso, prazo esgotado ou saída fora do formato) e como único provedor para laudos em PDF, que o DeepSeek não aceita. Fotos de refeição só vão ao DeepSeek se **DEEPSEEK_VISION_MODEL** apontar um modelo com entrada de imagem; sem ele, seguem direto para a OpenAI. Com as duas chaves, texto e foto tentam o DeepSeek primeiro; com apenas uma, tudo usa o provedor configurado (o DeepSeek sozinho recusa PDF e, sem modelo de visão, fotos). O modelo da OpenAI precisa aceitar imagens e PDF como entrada. **OPENAI_MODEL_FAST** é opcional: um modelo mais rápido da OpenAI para os nós auxiliares do grafo (triagem e revisão); se vazio, todos os nós usam o modelo principal. Reinicie o servidor. As chaves são lidas apenas no servidor, nunca incluídas no JavaScript do navegador. Não compartilhe esse arquivo nem coloque as chaves no chat.

Consulte a [documentação da API do DeepSeek](https://api-docs.deepseek.com/), a [documentação da Responses API](https://developers.openai.com/api/docs/guides/text) e os [modelos disponíveis](https://developers.openai.com/api/docs/models). O serviço gera custos de uso conforme a conta configurada; cada solicitação ao agente executa várias chamadas ao modelo (ver “Arquitetura do agente”).

Na anamnese ou em **Meu espaço → Preferências e dados**, autorize o envio de contexto. Sem configuração ou autorização, os botões de IA ficam desativados; os demais registros continuam funcionando. Erros, cancelamento, indisponibilidade e limites de uso são apresentados sem inventar uma resposta.

Ao concluir ou atualizar a anamnese, se a IA estiver autorizada e o servidor conectado, o app abre **Minha dieta** e pede ao agente uma sugestão alimentar personalizada para um dia: breve resumo das respostas, refeições com horários e porções sugeridas, substituições e orientações de preparo. O modo `diet` usa o especialista de nutrição, a guarda e o revisor, respeitando alergias, alimentos evitados, rotina, orçamento, plano profissional e limitações de saúde. Quando informações essenciais estiverem desconhecidas, o agente pede esclarecimentos antes de detalhar alimentos. Não calcula novos valores nutricionais nem garante que as porções atinjam uma meta exata.

A dieta fica salva no estado local (`dietPlan`) e na conversa, com acesso por **Hoje** e **Meu agente**, no web e no app nativo. A geração oferece cancelamento e nova tentativa; falhas preservam a anamnese e o plano anterior. Sem autorização ou conexão, a pessoa pode entrar e gerar depois. Alterações nos dados alimentares, de saúde ou nas metas marcam a dieta como desatualizada; a versão anterior fica recolhida para consulta até uma nova geração. Preferências de calorias são aplicadas também ao conteúdo salvo. Perfis antigos carregam normalmente sem dieta.

No app web e no Android, a etapa **Revisão da anamnese** permite anexar exames opcionais (PDF/JPG/PNG/WebP, até 5 MB por arquivo e 30 exames). Salve o anexo e marque **Analisar ao concluir** para enviar apenas os arquivos escolhidos à IA. Os laudos são analisados em sequência antes da dieta; as transcrições revisadas entram no contexto dessa geração, sem reenviar os arquivos ao nutricionista. A tela Minha dieta mostra o progresso, permite cancelar e repetir uma tentativa que falhou. Falhas preservam anexos, análises já salvas e a dieta anterior. Ao recarregar a anamnese, os anexos permanecem e a seleção de envio precisa ser feita novamente.

Registros de refeição, água e hábitos usam confirmações discretas após salvar. A home prioriza ações diárias; o resumo do dia é calculado por regras e os detalhes de balanço ficam recolhidos. A interface identifica respostas e revisões de IA como automáticas.

O agente recebe respostas da anamnese, idade, objetivos, registros dos últimos sete dias, medidas recentes, hábitos e notas de exames. Nome e data de nascimento são removidos do contexto estruturado. Textos livres podem conter identificadores inseridos pelo próprio usuário. Arquivos só são enviados ao solicitar sua análise. A configuração `hideCalories` é informada ao agente.

## Arquitetura do agente

O agente é um grafo [LangGraph](https://docs.langchain.com/oss/javascript/langgraph) executado no servidor local (`server/graph/`). As chamadas ao modelo passam por `server/model.ts`: o DeepSeek (API de chat compatível com OpenAI, modo JSON com o esquema nas instruções) é o principal e a Responses API da OpenAI (saída estruturada em JSON estrito) a reserva; os nós de triagem e revisão exigem JSON validado contra o esquema em ambos.

| Nó                | Modelo    | Função                                                                                                                                                                                                                                                                           |
| ----------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preparar`        | não       | Extrai sinais de segurança da anamnese (alergias, gestação, transtorno alimentar, menor de idade, hideCalories), calcula fatos em código, compacta o contexto e o envolve em marcadores de dados; detecta urgência por padrões no texto.                                         |
| `triagem`         | rápido    | Só no chat: classifica urgência, escolhe os especialistas e o foco de cada um, sinaliza tentativas de injeção e informações ausentes.                                                                                                                                            |
| `urgencia`        | não       | Curto-circuito com mensagem fixa de segurança (SAMU 192; CVV 188 em risco à vida). Nenhum especialista é consultado.                                                                                                                                                             |
| `nutricionista`   | principal | Alimentação, hidratação, catálogo e rótulos; também analisa fotos de refeição sem estimar porções ou valores.                                                                                                                                                                    |
| `rotina`          | principal | Sono, estresse, atividade leve, hábitos e barreiras práticas.                                                                                                                                                                                                                    |
| `analista_exames` | principal | Transcreve laudos legíveis com unidade, data e referência impressa; lista o ilegível; organiza dúvidas. Não interpreta.                                                                                                                                                          |
| `guarda`          | não       | Verificações determinísticas do rascunho: calorias com hideCalories, afirmação de gravação, identificadores, alegações de validação clínica, diagnóstico, alteração de medicamento, estimativa de gordura ou de porção em foto, alergênico sugerido, urgência ignorada, tamanho. |
| `revisor`         | principal | Audita o rascunho contra as regras e devolve JSON com veredito (aprovado, revisar, bloquear) e problemas com trecho literal, correção e gravidade.                                                                                                                               |
| `finalizar`       | não       | Entrega apenas texto aprovado; mascara calorias quando solicitado; anexa avisos honestos (atenção, injeção ignorada, dados faltantes).                                                                                                                                           |

Fluxo: `preparar → (urgência | triagem | especialista) → especialistas em paralelo → guarda → revisor → finalizar`. Problemas apontados pela guarda ou pelo revisor geram **uma** reescrita pelo especialista responsável; se persistirem, a solicitação falha com HTTP 422 e nada é exibido. Texto reprovado nunca sai do servidor.

Custos e prazos: uma mensagem de chat faz tipicamente 3 chamadas (triagem, especialista, revisor) e no máximo 6; foto e exame fazem 2 a 4. O servidor limita cada solicitação a 100 s e o cliente aguarda 115 s. Contexto, histórico e arquivos são tratados como dados não confiáveis dentro de marcadores com nonce; o histórico vai como transcrição, nunca como turnos do assistente. No modo exame o revisor recebe o mesmo arquivo do laudo e é instruído a conferir cada valor transcrito; a interface acrescenta um aviso fixo lembrando que a transcrição é automática.

A resposta da API é `{ text, meta: { specialists, reviewed, revisions, urgency, notes, llmCalls }, structured? }`; a interface mostra quem respondeu e se houve revisão. Chat, dieta, foto do prato, receitas e laudos pedem ao modelo um JSON estrito que o app desenha; o texto continua sendo a versão legível e o que a guarda e o revisor examinam. Detalhes em [saídas estruturadas da IA](ia-estruturada.md).

O modo `diet` faz de 2 a 4 chamadas (nutricionista e revisor, com uma possível reescrita), exige contexto de anamnese válido e não aceita anexos. A migração `0004_diet_mode.sql` acrescenta esse modo à restrição de telemetria do PostgreSQL; a dieta desta versão continua persistida no armazenamento local.

## Fluxos implementados

### Despensa, geladeira e receitas

Em **Hoje** ou **Minha dieta → Abrir despensa e receitas**, cadastre alimentos manualmente ou use **Tirar foto / Galeria**. O reconhecimento aceita fotos da despensa, da geladeira e da **lista de compras já realizadas**: essa lista representa alimentos comprados e disponíveis, não compras pendentes.

A foto gera um rascunho editável. Antes de **Confirmar e salvar itens**, confira nomes, quantidades, unidades, local de armazenamento, validade opcional e observações; remova identificações incorretas e adicione itens omitidos. Quantidades e validades não legíveis ficam em branco. O cadastro manual dispensa IA. As fotos são reduzidas para envio e não são armazenadas com o estoque; os itens confirmados ficam salvos localmente, podem ser editados/removidos e entram na exportação de dados. Lotes repetidos são mantidos separados para preservar quantidades e validades diferentes.

**Criar receitas com meus alimentos** exige autorização de IA, conexão, alimentos disponíveis e uma dieta salva compatível com a anamnese atual. O agente recebe a dieta, a anamnese e o estoque confirmado; itens com validade vencida são excluídos. Nutricionista e revisor verificam as sugestões, que incluem ingredientes, porções sugeridas, rendimento, preparo e relação com a dieta. Ingredientes que faltam devem ser separados. Criar uma receita não desconta estoque nem registra consumo no diário. Receitas ficam salvas e versões baseadas em dieta ou estoque alterados aparecem recolhidas com aviso.

Os modos `pantry_photo` e `shopping_photo` usam o provedor de imagem configurado e retornam dados estruturados para revisão humana, sem enviar a anamnese. O modo `recipe` usa o grafo de nutrição e revisão. A migração `0005_pantry_agent_modes.sql` atualiza apenas os modos de telemetria; `pantry` e `recipes` continuam no estado local e perfis antigos carregam esses campos vazios. Testes em `tests/pantry.test.ts` e `tests/e2e/pantry.spec.ts` usam respostas simuladas.

### Demais fluxos

- Refeições favoritas: até 100 pratos, separados do diário, sem fotos ou datas. A tela também oferece cinco refeições recentes sem repetições. Reutilizar preenche um rascunho com cópia dos ingredientes, preserva data/horário escolhidos e exige salvar a nova refeição.

- Anamnese para personalização alimentar, em oito etapas: Vamos conhecer você; Cuidados importantes (gestação, transtorno alimentar, restrição de líquidos, condições e "Como prefere ver números?", antes das medidas); Seu ponto de partida; Histórico de saúde; Sua alimentação; Sono, movimento e bem-estar; Objetivos e metas; Revise sua anamnese. Respostas sensíveis admitem “Não sei” ou “Prefiro não informar”, e o fluxo esconde IMC, peso desejado, projeção e calorias quando a triagem pede cautela (`src/lib/anamnese-flow.ts`). A revisão termina com a revelação do plano inicial ("Seu plano de hábitos" para perfis sensíveis, menores de idade ou sem meta automática). Rascunhos são salvos após concordância com armazenamento local; rascunhos do fluxo antigo são convertidos para a nova ordem.
- Perfil existente: **Meu espaço → Saúde → Seu perfil de saúde** mostra um cartão por etapa, com destaques sem números sensíveis e avisos "Precisa de atenção". "Editar esta seção" abre só aquela etapa e volta ao hub ao salvar (`src/lib/profile-summary.ts`).
- Anamnese interativa: perguntas organizadas em cartões, opções selecionáveis, progresso de preenchimento e transições entre etapas. Os controles funcionam por teclado e respeitam a preferência do sistema por movimento reduzido.
- Diário por data: criar, editar e excluir refeições, água e bem-estar. Refeições preservam ingredientes, fonte, quantidades, foto, horários e totais.
- Seringa e dose: para quem usa injetável de emagrecimento. Três modos de aplicação: frasco com seringa de insulina (30, 50 ou 100 UI, conversão mg ↔ ml ↔ UI e seringa calibrada), caneta com seletor e caneta de dose única (só a dose em mg). Com uma aplicação recente, a tela abre em "Sua dose de sempre"; "Outra dose ou frasco novo" abre a calculadora. O mapa de rodízio mostra frente e costas, lado esquerdo ou direito e as últimas aplicações, e sugere o próximo local sem bloquear. Registrar exige confirmação; depois, a folha "Aplicação registrada" leva ao diário. A próxima dose é sempre "estimada" pela frequência informada, nunca "atrasada", e não há contagem na gestação ou amamentação (`src/lib/treatment.ts`). A calculadora converte, não prescreve. Os registros ficam em `injections`, editáveis e excluíveis.
- Perfil único: medidas, metas e preferências alimentam todas as telas. Metas anteriores são preservadas por data de revisão, sem aplicar alterações futuras aos registros anteriores.
- Evolução: "Sua jornada" com o peso de tendência; gráfico de peso de 1M a Tudo, com meta e degraus de dose; pesagens em lista e a folha "Registrar medidas"; mini gráficos de 7 ou 28 dias; consistência em anéis, sem contar dias seguidos; medidas com silhueta; locais e doses da medicação. Perfis calmos veem só o valor do peso, sem tendência, meta, IMC ou medidas. Cintura, quadril e gordura corporal aparecem apenas quando informados.
- Hábitos diários: criação, horário, conclusão por data e exclusão.
- Lembretes: central com as seções Agora, Hoje e Próximos, ícone por tipo e atalhos ("+250 ml", "Concluir", "Registrar") com "Desfazer". Desligados, a tela mostra "Como ficaria hoje" e "Ativar lembretes". No navegador aparecem só com o app aberto; respeitam intervalo e horário de silêncio. Ler um lembrete não registra consumo, e o lembrete da aplicação é só informativo (`src/lib/reminder-center.ts`).
- Exames: arquivos PDF/JPG/PNG/WebP, data, notas, download, análise opcional pelo agente e exclusão. Limite de 5 MB por laudo e 30 laudos. A análise transcreve os resultados em linhas (valor, unidade, referência e marcação copiadas do laudo), com barra de faixa só quando os números permitem, perguntas marcáveis para a consulta e o texto completo em "Ver análise em texto". O app nunca classifica um resultado; veja [saídas estruturadas da IA](ia-estruturada.md#laudos-de-exame).
- Consultas: registro local de uma consulta já combinada, profissional, registro profissional opcional, data, notas e link HTTPS, exibidos como agenda (próxima, seguintes e anteriores). "Lembrar-me" baixa um arquivo `.ics` com alarme 1 hora antes para o calendário do aparelho; o WebFit não agenda nada. O link abre o serviço externo do profissional; não existe sala de vídeo fictícia ou agendamento enviado a terceiros.
- Aparência: Sistema, Claro ou Escuro em **Meu espaço → Preferências e dados**, só neste aparelho. Veja [tokens e tema escuro](tokens-e-tema.md).
- Privacidade: exportação JSON com anexos, restauração validada de backups de até 256 MB com prévia/confirmação e exclusão integral dos dados locais. A restauração substitui o conteúdo de forma validada, preserva os dados anteriores em caso de falha e desativa IA/lembretes até nova escolha. Autorizações antigas apenas para OpenAI precisam ser renovadas para DeepSeek/OpenAI. A revogação de uso da IA cancela solicitações em andamento. O ditado, quando disponível, usa o reconhecimento de voz real do navegador.

## Dados e cálculos

O armazenamento utiliza **IndexedDB**, com validação de esquema, versão e revisões. A gravação deve concluir antes de mostrar sucesso. Erros de quota ou dados inválidos preservam a cópia anterior. Uma revisão concorrente em outra aba exige recarregar; a aplicação não sobrescreve silenciosamente a outra alteração.

Não há autenticação nesta versão local. Quem acessar o mesmo perfil do navegador poderá ler os dados. Limpar o site ou usar navegação temporária pode apagar o histórico. A exportação contém informações sensíveis e arquivos sem proteção por senha; guarde-a em um local adequado. Exclusão local não apaga exportações nem informações já enviadas ao provedor de IA.

O servidor local encaminha solicitações ao DeepSeek ou à OpenAI e não grava o conteúdo das conversas com a IA em arquivo ou banco; o único conteúdo gravado no banco é a cópia no servidor, quando a pessoa a liga. A API valida entrada, tamanho e assinatura de arquivos, exige token da sessão do servidor, verifica origem e limita solicitações. Uma implantação pública exigiria arquitetura e autenticação próprias; alterar apenas o endereço de escuta não é suportado.

### Base TACO

Os alimentos foram importados da [planilha oficial NEPA/UNICAMP](https://www.nepa.unicamp.br/arquivo/uploads/taco-4a-edicao/taco-4a-edicao-2/), **TACO, 4ª edição, 2011**. São **593 alimentos utilizáveis**. Cada ajuste vira uma observação no próprio alimento:

- traços (`Tr`) e `NA` (não se aplica: proteína e carboidrato dos óleos e do azeite, tudo no sal) são considerados zero;
- o carboidrato calculado por diferença que sai levemente negativo (até −0,1 g; corimba, tucunaré, contra-filé grelhado e fígado de frango) é considerado zero;
- a aguardente traz só a energia, que vem do álcool; proteína, gordura e carboidrato ficam em zero.

Quatro linhas continuam fora porque a TACO não traz nenhum valor para elas (`*`, valores em análise): iogurte sabor abacaxi, leite de vaca desnatado UHT, leite de vaca integral e coco verde cru. Nenhum número é inventado. Fibra, sódio, cálcio e demais micronutrientes da planilha ainda não são importados.

`data-sources/taco.xlsx` preserva a fonte; `data-sources/taco-metadata.json` contém URL, hash SHA-256, regras e exclusões. O catálogo está em `src/data/foods.json`. Para reproduzir a importação (só Node, sem bibliotecas externas):

```sh
npm run taco:import            # regrava foods.json e taco-metadata.json
npm run taco:import -- --check # só confere se o arquivo atual é o que a planilha gera
npm run db:seed                # leva o catálogo atualizado para o banco
```

Valores por 100 g são preservados com três casas decimais; calorias são arredondadas após somar a refeição, e macros a uma casa decimal. O usuário também pode cadastrar alimentos a partir de rótulos, sempre indicando a fonte. Não há alegação de catálogo IBGE.

### Estimativas pessoais

A equação [Mifflin–St Jeor (1990)](https://pubmed.ncbi.nlm.nih.gov/2305711/) estima gasto basal: `10 × peso (kg) + 6,25 × altura (cm) − 5 × idade + 5` (masculino) ou `− 161` (feminino). Fatores de atividade aproximados: 1,2; 1,375; 1,55; 1,725. A meta calórica automática depende do objetivo informado (`GOAL_RULES` em `src/lib/domain.ts`): manutenção e organização da rotina usam o gasto estimado; perda de peso aplica déficit de 500 kcal/dia; ganho de peso, superávit de 300 kcal/dia. Informar uso de medicamento não modifica calorias ou macronutrientes automaticamente. Nenhuma meta automática fica abaixo do piso de 1.200 kcal (feminino) ou 1.500 kcal (masculino); se o gasto estimado já estiver nesse piso, vale a manutenção. A etapa de revisão da anamnese mostra as metas resultantes e a explicação do déficit.

**Meta diária estável** (`dailyTargets` em `src/lib/domain.ts`): preserva as calorias e macronutrientes da meta vigente, inclusive quando informados manualmente. Registros do dia anterior não geram compensação, pois o diário pode estar incompleto. O formato de retorno conserva `adjustment: 0` e `adjustmentNote: null` por compatibilidade.

Estimativas automáticas são desativadas para menores de 18 anos, gestação/amamentação, histórico alimentar relevante, sexo não informado e condições de saúde ou informações desconhecidas. É uma restrição conservadora do produto, não uma regra clínica completa. O [NIDDK](https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner) também explicita limites de população para suas ferramentas de planejamento.

Metas informadas manualmente prevalecem sobre as estimativas (e os macronutrientes em branco são derivados da meta informada). Macronutrientes automáticos: proteína de 1,2 g/kg de peso na manutenção ou 1,6 g/kg para perda ou ganho, limitada a 35% das calorias; gorduras em 30% das calorias; carboidratos com o restante. Macros automáticos nunca ultrapassam o que sobra da meta calórica depois dos valores manuais; se metas manuais de macronutrientes somarem mais de 5% acima da meta calórica, a revisão da anamnese e Meu espaço mostram um aviso pedindo ajuste. Água não tem prescrição automática. IMC e relação cintura/quadril são apenas descritivos, sem classificação clínica. Gordura corporal não é estimada. O produto não declara certificação, conformidade jurídica, criptografia ponta a ponta nem protocolo clínico validado.

## Banco de dados PostgreSQL

O esquema relacional completo fica em `server/db/migrations/` e é aplicado por um runner versionado (`scripts/db.ts`). Todas as tabelas vivem no schema **`webfit`**, porque o banco informado (`nutri`) já contém tabelas de outra aplicação no schema `public`; nada fora do schema `webfit` é tocado.

```sh
npm run db:migrate   # cria o banco se não existir, o schema webfit e aplica migrações pendentes
npm run db:seed      # carrega/atualiza o catálogo TACO (src/data/foods.json) em foods
npm run db:status    # lista migrações aplicadas e contagem de linhas por tabela
npm run test:db      # integração (db, state-sync e auth .integration.ts); pulam sem DATABASE_URL
```

Defina `DATABASE_URL` em `.env.local`. Em servidores remotos use `sslmode=require`: com `sslmode=disable` a senha e os dados trafegam em texto claro.

| Tabela                                       | Conteúdo                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `users`                                      | dono dos dados e revisão do estado                                                                                     |
| `profiles`, `profile_drafts`, `goal_history` | anamnese concluída (com todas as restrições de faixa do esquema zod), rascunho por etapa e snapshots de metas por data |
| `measurements`                               | pesagens e medidas datadas (uma por dia)                                                                               |
| `foods`                                      | catálogo TACO (`user_id` nulo) e alimentos de rótulo do usuário                                                        |
| `diary_entries`, `diary_items`               | refeições, água e bem-estar; ingredientes com snapshot nutricional por 100 g                                           |
| `habits`, `habit_completions`                | hábitos e conclusões por data                                                                                          |
| `chat_messages`                              | conversa com o agente, com os metadados de especialistas e revisão                                                     |
| `exams`, `appointments`                      | laudos (binário validado por tipo e tamanho) e consultas com link HTTPS                                                |
| `injections`                                 | aplicações de injetáveis: medicamento, concentração, seringa, UI, volume, dose, local e observações (migração `0003`)  |
| `notifications_read`                         | lembretes marcados como lidos                                                                                          |
| `agent_runs`                                 | telemetria do agente sem conteúdo (modo, especialistas, revisões, chamadas, duração, resultado)                        |
| `treatment_stock`                            | estoque do frasco ou da caneta                                                                                         |
| `device_data`                                | o que o aparelho guarda sem tabela própria (dieta, despensa, receitas, compras, pratos salvos), em jsonb              |

As 16 migrações estão aplicadas no banco configurado. Da `0006` em diante, cada uma acrescenta colunas opcionais ou com padrão:

| Migração | Acrescenta |
| --- | --- |
| `0006_home_layout_wellbeing_tags.sql` | `profiles.home_layout` ("Editar Hoje") e `diary_entries.tags` (marcadores do bem-estar) |
| `0007_injection_method.sql` | `injections.method` (frasco, caneta, dose única); campos da seringa passam a aceitar nulo nas canetas |
| `0008_chat_blocks.sql` | `chat_messages.blocks` (blocos estruturados das respostas) |
| `0009_exam_structured.sql` | `exams.analysis_structured` e `exams.questions_done` |
| `0010_injection_side.sql` | `injections.side` (lado esquerdo ou direito) |
| `0011_pen_weekday.sql` | `profiles.pen_weekday` (dia da aplicação semanal) |
| `0012_treatment_o4l3.sql` | `diary_entries.symptoms` (efeitos no bem-estar) e `diary_entries.satiety` ("Como ficou?" nas refeições); tabela `treatment_stock` (estoque do frasco ou da caneta); modo `rotulo` em `agent_runs` |
| `0013_hide_body_numbers.sql` | `profiles.hide_body_numbers` ("Ocultar números do corpo"); modo `meal_text` em `agent_runs` (a lista de modos é refeita inteira) |
| `0014_ai_consent_version.sql` | `profiles.ai_consent_version` (versão do texto de autorização da IA) |
| `0015_state_sync.sql` | tabela `device_data`; `position` nas listas (a ordem do aparelho volta igual); `diary_items.food_ref`, `food_source_url` e `food_note` (alimentos estimados fora do catálogo) |
| `0016_accounts.sql` | WebFit online: `accounts`, `sessions`, `invites`, `password_resets` e `ai_usage` (tokens e códigos só como SHA-256) |

### WebFit online (várias contas)

Com `WEBFIT_PUBLIC_URL` (https) e `DATABASE_URL`, o servidor entra no modo online (`server/online.ts`): `/api/status` não entrega mais o token local e tudo exige a sessão de uma conta (`server/auth/`). O navegador guarda a sessão num cookie `HttpOnly`, `Secure`, `SameSite=Strict`; o app nativo, num token `Bearer` no armazenamento privado do app. Cadastro só por convite e senha redefinida pelo dono do servidor (`npm run admin -- invite | reset | owner | list | disable`); senhas com scrypt; limites de tentativas por IP e por e-mail; pedidos ao agente limitados por conta e por dia (`WEBFIT_AI_DAILY_LIMIT`, sem limite para o dono). A cópia no servidor passa a ser da conta (o `userId` do estado é o id da conta; ninguém lê nem grava a de outra); ao entrar, os dados do aparelho são adotados pela conta ou trocados pelos da conta (`src/lib/account.ts`, nunca de outra conta para esta) e "Sair da conta" apaga os dados do aparelho. Publicação: [guia da VPS](publicacao-vps.md).

### Cópia no servidor (opcional)

O aplicativo continua gravando primeiro no aparelho (IndexedDB no web, SQLite no app nativo). Em **Meu espaço › Ajustes**, "Guardar uma cópia no servidor" vem **desligado** e só aparece habilitado quando o servidor tem `DATABASE_URL` (`/api/status` responde `sync: true`). Ligado, cada gravação agenda o envio do estado inteiro alguns segundos depois (`src/lib/server-sync.ts`, `src/lib/use-server-sync.ts`, os mesmos no web e no nativo):

| Rota | Faz |
| --- | --- |
| `GET /api/sync/status?userId=` | `{ configured, revision }` (revisão `null`: ainda sem cópia) |
| `PUT /api/sync[?force=1]` | grava o estado (`server/db/state-repo.ts`, uma transação); revisão igual ou menor responde 409 com `serverRevision` |
| `GET /api/sync/state?userId=` | devolve a cópia, conferida no aparelho pelas mesmas regras do backup em arquivo |
| `DELETE /api/sync?userId=` | apaga a cópia (cascata a partir de `users`) |

- **Acesso:** o mesmo token de sessão do agente (`X-WebFit-Token`, mesma origem) e o código da instalação (`userId`, UUID aleatório) — quem tem o código tem a cópia; ele aparece em Ajustes para ser guardado com os backups. Limite de 30 pedidos por minuto e corpo de até 64 MB.
- **Conflito:** se o servidor tem uma revisão mais nova (por exemplo, dados do aparelho voltados a uma versão antiga), nada é enviado até a pessoa escolher "Enviar a deste aparelho" ou "Restaurar do servidor".
- **Restaurar do servidor:** passa por `validateBackup` e `prepareRestore`, como o arquivo: o aparelho mantém o próprio código e a IA e os lembretes ficam desligados. Com a cópia ligada, a versão restaurada volta ao servidor por cima.
- **Excluir:** "Excluir todos os meus dados" apaga antes a cópia do servidor; se não conseguir, nada é excluído. Desligar a cópia pergunta se ela também sai do servidor.
- **Fora do ar:** o envio tenta de novo a cada 30 s; os dados seguem no aparelho.

## Padrão visual

A interface segue a identidade WebFit: marca com barras esmeralda e azuis (`src/components/Logo.tsx`, recriada em SVG; o favicon é a mesma marca embutida em `index.html`), paleta esmeralda `#00D084` + azul `#00A3FF` sobre superfícies claras (`#F6F8FB`, `#0F172A`), cantos de 16 a 24 px, cabeçalho e navegação em vidro e gradientes esmeralda→azul nos elementos de destaque.

- Tokens: fonte única em `src/design/tokens.ts`, que gera as variáveis `--wf-*` de `src/styles/tokens.css` (cores claras e escuras, tons por domínio, gradientes, sombras, raios, escala tipográfica e molas); `src/index.css` define só as fontes. O CSS não usa hexadecimal nem `font-size` em px, e o texto informativo tem no mínimo 12 px. Novas telas reutilizam as classes existentes (`.card`, `.pill`, `.btn`, `.icon-btn`, `.tabs`, `.progress`). Veja [tokens e tema escuro](tokens-e-tema.md).
- Tipografia: Inter (texto) e Plus Jakarta Sans (títulos), servidas localmente por `@fontsource-variable/*` e importadas em `src/main.tsx`. A CSP do servidor só permite fontes da própria origem; não use Google Fonts por link.
- Cabeçalho por tela: em Hoje, avatar em anel gradiente com a data e a saudação, marca centralizada e sino; nas demais, botão de voltar, título centralizado e subtítulo (no Diário, a data legível e a faixa de dias). O título de cada tela vive nesse cabeçalho e na aba do navegador (componente `Page`).
- Navegação: barra inferior com cinco abas e o botão "+" central no celular; barra lateral no desktop, onde o "+" flutuante some e o botão "Registro rápido" abre o registro como popover. O registro rápido oferece Refeição, Água, Bem-estar, Peso e, para quem usa caneta, Aplicação. A tecla **N** abre o registro rápido fora de campos de texto (`src/lib/shortcuts.ts`).
- Hoje: a semana, os anéis do dia e o próximo passo ficam no topo; as seções abaixo (bem-estar, água, refeições, combinados, medicação injetável, plano alimentar e despensa) podem ser reordenadas ou ocultadas em "Editar Hoje" (`src/lib/home-layout.ts`). A partir de 1024 px, as seções formam uma grade bento de 12 colunas calculada por `bentoLayout`.
- Seringa e dose (`src/components/injecao/`): seringa em SVG com escala fiel ao modelo (30, 50 ou 100 UI) e lupa, régua da bula, folha de confirmação e mapa de rodízio sobre a silhueta humana (frente e costas). A silhueta é gerada por `scripts/body-map/gen.mjs` a partir de pontos-chave espelhados, pré-visualizada por `render.mjs` e convertida em `src/components/injecao/bodySilhouette.ts` por `to-ts.mjs`; ajustes de anatomia ou dos marcadores devem passar por esse fluxo. Em Hoje aparece o cartão de medicação injetável, com o anel da próxima dose estimada no tom da medicação, quando a anamnese indica caneta ou já existem aplicações; no Diário as aplicações aparecem na seção "Medicação injetável" do dia.
- Gráficos: formas, cores e acessibilidade seguem a [gramática de gráficos](viz.md).
- Cores fixas por macronutriente em todas as telas: proteína esmeralda, carboidratos azul, gorduras âmbar (`MACROS` em `src/lib/today.ts`).
- A etapa "Histórico de saúde" pergunta sobre canetas emagrecedoras (Não, Sim, Prefiro não informar); com "Sim", aparecem qual caneta (Ozempic, Wegovy, Mounjaro, Saxenda, Victoza, Trulicity, "Não sei o nome" ou outra), a quantidade por aplicação (doses típicas da caneta escolhida, "Não sei a dose" ou outra) e a frequência (Semanal, Diária ou Outra, em aplicações por mês). Na aplicação semanal, o dia da semana é opcional (`penWeekday`). A pessoa pode informar a última aplicação, que só vira registro no diário depois de uma confirmação explícita (`src/lib/pen-setup.ts`). Um aviso neutro aponta quando "Não uso medicamentos" foi marcado junto com a caneta. Perfis salvos antes carregam "Prefiro não informar"; a migração `0002_weight_loss_pen.sql` acrescenta as colunas correspondentes no PostgreSQL. A política do agente proíbe sugerir início, interrupção ou ajuste de dose e pede atenção a apetite reduzido, náusea e saciedade precoce.
- Anamnese sem digitação (exceto o nome): perguntas de texto viram cartões selecionáveis de escolha única ou múltipla, sempre com a opção "Outros" para escrever algo fora da lista (`src/data/anamneseOptions.ts`); números viram régua arrastável com ajuste fino, passos ou chips; datas e horários usam rodas roláveis com atalhos. O texto salvo continua compatível com o `profileSchema` (opções separadas por vírgula, números, `AAAA-MM-DD`, `HH:MM`), e cada controle mantém um campo nativo espelho com o mesmo `name` para automação e leitores de tela.
- Verificação visual: com o servidor em execução, `THEME=light` ou `THEME=dark` com `CHANNEL=chrome node --import tsx scripts/visual-check.ts` semeia um perfil de exemplo, captura desktop e 390 px e confere fontes, rolagem horizontal e contraste. Veja [testes e verificações](testes.md#verificação-visual).

## App nativo (React Native / Expo)

A pasta `mobile/` contém um aplicativo Expo (Android, iOS e web) construído em paralelo, sem descartar o app web. Ele reutiliza a lógica de `src/` (tipos, metas, seringa, questionário, TACO, silhueta) pelo alias `@shared/*` e reproduz o padrão visual em React Native. Instruções em `mobile/README.md`:

```sh
cd mobile && npm install && npm run android   # ou npm run ios / npm run web
adb reverse tcp:3000 tcp:3000                 # emulador Android alcança o servidor do agente
```

APK instalável (Windows, PowerShell): `cd mobile; .\scripts\build-android.ps1 -Task assembleRelease` gera `mobile/dist/WebFit-<versão>-release.apk`. O script compila a partir de uma cópia em `D:\wf-build` porque o caminho deste repositório contém `&` e acentos (detalhes em `mobile/README.md`).

Regras de negócio continuam sendo alteradas só em `src/`; os arquivos importados pelo app nativo não podem depender do DOM.

O tema escuro do app nativo está preparado e desligado (`RN_DARK_MODE_ENABLED = false`); o app segue claro. As verificações do app rodam contra o export web; não houve teste em aparelho nem validação de APK nesta versão. Veja [tokens e tema escuro](tokens-e-tema.md#tema-escuro-no-app-nativo) e [testes e verificações](testes.md#app-nativo).

## Verificação e arquitetura

```sh
npm run lint
npm test
npm run build
npm run test:e2e
```

Os testes de navegador usam Google Chrome instalado; o build e o servidor de testes são iniciados automaticamente na porta 3107, com chamadas reais de IA desativadas. Para outros navegadores, ajuste `channel` em `playwright.config.ts`. Detalhes, verificação visual e verificações do app nativo em [testes e verificações](testes.md).

- `src/design/tokens.ts`: cores, escalas e movimento do web e do app nativo; `scripts/build-tokens.ts` gera `src/styles/tokens.css`.
- `src/types.ts`: esquema de perfil, diário, documentos e versão do armazenamento.
- `src/lib/domain.ts`: datas locais, cálculos, histórico, lembretes e contexto do agente.
- `src/lib/injection.ts`: conversões mg ↔ ml ↔ UI, perfis de seringa, faixas informativas, rodízio de locais e resumo das aplicações.
- `src/lib/storage.ts`: persistência, exportação e leitura de arquivos.
- `src/data/questionnaire.ts`: perguntas e etapas da anamnese.
- `src/App.tsx`: bloqueio inicial, gravações sequenciais e coordenação das telas.
- `server/agent.ts`: contrato de entrada e validação de mídia.
- `server/model.ts` e `server/deepseek.ts`: provedores OpenAI (Responses API) e DeepSeek (chat completions) com função de geração injetável e o compositor `withFallback`.
- `server/graph/`: estado, prompts, preparação, especialistas, guarda e revisor, finalização e montagem do grafo.
- `server/index.ts`: servidor local, controles da API e integração com Vite.
- `server/db/`: conexão, schema e migrações SQL; `scripts/db.ts`: migrate, seed e status.
- `tests/`: cenários de regressão de domínio, provedor, grafo do agente (com modelo simulado) e jornada no navegador.

Critérios de aceite: começar com hábitos/água sem perfil clínico e exigir anamnese válida para personalização alimentar; retomar rascunho após recarregar; persistir registros e medidas; derivar totais por data; manter ingredientes ao editar; respeitar preferências e autorização de IA; exportar dados atuais; excluir dados e retornar ao primeiro acesso; não simular operações externas.

Chamadas reais à OpenAI dependem das credenciais do proprietário. Testes locais cobrem contratos e falhas; não substituem validação de conteúdo clínico por profissional habilitado.
