#!/usr/bin/env bash
# Backup diário do schema webfit (contas e cópias de saúde dos usuários), CRIPTOGRAFADO com age.
#
# - O dump sai do PostgreSQL direto para o age: nenhum arquivo em texto claro toca o disco.
# - A VPS guarda só a CHAVE PÚBLICA (consegue criptografar, não consegue abrir). A chave privada fica
#   com o dono do servidor, fora da VPS (gerenciador de senhas + cópia em papel). Sem ela, nada abre.
# - Com WEBFIT_BACKUP_REMOTE (um destino do rclone), cada arquivo também sai da VPS.
# - Guarda 14 dias na VPS e 60 no destino externo.
#
# Agende no cron da VPS (crontab -e), por exemplo às 3h:
#   0 3 * * * /home/usuario/webfit/deploy/backup.sh >> /home/usuario/webfit-backup.log 2>&1
#
# Variáveis (todas opcionais, com padrão):
#   WEBFIT_BACKUP_RECIPIENT  arquivo com a chave pública age   (~/.config/webfit/backup-recipient.txt)
#   WEBFIT_BACKUP_DIR        pasta dos backups na VPS           (~/webfit-backups; o cron roda sem root)
#   WEBFIT_BACKUP_CONTAINER  contêiner do PostgreSQL (usa o pg_dump de dentro dele; recomendado)
#   WEBFIT_BACKUP_DB / _USER / _PORT                            (nutri / postgres / 5442, sem contêiner)
#   WEBFIT_BACKUP_REMOTE     destino rclone, ex.: r2:webfit-backups   (vazio: só na VPS)
#   PGPASSWORD ou ~/.pgpass  senha do usuário do banco (sem contêiner)
set -euo pipefail
umask 077

RECIPIENT="${WEBFIT_BACKUP_RECIPIENT:-$HOME/.config/webfit/backup-recipient.txt}"
DEST="${WEBFIT_BACKUP_DIR:-$HOME/webfit-backups}"
DB="${WEBFIT_BACKUP_DB:-nutri}"
DB_USER="${WEBFIT_BACKUP_USER:-postgres}"
DB_PORT="${WEBFIT_BACKUP_PORT:-5442}"
CONTAINER="${WEBFIT_BACKUP_CONTAINER:-}"
REMOTE="${WEBFIT_BACKUP_REMOTE:-}"
KEEP_DAYS=14
REMOTE_KEEP_DAYS=60

fail() {
  echo "$(date -Iseconds) BACKUP FALHOU: $*" >&2
  exit 1
}
# Qualquer outro erro (ex.: pg_dump sem acesso ao banco) também deixa uma linha no log do cron.
trap 'echo "$(date -Iseconds) BACKUP FALHOU na linha $LINENO (veja a mensagem acima)" >&2' ERR
command -v age >/dev/null || fail "age não instalado (sudo apt-get install -y age)"
[ -s "$RECIPIENT" ] || fail "chave pública ausente em $RECIPIENT (veja docs/guias/publicacao-vps.md, passo 8)"
grep -q '^age1' "$RECIPIENT" || fail "$RECIPIENT não parece uma chave pública age (começa com age1…)"

mkdir -p "$DEST"
chmod 700 "$DEST"
FILE="$DEST/webfit-$(date +%Y-%m-%d-%H%M).dump.age"
PARTIAL="$FILE.partial"
trap 'rm -f "$PARTIAL"' EXIT

dump() {
  if [ -n "$CONTAINER" ]; then
    docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB" --schema=webfit --format=custom
  else
    pg_dump -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB" --schema=webfit --format=custom
  fi
}

# pipefail: se o pg_dump falhar no meio, o arquivo parcial é descartado e o cron registra a falha.
dump | age --encrypt --recipients-file "$RECIPIENT" --output "$PARTIAL"
[ -s "$PARTIAL" ] || fail "o arquivo criptografado ficou vazio"
mv "$PARTIAL" "$FILE"
chmod 600 "$FILE"
find "$DEST" -name 'webfit-*.dump.age' -mtime +"$KEEP_DAYS" -delete
# Backups antigos sem criptografia (versão anterior deste script) não ficam esquecidos na VPS.
find "$DEST" -name 'webfit-*.dump' -delete

if [ -n "$REMOTE" ]; then
  command -v rclone >/dev/null || fail "WEBFIT_BACKUP_REMOTE definido, mas o rclone não está instalado"
  rclone copy "$FILE" "$REMOTE" || fail "não foi possível copiar para $REMOTE (o backup local ficou em $FILE)"
  rclone delete "$REMOTE" --min-age "${REMOTE_KEEP_DAYS}d" --include 'webfit-*.dump.age' || true
fi
echo "$(date -Iseconds) backup ok: $FILE${REMOTE:+ (+ cópia em $REMOTE)}"
