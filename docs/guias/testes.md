# Testes e verificações

Os comandos rodam na raiz, salvo indicação. O caminho do repositório tem `&` e acentos, por isso os scripts chamam `node node_modules/...` em vez de `npx`.

## Resumo

| Verificação | Comando | Observação |
| --- | --- | --- |
| Arquivos do repositório | `npm run check:repo` | Nomes sensíveis, pastas geradas, arquivos grandes e padrões de credenciais |
| Tipos web + API | `npm run lint` | `tsc --noEmit` |
| React (ESLint) | `npm run lint:react` | `src/` com `eslint.config.js`: regras dos hooks (`rules-of-hooks` erro, `exhaustive-deps` aviso), `jsx-a11y` e `typescript-eslint` sem tipos; exceções só com `eslint-disable-next-line ... -- motivo`; fora da CI |
| Unitários | `npm test` | `node --import tsx --test tests/*.test.ts` |
| Um arquivo | `node --import tsx --test tests/<nome>.test.ts` | |
| Navegador (E2E) | `npm run test:e2e` | O `pretest:e2e` compila antes (`vite build`) |
| Banco | `npm run test:db` | `tests/db.integration.ts`; pula sem `DATABASE_URL` |
| Visual | `scripts/visual-check.ts` | Com servidor em execução, nos dois temas |
| App nativo | `npm --prefix mobile run typecheck` e scripts em `mobile/scripts/` | Só o export web é testável sem aparelho |

A CI (`.github/workflows/ci.yml`) roda `check-repo`, `lint`, `npm test`, build, Playwright com Chrome, tipos do mobile e export Android. Banco, verificação visual, verificações do app nativo e APK ficam fora da CI.

## Unitários

`tests/*.test.ts` cobre domínio, formatação, agente (modelo simulado) e as guardas do repositório:

- `tokens.test.ts`, `theme-css.test.ts`, `mobile-style.test.ts` e `mobile-theme.test.ts`: tokens, contraste e tema escuro. Veja [Tokens e tema](tokens-e-tema.md).
- `copy.test.ts`: glossário, um nome por conceito ("agente", "combinados", "Registrar medidas").
- `structured.test.ts`, `structured-guard.test.ts` e `exam-result.test.ts`: saídas estruturadas da IA. Veja [IA estruturada](ia-estruturada.md).

Não são testes: `tests/fixtures.ts`, `tests/structured-fixtures.ts` e `tests/strict-schema.ts`, este último com ajudantes para esquemas estritos.

## Navegador (Playwright)

[`playwright.config.ts`](../../playwright.config.ts) inicia `server/index.ts --production` na porta **3107**, que serve o build de `dist/`. As chaves de IA ficam vazias e o modo de rede desligado. Usa o Google Chrome instalado (`channel: "chrome"`), um worker e janela de 1365 × 950. As respostas de IA são simuladas nos specs.

```sh
npm run test:e2e                                          # compila e roda tudo
npm run build                                             # para rodar um spec isolado
node node_modules/@playwright/test/cli.js test tests/e2e/tema.spec.ts
```

- **Uma execução por vez.** O servidor usa a porta 3107 fixa (`reuseExistingServer: false`) e `npm run build` reescreve o `dist/` que ele serve. Se várias sessões trabalham na mesma pasta, use um lock antes do build e do Playwright e remova-o no fim. Um diretório criado com `mkdir` fora do repositório funciona: se a criação falhar, outra execução está em andamento.
- Sem o build, o servidor serve uma versão antiga ou falha. Chamar o Playwright direto exige `npm run build` antes.
- `test-results/` é apagado a cada execução. Guarde capturas em outra pasta.
- `tests/e2e/contrast.ts` não é spec: faz a varredura de contraste usada por `tema.spec.ts` e pela verificação visual.
- Seletores presos a nomes acessíveis ("Registro rápido", "Salvar medidas", "Ver no diário") fazem parte do contrato. Ao mudar um texto, atualize o spec preservando a intenção.

### Specs da Onda 4

Oito specs novos no web, além de casos novos em `evolucao.spec.ts` (destaques dos mini gráficos, "Como calculamos", bem-estar e sono):

| Spec | O que cobre |
| --- | --- |
| `cozinha.spec.ts` | Minha dieta: "Comi esta" com "Desfazer", "Ajustar" quando falta alimento da TACO ou há alérgeno, "Trocar" com as trocas revisadas, "Pedir outra opção" que só preenche o chat, semana S–D e perfil sensível; lista de compras (sugestões, revisão, marcar, guardar na despensa, compartilhar, toque duplo); "Use primeiro" e o lembrete das 10:00; modo preparo (timer, tela acesa, navegador sem Wake Lock) e "Descontar da despensa" com toque duplo e "Desfazer" |
| `semana.spec.ts` | "Sua semana": cartão no Hoje na segunda e não na terça, stories de 5 partes (teclado, deslizar, pausar), perfil calmo sem peso nem meta, imagem opcional gerada no aparelho e nada com poucos registros |
| `tratamento.spec.ts` | Efeitos percebidos e nota de efeito forte, "Como ficou?" (conjunto reduzido com transtorno alimentar), grade "Seu ciclo" D0–D6, estoque do frasco ou caneta, "Seu ciclo da semana" com combinado em um toque, leitura do rótulo (confirmação, várias leituras, foco a cada etapa, sem autorização de IA) |
| `registro.spec.ts` | "Descrever refeição": porção dita, alérgeno desmarcado, "Falta porção" confirmado antes de salvar, sem autorização de IA, com alerta de urgência e com resposta só em texto; "Qualidade do dia" (3 de 7 grupos, sem vermelho e sem calorias) |
| `relatorio.spec.ts` | Cartão "Essencial" (remédios sem dose); relatório com seções marcadas e pergunta pendente, impressão (`window.print()` simulado e CSS de impressão), calorias ocultas, perfil calmo, nome com HTML como texto e números do corpo ocultos |
| `privacidade.spec.ts` | "Ocultar números do corpo": interruptor, Minha saúde, peso rápido, Minha dieta e o agente, texto salvo do agente como "número oculto", anamnese com aviso |
| `privacidade-evolucao.spec.ts` | Evolução com os números ocultos: jornada, pesagens e medidas sem valores, menor de 18 anos sem lembrete de pesagem, primeira pesagem e Evolução completa com o relatório no fim |
| `atalhos.spec.ts` | Manifest e ícones servidos pelo próprio app; atalhos de água, refeição e registro rápido abrem a tela sem registrar nada; atalho antes da anamnese e valor desconhecido são descartados |

**JSON nos specs:** o carregador do Playwright exige o atributo `with { type: "json" }` para importar JSON. Por isso os specs não importam módulos que carregam `src/data/foods.json`: `src/lib/taco-match.ts`, `src/lib/food-categories.ts` e o que depende deles, como `src/lib/report.ts` e `tests/report-fixtures.ts`. Quando um spec precisa da TACO, lê o arquivo com `readFileSync`, como `registro.spec.ts`.

### Padrões e ajustes em E2E

- **Tamanho de alvos:** meça a caixa de layout (`offsetWidth`/`offsetHeight`), não `getBoundingClientRect` nem `boundingBox()`. Durante a entrada da folha (`wf-fade-up`, com `translateY`), a caixa medida dá 43,99… px e a guarda de 44 px falha sem o alvo ter mudado (`smallTargets` e `layoutSize` em `tratamento.spec.ts`).
- **Contraste com a tela parada:** antes de medir, tire o ponteiro de cima (`page.mouse.move(0, 0)`) e espere as transições CSS terminarem, com `document.getAnimations()` filtrado por `CSSTransition` (`stableContrast` em `relatorio.spec.ts` e `privacidade-evolucao.spec.ts`). Os botões animam cor e fundo em 0,18 s.
- **Relógio fixo:** `page.clock.setFixedTime` fixa o dia e a hora (segunda-feira em `semana.spec.ts`; depois das 10:00 para o lembrete do "Use primeiro"). No modo preparo, `page.clock.install` e `page.clock.runFor` avançam os timers.
- **APIs do navegador simuladas** com `page.addInitScript`: `window.print` (`relatorio.spec.ts`), `navigator.share` e `navigator.wakeLock` (`cozinha.spec.ts`). A impressão usa `page.emulateMedia({ media: "print" })` e o evento `afterprint`.
- **Movimento reduzido:** `reducedMotion: "reduce"` nos stories e no modo preparo.
- **Agente simulado:** `/api/status` e `/api/agent` respondem por `page.route`; em `registro.spec.ts`, em NDJSON, com as respostas de `tests/structured-fixtures.ts`.

## Verificação visual

[`scripts/visual-check.ts`](../../scripts/visual-check.ts) semeia um estado de exemplo e fotografa Hoje, Diário, Agente, registro rápido, anamnese, Seringa e dose e metas, em desktop e em 390 px. Confere fontes carregadas, ausência de rolagem lateral e contraste, e imprime um JSON com `errors`, que deve vir vazio. `THEME=light` (padrão) ou `THEME=dark` emula o modo do aparelho, como "Sistema" em Aparência.

```sh
npm run build
PORT=3141 npm start                        # outro terminal; qualquer porta livre
THEME=light BASE=http://127.0.0.1:3141 CHANNEL=chrome node --import tsx scripts/visual-check.ts
THEME=dark  BASE=http://127.0.0.1:3141 CHANNEL=chrome node --import tsx scripts/visual-check.ts
```

No PowerShell, defina as variáveis antes: `$env:PORT="3141"; npm start` para o servidor e `$env:THEME="dark"; $env:BASE="http://127.0.0.1:3141"; $env:CHANNEL="chrome"; node --import tsx scripts/visual-check.ts` para a verificação. Sem `OUT`, as capturas vão para `test-results/visual/<tema>`.

`scripts/ux-audit/capture.ts` fotografa todas as telas a 390 px com um estado rico, para comparar antes e depois. O uso está no cabeçalho do arquivo.

## App nativo

Dentro de `mobile/`:

```sh
npm run typecheck                                              # inclui ../src via @shared
npm run export:android                                         # bundle Hermes
node node_modules/expo/bin/cli export --platform web --output-dir dist/o3l1
node --import tsx scripts/o3l1-check.mjs dist/o3l1 [pasta-das-fotos]
```

Cada verificação serve o export web numa porta própria e o abre no Chrome instalado, pelo Playwright da raiz. Exporte para uma pasta por verificação e rode uma de cada vez: as portas são fixas e `agent-check` e `anamnese-check` usam a mesma.

| Script | Porta | O que cobre |
| --- | --- | --- |
| `anamnese-parity.mjs` | 3209 | Paridade da anamnese web × app (modo `web` usa o servidor em `127.0.0.1:3000`) |
| `exams-check.mjs` | 3210 | Exames na anamnese com SQLite real e IA simulada |
| `agent-check.mjs` | 3211 | Envio ao agente: offline, reconexão, sem consentimento, servidor sem IA |
| `anamnese-check.mjs` | 3211 | Etapas da anamnese a 390 e 360 px |
| `lote2x-check.mjs` | 3214 | "Antes de medir", local da aplicação, contagem da água, "Sua jornada" |
| `o2l1-check.mjs` | 3216 | Primeiro acesso em 3 telas e pílulas da anamnese |
| `o2l2-check.mjs` | 3217 | Evolução: jornada, peso por período, mini gráficos 7/28 dias |
| `o2l3-check.mjs` | 3218 | Registrar refeição: busca, medidas caseiras, "Seus pratos", rótulo |
| `o2l4-check.mjs` | 3219 | Faixa da semana, Diário agrupado, água em uma linha |
| `o2l5-check.mjs` | 3220 | Seringa e dose: frasco, caneta, confirmação, dose de sempre |
| `o2l6-check.mjs` | 3221 | IA estruturada no chat e perfil sensível |
| `o2l7-check.mjs` | 3222 | Despensa e receitas |
| `o3l1-check.mjs` | 3223 | Anamnese da Onda 3: cuidados, IMC neutro, caneta, linha do dia, plano |
| `o3l2-check.mjs` | 3224 | Meu espaço: perfil de saúde, exames estruturados, consultas `.ics`, ajustes |
| `o3l3-check.mjs` | 3225 | Pesagens, medidas, consistência, doses no gráfico, mapa de rodízio |
| `o3l4n-check.mjs` | 3226 | Central de lembretes (relógio fixo às 13:00) |
| `o3l4d-check.mjs` | 3227–3228 | Tema do app: claro idêntico e escuro ainda desligado |
| `acab-c-check.mjs` | 3231 | Ajustar metas, "Sua jornada", ícones de categoria |
| `acab-d-check.mjs` | 3232 | Título grande que encolhe com a rolagem |
| `acab-a-check.mjs` | 3233 | Anel do Hoje, folhas de água e bem-estar, "Editar Hoje" |
| `acab-b-check.mjs` | 3234 | Avisos, estados vazios, esqueleto e validade da Despensa |
| `o4l1-check.mjs` | 3230 | Cozinha: "Comi esta", "Ajustar", "Trocar", "Pedir outra opção", semana do plano, lista de compras, "Use primeiro", modo preparo e "Descontar da despensa" |
| `o4l2-check.mjs` | 3235 | Evolução e semana: destaques e "Como calculamos", bem-estar e sono, "Sua semana" no Hoje e na Evolução, stories e resumo em texto |
| `o4l3-check.mjs` | 3236 | Tratamento: efeitos percebidos, "Como ficou?", "Seu ciclo", estoque, "Seu ciclo da semana" e leitura do rótulo com confirmação |
| `o4l4-check.mjs` | 3237 | Registro e privacidade: "Descrever refeição" (sem ditado no export web), "Qualidade do dia", "Essencial", relatório em HTML e "Ocultar números do corpo" |

O uso de cada script está no cabeçalho. `agent-check` e `exams-check` também aceitam rodar da raiz com `mobile/dist/<pasta>`. Não há teste em aparelho nem APK validado nesta versão: o export web não substitui notificações, seletor de arquivos e navegação nativos. Para gerar o APK, veja o [guia mobile](../../mobile/README.md).

### Gerar o APK com a saída em arquivo

`mobile/scripts/build-android.ps1` espelha `mobile/` e `src/` em `D:\wf-build`, porque o `&` e os acentos do caminho real quebram o Gradle, e compila lá. Para gravar a saída num arquivo, rode na pasta `mobile/`, pelo Git Bash ou pelo cmd, com o redirecionamento feito fora do PowerShell:

```sh
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Task assembleRelease > apk-build.log 2>&1
```

Nunca capture a saída com `*>&1` ou `2>&1` dentro do PowerShell. O script define `$ErrorActionPreference = "Stop"`, e o Windows PowerShell 5.1 transforma cada linha que o Gradle escreve em stderr num erro; com `Stop`, o primeiro aviso encerra o build. O APK sai em `mobile/dist/WebFit-<versão>-release.apk`. A compilação de 29/09/2026 levou cerca de 12,5 min (`BUILD SUCCESSFUL in 12m 25s`).
