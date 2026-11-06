#!/usr/bin/env bash
# Деплой read-only reporting API для демо https://arhellist.ru/crm-nova/ (DEC-049).
# Требует: .env.supabase, /tmp/nova-ro.pass (пароль роли nova_ro), sudo на VPS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE="${DEPLOY_REMOTE:-arhellist}"
API_REMOTE="${API_REMOTE:-/home/devops/apps/crm-nova-api}"
API_PORT="${API_PORT:-5020}"
SNIP="$ROOT/scripts/release/nginx-crm-nova.snippet"

cd "$ROOT"

if [[ ! -f .env.supabase ]]; then
  echo "Нужен .env.supabase"
  exit 1
fi
if [[ ! -f /tmp/nova-ro.pass ]]; then
  echo "Нужен /tmp/nova-ro.pass (пароль nova_ro на cloud)"
  exit 1
fi

# shellcheck disable=SC1091
set -a
# shellcheck source=/dev/null
source .env.supabase
set +a

SUPA_URL="${VITE_SUPABASE_URL:-${SUPABASE_URL:-}}"
ANON_KEY="${VITE_SUPABASE_ANON_KEY:-${VITE_SUPABASE_PUBLISHABLE_KEY:-${SUPABASE_PUBLISHABLE_KEY:-}}}"
# DEC-060: secret/service_role только для POST /api/auth/managers на BFF.
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SECRET_KEY:-}}"
if [[ -z "$SUPA_URL" || -z "$ANON_KEY" ]]; then
  echo "Нет VITE_SUPABASE_URL / anon key"
  exit 1
fi
if [[ -z "$SERVICE_ROLE_KEY" ]]; then
  echo "Нет SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY — провижининг менеджеров будет 503"
fi

REF="${SUPABASE_PROJECT_REF:-hcuailgajbetllkmqrgq}"
RO_PASS="$(cat /tmp/nova-ro.pass)"
RO_ENC="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$RO_PASS")"
REPLICA_URL="postgresql://nova_ro.${REF}:${RO_ENC}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"

API_TOKEN="${API_TOKEN:-${VITE_REPORT_API_TOKEN:-}}"
if [[ -z "$API_TOKEN" ]]; then
  API_TOKEN="$(openssl rand -hex 24)"
fi
if [[ ${#API_TOKEN} -lt 32 ]]; then
  echo "API_TOKEN короче 32 символов"
  exit 1
fi
# Токен для SPA-сборки (публичный Bearer отчётного контура, не service_role).
export VITE_REPORT_API_TOKEN="$API_TOKEN"
printf '%s' "$API_TOKEN" > /tmp/crm-nova-api-token
chmod 600 /tmp/crm-nova-api-token

echo "==> Build backend (tsc)"
npm run build

echo "==> Sync API → $REMOTE:$API_REMOTE"
ssh "$REMOTE" "mkdir -p $API_REMOTE"
rsync -avz --delete \
  --exclude node_modules \
  --exclude '.env' \
  --exclude '*.map' \
  "$ROOT/dist/" "$REMOTE:$API_REMOTE/dist/"
rsync -avz "$ROOT/package.json" "$ROOT/package-lock.json" "$REMOTE:$API_REMOTE/"

echo "==> npm ci --omit=dev + .env"
# Env на сервере: секреты не в git. DEMO_STAND=1 — без logical subscription (DEC-049).
ssh "$REMOTE" "cd $API_REMOTE && npm ci --omit=dev --no-audit --no-fund"
ssh "$REMOTE" "umask 077; cat > $API_REMOTE/.env <<EOF
NODE_ENV=production
PORT=${API_PORT}
LOG_LEVEL=info
DEMO_STAND=1
COOKIE_SECURE=1
SUPABASE_URL=${SUPA_URL}
SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
API_TOKEN=${API_TOKEN}
DATABASE_URL=${REPLICA_URL}
DATABASE_URL_REPLICA=${REPLICA_URL}
ALLOWED_ORIGINS=https://arhellist.ru
REPORT_CACHE_TTL_S=30
GIT_COMMIT=demo-crm-nova
EOF"

echo "==> pm2 crm-nova-api (env из .env процесса)"
ssh "$REMOTE" "cd $API_REMOTE && set -a && . ./.env && set +a && \
  (pm2 delete crm-nova-api >/dev/null 2>&1 || true) && \
  pm2 start dist/server/index.js --name crm-nova-api --cwd $API_REMOTE --update-env --time && \
  pm2 save"

echo "==> nginx: заменить блок crm-nova"
rsync -avz "$SNIP" "$REMOTE:/tmp/nginx-crm-nova.snippet"
# Пароль sudo — из stdin на вызывающей стороне (не логируем).
if [[ -z "${SUDO_PASS:-}" ]]; then
  echo "Задай SUDO_PASS для nginx reload"
  exit 1
fi
ssh "$REMOTE" "python3 - <<'PY'
from pathlib import Path
path = Path('/etc/nginx/sites-enabled/arhellist.ru')
text = path.read_text()
snip = Path('/tmp/nginx-crm-nova.snippet').read_text()
start = text.find('    # NOVA CRM demo SPA')
if start < 0:
    marker = '    # SPA портфолио'
    i = text.find(marker)
    if i < 0:
        raise SystemExit('marker SPA портфолио not found')
    # вставить после строки маркера
    nl = text.find('\n', i)
    text = text[: nl + 1] + snip + text[nl + 1 :]
else:
    # вырезать до следующего location-комментария того же уровня или Re:Coursia
    rest = text[start:]
    end_rel = None
    for needle in ('    # Re:Coursia', '    # SPA портфолио', '    location ^~ /recoursia'):
        j = rest.find(needle, 1)
        if j > 0 and (end_rel is None or j < end_rel):
            end_rel = j
    if end_rel is None:
        raise SystemExit('cannot find end of crm-nova block')
    text = text[:start] + snip + ('\n' if not snip.endswith('\n') else '') + rest[end_rel:]
Path('/tmp/arhellist.ru.crm-nova.new').write_text(text)
print('nginx draft ok', start)
PY
printf '%s\n' \"$SUDO_PASS\" | sudo -S cp /tmp/arhellist.ru.crm-nova.new /etc/nginx/sites-enabled/arhellist.ru
printf '%s\n' \"$SUDO_PASS\" | sudo -S nginx -t
printf '%s\n' \"$SUDO_PASS\" | sudo -S nginx -s reload"

echo "==> Smoke API"
sleep 1
ssh "$REMOTE" "curl -sS -o /tmp/crm-nova-health.json -w '%{http_code}' http://127.0.0.1:${API_PORT}/health; echo; \
  curl -sS -H \"Authorization: Bearer ${API_TOKEN}\" http://127.0.0.1:${API_PORT}/api/reports/objects | head -c 400; echo"

echo "==> Готово API. Токен SPA: /tmp/crm-nova-api-token (локально)"
echo "    Дальше: VITE_REPORT_API_TOKEN=\$(cat /tmp/crm-nova-api-token) ./scripts/release/deploy-arhellist-crm-nova.sh"
