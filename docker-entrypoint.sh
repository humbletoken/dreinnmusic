#!/bin/sh
# =============================================================================
#  Dreinn Music - entrypoint
#  Готовит каталог базы на volume и сбрасывает привилегии до пользователя node.
#  Нужен потому, что docker-том или bind-mount может принадлежать root:
#  тогда процесс под node не смог бы создать /data/dreinn.db (SQLITE_CANTOPEN).
# =============================================================================
set -e

DB_PATH="${DB_PATH:-/data/dreinn.db}"
DB_DIR=$(dirname "$DB_PATH")

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DB_DIR"
  # том мог быть создан ранее (или примонтирован с хоста) от имени root
  chown -R node:node "$DB_DIR" 2>/dev/null || true
  exec gosu node "$@"
fi

# контейнер уже запущен не от root (например, docker run --user ...)
mkdir -p "$DB_DIR" 2>/dev/null || true
exec "$@"
