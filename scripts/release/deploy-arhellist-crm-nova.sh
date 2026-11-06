#!/usr/bin/env bash
# Деплой демо NOVA CRM на https://arhellist.ru/crm-nova/
#
# Паттерн как у Recoursia: Vite base=/crm-nova/, статика в public Next-монолита,
# nginx location ^~ /crm-nova/. Данные — Supabase Cloud (не локальный 54321).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE="${DEPLOY_REMOTE:-arhellist}"
FE_REMOTE="/var/www/arhellist.ru/present/next/public/crm-nova"
ORIGIN="https://arhellist.ru/crm-nova"
SNIP="$ROOT/scripts/release/nginx-crm-nova.snippet"

cd "$ROOT"

if [[ ! -f .env.supabase ]]; then
  echo "Нужен .env.supabase с VITE_SUPABASE_URL и ключами cloud-проекта"
  exit 1
fi

# shellcheck disable=SC1091
set -a
# shellcheck source=/dev/null
source .env.supabase
set +a

ANON_KEY="${VITE_SUPABASE_ANON_KEY:-${VITE_SUPABASE_PUBLISHABLE_KEY:-${SUPABASE_PUBLISHABLE_KEY:-}}}"
SUPA_URL="${VITE_SUPABASE_URL:-${SUPABASE_URL:-}}"
if [[ -z "$SUPA_URL" || -z "$ANON_KEY" ]]; then
  echo "В .env.supabase нет VITE_SUPABASE_URL / publishable (anon) ключа"
  exit 1
fi

REPORT_URL="${VITE_REPORT_API_URL:-https://arhellist.ru/crm-nova}"
REPORT_TOKEN="${VITE_REPORT_API_TOKEN:-}"
if [[ -z "$REPORT_TOKEN" ]]; then
  echo "Нужен VITE_REPORT_API_TOKEN (≥32) в окружении или .env.supabase (DEC-049)"
  exit 1
fi

echo "==> Build SPA base=/crm-nova/ → $SUPA_URL (reports → $REPORT_URL)"
# Не подхватываем VITE_API_BASE_URL из .env.local (часто 127.0.0.1) — иначе CSP на демо (DEC-054).
env -u VITE_API_BASE_URL \
VITE_BASE_PATH=/crm-nova/ \
VITE_SUPABASE_URL="$SUPA_URL" \
VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
VITE_REPORT_API_URL="$REPORT_URL" \
VITE_REPORT_API_TOKEN="$REPORT_TOKEN" \
VITE_APP_ENV=staging \
VITE_API_BASE_URL= \
npm run build:web

if ! grep -q '/crm-nova/assets/' "$ROOT/dist/web/index.html"; then
  echo "ABORT: dist собран без base=/crm-nova/ — ассеты не найдутся"
  exit 1
fi

echo "==> rsync dist/web → $REMOTE:$FE_REMOTE"
ssh "$REMOTE" "mkdir -p $FE_REMOTE"
rsync -avz --delete "$ROOT/dist/web/" "$REMOTE:$FE_REMOTE/"

echo "==> nginx snippet (idempotent)"
rsync -avz "$SNIP" "$REMOTE:/tmp/nginx-crm-nova.snippet"
ssh "$REMOTE" 'if ! grep -q "crm-nova/" /etc/nginx/sites-enabled/arhellist.ru; then
  if grep -q "SPA портфолио" /etc/nginx/sites-enabled/arhellist.ru; then
    sudo sed -i "/# SPA портфолио/r /tmp/nginx-crm-nova.snippet" /etc/nginx/sites-enabled/arhellist.ru
  else
    echo "WARN: маркер «SPA портфолио» не найден — вставь snippet вручную"
    exit 1
  fi
fi
sudo nginx -t && sudo nginx -s reload'

echo "==> Smoke"
ssh "$REMOTE" "curl -sI $ORIGIN/ | head -12; curl -sf $ORIGIN/ | head -c 200; echo"

echo "==> Готово: $ORIGIN/"
echo "    manager@nova.local / nova-local-password (+ TOTP seed)"
echo "    executor1@nova.local / nova-local-password"
echo "    executor2@nova.local / nova-local-password"
