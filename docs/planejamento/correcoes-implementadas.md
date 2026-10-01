**Correções implementadas após a análise do WebFit — 23/09/2026**

O pacote aplica correções locais de regras, dados e experiência nas versões web e mobile. A análise de mercado anterior permanece como registro do diagnóstico; ela não representa mais integralmente o comportamento desta versão.

| Área             | Comportamento entregue                                                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrada          | Nome, objetivo, consentimento local e hábito opcional permitem começar. Água e hábitos funcionam com `profile: null`, sem respostas de saúde inventadas, metas clínicas ou envio à IA.                                                                               |
| Anamnese         | Continua necessária para personalização alimentar. Pode ser retomada e permite salvar/voltar aos hábitos. Perfis e rascunhos existentes continuam acessíveis.                                                                                                        |
| Metas            | Removidas compensações entre dias e alterações automáticas de calorias/macros por uso de caneta. Metas manuais e histórico são preservados.                                                                                                                          |
| Consentimento    | Interface informa DeepSeek/OpenAI e provedor de reserva. Autorizações antigas são desativadas até renovação; versão do consentimento não invalida dieta nem é enviada como contexto.                                                                                 |
| IA               | Respostas e revisão são identificadas como automáticas; o resumo diário por regras deixou de ser apresentado como insight de IA.                                                                                                                                     |
| Home             | Água, hábitos e refeições vêm antes dos módulos secundários. Há sugestões opcionais de hábitos. Balanço detalhado pode ser expandido.                                                                                                                                |
| Registros        | Confirmações discretas substituem pop-ups de incentivo a cada registro. Injeção saiu do menu geral; acesso específico e registros anteriores foram preservados.                                                                                                      |
| Refeições        | Até 100 favoritos independentes do diário e cinco refeições recentes sem duplicações. Reutilizar clona ingredientes, preserva dia/horário escolhido e exige salvar.                                                                                                  |
| Backup           | Importação JSON de até 256 MB disponível desde a entrada. Validação, prévia, exportação dos dados atuais e confirmação explícita antes da substituição. Falha de gravação preserva o estado anterior; autorização de IA e lembretes não são reativados pelo arquivo. |
| Lembretes mobile | Agenda pontual de sete dias, renovada ao abrir, até três pausas de água/dia e 60 notificações totais. Registros/conclusões cancelam avisos correspondentes; horários de silêncio são respeitados.                                                                    |
| Qualidade        | Casos de migração, metas, favoritos, backup, entrada breve e agenda estão cobertos por testes. CI inclui jornadas de navegador com provedores simulados.                                                                                                             |

Os backups são arquivos locais sem senha. Importação não é sincronização: manter uma cópia segura continua sendo responsabilidade de quem usa a versão local. Lembretes dependem da permissão e da entrega do sistema operacional; o horizonte é renovado ao reabrir o aplicativo.

**Ainda pendente para uma operação comercial:** API pública HTTPS, identidade/autorização por usuário, persistência e sincronização em produção, recuperação de conta, limites/custos de IA por cliente, observabilidade, suporte, cobrança, assinatura de distribuição e publicação em lojas. Avaliações profissional, de privacidade e regulatória não foram substituídas por testes de software.

**Melhorias de produto ainda no planejamento:** medidas caseiras verificadas, ampliação da base alimentar com fontes adequadas, refeições estruturadas a partir de receitas/planos, hábitos com frequência flexível, revisão semanal e instrumentação de retenção. O pacote não cria bases nutricionais inventadas nem simula serviços externos.

**Validação realizada em 23/09/2026:**

- 162 testes automatizados de regras e integrações com provedores simulados, todos aprovados.
- 27 jornadas Playwright aprovadas: anamnese, refeições/favoritos, hábitos/água, backup, exclusão entre abas, exames, dieta e despensa.
- TypeScript web/API e mobile, compilação Vite e exportações Expo Android e web concluídos.
- Jornada Expo com SQLite real em navegador isolado: entrada breve, hábito, água, recarga, ida/volta da anamnese e restauração de rascunho aprovadas, sem erro de execução nem chamada de IA nesses fluxos.
- Jornada Expo de exames com IA simulada: anexos, persistência, exame antes da dieta, falha, nova tentativa e cancelamento aprovados.
- Comparação visual da anamnese web/Expo em 412 px: sem erros de execução; régua vazia inicialmente, 71,0 kg após ajuste fino e 73,0 kg após rolagem em ambas. Telas principais web revisadas em 390 px e 1365 px, sem excesso de largura.

As verificações Expo em navegador não substituem testes em aparelho. Entrega de notificações, seletor nativo de arquivos e navegação no Android/iOS ainda precisam de validação em dispositivo. A exportação Android gera o bundle; não foi gerado nem publicado um APK/AAB de distribuição neste pacote. Provedores de IA reais e infraestrutura comercial não foram exercitados.

Consulte [produção](../guias/producao.md) para os limites atuais e [análise original](analise-produto-mercado.md) para a estratégia do piloto.
