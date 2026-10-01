#!/usr/bin/env bash
# Confere se um backup criptografado abre e traz as tabelas do WebFit, SEM mexer no banco.
#
#   ./restore-check.sh ~/webfit-backups/webfit-AAAA-MM-DD-HHMM.dump.age
#
# Pede a chave privada: cole o conteúdo do arquivo gerado pelo age-keygen (inteiro ou só a linha
# AGE-SECRET-KEY-…), tecle Enter e depois Ctrl+D. A chave fica só na memória deste comando; nada é gravado
# na VPS. Use WEBFIT_BACKUP_CONTAINER como no backup.sh.
# Faça isto logo depois de configurar o backup e de vez em quando (ex.: uma vez por mês).
set -euo pipefail

FILE="${1:-}"
CONTAINER="${WEBFIT_BACKUP_CONTAINER:-}"
[ -s "$FILE" ] || { echo "Uso: $0 caminho/do/backup.dump.age" >&2; exit 2; }
command -v age >/dev/null || { echo "age não instalado (sudo apt-get install -y age)" >&2; exit 1; }

echo "Cole a chave privada (o arquivo do age-keygen ou a linha AGE-SECRET-KEY-…), Enter e depois Ctrl+D:" >&2
# O arquivo do age-keygen tem comentários (# created, # public key) antes da chave: só a linha da chave conta.
KEY="$(grep -m1 '^AGE-SECRET-KEY-' || true)"
[ -n "$KEY" ] || { echo "Não encontrei uma linha AGE-SECRET-KEY-… no que foi colado." >&2; exit 1; }

list() {
  if [ -n "$CONTAINER" ]; then docker exec -i "$CONTAINER" pg_restore --list; else pg_restore --list; fi
}

# O pg_restore --list para de ler ao terminar o índice; o resto do arquivo é descartado aqui, para o age não
# morrer com "pipe fechado" (o pipefail tomaria isso por falha). Chave errada ou arquivo corrompido fazem o
# age falhar, e o teste reprova.
if ! LISTING="$(age --decrypt --identity <(printf '%s\n' "$KEY") "$FILE" | { list; status=$?; cat >/dev/null; exit "$status"; })"; then
  unset KEY
  echo "FALHOU: o backup não abriu com esta chave (ou o arquivo está corrompido)." >&2
  exit 1
fi
unset KEY
TABLES="$(printf '%s\n' "$LISTING" | grep -c 'TABLE DATA webfit' || true)"
if [ "${TABLES:-0}" -lt 10 ]; then
  echo "FALHOU: o backup abriu, mas só tem ${TABLES:-0} tabela(s) com dados do webfit." >&2
  exit 1
fi
echo "OK: o backup abre com esta chave e traz $TABLES tabelas com dados do webfit."
