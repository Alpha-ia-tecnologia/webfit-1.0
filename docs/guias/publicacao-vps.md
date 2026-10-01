# Publicar o WebFit na VPS (modo online, várias contas)

Este guia põe o WebFit no ar com HTTPS, contas por convite e a cópia dos dados de cada pessoa no
PostgreSQL da própria VPS. Os comandos marcados **na VPS** rodam por SSH no servidor; os marcados
**no computador** rodam no Windows, na pasta do projeto.

Como funciona: o contêiner `app` roda o servidor do WebFit só em `127.0.0.1:3000`; o contêiner `caddy`
atende as portas 80 e 443, tira o certificado HTTPS sozinho (Let's Encrypt) e repassa para o app. Os dois
usam a rede do próprio servidor, então o app alcança o PostgreSQL da VPS em `127.0.0.1`.

## 1. Antes de começar

- **Domínio:** crie um registro DNS do tipo **A** para o subdomínio (ex.: `webfit.seudominio.com.br`)
  apontando para o IP da VPS. Confira com `nslookup webfit.seudominio.com.br`.
- **Portas 80 e 443 livres** (na VPS). Se outro programa já usa (nginx, outro Caddy, Traefik), não suba o
  `caddy` deste guia: aponte o proxy que já existe para `127.0.0.1:3000`.

  ```sh
  sudo ss -ltnp | grep -E ':(80|443)\s'
  docker --version && docker compose version
  ```

## 2. Levar o código para a VPS

**No computador** (PowerShell, na pasta do projeto). O pacote leva o código sem `node_modules`, sem o app
nativo e **sem o `.env.local`** (as chaves vão só no arquivo de ambiente da VPS):

```powershell
tar -czf webfit.tgz --exclude=node_modules --exclude=mobile --exclude=dist --exclude=test-results --exclude=.git --exclude=".env.local" .
scp webfit.tgz usuario@IP_DA_VPS:~/
```

**Na VPS:**

```sh
mkdir -p ~/webfit && tar -xzf ~/webfit.tgz -C ~/webfit && cd ~/webfit/deploy
```

## 3. Configurar o ambiente

**Na VPS:**

```sh
cp env.production.example .env.production
chmod 600 .env.production
nano .env.production
cp caddy.env.example caddy.env
nano caddy.env
```

Em `.env.production`, preencha `WEBFIT_PUBLIC_URL`, `DATABASE_URL` (porta em que o banco atende na VPS) e
as chaves de IA (as mesmas do `.env.local` do computador). Em `caddy.env`, só o domínio (`WEBFIT_DOMAIN`):
o Caddy não recebe a senha do banco nem as chaves. `WEBFIT_AI_DAILY_LIMIT` é o número de pedidos ao
agente por conta e por dia; o dono do servidor não tem limite.

## 4. Banco de dados

As migrações `0001`–`0016` (contas inclusas) **já estão aplicadas** no banco `nutri` usado no
desenvolvimento. Se for outro banco, aplique-as com um usuário administrador:

```sh
read -rsp "URL do banco com o usuário administrador (não aparece na tela): " ADMIN_DB_URL; echo
docker compose run --rm -e DATABASE_URL="$ADMIN_DB_URL" app npm run db:migrate
docker compose run --rm -e DATABASE_URL="$ADMIN_DB_URL" app npm run db:seed
unset ADMIN_DB_URL
```

Recomendado: um usuário só para o app, que enxerga apenas o schema `webfit` (`deploy/db-role.sql`).
Com o PostgreSQL em contêiner, troque `NOME_DO_CONTEINER` pelo nome mostrado em `docker ps`:

```sh
docker exec -i NOME_DO_CONTEINER psql -U postgres -d nutri -v senha="'uma-senha-longa'" < db-role.sql
```

e use `webfit_app` com essa senha no `DATABASE_URL`.

## 5. Subir

**Na VPS**, em `~/webfit/deploy`:

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f app     # deve mostrar "WebFit online em https://…"; Ctrl+C para sair
```

Abra o endereço no navegador: deve aparecer a tela "Entre na sua conta".

## 6. Sua conta (dono do servidor)

```sh
docker compose exec app npm run admin -- invite "Eu"
```

Copie o código mostrado, crie a conta em "Criar conta" no site e depois se torne dono (sem limite de IA):

```sh
docker compose exec app npm run admin -- owner seu@email.com
```

## 7. Administração do dia a dia

| Tarefa | Comando (na VPS, em `~/webfit/deploy`) |
| --- | --- |
| Convidar alguém | `docker compose exec app npm run admin -- invite "Maria"` |
| Esqueceu a senha | `docker compose exec app npm run admin -- reset maria@email.com` (mande o código; vale 24 h) |
| Ver contas e uso de IA hoje | `docker compose exec app npm run admin -- list` |
| Bloquear / liberar | `docker compose exec app npm run admin -- disable maria@email.com` / `enable` |
| Ver erros | `docker compose logs --tail=100 app` |

## 8. Backup diário (criptografado)

Os backups têm dados de saúde e as senhas (em hash) de todos: saem do banco direto para o
[age](https://age-encryption.org), que criptografa com uma **chave pública**. A VPS guarda só essa chave
(consegue criptografar, não consegue abrir). A **chave privada** fica com você, fora da VPS.

**8.1 Gerar as chaves — no computador** (uma vez):

```powershell
winget install FiloSottile.age
age-keygen -o webfit-backup-chave-privada.txt
```

O comando mostra a chave pública (`Public key: age1…`). Guarde o arquivo `webfit-backup-chave-privada.txt`
no seu gerenciador de senhas e numa cópia impressa; depois apague-o do computador. **Sem ela, nenhum
backup abre** — nem para você.

**8.2 Configurar — na VPS:**

```sh
sudo apt-get install -y age
mkdir -p ~/.config/webfit
echo 'age1COLE_AQUI_A_CHAVE_PUBLICA' > ~/.config/webfit/backup-recipient.txt
chmod +x ~/webfit/deploy/backup.sh ~/webfit/deploy/restore-check.sh
docker ps --format '{{.Names}}'     # nome do contêiner do PostgreSQL
```

Rode uma vez à mão (troque `NOME_DO_CONTEINER`):

```sh
WEBFIT_BACKUP_CONTAINER=NOME_DO_CONTEINER ~/webfit/deploy/backup.sh
```

**8.3 Cópia fora da VPS (recomendado).** Um backup na mesma máquina do banco some junto com ela. Com o
[rclone](https://rclone.org) configurado para um armazenamento seu (Cloudflare R2, Backblaze B2, Google
Drive…), cada arquivo também sai da VPS — já criptografado, então o destino não precisa ser de confiança:

```sh
sudo apt-get install -y rclone
rclone config                       # crie um destino, ex.: "r2"
rclone mkdir r2:webfit-backups
```

**8.4 Agendar** (`crontab -e`), todo dia às 3h:

```
0 3 * * * WEBFIT_BACKUP_CONTAINER=NOME_DO_CONTEINER WEBFIT_BACKUP_REMOTE=r2:webfit-backups /home/usuario/webfit/deploy/backup.sh >> /home/usuario/webfit-backup.log 2>&1
```

Ficam 14 dias na VPS (`~/webfit-backups`) e 60 no destino externo. Sem `WEBFIT_BACKUP_REMOTE`, só na VPS.
Confira o log de vez em quando: `tail ~/webfit-backup.log` (cada dia deve terminar em `backup ok`).

**8.5 Testar a restauração** — logo depois de configurar e uma vez por mês:

```sh
WEBFIT_BACKUP_CONTAINER=NOME_DO_CONTEINER ~/webfit/deploy/restore-check.sh ~/webfit-backups/webfit-AAAA-MM-DD-HHMM.dump.age
```

Ele pede a chave privada (cole o conteúdo do arquivo do `age-keygen`, Enter, Ctrl+D), abre o backup só na
memória e confere as tabelas, sem mexer no banco. Deve responder `OK: o backup abre com esta chave…`.

**Restaurar de verdade** (perda do banco). Nos dois comandos de restauração, o terminal pede a chave do
mesmo jeito (cole, Enter, Ctrl+D) e o backup é aberto só na memória. Primeiro num banco separado, para
conferir sem mexer no `nutri`:

```sh
C=NOME_DO_CONTEINER
B=~/webfit-backups/webfit-AAAA-MM-DD-HHMM.dump.age
docker exec $C createdb -U postgres webfit_restauracao
age --decrypt -i <(cat) "$B" | docker exec -i $C pg_restore -U postgres -d webfit_restauracao --no-owner --exit-on-error --single-transaction
docker exec $C psql -U postgres -d webfit_restauracao -c "select count(*) as contas from webfit.accounts"
docker exec $C dropdb -U postgres webfit_restauracao
```

Com tudo certo, no banco `nutri` — só o schema `webfit` é apagado e recriado (o `public` não é tocado); com
`--single-transaction`, qualquer erro desfaz tudo e o banco fica como estava:

```sh
cd ~/webfit/deploy && docker compose stop app
age --decrypt -i <(cat) "$B" | docker exec -i $C pg_restore -U postgres -d nutri --clean --if-exists --no-owner --exit-on-error --single-transaction
docker compose start app
```

## 9. Atualizar para uma versão nova

Repita o passo 2 (o pacote não leva o `.env.production`, que continua na VPS) e, na VPS:

```sh
cd ~/webfit/deploy && docker compose up -d --build
```

Se a versão trouxer migração nova, rode o `db:migrate` do passo 4 antes.

## 10. Segurança do banco

Hoje o banco aceita conexões pela internet na porta 5442 **sem SSL** (`sslmode=disable`): a senha e os
dados trafegam sem criptografia. Depois de publicar, o app usa o banco pela própria VPS e a porta pode ser
fechada para fora:

```sh
sudo ufw deny 5442/tcp     # ou a regra equivalente do firewall da sua hospedagem
```

Se ainda precisar acessar o banco do computador (desenvolvimento), use um túnel SSH em vez da porta aberta:
`ssh -L 5442:127.0.0.1:5442 usuario@IP_DA_VPS`. Troque também a senha do usuário administrador do banco.

## App de celular

O APK precisa saber o endereço público. Depois que o site estiver no ar, gere um APK novo com
`EXPO_PUBLIC_API_URL=https://webfit.seudominio.com.br`; ele usa a mesma conta do site.
