#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/1panel/docker/compose/KACON-ERP}"
SERVER_IP="${SERVER_IP:-192.168.1.251}"
PUBLIC_URL="${PUBLIC_URL:-https://erp.kacon.ai}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-1Panel-mysql-eFiU}"
OLD_COMPOSE="${OLD_COMPOSE:-/opt/erp-deploy/docker-compose.yml}"

cd "$PROJECT_DIR"

container_env_value() {
  local key="$1"
  docker inspect "$MYSQL_CONTAINER" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | sed -n "s/^${key}=//p" \
    | head -n 1
}

old_compose_value() {
  local key="$1"
  if [[ ! -f "$OLD_COMPOSE" ]]; then
    return 0
  fi
  sed -n "s/^[[:space:]]*- ${key}=//p" "$OLD_COMPOSE" | head -n 1
}

if [[ ! -f .env ]]; then
  db_password="$(container_env_value MYSQL_ROOT_PASSWORD)"
  if [[ -z "$db_password" ]]; then
    echo "Unable to read MySQL root password from $MYSQL_CONTAINER" >&2
    exit 1
  fi

  jwt_secret="$(openssl rand -hex 48)"
  jwt_refresh_secret="$(openssl rand -hex 48)"
  csrf_secret="$(openssl rand -hex 48)"
  redis_password="$(openssl rand -hex 32)"
  zhipu_key="$(old_compose_value ZHIPU_API_KEY)"
  siliconflow_key="$(old_compose_value SILICONFLOW_API_KEY)"

  umask 077
  {
    printf 'PUBLIC_API_BASE_URL=%s\n' "$PUBLIC_URL"
    printf 'DB_HOST=172.17.0.1\n'
    printf 'DB_PORT=3306\n'
    printf 'DB_USER=root\n'
    printf 'DB_NAME=mes\n'
    printf 'DB_PASSWORD=%s\n' "$db_password"
    printf 'JWT_SECRET=%s\n' "$jwt_secret"
    printf 'JWT_REFRESH_SECRET=%s\n' "$jwt_refresh_secret"
    printf 'CSRF_SECRET=%s\n' "$csrf_secret"
    printf 'DEFAULT_ADMIN_PASSWORD_HASH=\n'
    printf 'DEFAULT_ADMIN_PASSWORD=\n'
    printf 'ALLOWED_ORIGINS=http://%s:18080,http://%s:18081,http://%s:18082,%s\n' "$SERVER_IP" "$SERVER_IP" "$SERVER_IP" "$PUBLIC_URL"
    printf 'COOKIE_SECURE=true\n'
    printf 'COOKIE_SAME_SITE=lax\n'
    printf 'REDIS_HOST=redis\n'
    printf 'REDIS_PASSWORD=%s\n' "$redis_password"
    printf 'OLLAMA_HOST=http://172.17.0.1:11434\n'
    printf 'ZHIPU_API_KEY=%s\n' "$zhipu_key"
    printf 'SILICONFLOW_API_KEY=%s\n' "$siliconflow_key"
    printf 'BACKUP_RETENTION_DAYS=30\n'
    printf 'BACKUP_RETENTION_COUNT=30\n'
  } > .env
  chmod 600 .env
fi

chmod -R u=rwX,go=rX "$PROJECT_DIR"
chmod 600 .env

docker compose config --quiet
docker compose build --pull
docker compose run --rm backend npm run migrate
docker compose up -d --remove-orphans
docker compose ps
