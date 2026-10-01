**WebFit — análise de produto, mercado e preparação para lançamento**

Data: 23/09/2026. Público confirmado: pessoas que querem emagrecer e criar hábitos. Estágio confirmado: desenvolvimento, ainda sem usuários reais.

**Diagnóstico.** O WebFit já possui uma base funcional extensa e testes relevantes. A oportunidade mais forte é transformar alimentação e hábitos em uma rotina simples, adaptada ao tempo, orçamento e ingredientes da pessoa. O produto atual pede muito esforço antes da primeira entrega de valor e ainda depende de infraestrutura local. Recomendo preparar um piloto fechado e reduzir a jornada principal antes de ampliar o catálogo de funcionalidades. Não há evidência de demanda, retenção, disposição a pagar ou eficácia do produto que permita prever sucesso comercial.

**Como esta análise foi feita.** Leitura do código web, API, regras compartilhadas e mobile; documentação de produção; inspeção do web no Chrome com perfil fictício, nas larguras de 390 e 1365 pixels; execução das verificações existentes; consulta a páginas oficiais de concorrentes, ANPD, Anvisa e Google Play. O mobile foi analisado pelo código, sem execução em aparelho. Não houve alteração das funcionalidades, migração de banco, publicação ou uso de dados pessoais reais.

Validação: 137 testes de lógica aprovados; 23 jornadas de navegador aprovadas; verificação de tipos web/API aprovada; build web aprovado. As jornadas de IA usam respostas simuladas. Esses resultados não demonstram qualidade clínica, precisão da IA real, desempenho sob carga, compatibilidade de todos os aparelhos ou adequação regulatória. O build avisou sobre um arquivo JavaScript de aproximadamente 897 kB antes de compressão; otimização de carregamento merece atenção posterior, sem evidência suficiente para afirmar lentidão real neste momento.

**O que já existe e merece ser aproveitado.**

| Recurso observado | Valor para o público | Decisão recomendada |
| --- | --- | --- |
| Diário alimentar, catálogo TACO e alimentos próprios | Organiza alimentação e histórico | Manter, tornando o registro muito mais rápido |
| Água e hábitos com conclusão diária | Cria ações pequenas e recorrentes | Manter e oferecer uma escolha inicial guiada |
| Peso, medidas e gráficos de 7/28 dias | Permite acompanhar mudanças | Manter e acrescentar leitura semanal simples |
| Perfil com rotina, restrições, orçamento e tempo para cozinhar | Permite personalização relevante | Preservar a informação, coletando-a no momento necessário |
| Conversa com IA contextualizada | Pode ajudar em decisões e dificuldades concretas | Integrar às tarefas do dia, medir utilidade, custo e espera |
| Plano alimentar e receitas com ingredientes disponíveis | Boa base para reduzir o esforço de decidir o que comer | Tornar sugestões estruturadas e conectadas ao diário |
| Revisão humana do reconhecimento da despensa | Permite corrigir alimentos identificados incorretamente | Preservar |
| Ocultar calorias, exportar e excluir dados | Respeita preferências e melhora controle dos dados | Preservar e completar com recuperação de histórico |
| Registros locais e lembretes nativos no mobile | Permitem uso básico sem depender continuamente da IA | Preservar e validar em aparelhos reais |

Referências locais: [tela Hoje](../../src/components/ScreenHoje.tsx), [registro alimentar](../../src/components/ScreenAdicionarRefeicao.tsx), [dieta](../../src/components/ScreenDieta.tsx), [despensa](../../src/components/ScreenDespensa.tsx), [evolução](../../src/components/ScreenEvolucao.tsx), [lembretes mobile](../../mobile/src/lib/reminders.ts).

**Onde a experiência perde força.** Os pontos abaixo são observações de implementação acompanhadas de hipóteses de impacto; abandono e retenção precisam ser medidos com usuários.

1. **Anamnese antes de qualquer valor.** Oito etapas bloqueiam o acesso às demais telas. O objetivo aparece apenas na sexta etapa. No web a 390 pixels, apresentação, instruções e indicadores de progresso ocupam quase toda a primeira tela, exigindo rolagem para começar a responder. Sugestão: objetivo, contexto mínimo e primeiro hábito/registro em uma entrada breve; aprofundar depois. Perguntas necessárias à segurança continuam obrigatórias antes da recomendação que depende delas. Um modo de registro básico pode entregar valor antes de liberar personalização alimentar. Evidências: `src/data/questionnaire.ts:353`, `src/components/ScreenAnamnese.tsx:948`, `mobile/src/app/(tabs)/_layout.tsx:5`.

2. **Registro de comida exige trabalho repetitivo.** O usuário busca ingredientes e ajusta gramas; cada alimento entra inicialmente com 100 g. A foto gera descrição textual, mas não preenche automaticamente o prato. Não identifiquei favoritos, repetição de refeição, medidas caseiras ou código de barras. Prioridade: recentes, favoritos, repetir refeição, pratos salvos e porções usuais com conversões verificadas. Depois, foto/voz podem propor um rascunho a confirmar. Evidências: `src/components/ScreenAdicionarRefeicao.tsx:57`, `:212`, `:267`; `mobile/src/screens/refeicao.tsx:49`.

3. **Plano e diário estão desconectados.** A dieta é texto de um dia; não há refeição estruturada com ações de troca, registro do consumo ou lista de compras planejadas. As receitas também não registram consumo. Converter uma sugestão aprovada em prato editável e registrável é mais útil do que gerar mais textos. A foto de lista de compras já existente representa itens comprados, não uma lista futura derivada do plano. Evidências: `src/components/ScreenDieta.tsx:111`, `src/types.ts:316`, `docs/guias/sistema.md`.

4. **Hábitos começam vazios e têm pouca orientação.** O modelo inclui título, horário e datas concluídas. Faltam frequência flexível, meta semanal, progressão, pausa, motivo da dificuldade e retomada. Oferecer uma seleção de 1–3 hábitos e um ajuste semanal simples. Evitar premiar apenas sequências perfeitas. Evidências: `src/types.ts:262`, `src/lib/domain.ts:407`, `src/components/ScreenHoje.tsx:492`.

5. **A home prioriza módulos e números.** Na inspeção móvel, dieta e despensa aparecem antes de água e hábitos. Calorias também se repetem em diferentes telas. Recomendo que Hoje mostre primeiro a próxima ação útil, depois o progresso essencial. Diário serve para registrar/corrigir; Evolução para interpretar a semana. A aparência é coerente; a prioridade é melhorar a hierarquia e reduzir rolagem, sem necessidade de trocar toda a identidade visual.

6. **Incentivo pode interromper o uso.** O app abre um pop-up após registros de água, refeições e hábitos. Vale testar confirmação discreta com opção de desfazer; reservar celebrações maiores para marcos significativos. No mobile, o código agenda até 12 lembretes de água, três refeições e os hábitos; a atualização da agenda não considera o diário/conclusões. Já existe horário de silêncio. Testar menor frequência e cancelar lembretes de ações cumpridas. Evidências: `src/App.tsx:199`, `mobile/src/lib/reminders.ts:27`, `:63`.

7. **A apresentação da IA pode gerar expectativa errada.** Rótulos como “Nutricionista · revisado” descrevem etapas automatizadas, não atendimento ou aprovação humana. O cartão “Insights do Agente WebFit” deriva de regras e totais em `coachSummary`. Identificar claramente assistência por IA e usar “resumo do dia” quando só houver um resumo numérico. Evidências: `src/components/ScreenAgente.tsx:50`, `:75`, `src/components/ScreenHoje.tsx:542`, `src/lib/today.ts:99`.

**O que simplificar ou adiar.** Não há dados para declarar uma funcionalidade inútil. Estes recursos apresentam menor prioridade para o público escolhido ou exigem justificativa própria:

| Recurso | Decisão para a primeira versão comercial | Motivo |
| --- | --- | --- |
| Seringa, dose e mapa de aplicação | Retirar da jornada geral e suspender oferta pública até avaliar escopo e requisitos | Atende um segmento específico; acrescenta riscos e complexidade que não são necessários à promessa de hábitos |
| Exames e transcrição de laudos | Adiar expansão; retirar do primeiro contato | Baixa frequência esperada no uso cotidiano e tratamento adicional de dados sensíveis |
| Cadastro de consultas | Manter secundário apenas se o piloto demonstrar utilidade | É um registro local de consulta já combinada, sem agendamento com profissional |
| Estoque completo com quantidade, local e validade | Tornar opcional | A pessoa pode querer uma ideia de jantar sem administrar inventário doméstico |
| Contexto JSON e detalhes internos do agente | Tirar da jornada comum | Não ajudam a escolher ou registrar a próxima refeição |
| Repetição de painéis calóricos e pop-ups a cada ação | Simplificar e testar | Compete com as ações principais e acrescenta interrupções |

Não acrescentaria agora rede social, ranking público de peso, marketplace de profissionais, biblioteca extensa de treinos ou múltiplas integrações. Não são funcionalidades existentes; são expansões que dispersariam o trabalho antes de validar a experiência central. Código de barras e Apple Health/Health Connect também podem esperar até se comprovar que sua ausência limita o público inicial.

**O que o mercado já oferece.** Pesquisa em fontes dos próprios produtos; não é uma avaliação independente de eficácia. Disponibilidade varia por plano, região, idioma e plataforma.

| Produto | Oferta descrita pela fonte oficial | Implicação para o WebFit |
| --- | --- | --- |
| MyFitnessPal | Registro por câmera/voz/código de barras; Premium+ acrescenta planejamento alimentar | Ter IA, calorias e cardápio isoladamente tem pouca força como diferencial. [Recursos oficiais](https://support.myfitnesspal.com/hc/en-us/articles/360032625951-MyFitnessPal-Premium-features) |
| YAZIO | Foto com IA, registro manual e código de barras; proposta ligada a hábitos | “Emagrecer com IA” é amplo demais para posicionar o produto. [Site brasileiro](https://www.yazio.com/pt) |
| Noom | Lições diárias e trilhas de conteúdo incorporadas ao plano do dia | Mudança de hábitos exige experiência guiada, além de uma lista de marcações. [Funcionamento das lições](https://www.noom.com/support/faqs/using-the-app/daily-features/2025/10/how-to-find-and-revisit-your-noom-lessons/) |
| Tecnonutri | Página comercial reúne cardápios, receitas, diário e acesso a nutricionistas | O usuário pode comparar orientação automatizada com apoio humano; comunicar a diferença com clareza. [Oferta oficial](https://www.tecnonutri.com.br/mobile) |

**Posicionamento recomendado, ainda como hipótese.** “Organize sua alimentação e construa hábitos com a comida que você gosta, o tempo que tem e o orçamento que cabe.” Para o primeiro piloto, recrutaria adultos com rotina corrida que já tentaram registrar alimentação e desistiram do esforço de manter o diário. Esse recorte é uma proposta de teste, não um público validado.

A experiência característica seria: a pessoa informa que tem arroz, feijão, ovos e pouco tempo; recebe opções práticas compatíveis com suas restrições; escolhe e ajusta porções; salva o prato; consegue repeti-lo facilmente; no fim da semana escolhe um pequeno ajuste para a próxima. A IA aparece quando ajuda uma decisão. A diferenciação depende da qualidade dessa experiência em português e no cotidiano brasileiro, não de alegar exclusividade da ideia.

**Funcionalidades que faltam, em ordem de valor para o piloto.**

| Ordem | Entrega | Critério de aceitação sugerido |
| --- | --- | --- |
| 1 | Entrada progressiva e primeiro hábito guiado | Participante consegue fazer a primeira ação útil sem completar a anamnese longa; segurança preservada antes de recomendações dependentes de saúde |
| 2 | Favoritos, recentes, repetir prato e medidas caseiras | Participante repete uma refeição conhecida em até 20 segundos, como meta de teste de usabilidade |
| 3 | Sugestão alimentar conectada ao diário | Escolher receita, revisar ingredientes/porções e registrar sem redigitar; trocas preservam restrições |
| 4 | Rotina semanal de hábitos e retomada | Usuário escolhe poucas ações, ajusta frequência e sabe o que fazer após um dia sem usar |
| 5 | Revisão semanal útil | Mostra regularidade e obstáculos, diferencia ausência de registro de ausência de consumo e propõe apenas um próximo ajuste |
| 6 | Biblioteca alimentar com cobertura prática | Verificar alimentos cotidianos, preparo, fonte e porções; não substituir dados ausentes por zero sem validação |
| 7 | Canal de feedback e medição de produto | Registrar dificuldade, entender abandono e acompanhar uso de ações relevantes |

O catálogo atual tem 578 itens utilizáveis da TACO. O guia documenta exclusões de alimentos comuns, como azeite e alguns leites, devido a valores ausentes na importação. Melhorar cobertura, nomes reconhecíveis, sinônimos e medidas usuais é mais importante inicialmente do que anunciar uma base numericamente grande. Fonte: [guia funcional](../guias/sistema.md), seção Base TACO.

**Bloqueadores concretos antes de receber clientes.**

| Prioridade | Evidência atual | Trabalho necessário |
| --- | --- | --- |
| P0 | Servidor local/LAN, token por processo e ausência de conta individual | Hospedar API com HTTPS; implementar identidade e autorização por usuário, proteção de acesso e limites de consumo; eliminar configuração de IP pelo cliente |
| P0 | Web em IndexedDB e mobile em armazenamento local; banco preparado sem integração às telas | Definir persistência de produção e recuperação; permitir entrada como visitante quando viável e conta para salvar/recuperar; testar troca de aparelho, reinstalação e conflitos |
| P0 | Exportação existe, mas não foi identificado fluxo de importação/restauração | Implementar e testar recuperação; exportar um arquivo sozinho não prova que o histórico pode ser restaurado |
| P0 | Consentimento diz OpenAI; backend usa DeepSeek como principal quando configurado | Alinhar interface, política e fluxo com os provedores efetivamente utilizados, inclusive fallback |
| P0 | Meta diária muda com base em qualquer refeição do dia anterior, inclusive alterando meta calórica manual | Desativar ou reformular a compensação; exigir evidência de registro completo antes de inferências de consumo; preservar metas profissionais e submeter regras a revisão nutricional |
| P0 | Uso de caneta muda automaticamente a regra de déficit; há calculadora de seringa/dose | Revisão profissional e avaliação regulatória do escopo antes da oferta pública; não usar aprovação de testes de software como validação clínica |
| P1 | Até duas solicitações simultâneas e dez/minuto para todo o processo | Limites por usuário/plano, capacidade, controle de abuso, teto financeiro, observabilidade e mensagens claras quando indisponível |
| P1 | APK documentado com assinatura debug | Preparar distribuição de produção e validar permissões, atualização e notificações em aparelhos reais |
| P1 | Não foram identificados funil, retenção, monitoramento operacional ou canal de suporte | Implantar instrumentação mínima, tratamento de incidentes e feedback sem registrar laudos/conversas em analytics |
| Antes de cobrar | Não foi identificada assinatura/pagamento no código | Cobrança adequada ao canal, restauração de compra, cancelamento, termos e suporte; teste completo de compra e recuperação de acesso |

Fontes locais: [produção](../guias/producao.md); `server/index.ts:25`, `:93`, `:116`, `:131`; `src/lib/storage.ts:25`; `src/data/questionnaire.ts:484`; `src/lib/domain.ts:105`, `:292`, `:336`, `:350`; `mobile/README.md:114`.

**Dois cuidados têm fundamento específico no produto.** Há dados de saúde, que a ANPD classifica como dados pessoais sensíveis. Definir finalidade, base legal adequada, acesso, retenção, fornecedores, atendimento de direitos e segurança faz parte de preparar esta operação. O checkbox atual não demonstra sozinho adequação à LGPD. [Perguntas frequentes da ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes).

A Anvisa aborda softwares de cálculo de dose em suas perguntas e respostas sobre SaMD. Como o WebFit possui conversão de dose/seringa, é necessário avaliar formalmente o enquadramento e a finalidade declarada antes de ofertar esse módulo ao público. Esta análise não determina a classificação do produto. [Orientação oficial da Anvisa](https://www.gov.br/anvisa/pt-br/centraisdeconteudo/publicacoes/produtos-para-a-saude/manuais/software-como-dispositivo-medico-perguntas-e-respostas).

Na distribuição Android, a declaração de apps de saúde abrange controle de nutrição/peso e também faixas de teste no Google Play. Preparar as declarações compatíveis com as funções efetivamente oferecidas. [Exigência oficial do Google Play](https://support.google.com/googleplay/android-developer/answer/14738291?hl=pt-BR).

**Plano de validação e lançamento por etapas.** Os prazos são uma sequência sugerida; a duração da implementação depende da equipe. Não vincular publicação a uma data antes de concluir os bloqueadores.

1. **Descoberta e redução do escopo:** entrevistar 8–12 pessoas do recorte; observar 5 tentando começar e registrar uma refeição; identificar ferramentas já usadas, motivo de abandono e situação em que pagariam por ajuda. Validar a promessa com exemplos concretos. Remover obstáculos óbvios do cadastro e do registro.
2. **Preparar o piloto:** resolver infraestrutura, recuperação de dados, consentimento e regras nutricionais; entregar registro rápido, poucos hábitos guiados e sugestões conectadas ao diário; instalar medição e feedback. Testar com duas contas distintas, falha de rede, falha de IA, restauração e atualização.
3. **Piloto fechado com 20–30 adultos durante quatro semanas:** observar a primeira utilização e conversar semanalmente com participantes que voltam e que abandonam. Não exigir todos os módulos. Fazer mudanças com base na dificuldade recorrente, mantendo registro da versão usada por cada coorte.
4. **Teste comercial pequeno:** depois de comprovar uso recorrente, apresentar assinatura real e clara; medir conversão, cancelamento e custo de atendimento/IA. Expandir com novas coortes antes de comprar tráfego em escala.

Recrutamento inicial: rede própria e parcerias de indicação com profissionais que atendam o mesmo recorte, sem pressupor integração clínica no app. Comunicação demonstrativa: mostrar como resolver uma refeição cotidiana ou repetir um prato em poucos toques. Comparar duas promessas — praticidade com ingredientes disponíveis e retomada de hábitos — pela ativação e uso posterior, não só por cliques. Não recomendar promessas de quilos perdidos em prazo fixo.

**Como medir se está funcionando.** As metas abaixo são critérios internos propostos para decisão, não benchmarks de mercado nem evidência de eficácia. Com 20–30 pessoas, observar também números absolutos e entrevistas; repetir em coortes maiores antes de escalar.

| Indicador | Definição para evitar métricas vagas | Meta inicial de teste |
| --- | --- | --- |
| Ativação | Participante faz um primeiro registro alimentar ou conclui um hábito escolhido, na primeira sessão | Pelo menos 70% dos participantes que iniciam o app |
| Tempo até primeiro valor | Tempo entre abertura inicial e primeira ação útil, observado em teste | Mediana de até dois minutos |
| Retenção na primeira semana | Participantes ativados que fazem ao menos uma ação central entre os dias 6 e 8 após ativação | Pelo menos 40%, como sinal para investigar continuidade |
| Retenção ao fim do piloto | Participantes ativados que fazem ao menos uma ação central entre os dias 26 e 30 | Pelo menos 25%, sujeito a revisão com as entrevistas |
| Frequência útil | Dias distintos com registro de refeição ou conclusão de hábito, por pessoa/semana | Entender se chega a três dias sem cobrança constante da equipe |
| Utilidade da sugestão | Sugestões efetivamente escolhidas/preparadas/registradas, junto de motivo de rejeição | Crescimento acompanhado de relatos de economia de esforço |
| Disposição a pagar | Compra de uma oferta real apresentada com preço e condições claros | Obter primeiras compras; não confundir resposta positiva em pesquisa com venda |
| Economia por cliente | Receita menos taxas/impostos, IA, infraestrutura e suporte atribuível | Margem positiva e previsível antes de ampliar aquisição |

Instrumentação mínima sugerida: início/conclusão da entrada, primeira ação útil, refeição salva/repetida, hábito concluído, sugestão escolhida/rejeitada, revisão semanal aberta/concluída e retorno. Medir falhas e latência da IA, sucesso de salvamento e recuperação. Eventos devem evitar conteúdo de saúde, textos livres, fotos e laudos.

**Monetização sugerida para experimentar.** Uma camada gratuita útil pode reunir diário simples, água, hábitos e histórico básico. Uma assinatura pode cobrar por planejamento prático, substituições, receitas adaptadas e revisão semanal assistida. Backup básico e controle dos dados favorecem confiança; não usaria risco de perder histórico como pressão para assinar. IA pode ter limites transparentes de uso. Não definir preço definitivo antes de medir custo por usuário ativo e comparar compra real entre ofertas; esta análise não estimou receita, aquisição ou tamanho de mercado.

O agente atual pode fazer várias chamadas de modelo por interação. Custo e demora precisam ser medidos no fluxo real. Usar regras locais em tarefas simples, reaproveitar respostas ainda válidas e limitar chamadas redundantes pode melhorar viabilidade; qualquer otimização deve preservar as verificações necessárias à segurança. Não há medição real de tokens/custo de produção nesta análise.

**Decisão recomendada.** Concentrar o próximo ciclo em entrada curta, registro rápido, hábitos guiados, sugestões que viram ações e infraestrutura confiável. Validar se as pessoas mantêm essa rotina e pagam por ela antes de ampliar ferramentas clínicas, integrações e aquisição. O diferencial potencial do WebFit está na utilidade cotidiana dessa combinação; ainda precisa ser demonstrado com usuários.
