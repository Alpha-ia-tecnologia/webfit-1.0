# WebFit — Saúde & Nutrição

Aplicação de acompanhamento individual de alimentação, hidratação, hábitos, medidas, medicação injetável e exames, com interface web, API de IA e aplicativo mobile.

Este repositório reúne os projetos web e mobile. O mobile reutiliza as regras de negócio do web; clone o repositório completo.

**Estado atual:** uso individual local ou em rede interna. Organizar o código no GitHub não habilita uma implantação pública: o servidor ainda exige adaptações de autenticação, armazenamento e acesso. Veja [Produção](docs/guias/producao.md).

## O que o app faz

- **Primeiro acesso em 3 telas** (boas-vindas → "Sobre você" → "Seu primeiro passo"): água e combinados funcionam sem perfil clínico.
- **Anamnese em 8 etapas**, com "Cuidados importantes" antes das medidas, controles sem digitação, linha do dia, metas "Recomendado para você" e a revelação do plano inicial. Com o perfil pronto, **Seu perfil de saúde** mostra um cartão por etapa e edita uma seção por vez.
- **Hoje**: semana em anéis, anéis do dia e próximo passo; seções reordenáveis em "Editar Hoje". No desktop (a partir de 1024 px), grade bento de 12 colunas e "Registro rápido" na barra lateral, também pela tecla **N**.
- **Diário** agrupado por refeição, com busca e "Qualidade do dia" (variedade em 7 grupos, sem calorias); **Registrar refeição** com busca na TACO, medidas caseiras, "Seus pratos", foto do prato como rascunho e "Descrever refeição" por texto (no app Android, também por ditado no aparelho, com o pt-BR instalado).
- **Minha dieta**: "Comi esta" registra a refeição do plano; "Trocar" alterna as trocas revisadas do plano, também na semana (S–D), sem nova chamada de IA; lista de compras do plano e das receitas → checklist → despensa, só no aparelho. Na **Despensa**, "Use primeiro"; nas receitas, modo preparo com timers, tela acesa e "Descontar da despensa".
- **Meu agente** (DeepSeek/OpenAI) com respostas em blocos, dieta estruturada, despensa e receitas; também organiza a descrição de uma refeição (modo `meal_text`) e lê o rótulo do frasco por foto (modo `rotulo`).
- **Evolução**: jornada e tendência do peso, pesagens em lista, medidas com silhueta, consistência em anéis, doses sobre o gráfico; destaques calculados no aparelho nos mini gráficos, com "Como calculamos"; **bem-estar e sono** em 7 colunas, mapa de 28 dias e leitura cruzada sem causa; **Sua semana** com cartão no Hoje às segundas e stories de 5 partes (no web, imagem opcional gerada no navegador; no app, texto; nunca o peso).
- **Seringa e dose**: frasco com seringa de insulina, caneta com seletor ou de dose única, mapa de rodízio com lados e frente/costas, próxima dose estimada; efeitos percebidos com intensidade, "Seu ciclo da semana" com dicas locais por fase, estoque do frasco ou caneta com doses restantes e "usar até", e leitura do rótulo por foto com confirmação (a foto não é salva).
- **Meu espaço**: saúde (corpo, metas, tratamento, perfil, cartão "Essencial"), exames com resultados transcritos em linhas, consultas como agenda com "Lembrar-me" (`.ics`); **Relatório para consulta** montado no aparelho (período, seções, gráfico, doses, perguntas): no web, impressão em A4 pelo navegador, que também salva em PDF; no app, arquivo HTML compartilhado; preferências e dados (backup, IA, Aparência e "Ocultar números do corpo" em "Suas escolhas").
- **Lembretes** em uma central (Agora, Hoje, Próximos) com atalhos e "Desfazer".
- **Tema escuro no web** (Sistema, Claro ou Escuro, por aparelho). No app nativo está preparado e desligado.
- **App instalável no navegador** (manifest), com atalhos para água, refeição e registro rápido: cada um abre a tela correspondente, e nada é registrado sem a pessoa salvar.

Detalhes em [Funcionalidades e sistema](docs/guias/sistema.md).

## Princípios de saúde

Regras de produto aplicadas no web, no app e no agente, cobertas por testes:

- **Ocultar calorias** (`hideCalories`) remove números de calorias das telas, dos resumos acessíveis e das respostas da IA, inclusive das estruturadas.
- **Vermelho nunca significa "passou da meta"** nem "atrasado". Fica reservado a erro e ação destrutiva; acima do planejado é neutro ou âmbar, e validade é laranja.
- **Perfis calmos**: gestação ou amamentação, transtorno alimentar (inclusive "prefiro não informar") ou menores de 18 anos. Veem só o valor do peso, sem tendência, IMC, peso desejado, projeção ou prévia de meta. Não recebem convites de peso e calorias da IA, e as metas automáticas ficam desligadas.
- **Medicação é só informativa.** A calculadora converte e não prescreve. O app nunca sugere nem ajusta dose e só registra com confirmação explícita. A próxima dose é sempre "estimada", sem contagem na gestação. A dose nunca entra nas metas; usar caneta só aumenta o déficit na perda de peso (+5 pontos percentuais por faixa de IMC, até 1.000 kcal/dia) e a proteína (1,8 g/kg), sempre acima do piso de 1.200/1.500 kcal.
- **Estimativas pessoais**: metas automáticas por Mifflin-St Jeor e nível de atividade, com déficit por faixa de IMC (sem déficit abaixo de 18,5), proteína com peso ajustado acima do IMC 30 e condições de saúde de uma lista fechada (algumas ajustam os cuidados, outras pedem avaliação individual). Cuidados do perfil aparecem como chips neutros ("Pressão alta", "Glicose", "Caneta"…) que abrem a folha "Cuidados do seu perfil", só texto, sem números. **Ajuste dinâmico** (preferência ligada por padrão): a meta de hoje acompanha só o dia anterior (2+ refeições), metade da diferença acima de 10%, até ±10% e ±250 kcal, nunca abaixo do piso (e nunca para menos com IMC abaixo de 18,5), absorvida nos carboidratos (mínimo 50%); a proteína nunca diminui e sobe até 20 g quando ontem ficou baixa; fora de metas manuais, perfis calmos e, com "Ocultar calorias", só a proteína. **IA mais ativa**: no Hoje, o cartão Resumo é a única voz proativa (título com o recado do dia, o alerta da caneta ou um sinal; até 3 chips, como "↑ +147 kcal hoje"; detalhe numa folha a um toque); nas outras telas, os sinais do app são chips de insight (dispensáveis por 3 dias); o recado do dia é uma frase do agente, uma vez por dia (preferência própria), que no chat aparece como "Recado do dia". Detalhes em [Estimativas pessoais](docs/guias/sistema.md#estimativas-pessoais).
- **A IA devolve dados; o app desenha.** Números nutricionais vêm da TACO e dos registros locais, nunca do modelo. Guarda determinística e revisor verificam cada resposta.
- **Laudos são transcritos, nunca classificados.** Valor, unidade, referência e marcação são copiados do laudo; o app não diz "normal", "alto" ou "baixo" nem colore resultados.

## Organização

```text
webfit/
├── .github/workflows/    # Verificações automáticas do GitHub
├── src/                 # Interface web e regras compartilhadas
│   ├── components/      # Componentes e telas web
│   ├── data/            # Questionário e catálogo alimentar
│   ├── design/          # Tokens visuais (fonte única web + app)
│   ├── lib/             # Domínio, persistência e regras de negócio
│   ├── styles/          # tokens.css gerado a partir de design/
│   └── types.ts         # Contratos e esquemas compartilhados
├── server/              # API Express, provedores e agente de IA
│   ├── graph/           # Fluxo do agente e saídas estruturadas
│   └── db/migrations/   # Migrações PostgreSQL
├── mobile/              # Aplicativo Expo / React Native
│   ├── src/             # Rotas, telas e componentes nativos
│   ├── assets/          # Ícones e imagens
│   └── scripts/         # Compilação Android e verificações
├── tests/               # Testes de domínio, API, guardas e navegador
├── scripts/             # Banco, tokens, verificação visual e ferramentas
├── data-sources/        # Fonte TACO e metadados de importação
├── docs/                # Guias, arquitetura, planejamento e histórico
├── .env.example         # Modelo de configuração do servidor
├── package.json         # Comandos e dependências do web + API
└── package-lock.json    # Versões reproduzíveis do web + API
```

`node_modules/`, `dist/`, logs, relatórios, arquivos `.env` reais e `.local/` ficam apenas na máquina e são ignorados pelo Git. O mobile mantém seu próprio `package.json` e `package-lock.json`.

## Executar web e API

Requer Node.js 22.12 ou superior e npm. A versão principal adotada nas verificações é Node.js 22 (`.nvmrc`).

```sh
npm ci
```

Copie `.env.example` para `.env.local`. No PowerShell:

```powershell
Copy-Item .env.example .env.local
```

No macOS/Linux: `cp .env.example .env.local`. Preencha credenciais somente no arquivo local, se quiser ativar IA ou os comandos de banco.

```sh
npm run dev          # http://127.0.0.1:3000
npm run dev:lan      # também aceita o IP deste computador na rede (app no celular)
```

Para gerar e executar a versão compilada localmente:

```sh
npm run build
npm start            # ou npm run start:lan
```

## Executar mobile

Na raiz do repositório:

```sh
npm --prefix mobile ci
```

Siga o [guia mobile](mobile/README.md) para configurar o endereço da API, executar o Expo e gerar APKs. As dependências da raiz também são necessárias para as verificações que usam o código compartilhado.

## Verificar antes de enviar

```sh
npm run check:repo
npm run lint
npm test                               # unitários e guardas de tokens, tema e estilo do app
npm run test:e2e                       # compila (pretest) e roda o Playwright na porta 3107
npm --prefix mobile run typecheck
npm --prefix mobile run export:android
```

- **E2E:** exige o Google Chrome instalado. Para rodar um spec isolado, rode `npm run build` antes de `node node_modules/@playwright/test/cli.js test tests/e2e/<arquivo>.spec.ts`. Rode uma execução por vez: porta e `dist/` são compartilhados.
- **Visual nos dois temas:** com o servidor compilado rodando, `THEME=light` e depois `THEME=dark` com `CHANNEL=chrome node --import tsx scripts/visual-check.ts`. O JSON impresso deve trazer `"errors": []`.
- **App nativo:** em `mobile/`, exporte o web (`node node_modules/expo/bin/cli export --platform web --output-dir dist/<pasta>`) e rode `node --import tsx scripts/<nome>-check.mjs dist/<pasta>`. Cada script usa uma porta fixa.
- **Banco:** `npm run test:db` é opcional e depende de `DATABASE_URL`.

Comandos completos, portas e a lista de verificações do app em [Testes e verificações](docs/guias/testes.md).

## Banco de dados

O esquema PostgreSQL fica em `server/db/migrations/`, no schema `webfit`; `npm run db:migrate`, `db:seed` e `db:status` são ações explícitas. **WebFit online (várias contas):** com `WEBFIT_PUBLIC_URL` definida, o servidor exige conta (cadastro só por convite, `npm run admin`), limita os pedidos de IA por conta e por dia e guarda a cópia de cada pessoa na própria conta. Publicação na VPS com Docker e HTTPS: [guia de publicação](docs/guias/publicacao-vps.md).

As 16 migrações estão aplicadas no banco configurado. O app grava primeiro no armazenamento local (IndexedDB no web, SQLite no mobile); em Meu espaço › Ajustes, a **cópia no servidor** (desligada por padrão) guarda o estado também no PostgreSQL, com restauração por código e exclusão junto com os dados do aparelho. Detalhes no [guia do sistema](docs/guias/sistema.md#cópia-no-servidor-opcional).

## Limites conhecidos

- **App nativo** verificado apenas pelo export web no navegador. O APK de release foi gerado de novo em 29/09/2026 e não foi testado em aparelho. Notificações, seletor de arquivos, navegação nativa, ditado, tela acesa no modo preparo, TalkBack e compartilhamento do relatório ainda precisam de aparelho.
- **Tema escuro do app nativo** preparado e desligado (`RN_DARK_MODE_ENABLED = false`). O app segue claro.
- **Lembretes no navegador** aparecem só com o app aberto.
- **Esquemas estritos da IA** não foram conferidos com a OpenAI real: `scripts/strict-schema-smoke.ts` faz 7 chamadas pagas e só roda com autorização. Se o provedor recusar um esquema, a reserva em texto mantém o modo funcionando.
- **Base TACO** sem alimentos com `NA` na planilha (azeite, óleos, leites); fibra e sódio ainda não estão no `src/data/foods.json`. Incluir depende de executar o importador Python.
- **Conteúdo de saúde** (textos, faixas, regras de cautela, efeitos colaterais, ciclo de fases, qualidade) é restrição de produto e ainda não passou por revisão de profissional habilitado.
- **Adiados na Onda 4:** Health Connect (HOJE-14), código de barras com o Open Food Facts (DIARIO-06), widgets Android e notificações acionáveis (parte de HOJE-13), bloqueio por biometria, proteção contra captura de tela e PIN no web (parte de ESPACO-13). Dependem de bibliotecas nativas novas ou de serviço externo, e de teste em aparelho. Veja o [histórico da Onda 4](docs/historico/onda-4.md#itens-em-parte-e-adiados).

## Documentação

- [Índice e arquitetura das pastas](docs/README.md)
- [Funcionalidades, agente, banco e padrões do sistema](docs/guias/sistema.md)
- [Testes e verificações](docs/guias/testes.md)
- [Tokens visuais e tema escuro](docs/guias/tokens-e-tema.md)
- [Saídas estruturadas da IA](docs/guias/ia-estruturada.md)
- [Gramática de gráficos](docs/guias/viz.md)
- [Preparar e enviar para o GitHub](docs/guias/github.md)
- [Produção: execução atual e trabalho pendente](docs/guias/producao.md)
- [Aplicativo mobile](mobile/README.md)
- [Histórico: Ondas 2 e 3](docs/historico/ondas-2-3.md)
- [Histórico: Onda 4](docs/historico/onda-4.md)
- [Plano de evolução](docs/planejamento/plano-app.md)
