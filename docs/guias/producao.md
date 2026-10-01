# Produção

## Estado atual

O projeto pode gerar e executar um build local, mas ainda não está preparado para oferecer acesso público com contas de usuários. Esta organização de pastas prepara o versionamento no GitHub; não implementa hospedagem ou login.

Evidências no código atual:

- `server/index.ts` aceita apenas hosts locais e, opcionalmente, IPs da rede local. O token de sessão do processo não representa autenticação individual.
- O web salva os registros em IndexedDB; o mobile usa armazenamento local. Não existe sincronização de dados entre aparelhos.
- `server/db/migrations/` e os comandos de banco preparam PostgreSQL; não conectam automaticamente as telas a uma API autenticada de dados.
- O build Android descrito no guia mobile usa assinatura de depuração. Publicação em loja exige configuração de assinatura própria.

## Executar o build local

Na raiz:

```sh
npm ci
npm run lint
npm test
npm run build
npm start
```

Configure `.env.local` a partir de `.env.example`, ou injete as mesmas variáveis no ambiente do processo. A aplicação escuta em `127.0.0.1:3000` por padrão; `PORT` altera a porta. Para uso na rede interna, o comando existente é `npm run start:lan`.

O processo depende de `server/`, `src/`, `dist/`, `package.json`, `package-lock.json` e das dependências instaladas. Hoje o servidor executa TypeScript com `tsx` e importa Vite; por isso, `npm ci --omit=dev` não é compatível com o comando de inicialização atual.

GitHub armazena o código. GitHub Pages serve arquivos estáticos e não executa esta API Node.js. Subir apenas a pasta `dist/` não disponibiliza as funções de IA do sistema.

## Trabalho necessário antes de acesso público

1. Definir hospedagem Node.js, domínio e HTTPS; adaptar a validação de hosts/origens e a interface de escuta do servidor para esse ambiente.
2. Implementar autenticação, autorização por usuário e limites de consumo da API. O token local atual não substitui essas funções.
3. Implementar a camada autenticada de persistência/sincronização, se os dados precisarem estar disponíveis em vários aparelhos, e definir backups e restauração.
4. Configurar credenciais no ambiente da hospedagem; nunca colocar chaves em `src/` ou em variáveis `EXPO_PUBLIC_*`, que são públicas no aplicativo.
5. Configurar a URL HTTPS da API no mobile e a assinatura de distribuição para a plataforma de destino.
6. Validar jornadas completas, separação de dados entre usuários, restauração, falhas dos provedores e atualização dos aplicativos no ambiente escolhido.

As migrações e o seed são ações explícitas: `npm run db:migrate` e `npm run db:seed`. Execute somente com `DATABASE_URL` apontando para o banco pretendido. Esta organização não executa migrações nem modifica bancos existentes.
