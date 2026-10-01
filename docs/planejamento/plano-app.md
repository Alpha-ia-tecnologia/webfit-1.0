# Plano de implementação: WebFit como app (Android, iOS e Web)

Data: 13 de setembro de 2026. Horizonte: 14 a 17 semanas com uma pessoa em tempo integral; 9 a 11 semanas com duas.

## 1. Ponto de partida

O que já existe e pode ser reaproveitado quase sem mudanças:

| Área | Estado atual | Consequência para o app |
| --- | --- | --- |
| Interface | React 19 + Vite, layout móvel pronto (390 px), fontes locais, SVGs próprios | Uma base de código serve web, Android e iOS |
| Dados | Tudo no IndexedDB do navegador (perfil, diário, aplicações, medidas, laudos em base64, conversa) | Funciona offline, mas não sobrevive à troca de aparelho; precisa de sincronização |
| Agente de IA | Servidor Express local com a chave da OpenAI; aceita só `127.0.0.1`, valida origem e token de sessão | Precisa ser hospedado, com login e limite por usuário |
| Banco | PostgreSQL, schema `webfit` com 3 migrações espelhando o esquema do app | Falta só a camada de API |
| Qualidade | 78 testes unitários, 10 E2E (Playwright), testes de banco, script visual | Mantidos e ampliados em cada fase |
| PWA | Sem manifesto nem service worker | Primeiro passo, barato |

## 2. Decisões de arquitetura

1. **Uma base de código.** O front atual (React + Vite) vira PWA e é empacotado com **Capacitor** para Android e iOS. Reescrever em React Native/Expo descartaria telas, CSS e testes por um ganho pequeno neste tipo de app.
   *Atualização (2026-09-13):* existe agora um app Expo paralelo em `mobile/` que compartilha `src/lib`, `src/data` e `src/types.ts`. Ele não substitui esta decisão: a Fase 4 pode seguir por Capacitor ou promover o app nativo, conforme a experiência de uso comparada nos dois. O núcleo compartilhado serve às duas rotas.
2. **Backend hospedado.** O servidor Express atual é publicado como serviço (Docker) com HTTPS, segredos em variáveis de ambiente e a chave da OpenAI só no servidor.
3. **Login sem senha.** E-mail com código de uso único (e login social opcional), token de acesso curto e renovação; no app nativo o token fica em armazenamento seguro. Um provedor de autenticação pronto evita escrever isso do zero.
4. **Offline primeiro.** O IndexedDB continua como armazenamento local. Cada gravação entra numa fila e é enviada à API quando há rede; cada registro carrega `updatedAt` e revisão, e a última gravação vence. No primeiro login o app oferece "importar os dados deste aparelho".
5. **Anexos fora do estado.** Laudos e fotos deixam de viver em base64 no estado e vão para um armazenamento de objetos com URLs assinadas e limite por usuário.
6. **LGPD desde o início.** Dados de saúde são sensíveis: consentimento explícito, exportação e exclusão da conta pela API, TLS em trânsito, criptografia em repouso, logs sem conteúdo (a tabela `agent_runs` já segue isso).
7. **Lembretes locais.** As regras de lembrete já existem; no app nativo elas passam a disparar notificações locais. Push remoto fica para depois.

## 3. Fases

### Fase 0: PWA instalável e publicação web (1 semana)

- Manifesto, ícones e service worker via `vite-plugin-pwa`; cache do shell e das fontes, nunca de `/api`.
- Ajustar a CSP e a verificação de origem para o domínio publicado.
- Publicar o front em hospedagem estática com HTTPS e domínio próprio.
- Aceite: app instalável no Android e no iOS pelo navegador; abre offline; testes verdes; Lighthouse PWA sem falhas.

### Fase 1: Backend na nuvem com autenticação (2 a 3 semanas)

- Conteinerizar o servidor; publicar num provedor gerenciado com HTTPS e segredos fora do código.
- Autenticação por e-mail com código; middleware que substitui a checagem de `host`/origem local por token do usuário e lista de origens permitidas (domínio web, `capacitor://localhost`, `https://localhost`).
- Limite de requisições e de custo de IA por usuário; rotacionar a chave da OpenAI e a senha do PostgreSQL; ligar SSL no banco.
- Aceite: `/api/agent` responde só com token válido; testes de contrato da API; painel de custo por usuário.

### Fase 2: API de dados e sincronização (3 a 4 semanas)

- Endpoints por coleção sobre o schema `webfit`: perfil, diário, aplicações, medidas, hábitos, conversa, metadados de laudos, consultas, lembretes lidos.
- No front, uma camada de repositório entre as telas e o armazenamento: escreve local, enfileira, sincroniza; download completo no login; resolução de conflito por registro.
- Importação dos dados locais no primeiro login; exportação e exclusão de conta pela API.
- Aceite: dois aparelhos convergem após edições offline; E2E de sincronização; testes de integração do banco ampliados.

### Fase 3: Anexos e agente no servidor (2 semanas)

- Armazenamento de objetos para laudos e fotos, com URLs assinadas e limites de tamanho.
- Agente passa a montar o contexto a partir do servidor (perfil e registros do usuário autenticado), não só do que o cliente envia.
- Aceite: laudo enviado pelo celular aparece na web; análise de exame funciona com URL assinada; nenhum anexo em base64 no estado.

### Fase 4: Apps nativos com Capacitor (2 a 3 semanas)

- Adicionar Capacitor (core, CLI, Android, iOS) e plugins: armazenamento seguro para tokens, notificações locais para lembretes, câmera para fotos de refeições e laudos, sistema de arquivos e compartilhamento para a exportação, deep links, barra de status e splash.
- Ajustes de WebView: exportação por arquivo e compartilhamento (links de download não funcionam no app), áreas seguras (o `viewport-fit=cover` já existe), teclado sobre formulários.
- Builds: Android Studio com keystore; iOS com Xcode num Mac ou serviço de build na nuvem, conta Apple Developer.
- Aceite: fluxos críticos (anamnese, diário, água, seringa e dose, exportação) passando em aparelhos reais Android e iOS; suíte E2E web continua verde.

### Fase 5: Lojas e conformidade (1 a 2 semanas)

- Política de privacidade e termos; declaração de dados de saúde nas fichas das lojas (Data safety no Google Play, App Privacy na App Store).
- Textos claros de que o app não substitui acompanhamento profissional e não é dispositivo médico; sem alegações clínicas; a calculadora de seringa converte, não prescreve.
- Contas de teste para os revisores, capturas de tela, testes internos (Internal testing e TestFlight), publicação gradual.
- Aceite: apps aprovados nas duas lojas; web e apps na mesma versão.

### Fase 6 (contínua): operação

- CI/CD: tipagem, testes unitários, build, E2E e testes de banco a cada mudança; builds nativos automatizados.
- Monitoramento de erros e de custo de IA; alertas; rotina de atualização das dependências e do modelo do agente.

## 4. Cronograma resumido

| Fase | Duração (1 pessoa) | Dependências | Entrega visível |
| --- | --- | --- | --- |
| 0. PWA e web | 1 semana | Domínio e hospedagem | App instalável pelo navegador |
| 1. Backend e login | 2 a 3 semanas | Provedor de nuvem e de autenticação | Agente funcionando fora do computador local |
| 2. API e sincronização | 3 a 4 semanas | Fase 1 | Dados iguais em vários aparelhos |
| 3. Anexos e agente no servidor | 2 semanas | Fase 2 | Laudos e fotos sincronizados |
| 4. Apps nativos | 2 a 3 semanas | Fase 1 (pode começar em paralelo à 2) | Builds Android e iOS em teste interno |
| 5. Lojas | 1 a 2 semanas | Fases 2 a 4, contas de desenvolvedor | Apps publicados |
| 6. Operação | contínua | Fase 5 | Rotina de releases |

## 5. Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Custo da IA cresce com usuários | Limite por usuário, modelo menor na triagem (já existe), cache de contexto, teto mensal com alerta |
| Revisão das lojas para app de saúde com IA | Avisos claros, política de privacidade, sem alegações clínicas, contas de teste, fluxo de exclusão de conta dentro do app |
| Dados sensíveis (LGPD) | Consentimento explícito, exportação e exclusão pela API, criptografia, logs sem conteúdo, retenção definida |
| Conflitos de sincronização | Revisão por registro, última gravação vence, importação explícita no primeiro login, testes com dois aparelhos |
| Laudos em base64 pesam o estado | Mover para armazenamento de objetos na Fase 3 antes de escalar usuários |
| iOS exige Mac e conta paga | Serviço de build na nuvem ou Mac dedicado; conta Apple Developer (anual) e Google Play (taxa única) |

## 6. Decisões pendentes (bloqueiam o início das fases 1 e 4)

- Provedor de hospedagem do servidor e do front (e domínio).
- Provedor de autenticação (e-mail com código, login social ou ambos).
- Armazenamento de objetos para laudos e fotos.
- Contas Apple Developer e Google Play; quem publica e assina os builds.
- Orçamento mensal de IA por usuário.

## 7. Próximos passos desta semana

1. Executar a Fase 0 (manifesto, service worker, publicação web): não depende de nenhuma decisão pendente.
2. Escolher hospedagem, autenticação e domínio.
3. Abrir as contas de desenvolvedor Apple e Google.
4. Rotacionar a chave da OpenAI e a senha do PostgreSQL antes de qualquer publicação.
