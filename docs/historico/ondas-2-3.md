# Modernização visual: Ondas 2 e 3 — 26 e 27/09/2026

Continuação do roteiro de auditoria visual. A Onda 1 e o "acabamento" dos itens parciais foram entregues entre 24 e 26/09. Web e app nativo avançaram juntos, com as regras em `src/lib/` compartilhadas pelo alias `@shared`. As migrações novas foram só escritas, o teste pago dos esquemas estritos não foi rodado e não há commit.

## Onda 2

| Lote | Entregue |
| --- | --- |
| 1 · Entrada e anamnese | Primeiro acesso em 3 telas (boas-vindas → "Sobre você" → "Seu primeiro passo"); pílulas da anamnese com opções excludentes no topo e "Ver todas" com busca |
| 2 · Evolução | "Sua jornada" com peso de tendência, gráfico de peso por período com balão, mini gráficos de 7/28 dias, linha de partida da primeira visita |
| 3 · Registrar refeição | Busca com nomes amigáveis, preparos e sinônimos; medidas caseiras; "Seus pratos"; bandeja fixa; rótulo com calorias ocultas |
| 4 · Diário e Hoje | Diário agrupado por refeição, com busca e equação do balanço; semana em anéis; registro rápido em folha |
| 5 · Seringa e GLP-1 | Modos frasco, caneta e dose única; "Sua dose de sempre"; folha de confirmação; próxima dose estimada; "Meu tratamento"; lembrete da aplicação. Migração `0007` |
| 6 · IA estruturada | Blocos do chat, dieta v2, foto do prato como rascunho; guarda dos campos e reserva em texto. Migração `0008` |
| 7 · Despensa e receitas | Despensa com validade em laranja e "Use primeiro"; receitas em cartões com o que há em casa, o que falta comprar e passos |
| Acabamento | Itens parciais da Onda 1: CSS só com tokens, texto mínimo de 12 px, "Editar Hoje", marcadores do bem-estar. Migração `0006` |

## Onda 3

| Lote | Entregue |
| --- | --- |
| 1 · Anamnese | "O que você já contou"; "Cuidados importantes" antes das medidas; IMC neutro e silhueta; caneta com frequência, dia e última aplicação confirmada; linha do dia; "Recomendado para você"; projeção em faixa; revelação do plano. Migração `0011` |
| 2 · Meu espaço | "Seu perfil de saúde" com edição por seção e "Precisa de atenção"; cartão Corpo; exames com resultados transcritos, barra de faixa e perguntas marcáveis; consultas como agenda com `.ics`; ajustes em lista. Migração `0009` |
| 3 · Evolução e Seringa | Pesagens em lista e "Registrar medidas" com o kit da anamnese; consistência em anéis; medidas com silhueta; doses sobre o gráfico de peso; mapa de rodízio com lados e frente/costas; folha "Aplicação registrada". Migração `0010` |
| 4 · Sistema | Tema escuro no web com "Aparência" e guardas de contraste; tema do app nativo preparado e desligado; central de lembretes; grade bento no desktop e atalho **N** |

Guias novos: [testes](../guias/testes.md), [tokens e tema](../guias/tokens-e-tema.md) e [IA estruturada](../guias/ia-estruturada.md).

## Última verificação registrada

Rodada final de 27/09 (depois da divisão do código, da limpeza de CSS e da linha "Aparência" do app):

- `npm run lint`, tipos do app nativo e `npm run check:repo` (774 arquivos) sem problemas.
- `npm test`: 704 aprovados.
- `npm run build` e Playwright completo: 143 de 143.
- Verificação visual clara e escura: `"errors": []`.
- Verificações do app no export web aprovadas (as 21 às 16h; depois, as afetadas por cada mudança).
- A falha isolada de `lembretes.spec.ts` (360 px, 43,99997 px durante a animação de entrada) foi corrigida medindo a caixa de layout (`offsetWidth`/`offsetHeight`).

Não houve teste em aparelho nem APK desta versão.

## Decisões pendentes

1. **Commit:** o repositório ainda não tem commits.
2. **Migrações `0006`–`0011`:** revisar e aplicar com `npm run db:migrate` no banco pretendido (schema `webfit`).
3. **`scripts/strict-schema-smoke.ts`:** 5 chamadas pagas à OpenAI para confirmar os esquemas estritos; só com autorização.
4. **Revisão profissional:** textos de saúde, regras de cautela, exames e medicação por profissional habilitado.
5. **Cores da barra de faixa dos exames:** a zona passou de menta para cinza neutro (slate-300), com ponto navy, para não sugerir "normal"; se o aval clínico preferir menta, é uma linha em `Documents.css` e em `biomarker-row.tsx`.
6. **Tema escuro do app nativo:** ligar segue a lista em `mobile/src/theme/theme.tsx` e exige teste em aparelho.
7. **Contraste do botão principal:** texto branco sobre `--wf-gradient-btn` fica em 3,77:1 no início (`#059669`) e 2,03:1 no fim (`#00d084`), abaixo de 4,5:1.
8. **Alimentos TACO com `NA`:** azeite, óleos e leites seguem fora do catálogo até decisão.
