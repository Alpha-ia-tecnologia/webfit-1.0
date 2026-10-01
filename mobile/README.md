# WebFit Mobile (Expo / React Native)

Aplicativo nativo do WebFit para Android, iOS e web, construído em paralelo ao app web (`../`) sem descartá-lo.
A **lógica de negócio é compartilhada**: tipos e esquemas zod, regras de metas, calculadora de seringa, questionário
da anamnese, catálogo TACO e silhueta do mapa corporal vêm de `../src` pelo alias `@shared/*`. Este projeto contém apenas
a camada de apresentação em React Native, reproduzindo o design do app web (tokens `--wf-*`, Inter + Plus Jakarta Sans,
cartões, pílulas, barra inferior com botão flutuante e menu rápido).

## Estrutura

```
mobile/
├── app.json                 # nome, slug, esquema webfit://, ícones, plugins (router, splash, sqlite, sharing, image-picker)
├── metro.config.js          # watchFolders + resolveRequest: ../src é observado e resolve pacotes de mobile/node_modules
├── tsconfig.json            # @/* → ./src/*, @shared/* → ../src/*
├── .env.example             # EXPO_PUBLIC_API_URL (servidor Express do app web)
└── src/
    ├── app/                 # rotas do expo-router (somente rotas)
    │   ├── _layout.tsx      # fontes, SafeArea, AppProvider, Stack
    │   ├── (tabs)/          # Hoje, Diário, Agente, Evolução, Meu espaço (+ redireciona para /anamnese sem perfil)
    │   ├── anamnese.tsx, refeicao.tsx, injecao.tsx, notificacoes.tsx
    ├── screens/             # corpo de cada tela (hoje, diario, agente, evolucao, espaco, refeicao, injecao, anamnese, notificacoes)
    ├── components/
    │   ├── ui/              # primitivos: AppText, Button, Card, Pill, ProgressBar, Field, Sheet, Wheel, DateField, TimeField, Toast…
    │   ├── layout/          # AppHeader, Screen, AppTabs (barra com FAB + speed dial)
    │   ├── quick/           # menu rápido e formulário de registro (água, lanche, hábito…)
    │   ├── hoje/            # medidor semicircular, água da semana, faixa de datas, macros
    │   ├── anamnese/        # ChoiceChips, ChoiceCards, Ruler, Stepper, DateWheels, TimePicker, ProgressRing, MilestoneBanner
    │   ├── injecao/         # SyringeFigure/SyringeMini (SVG) e BodyMap (silhueta gerada do app web)
    │   └── brand/           # Logo em SVG
    ├── state/app-context.tsx# estado global, persistência, toasts, navegação de edição, cliente do agente
    ├── lib/                 # storage (expo-sqlite/kv-store), api, confirm, format
    ├── theme/tokens.ts      # cores, gradientes, raios, sombras, fontes, tons de pílulas
    └── polyfills.ts         # crypto.randomUUID via expo-crypto
```

Os dados ficam no aparelho (`expo-sqlite/kv-store`, chave `webfit-personal-v1`), validados pelo mesmo `stateSchema` do
app web. O arquivo exportado em JSON é compatível entre as duas versões. A opção Restaurar backup está disponível no início e em Preferências e dados: valida o arquivo, mostra prévia e pede confirmação antes de substituir os dados. IA e lembretes ficam desativados após a restauração.

## Executar

```bash
cd mobile
npm install
cp .env.example .env          # ajuste EXPO_PUBLIC_API_URL se necessário
npm run android               # ou: npm run ios | npm run web | npx expo start
```

O agente de IA usa o servidor Express do app web (`npm run dev` na raiz, porta 3000, só aceita hosts locais).
No emulador Android encaminhe a porta para que `127.0.0.1:3000` chegue ao computador:

```bash
adb reverse tcp:3000 tcp:3000
```

Em aparelho físico, rode o servidor no modo de rede local e aponte o app para o computador (os dois na mesma rede Wi-Fi):

```bash
npm run dev:lan        # na raiz; o terminal mostra algo como "Rede local: http://192.168.0.10:3000"
```

No app, abra **Meu espaço → Preferências e dados → Servidor do agente** e toque em **Procurar na rede** (o aparelho varre a própria sub-rede atrás da porta 3000) ou digite o endereço e toque em **Testar e salvar**. A busca é automática: sempre que a verificação do servidor falha (na abertura, a cada minuto, ao voltar ao primeiro plano ou ao trocar de rede), o app tenta os endereços que já responderam e o nome do computador (`<nome>.local`) e só então varre a sub-rede, no máximo uma vez a cada 90 s e apenas em Wi-Fi ou cabo. O IP do computador muda com o DHCP; se preferir um endereço fixo, reserve-o no roteador. No terminal do servidor aparece "Cliente da rede conectado: <IP>" quando o celular chega. O endereço fica guardado no aparelho e vale para o agente e para a análise de fotos. Se o Windows perguntar, permita o Node.js em redes privadas. O acesso continua protegido pelo token de sessão; use o modo de rede apenas em redes confiáveis. O build Android libera tráfego HTTP (`usesCleartextTraffic` via `expo-build-properties`) porque o servidor local não usa TLS.

## Verificações

```bash
node node_modules/typescript/bin/tsc --noEmit        # tipos (inclui ../src via @shared)
node node_modules/expo/bin/cli export --platform android   # bundle Hermes
node node_modules/expo/bin/cli export --platform web       # site estático
.\scripts\build-android.ps1 -Task assembleRelease          # APK instalável (PowerShell, ver abaixo)
```

> O caminho do projeto contém `&`; por isso os comandos chamam os binários por `node node_modules/...` em vez de `npx`.

Paridade visual com o app web (usa o Chrome instalado e o Playwright da raiz; o servidor web precisa estar rodando em `127.0.0.1:3000`):

```bash
node scripts/anamnese-parity.mjs web http://127.0.0.1:3000/ ../dist/parity/web
node node_modules/expo/bin/cli export --platform web --output-dir dist/web
node scripts/anamnese-parity.mjs rn dist/web ../dist/parity/rn
```

O roteiro preenche a etapa 1, avança para a etapa 2 e grava capturas do topo e da régua (`*-1-top.png`, `*-2-top.png`, `*-2-ruler-*.png`) nas duas versões, além de imprimir os valores lidos da régua (vazia, 71,0 após o ajuste fino e 73,0 após rolar 120 px).

## Lembretes e voz

- **Lembretes** viram notificações locais (`expo-notifications`, `src/lib/reminders.ts`), planejadas pela regra compartilhada `../src/lib/reminder-plan.ts`: refeições 30 min após os horários informados, no máximo três lembretes de água por dia, hábitos no horário cadastrado e um convite opcional para medidas quando não houver medição nos últimos sete dias. São até 60 avisos pontuais nos próximos sete dias, renovados ao abrir o app. Registros de refeições, meta de água atingida, hábitos concluídos e medidas recentes removem os avisos correspondentes; silêncio e permissões são respeitados. Tocar na notificação abre a tela correspondente. No web, os avisos permanecem na tela Lembretes.
- **Confirmações e alertas**: novos registros mostram uma confirmação discreta, sem interromper a rotina. Lembretes que vencem com o app aberto e notificações recebidas em primeiro plano ainda podem apresentar um aviso com acesso à tela correspondente.
- **Dieta após a anamnese**: com servidor conectado e autorização de IA, salvar as respostas abre Minha dieta e inicia a geração de refeições, porções sugeridas e substituições pelo agente. A dieta fica salva no aparelho e na conversa, com acesso por Hoje e Agente. Há cancelamento durante a geração, fase final de salvamento e nova tentativa; alterações na anamnese mantêm o plano anterior visível, marcado como "Versão anterior", sob a faixa "Seu plano precisa ser atualizado" com o botão "Atualizar dieta". Sem conexão ou autorização, a pessoa pode entrar e gerar depois. Tipos e assinatura do perfil são compartilhados em `../src/lib/diet.ts`.
- **Ditado** no agente com `expo-speech-recognition` (reconhecedor do sistema, pt-BR). O botão de microfone só aparece quando o aparelho oferece reconhecimento de fala.
- Os dois módulos exigem um **build de desenvolvimento** (`npm run android` gera o projeto nativo e instala no aparelho); no Expo Go o ditado não está disponível.

## Build nativo no Windows

O caminho deste repositório contém `&` e acentos, que quebram o Gradle (o `cmd` corta em `&` e o codegen mistura raízes). Junções e unidades `subst` **não** resolvem: o autolinking do Expo usa `realpath` e volta ao caminho real. O que funciona é compilar a partir de uma **cópia em caminho simples**, o que o script abaixo automatiza (espelha `mobile/` e `src/` com `robocopy`, roda o `prebuild` e o Gradle):

```powershell
cd mobile
.\scripts\build-android.ps1 -Task assembleRelease   # APK instalável, JS embutido → mobile\dist\WebFit-0.1.0-release.apk
.\scripts\build-android.ps1                         # APK de depuração (exige o Metro rodando no computador)
```

Para instalar, copie o arquivo de `mobile\dist` para o aparelho e abra-o (permita "fontes desconhecidas"), ou use o `adb`:

```powershell
adb install -r mobile\dist\WebFit-0.1.0-release.apk
adb reverse tcp:3000 tcp:3000      # só para o agente de IA alcançar o servidor local pelo cabo USB
```

O endereço padrão da API vem do build (`EXPO_PUBLIC_API_URL` em `mobile/.env`; sem esse arquivo, `127.0.0.1:3000`, que só funciona com `adb reverse`). No aparelho ele pode ser trocado a qualquer momento em **Meu espaço → Preferências e dados → Servidor do agente**, apontando para o computador com `npm run dev:lan`. Todo o resto (diário, metas, seringa, lembretes, ditado) funciona sem servidor.

O script também eleva o heap do Gradle para 4 GB no `gradle.properties` gerado e para os daemons antigos antes de compilar: com os 2 GB do template, a mesclagem dos dex do release pode falhar com `D8: OutOfMemoryError: Java heap space` quando há pouca memória livre.

Verificado em 2026-09-13: `BUILD SUCCESSFUL` nas duas variantes (~10 min cada; o `prebuild` recria `android/` a cada execução, então toda compilação é completa). O APK de release tem 121 MB (arm64-v8a, armeabi-v7a, x86 e x86_64), pacote `com.webfit.app` 0.1.0, bundle Hermes embutido, permissões de microfone, câmera e notificações. Ele é assinado com o keystore de depuração padrão do Android: serve para instalar e testar, não para publicar na Play Store (antes disso, gere um keystore próprio ou use o EAS Build). A solução definitiva para o caminho é mover o repositório para uma pasta sem `&` nem acentos; aí `npm run android` funciona direto.

A pasta `android/` é gerada (está no `.gitignore`); ajustes nativos devem ir para `app.json` e plugins, não para os arquivos gerados.

## Diferenças em relação ao app web

A tela **Despensa e receitas**, acessível por Hoje e Minha dieta, permite cadastrar alimentos, fotografar a despensa/geladeira ou a lista de **compras já realizadas**, revisar todos os itens antes de salvar e pedir receitas com a dieta atual. Câmera e galeria usam o seletor nativo já disponível no app. As regras de estoque, validade e atualização das receitas são compartilhadas em `../src/lib/pantry.ts`.

- A entrada por voz usa o reconhecedor do sistema em vez da Web Speech API.
- Datas e horários usam rodas (Wheel) em folhas inferiores no lugar dos `input type="date|time"`.
- Exames e fotos são escolhidos com `expo-document-picker` / `expo-image-picker` e compartilhados com `expo-sharing`.
- Lembretes são notificações locais agendadas; push remoto (servidor) fica para a fase 4 do plano.

## Exames ao final da anamnese

Na última etapa, **Revisão**, o cartão **Exames para análise da IA (opcional)** permite selecionar um laudo PDF/JPG/PNG/WebP, informar nome, data e observações e tocar em **Salvar anexo**. Limites: 5 MB por arquivo e 30 exames. O arquivo permanece no aparelho mesmo sem IA e pode ser consultado em Meu espaço → Exames e consultas.

Com IA autorizada e servidor conectado, marque **Analisar [exame] ao concluir**. A tela Minha dieta mostra o andamento de cada exame; as transcrições revisadas entram no contexto da dieta, sem reenviar os arquivos ao agente de alimentação. Há cancelamento e nova tentativa. Uma falha preserva os anexos, as análises já concluídas e a dieta anterior. Ao reabrir a anamnese, marque novamente os exames que deseja enviar. Salve ou descarte uma seleção de arquivo antes de concluir a anamnese.

Verificação da jornada Expo com SQLite real e IA simulada (da raiz, após exportar o app web em mobile/dist/web):

```sh
node --import tsx mobile/scripts/exams-check.mjs mobile/dist/web
```

O teste usa um contexto isolado de navegador, sem alterar os dados do aplicativo em uso, e cobre anexos, recarga, sequência exame → dieta, persistência, falha e cancelamento.
