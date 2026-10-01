# Tokens visuais e tema escuro

O padrão visual do web e do app nativo sai de um único arquivo, [`src/design/tokens.ts`](../../src/design/tokens.ts). O web usa as variáveis `--wf-*` de `src/styles/tokens.css`, gerado a partir dele por [`scripts/build-tokens.ts`](../../scripts/build-tokens.ts). O app nativo recebe os mesmos valores por `@shared/design/tokens`, em `mobile/src/theme/tokens.ts`. Nenhuma tela declara cor, tamanho de fonte ou espaçamento próprio.

## Camadas

| Camada | Claro | Escuro | No CSS |
| --- | --- | --- | --- |
| Paleta | `palette` | `darkPalette`, só o que muda | `--wf-<nome>` (`--wf-sky-600`, `--wf-slate-550`) |
| Papéis semânticos | `semantic` | `darkSemantic`, todas as chaves | `--wf-bg`, `--wf-surface`, `--wf-surface-2`, `--wf-text`, `--wf-text-muted`… |
| Tons por domínio | `domainTone` | `darkDomainTone` | `--wf-tone-<domínio>-fg`, `-bg`, `-border` |
| Macronutrientes | `macroColor` | `darkMacroColor` | `--wf-macro-protein`, `-carbs`, `-fat` |
| Sombras | `shadows` | `darkShadows` | `--wf-shadow-card`, `--wf-shadow-float` |
| Papéis da varredura | `roles` | `darkRoles`, só o que muda | `--wf-surface-glass*`, `--wf-accent-fill*`, `--wf-inverse`, `--wf-marker`, `--wf-on-fill-*`, `--wf-art-*` |
| Escalas e movimento | `fontSize`, `space`, `radius`, `motion` | iguais | `--wf-fs-*` (rem), `--wf-space-*`, `--wf-radius-*`, `--wf-spring-*`, `--wf-ease` |

Gradientes (`--wf-gradient`, `-btn`, `-fab`, `-user`), branco, navy, esmeralda, azul, `green-500`/`green-600` e `rose-600` são iguais nos dois temas.

Regras de cor:

- `danger` (vermelho) só para erro e ação destrutiva. Acima do planejado usa `neutral` ou `attention` (âmbar); validade usa `warn` (laranja).
- `textFaint` é decorativo. Texto informativo usa no mínimo `textMuted` (AA 4,5:1).
- Cores com dois papéis (branco, verdes escuros, navy) passam pelos papéis da varredura, que no claro têm exatamente o valor anterior.

## Acrescentar um token ou papel

1. **Cor da paleta:** acrescente em `palette`. Se for tinta clara (50–300) ou tom escuro usado como texto, acrescente o par em `darkPalette`. Constantes da marca não entram em `darkPalette`; o teste recusa.
2. **Papel semântico:** acrescente em `semantic` e em `darkSemantic`. O `satisfies` exige as mesmas chaves.
3. **Papel da varredura:** acrescente em `roles` com o valor claro atual e, se mudar no escuro, em `darkRoles`. O teste que fixa os valores claros literais de `roles` precisa ser atualizado junto.
4. **Tom de domínio:** `Domain`, `domainTone` e `darkDomainTone`.
5. **Gerar o CSS:** `node --import tsx scripts/build-tokens.ts`. Não edite `src/styles/tokens.css` à mão.
6. **Verificar:** `npm test`. O teste compara o arquivo com o gerado e mede o contraste nos dois temas.
7. **App nativo:** valores fixos só em `mobile/src/theme/tokens.ts`. Uma chave nova de `colors` recebe o valor escuro por `SEMANTIC_OF`, `DARK_ONLY` ou pela paleta escura; sem mapeamento, fica igual ao claro. As telas leem as cores por `useThemeColors()` ou `makeStyles`.

## Tema escuro no web

- `tokens.css` tem o `:root` claro e os mesmos valores escuros duas vezes: em `@media (prefers-color-scheme: dark)` com `:root:not([data-theme="light"])` (segue o sistema) e em `:root[data-theme="dark"]` (escolha explícita).
- A escolha fica em **Meu espaço → Preferências e dados → Aparência**: Sistema, Claro ou Escuro. Regras puras em [`src/lib/theme.ts`](../../src/lib/theme.ts); aplicação no DOM em [`src/lib/theme-dom.ts`](../../src/lib/theme-dom.ts).
- A preferência é do aparelho (`localStorage`, chave `webfit-theme`). Não entra no estado, no backup nem em "Excluir dados". Outras abas acompanham a troca pelo evento `storage`.
- `initTheme()` roda em `src/main.tsx` antes do React. "Sistema" não grava `data-theme`. A CSP não permite script embutido no `index.html`, então uma escolha explícita pode piscar por um quadro.
- As metas `color-scheme` e `theme-color` acompanham o tema (`browserThemeColor`).

## Guardas automáticas

[`tests/tokens.test.ts`](../../tests/tokens.test.ts):

- `tokens.css` idêntico ao gerado.
- CSS de `src/` sem hexadecimal fora de `tokens.css`, `font-size` só por `var(--wf-fs-*)` (mínimo de 12 px) e sem `color: var(--wf-text-faint)`.
- `prefers-color-scheme` e `data-theme` só em `tokens.css`.
- Contraste: texto 4,5:1, marcas gráficas 3:1 e tinta da seringa sobre o papel 7:1. As falhas antigas do claro estão em `LIGHT_KNOWN_FAILURES`, uma lista que só pode encolher; o escuro não pode ter nenhuma falha.
- Mesmos nomes e ordem de tokens nos dois temas. Escalas, gradientes e constantes da marca não mudam.

[`tests/theme-css.test.ts`](../../tests/theme-css.test.ts) (varredura do escuro):

1. Nenhum `background: white`.
2. `green-700`, `green-800` e `navy` como fundo passam por `--wf-accent-fill`, `--wf-inverse` ou `--wf-marker` (exceto `.theme-swatch`).
3. Texto não usa `green-600`, `rose-600`, `sky-600`, `violet-600`, `indigo-500` nem `slate-500`: use `--wf-accent-text-soft`, `--wf-tone-danger-fg` ou `--wf-tone-water-fg`.
4. Fundos e bordas sem tinta clara literal em `rgb()`; só branco translúcido até 0,22 sobre cor.
5. `background: var(--wf-white)` apenas em `.next-step-cta`, `.switch::after` e `.mse-grip`.
6. Seringa e ilustrações de aplicação desenham com `--wf-art-*`.

[`tests/mobile-style.test.ts`](../../tests/mobile-style.test.ts): app nativo sem hexadecimal fora de `theme/tokens.ts` e tamanhos de texto na escala `fontSize`.

## Tema escuro no app nativo

Está preparado e **desligado**. O `ThemeProvider`, `useThemeColors`, `makeStyles`, as cores escuras e a folha "Aparência" existem. Enquanto `RN_DARK_MODE_ENABLED = false` em [`mobile/src/theme/theme.tsx`](../../mobile/src/theme/theme.tsx), o app fica claro, a linha "Aparência" não aparece no Meu espaço, o fundo nativo da janela não muda e o `mobile/app.json` mantém `"userInterfaceStyle": "light"`.

[`tests/mobile-theme.test.ts`](../../tests/mobile-theme.test.ts) é a catraca da migração:

- Todo `mobile/src`, menos `theme/`, precisa ler as cores do tema. São pendências: importar `colors`, `tones`, `pillTones`, `palette`, `semantic`, `domainTone`, `macroColor` ou `roles` estáticos; `StyleSheet.create` no nível do módulo (use `makeStyles`); e `rgba()`.
- Hoje não há pendências; um arquivo migrado que voltar a usar cor estática quebra o teste.
- Ligar a chave exige zero pendências e `"userInterfaceStyle": "automatic"`; desligada, exige `"light"`.

Para ligar, a lista `TODO(HOJE-X2)` acima de `RN_DARK_MODE_ENABLED`, em `mobile/src/theme/theme.tsx`, é a referência:

1. `RN_DARK_MODE_ENABLED = true`.
2. No `mobile/app.json`, `"userInterfaceStyle": "automatic"`. A catraca exige os dois juntos.
3. Fundo nativo da janela: com a chave ligada, o provedor chama `SystemUI.setBackgroundColorAsync` (`expo-system-ui`, já nas dependências do mobile).
4. Verificar: tipos do mobile, `npm test` na raiz e as verificações do [guia de testes](testes.md#app-nativo). O `o3l4d-check.mjs` hoje confere que o app continua claro com o sistema escuro e precisa acompanhar a mudança.
5. Testar em aparelho: modo do sistema, as três opções de "Aparência", fechar e reabrir o app. A abertura (`expo-splash-screen`) segue clara; um bloco `dark` no plugin evita o clarão.
