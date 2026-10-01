# Gramática de gráficos

Os gráficos do WebFit são poucos e se repetem de propósito: quem aprende a ler um anel no Hoje sabe ler o do Diário, o do registro rápido e o do app nativo. Não há biblioteca de gráficos. A geometria fica em [`src/lib/charts.ts`](../../src/lib/charts.ts) e, para os gráficos de uma tela só, no módulo de domínio (`evolution.ts`, `treatment.ts`, `exam-result.ts`, `body-metrics.ts`). É a mesma para o SVG da web e o `react-native-svg` do app. Nenhum componente calcula circunferência, escala ou caminho por conta própria.

## Formas

| Forma | Geometria | Onde aparece | Regras |
| --- | --- | --- | --- |
| Anel de progresso | `arcDash`, `arcLength` | Anel de energia e macros (`DayHero`), mini anel do aviso, anel do Agente, linha de partida | Começa no topo (`rotate(-90)`). Sem progresso, não desenha arco, porque a ponta redonda viraria um ponto. Acima de 100%, fica cheio e neutro. |
| Anel segmentado | `ringSegments`, `segmentFill` | "Seu dia" (refeições, água e combinados), Combinados | Segmentos iguais com folga entre eles; cada um enche até o próprio percentual. |
| Rosca proporcional | `donutArcs` | Proporção P/C/G no Diário com as calorias ocultas | Fatias proporcionais; fatia vazia some sem deixar folga. |
| Barras com alvo | CSS com altura em % de uma referência | Semana da água (`WaterWeek`), 72 px | A referência é o maior valor entre a meta, 500 ml e os dias. A meta é uma linha tracejada, e há um check nos dias em que ela foi atingida. |
| Semana em anéis | Três segmentos por dia | `WeekStrip` | Só mostra presença (água, refeição, combinado), sem marca de falta nem sequência. |
| Barra até a meta | `scaleX(percent / 100)` | `MacroStat` no Diário, tiles do Hoje | Anima só `transform`. |
| Anel de três arcos | `thirdArcs`, `arcPath` | Consistência na Evolução (`ConsistencyCard`) | Um arco por água, refeição e combinado; dia sem registro é só o trilho neutro. Sem sequência nem marca de falta. |
| Linha do peso | `weightChartModel` (`evolution.ts`) | `WeightTrendChart` na Evolução | Pesagens em pontos vazados, tendência em linha forte, meta tracejada e degraus de dose. Períodos de 1M a Tudo. Sem meta nem doses em perfil calmo. |
| Barras dos dias | `dayBars` (`evolution.ts`) | `DayBarsCard`, 7 ou 28 dias | Cor pelo domínio da série; sem calorias com elas ocultas. Na Evolução, a legenda "média/dia" vira chips de `seriesInsight` (`progress-insights.ts`): % da meta neutra, sem teto e sem cor; o chat mantém a legenda. |
| Rostos e cápsula de sono | `wellbeingTrend` (`wellbeing-trend.ts`) | `WellbeingCard` na Evolução (7 dias) e parte 3 de "Sua semana" | Rosto do último humor do dia (sem vermelho) ou anel tracejado; cápsula de 12 × 44 px cheia até 12 h. Leitura cruzada só descritiva, com 4 dias pareados e aviso de que não há relação de causa. |
| Mapa de humor 28 dias | `wellbeingTrend(...).rows` | `WellbeingCard` com "28 dias" | Grade 4 × 7 como a consistência; rosto de 24 px ou anel tracejado; hoje contornado com `--wf-marker`. Forma e tom, nunca só cor. |
| Stories da semana | `weekRecap`, `slideTitles` (`week-recap.ts`) | `WeekStories` (Hoje às segundas e Evolução) | 5 partes; barra de progresso anima só `transform` e dita o avanço de 6 s; pausa com botão, toque longo, aba oculta e foco de teclado. Sem avanço automático com movimento reduzido. Imagem opcional (`weekShare`) desenhada no aparelho, sem peso, calorias, medicação, humor ou sono. |
| Minitendência | `sparklinePath` | Peso no cartão Corpo, medidas na Evolução, mesmo exame em laudos diferentes | Só com 2 ou mais valores; sem eixo nem cor por valor. |
| Régua de faixas iguais | `bandPosition` | IMC (`bmiGauge`) na anamnese e no Meu espaço; régua da bula na Seringa e dose | Faixas de mesma largura, marcador dentro da faixa ativa. O IMC usa só ardósia, sem cor por faixa; a régua da bula destaca a faixa no tom de medicação e hachura "Acima". |
| Faixa do laudo | `biomarkerScale` (`exam-result.ts`) | `BiomarkerRow` nos exames | Zona impressa em cinza neutro e valor em navy, só com número e referência simples; fora da barra, seta neutra. Sem cor por resultado. |
| Alturas relativas | `relativeHeights` | Doses no "Meu tratamento", cascata basal → gasto → meta do plano inicial | Piso de altura para valores positivos; zero some. |

## Cores

- Macros sempre nas mesmas cores: proteína `--wf-macro-protein` (esmeralda), carboidratos `--wf-macro-carbs` (azul) e gorduras `--wf-macro-fat` (âmbar). Use `MacroStat` para o ponto na cor certa.
- Domínios pelos tons de `domainTone`: água `water`, comida `food`, combinados `habit`, corpo `body`, medicação `medication` e bem-estar `mind`.
- Vermelho nunca significa "passou da meta". Acima do planejado, o gráfico fica neutro ou usa o tom de atenção. A variação entre pesagens usa navy, nunca vermelho nem verde.
- No tema escuro, macros e tons trocam para `darkMacroColor` e `darkDomainTone` pelas mesmas variáveis. Os gráficos usam só `var(--wf-*)` ou `currentColor`, nunca hexadecimal. A seringa e as ilustrações de aplicação desenham com `--wf-art-*` sobre papel claro nos dois temas. Veja [Tokens e tema](tokens-e-tema.md).

## Acessibilidade

- Todo gráfico tem um resumo em texto: `role="img"` com `aria-label`, ou o próprio botão descreve o que mostra. O SVG em si fica `aria-hidden`.
- O resumo diz os números que o desenho mostra: "Água registrada nesta semana: Seg 2,1 L, …; meta de 2 L por dia, atingida em 3 dias".
- Com as calorias ocultas, nenhum resumo menciona kcal. O anel vira "Seu dia" e a rosca mostra só proporções.

## Movimento

- Os arcos crescem com `transition` em `stroke-dasharray`, e as barras em `height` ou `transform`.
- Entradas e celebrações usam as molas `--wf-spring-*`, geradas de `motion.spring`.
- Com `prefers-reduced-motion`, tudo aparece no estado final.
