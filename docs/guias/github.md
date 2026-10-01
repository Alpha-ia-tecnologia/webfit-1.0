# Publicar o código no GitHub

Execute os comandos na raiz do WebFit. Use um único repositório chamado, por exemplo, `webfit`. Ao clonar no Windows, prefira um caminho simples, como `D:\projetos\webfit`, para facilitar a compilação nativa Android.

## O que deve entrar

Versione `src/`, `server/`, `mobile/` (código, assets, scripts e configurações), `tests/`, `scripts/`, `data-sources/`, `docs/`, `.github/`, os dois manifests e lockfiles, modelos `.env.example` e configurações da raiz.

Não envie dependências, builds, APKs, credenciais, bancos locais, logs ou exportações pessoais. O `.gitignore` cobre essas categorias. Ignorar um arquivo não o remove de commits existentes; confira também o conteúdo de tudo que for adicionado.

## Primeiro envio

O repositório local foi preparado na raiz, na branch `main`, sem commit e sem remoto. Em uma cópia sem `.git`, execute primeiro `git init -b main`.

1. Crie no GitHub um repositório vazio, sem README, licença ou `.gitignore` gerados pelo site. Escolha a visibilidade de acordo com o acesso desejado ao código.
2. Rode as verificações:

```sh
npm run check:repo
npm run lint
npm test
npm run build
npm --prefix mobile run typecheck
npm --prefix mobile run export:android
```

3. Prepare e revise os arquivos:

```sh
git add .
git diff --cached --stat
git diff --cached --name-only
git diff --cached
npm run check:repo
```

4. Após revisar, substitua `SEU_USUARIO` pela conta ou organização de destino:

```sh
git commit -m "Organiza estrutura inicial do WebFit"
git remote add origin https://github.com/SEU_USUARIO/webfit.git
git push -u origin main
```

Se já houver um remoto, confira `git remote -v` e use o destino correto antes do envio. A autenticação do GitHub deve ocorrer pelo gerenciador de credenciais; não coloque tokens na URL.

## Proteções e verificações

`npm run check:repo` inspeciona os arquivos da cópia de trabalho: rastreados e novos que não estão ignorados. Para revisar o conteúdo exato preparado para commit, use também `git diff --cached`. Ele bloqueia nomes de arquivos sensíveis/gerados, arquivos de 100 MiB ou mais, repositórios aninhados e alguns padrões conhecidos de credenciais, sem imprimir os valores encontrados. É uma verificação auxiliar, não uma garantia de ausência de segredos: revise o conteúdo antes do commit. Arquivos já rastreados continuam sendo examinados mesmo quando constam no `.gitignore`.

O workflow `.github/workflows/ci.yml` instala os lockfiles, verifica o repositório, roda TypeScript, testes unitários, build web, jornadas do navegador (Playwright com Chrome e IA simulada), tipos mobile e export Android. Não publica o sistema e não depende de chaves de IA ou de banco. Banco, verificação visual, verificações do app nativo e compilação de APK são separados; veja [testes e verificações](testes.md).

## Git anterior do mobile

Havia um Git independente em `mobile/.git`, sem commits, com o índice do template Expo. Seus metadados foram preservados em `.local/git-backups/mobile.git`, ignorado pelo novo repositório. Os arquivos de trabalho do mobile foram mantidos. Essa cópia é apenas local e não será enviada ao GitHub.

Depois da organização, `mobile/` é uma pasta normal do repositório principal, não um submódulo. Não execute um novo `git init` dentro dela.
