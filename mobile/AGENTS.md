# WebFit Mobile — guia para agentes

Projeto Expo SDK 57 (expo-router, React Native 0.86, React 19) que reutiliza a lógica do app web em `../src`.
Leia a documentação versionada em https://docs.expo.dev/versions/v57.0.0/ antes de usar APIs do Expo.

## Regras

- **Nunca duplique lógica de negócio.** Tipos, esquemas zod, regras de metas (`GOAL_RULES`), calculadora de seringa,
  questionário e opções da anamnese vivem em `../src` e são importados por `@shared/*`. Alterações de regra são feitas
  lá, com os testes do projeto web (`npm test` na raiz).
- Arquivos em `../src` importados daqui devem continuar **sem DOM** (nada de `window`, `document`, CSS). Componentes
  React do web (`../src/components/*.tsx`) não são importados; só `.ts` e o `bodySilhouette.ts` gerado.
- Cores, fontes e sombras vêm de `src/theme/tokens.ts`. Não use valores fixos nas telas.
- Telas em `src/screens`, rotas finas em `src/app`, primitivos em `src/components/ui`. Nomes de arquivo em kebab-case.
- Sombras usam `boxShadow` (string), nova arquitetura habilitada; `reactCompiler` está desligado em `app.json`.
- O caminho do repositório contém `&`: use `node node_modules/<pacote>/bin/...` em vez de `npx`.
- O servidor do agente (Express em `../server`) aceita só hosts locais; com `npm run dev:lan` aceita também o IP do computador na rede. No emulador use `adb reverse tcp:3000 tcp:3000`; em aparelho físico o endereço é configurado em Meu espaço → Preferências → Servidor do agente (`src/lib/api.ts` guarda em `expo-sqlite/kv-store`). O build Android libera HTTP (`usesCleartextTraffic`) via `expo-build-properties`.
- Segredos ficam no `.env.local` da raiz (servidor). Este app só lê `EXPO_PUBLIC_API_URL`.

- Paridade visual com o web: a anamnese segue o layout do web em largura de celular (sem hero: a barra de etapa `step-bar.tsx` é o único cabeçalho e o único voltar; cartão branco com barra fixa via `stickyHeaderIndices`, rodapé fixo, chips em coluna única até 480 dp). Antes de concluir mudanças de tela, compare com `scripts/anamnese-parity.mjs` (web × export web do app) e rode `scripts/anamnese-check.mjs` no export web.
- Régua (`src/components/anamnese/ruler.tsx`): o recuo lateral é metade da largura medida em `onLayout` e o traço fica na borda esquerda do slot de 12 px, como o `.tick` do web; rolagens programáticas são ignoradas por 150 ms para a régua vazia não se preencher sozinha. Não use `numberOfLines` em rótulos posicionados em absoluto: no export web o texto fica limitado a 100% do pai.
- Lembretes locais: `src/lib/reminders.ts` (planReminders é pura; syncReminders reprograma tudo a partir da assinatura do perfil e hábitos). Ditado: `src/components/agente/voice-button.tsx`.
- Build nativo no Windows: use scripts/build-android.ps1 (espelha mobile/ e src/ em D:\wf-build e compila lá; `-Task assembleRelease` gera o APK instalável em mobile/dist). Junção e subst não funcionam: o autolinking usa realpath e o cmd corta o caminho em &. Ferramentas .bat do SDK (apksigner) também quebram com o caminho real: aponte-as para a cópia em D:\wf-build. android/ é gerado pelo prebuild e ignorado.

## Verificar antes de concluir

```bash
node node_modules/typescript/bin/tsc --noEmit
node node_modules/expo/bin/cli export --platform android
```
