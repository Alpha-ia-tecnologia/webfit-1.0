# WebFit — briefing de produto, público e lançamento

**Versão de trabalho · 23 de setembro de 2026**

Este documento reúne as respostas para orientar os agentes, o desenvolvimento e a comunicação do WebFit. O público confirmado é formado por pessoas que querem emagrecer e criar hábitos. O app está em desenvolvimento e já possui APK Android para testes; ainda não há usuários reais ou pagantes informados.

**O que é fato e o que é proposta:** as funcionalidades abaixo refletem a implementação atual. Os perfis de público são personas fictícias para pesquisa. Preços, cotas, canais e datas são propostas, ainda não aprovadas nem validadas comercialmente. Não há promessa de resultado de emagrecimento ou de sucesso de mercado.

## 1. O app: o que faz, qual problema resolve e principais funcionalidades

**O que é:** o WebFit é um aplicativo de alimentação, hidratação e hábitos para ajudar adultos a organizar a rotina e acompanhar o próprio progresso, tendo o emagrecimento como um dos objetivos possíveis.

**Problema central:** a pessoa quer mudar, mas encontra dificuldade para manter pequenas ações no dia a dia. Registrar refeições dá trabalho, decidir o que comer exige tempo e abandonar a rotina por alguns dias costuma dificultar a retomada. A hipótese do WebFit é reduzir esse esforço com registros reutilizáveis, hábitos simples e apoio contextual.

**Proposta de valor:** “Organize sua alimentação e construa hábitos que cabem no seu dia.”

Principais funcionalidades já implementadas:

- **Entrada rápida por hábitos:** nome, objetivo e consentimento permitem começar com um hábito opcional e registros de água. A anamnese completa fica para a personalização alimentar; o diário alimentar completo ainda depende dessa etapa.
- **Diário alimentar:** busca de alimentos, cadastro de alimentos próprios, porções em gramas, edição de registros e acompanhamento por data.
- **Favoritos e refeições recentes:** salvar pratos e reaproveitar ingredientes e quantidades, com revisão e confirmação antes de registrar uma nova refeição.
- **Água e hábitos:** registros diários, conclusão de hábitos e lembretes mobile que consideram ações já registradas. Notificações ainda precisam ser validadas em aparelhos reais.
- **Evolução:** histórico de peso e medidas, gráficos, metas informadas e opção de ocultar calorias. O app não compensa automaticamente um dia com base em um diário possivelmente incompleto.
- **Assistência por IA:** conversa contextual, sugestões alimentares, plano e receitas relacionadas à despensa, além de reconhecimento de imagens sujeito à conferência. Exige autorização e servidor conectado; revisão automática não significa revisão por nutricionista.
- **Controle dos dados:** exportação, restauração de backup e exclusão. O armazenamento atual é local, sem sincronização automática entre aparelhos.

Também existem anexos de exames e ferramentas relacionadas a aplicações de medicamentos. A recomendação é mantê-los fora da mensagem principal de lançamento e condicionar sua oferta pública à revisão profissional e de enquadramento pertinente.

**Limite atual importante:** ter um APK instalável não significa ter uma operação comercial pronta. Contas, recuperação em nuvem, API pública, cobrança e distribuição de produção ainda precisam ser concluídas. Revisão semanal guiada, porções caseiras verificadas e registro de uma receita gerada em um toque permanecem no planejamento.

## 2. Público-alvo: três perfis concretos

**Recorte inicial proposto:** adultos brasileiros de 25 a 50 anos, com rotina corrida, que querem emagrecer e têm dificuldade de manter hábitos. Priorizar usuários Android no piloto. Esses recortes são hipóteses para recrutamento, não conclusões de uma pesquisa de mercado.

### Mariana, 32 anos — assistente administrativa

**Rotina e hábitos:** trabalha das 8h às 18h, usa transporte público, almoça fora ou leva marmita e recorre ao delivery quando chega cansada. Já instalou aplicativos de alimentação, mas deixou de registrar depois da primeira semana.

**Dores:** pouco tempo para cadastrar cada ingrediente, dificuldade para decidir o jantar e sensação de que precisa recomeçar do zero quando perde um dia. Quer emagrecer sem transformar cada refeição em uma tarefa longa.

**O que pode gerar valor:** repetir refeições favoritas, escolher um hábito simples e encontrar sugestões compatíveis com o que tem em casa. É o perfil prioritário para os primeiros testes.

**Como os agentes devem ajudá-la:** responder de forma breve, perguntar quanto tempo e quais ingredientes estão disponíveis e propor uma ação viável. Não interpretar a ausência de registro como ausência de alimentação ou como fracasso.

### Diego, 39 anos — motorista de aplicativo

**Rotina e hábitos:** passa várias horas na rua, tem intervalos irregulares, come em restaurantes por quilo ou lanchonetes e usa um celular Android durante o trabalho. Precisa de interações curtas, feitas apenas quando estiver parado.

**Dores:** horários fixos de dieta não combinam com sua rotina; lembretes excessivos atrapalham; não consegue pesar os alimentos fora de casa. Quer organizar a alimentação sem depender de cozinhar todas as refeições.

**O que pode gerar valor:** favoritos, registros básicos locais e sugestões adequadas às opções disponíveis. A exigência atual de gramas é uma limitação relevante para esse perfil e deve ser observada no piloto.

**Como os agentes devem ajudá-lo:** considerar o intervalo e o local onde pode comer, evitar planos que dependam de cozinha e não tratar estimativas de porção como medições exatas. Nunca estimular interação com o app enquanto dirige.

### Patrícia, 47 anos — professora e responsável pelas compras da casa

**Rotina e hábitos:** trabalha em dois turnos, planeja compras com orçamento definido e prepara refeições para a família. Costuma repetir pratos conhecidos e prefere aproveitar os ingredientes disponíveis.

**Dores:** receitas caras ou pouco familiares, necessidade de preparar refeições diferentes para cada pessoa e dificuldade para perceber progresso além do número na balança. Já abandonou rotinas rígidas que não combinavam com a família.

**O que pode gerar valor:** despensa, receitas que respeitem ingredientes e preferências, favoritos e acompanhamento de hábitos. Economia de tempo e menor desperdício são benefícios a investigar, ainda não comprovados.

**Como os agentes devem ajudá-la:** perguntar sobre tempo, orçamento e restrições; priorizar alimentos familiares; acolher a retomada sem culpa. Informações de saúde reais devem prevalecer sobre qualquer suposição da persona.

**Uso dessas personas:** orientar tom, exemplos e perguntas dos agentes. Elas não autorizam presumir idade, profissão, saúde ou orçamento de uma pessoa real. Entrevistar os três perfis antes de decidir se todos devem receber o mesmo produto e a mesma comunicação.

## 3. Concorrentes e diferenciação

Os concorrentes abaixo foram consultados em páginas oficiais em 23/09/2026. Recursos podem variar por plano, país, idioma e plataforma. A comparação descreve a oferta divulgada; não representa teste prático de cada aplicativo.

- **MyFitnessPal:** oferece diário nutricional e, nos planos pagos, diferentes formas de registro, metas e análises. O Premium+ inclui planejamento alimentar. O WebFit deve competir pela adequação da rotina e pela facilidade de uso demonstrada, sem alegar possuir mais recursos. [Fonte: recursos oficiais do MyFitnessPal](https://support.myfitnesspal.com/hc/en-us/articles/360032625951-MyFitnessPal-Premium-features).
- **YAZIO:** reúne contagem de calorias, acompanhamento de nutrientes, código de barras e receitas. Para o WebFit, a oportunidade proposta é tornar hábitos e retomada tão centrais quanto o registro alimentar, mantendo o foco em decisões cotidianas. Isso precisa ser comprovado em testes comparativos. [Fonte: apresentação oficial do YAZIO](https://www.yazio.com/pt/start/contador-calorias).
- **fatsecret:** oferece registro alimentar, receitas e diferentes formas de adicionar comida, incluindo recursos de reconhecimento de imagem. É uma alternativa direta para quem procura acompanhar a alimentação. O WebFit precisa demonstrar por que sua combinação de hábitos, rotina e despensa justifica uma troca ou assinatura. [Fonte: opções de registro do fatsecret](https://www.fatsecret.com/pt-br/fatsecret-ajuda-aplicativo/comece-agora/op%C3%A7%C3%B5es-de-adicionar-comida).
- **Noom:** é uma referência internacional em mudança de comportamento, com lições, registros e modalidades de apoio. Mostra que trabalhar hábitos também não é uma proposta exclusiva. O WebFit pode testar uma abordagem mais concentrada nas tarefas práticas da rotina brasileira; não deve anunciar acompanhamento humano que não oferece. [Fonte: programa Noom Weight](https://www.noom.com/lose-weight/).

**Diferencial proposto:** combinar alimentação cotidiana, aproveitamento da despensa e construção de hábitos em uma jornada simples, em português, que ajude a pessoa a continuar ou retomar a rotina.

Parte dessa base já existe: entrada por hábitos, favoritos, despensa, registros locais e IA contextual. Ainda falta demonstrar que essa combinação economiza esforço e faz as pessoas voltar. “Ter IA”, “ter receitas” e “registrar refeições” são funcionalidades compartilhadas com concorrentes, não diferenciais exclusivos.

Além dos aplicativos, o WebFit disputa atenção com anotações no celular, planilhas e orientações recebidas em consulta. O produto precisa ser mais conveniente para a tarefa escolhida, sem se apresentar como substituto do cuidado profissional.

## 4. Modelo de negócio: freemium com assinatura

**Situação atual:** não há cobrança ou controle de planos implementados. A proposta é validar o uso primeiro, manter um núcleo gratuito útil e cobrar pela assistência que exige processamento e entrega valor adicional.

| Oferta proposta | Preço | Conteúdo e condições |
| --- | --- | --- |
| Piloto fechado | R$ 0 por quatro semanas | Uso para pesquisa e feedback, sem cartão e sem conversão automática em assinatura. |
| WebFit Essencial | R$ 0 | Hábitos, água, diário manual, favoritos, medidas, histórico local e exportação/restauração de backup. |
| WebFit Plus mensal | R$ 24,90 por mês | Núcleo gratuito mais assistência por IA para conversa, imagens, planos alimentares e receitas, com limites claros e servidor de produção. |
| WebFit Plus anual, em etapa posterior | R$ 179,90 por ano | Mesmos recursos do Plus, em cobrança anual única. Oferecer somente após validar valor recorrente e capacidade de suporte. |

**Cota inicial proposta para teste do Plus:** 40 solicitações de IA por mês, considerando cada pedido de conversa, imagem, receita ou plano como uma solicitação. Uma solicitação pode envolver várias chamadas internas de modelo. Falhas técnicas sem resultado não devem consumir a cota. A cota é uma hipótese comercial e precisa ser implementada e revisada a partir do custo real de cada modalidade.

O Plus não inclui consulta com nutricionista, revisão humana de toda resposta ou promessa de resultado. Análise de exames não deve ser usada como benefício central da primeira oferta paga.

**Como validar o preço:** apresentar uma oferta real a participantes que já utilizaram o produto, observar compras e cancelamentos e medir receita líquida após taxas, impostos, infraestrutura, IA e suporte. Ainda não há dados para afirmar que R$ 24,90 é rentável ou que o público pagará esse valor. Recursos de compra, cancelamento, recuperação de acesso e limites por usuário precisam estar funcionando antes de cobrar.

Recomenda-se evitar publicidade no início e manter exportação e restauração básicas gratuitas. Confiança e controle do histórico fazem parte do produto.

## 5. Lançamento: canais, mensagem e calendário

**Estratégia proposta:** começar com um piloto Android de 20 a 30 adultos, observar o uso por quatro semanas e só depois abrir uma oferta comercial pequena. O APK de testes atual permite iniciar a validação técnica, mas não substitui a preparação da operação pública.

**Mensagem principal:** “Organize sua alimentação e construa hábitos que cabem no seu dia.”

**Mensagem de apoio:** “Comece com um hábito, registre suas refeições e aproveite seus pratos favoritos para tornar a rotina mais simples.”

**Chamada inicial:** “Participe do piloto gratuito do WebFit para Android.” A comunicação deve mostrar o app funcionando e explicar o que o teste inclui. Não anunciar perda de peso garantida, prazo para emagrecer ou atendimento profissional inexistente.

### Canais propostos

- **Instagram e TikTok:** demonstrações curtas de tarefas reais, como começar com um hábito, repetir uma refeição e escolher uma receita com ingredientes disponíveis. Testar mensagens pela qualidade dos participantes e pelo uso posterior, não apenas pelas visualizações.
- **WhatsApp com adesão voluntária:** lista de interessados, convite individual para o piloto, instruções de instalação e canal de feedback. Evitar grupos que exponham peso, exames ou outras informações pessoais dos participantes.
- **Nutricionistas e profissionais parceiros:** convites para avaliar a experiência e indicar adultos compatíveis com o recorte. São parcerias a prospectar; não existem parceiros confirmados neste documento.
- **Página de apresentação e, depois, loja Android:** explicar a proposta, coletar contato com autorização e apresentar recursos reais. A publicação depende da preparação e aprovação do canal de distribuição.

### Calendário proposto, sujeito à prontidão

| Período | Etapa | Entrega esperada |
| --- | --- | --- |
| 28/09 a 09/10/2026 | Descoberta e recrutamento | 8 a 12 entrevistas e observação de pelo menos cinco pessoas usando a entrada e um registro. |
| 12/10 a 16/10/2026 | Preparação do piloto | Testes em aparelhos, restauração de backup, instruções claras e canal de feedback. |
| 19/10 a 15/11/2026 | Piloto fechado de quatro semanas | 20 a 30 participantes, acompanhamento semanal de dificuldades e motivos de retorno ou abandono. |
| 16/11 a 27/11/2026 | Ajustes e decisão comercial | Corrigir bloqueios, medir custos e concluir requisitos da oferta que será cobrada. |
| 30/11/2026 | Data-alvo para lançamento público limitado | Abrir uma pequena coorte comercial apenas se os critérios de prontidão forem atendidos. |

O piloto pode começar pelo núcleo local de hábitos e registros. Recursos de IA para participantes remotos só devem entrar quando houver acesso seguro e operacional ao servidor; não depender de configurar o IP do computador do desenvolvedor como experiência comercial.

**Critérios para avançar:** validar instalação, atualização, salvamento e recuperação em aparelhos; resolver acesso individual, infraestrutura, privacidade e suporte; testar compra e cancelamento; concluir a revisão dos recursos de saúde oferecidos. Como hipóteses de produto, buscar ativação de pelo menos 70% dos participantes e retorno de pelo menos 40% dos ativados entre os dias 6 e 8. São metas internas propostas, não padrões de mercado ou comprovação de eficácia. Interpretar números junto das entrevistas, pois a amostra é pequena.

**A data não é um compromisso aprovado:** se segurança, operação ou valor recorrente não estiverem demonstrados, manter o piloto e adiar a abertura comercial. Não comprar tráfego em escala antes de entender retenção e custo de atendimento.

## 6. Riscos conhecidos: críticas que precisamos antecipar

Não são reclamações já recebidas: o produto ainda não tem usuários reais informados. São críticas plausíveis, baseadas na implementação e na proposta comercial.

### “É só mais um contador de calorias. Por que eu pagaria?”

O mercado já oferece registros, receitas e automação. A resposta precisa ser demonstrar economia de esforço e ajuda prática para manter a rotina. Priorizar favoritos, tarefas simples e retorno dos participantes antes de ampliar a lista de funcionalidades.

### “Para começar é fácil, mas registrar a comida continua trabalhoso.”

A entrada rápida libera água e hábitos; a personalização alimentar ainda exige anamnese e o registro trabalha com gramas. Favoritos reduzem repetição, mas não resolvem todas as porções ou a cobertura de alimentos. Observar refeições reais no piloto e priorizar medidas caseiras verificadas e melhorias no catálogo.

### “Troquei de celular e meu histórico não apareceu.”

O armazenamento atual é local. Backup manual existe, mas não equivale a conta ou sincronização. Explicar essa limitação no piloto, testar restauração e concluir recuperação de dados antes de prometer continuidade entre aparelhos.

### “A IA errou ou parece estar se passando por um profissional.”

Respostas automáticas podem conter erros; as revisões internas também são automáticas. Manter a identificação de IA, permitir conferência e correção de dados e submeter os recursos de saúde à revisão profissional apropriada. Não divulgar resultados de testes de software como validação clínica.

### “Por que um app de hábitos pede exames ou tem calculadora de dose?”

Os módulos ampliam a complexidade e podem enfraquecer o posicionamento inicial. A proposta é não destacá-los no lançamento voltado a hábitos e condicionar sua oferta pública às avaliações necessárias. Não orientar mudanças de medicamento como parte da promessa comercial.

### “Não sei para onde vão meus dados.”

O produto lida com informações pessoais de saúde e pode enviar conteúdo a DeepSeek/OpenAI conforme consentimento e configuração. Explicar o envio no momento adequado, limitar dados usados, oferecer controle e revisar a operação de privacidade e segurança. Backup local não tem senha; comunicar essa característica de forma clara.

### “A IA não conecta, o limite acaba rápido ou a assinatura não compensa.”

A infraestrutura ainda é local e os custos de produção não foram medidos. Antes de cobrar, disponibilizar serviço confiável, mostrar cotas e consumo, preservar o núcleo de registros quando a IA falhar e acompanhar cancelamentos. Não vender uso ilimitado sem conhecer o custo real.

### “O app me cobra demais e me faz sentir que fracassei.”

Mesmo com menos notificações e confirmações discretas, o tom dos agentes e das metas pode gerar pressão. Testar mensagens de retomada, respeitar preferências e a opção de ocultar calorias, e reconhecer ações realizadas sem transformar dias sem registro em julgamento sobre a pessoa.

**Decisões ainda a validar com o responsável pelo produto:** preço e cota do Plus, data de abertura, capacidade da equipe, orçamento de aquisição, escopo público dos módulos de saúde e requisitos finais de suporte e infraestrutura.

Base interna: [correções implementadas](correcoes-implementadas.md), [análise original de produto e mercado](analise-produto-mercado.md) e [guia funcional](../guias/sistema.md). Este briefing considera também o APK de testes gerado posteriormente à análise.
