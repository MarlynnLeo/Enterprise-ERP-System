#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/1panel/docker/compose/KACON-ERP}"
PUBLIC_URL="${PUBLIC_URL:-https://erp.kacon.ai}"

CANONICAL_PROJECT_DIR="/opt/1panel/docker/compose/KACON-ERP"
if [[ "$(readlink -f "$PROJECT_DIR")" != "$CANONICAL_PROJECT_DIR" ]]; then
  echo "Refusing deployment outside canonical project directory: $CANONICAL_PROJECT_DIR" >&2
  exit 2
fi

cd "$PROJECT_DIR"
export COMPOSE_FILE="$CANONICAL_PROJECT_DIR/docker-compose.yml"
unset COMPOSE_PATH_SEPARATOR

verify_frontend_menu_source() {
  local sidebar="$PROJECT_DIR/frontend/src/components/layout/SidebarMenu.vue"
  local layout="$PROJECT_DIR/frontend/src/views/Layout.vue"
  test -f "$sidebar"
  test -f "$layout"
  grep -q 'app-menu-list' "$sidebar"
  if grep -Eq '<el-(menu|sub-menu|menu-item)([[:space:]>]|-)|default-openeds|collapse-transition' "$sidebar" "$layout"; then
    echo "Refusing deployment: legacy Element Plus menu implementation detected" >&2
    exit 20
  fi
}

verify_frontend_menu_source

if [[ ! -f .env ]]; then
  : "${DB_HOST:?DB_HOST must be provided for first deployment}"
  : "${DB_USER:?DB_USER must be provided for first deployment}"
  : "${DB_PASSWORD:?DB_PASSWORD must be provided for first deployment}"
  if [[ -z "${DEFAULT_ADMIN_PASSWORD_HASH:-}" && -z "${DEFAULT_ADMIN_PASSWORD:-}" ]]; then
    echo "DEFAULT_ADMIN_PASSWORD or DEFAULT_ADMIN_PASSWORD_HASH must be provided for first deployment" >&2
    exit 1
  fi
  if [[ -n "${DEFAULT_ADMIN_PASSWORD:-}" && ${#DEFAULT_ADMIN_PASSWORD} -lt 12 ]]; then
    echo "DEFAULT_ADMIN_PASSWORD must contain at least 12 characters" >&2
    exit 1
  fi
  if [[ "${DB_USER,,}" == "root" ]]; then
    echo "DB_USER=root is forbidden for production deployment" >&2
    exit 1
  fi

  jwt_secret="$(openssl rand -hex 48)"
  jwt_refresh_secret="$(openssl rand -hex 48)"
  csrf_secret="$(openssl rand -hex 48)"
  redis_password="$(openssl rand -hex 32)"
  backup_encryption_key="$(openssl rand -hex 32)"
  zhipu_key="${ZHIPU_API_KEY:-}"
  siliconflow_key="${SILICONFLOW_API_KEY:-}"

  umask 077
  {
    printf 'PUBLIC_API_BASE_URL=%s\n' "$PUBLIC_URL"
    printf 'DB_HOST=%s\n' "$DB_HOST"
    printf 'DB_PORT=%s\n' "${DB_PORT:-3306}"
    printf 'DB_USER=%s\n' "$DB_USER"
    printf 'DB_NAME=%s\n' "${DB_NAME:-mes}"
    printf 'DB_PASSWORD=%s\n' "$DB_PASSWORD"
    printf 'JWT_SECRET=%s\n' "$jwt_secret"
    printf 'JWT_REFRESH_SECRET=%s\n' "$jwt_refresh_secret"
    printf 'CSRF_SECRET=%s\n' "$csrf_secret"
    printf 'DEFAULT_ADMIN_PASSWORD_HASH=%s\n' "${DEFAULT_ADMIN_PASSWORD_HASH:-}"
    printf 'DEFAULT_ADMIN_PASSWORD=%s\n' "${DEFAULT_ADMIN_PASSWORD:-}"
    printf 'ALLOWED_ORIGINS=%s\n' "$PUBLIC_URL"
    printf 'COOKIE_SECURE=auto\n'
    printf 'COOKIE_SAME_SITE=lax\n'
    printf 'REDIS_HOST=redis\n'
    printf 'REDIS_PASSWORD=%s\n' "$redis_password"
    printf 'OLLAMA_HOST=http://172.17.0.1:11434\n'
    printf 'ZHIPU_API_KEY=%s\n' "$zhipu_key"
    printf 'SILICONFLOW_API_KEY=%s\n' "$siliconflow_key"
    printf 'BACKUP_RETENTION_DAYS=30\n'
    printf 'BACKUP_RETENTION_COUNT=30\n'
    printf 'BACKUP_ENCRYPTION_MODE=required\n'
    printf 'BACKUP_ENCRYPTION_KEY=%s\n' "$backup_encryption_key"
  } > .env
  chmod 600 .env
fi

chmod -R u=rwX,go=rX "$PROJECT_DIR"
chmod 600 .env
normalize_env_cookie_policy() {
  if grep -q '^COOKIE_SECURE=' .env; then
    sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=auto/' .env
  else
    printf 'COOKIE_SECURE=auto\n' >> .env
  fi
  if grep -q '^COOKIE_SAME_SITE=' .env; then
    sed -i 's/^COOKIE_SAME_SITE=.*/COOKIE_SAME_SITE=lax/' .env
  else
    printf 'COOKIE_SAME_SITE=lax\n' >> .env
  fi
}

verify_minimum_privilege_db_user() {
  local db_user
  db_user="$(sed -n 's/^DB_USER=//p' .env | tail -n 1)"
  if [[ -z "$db_user" || "${db_user,,}" == "root" ]]; then
    echo "Production .env must use a non-root DB_USER" >&2
    exit 1
  fi
}

verify_auth_artifacts() {
  test -f backend/src/utils/cookieSecurity.js
  grep -q shouldUseSecureCookies backend/src/config/jwtEnhanced.js
  grep -q 'client_forwarded_proto' frontend/nginx.conf
  grep -q 'client_forwarded_proto' mobile/nginx.conf
  docker compose exec -T backend sh -lc 'test -f /app/src/utils/cookieSecurity.js'
  docker compose exec -T backend sh -lc 'grep -q shouldUseSecureCookies /app/src/config/jwtEnhanced.js'
  docker compose exec -T frontend sh -lc 'grep -q client_forwarded_proto /etc/nginx/conf.d/default.conf'
}

normalize_env_cookie_policy
verify_minimum_privilege_db_user

docker compose config --quiet
docker compose build --pull
docker compose run --rm backend npm run migrate
docker compose up -d --remove-orphans
docker compose ps
verify_auth_artifacts
