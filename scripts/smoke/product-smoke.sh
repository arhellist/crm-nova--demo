#!/usr/bin/env bash
# product-smoke.sh — сквозная приёмка NOVA CRM на staging.
# Канон: witness-done/catalogs/verification-tax.md, OUTPUT/docs/runbooks/product-smoke.md.
#
# Требует поднятого контура (frontend + api + supabase + replica) и трёх учётных записей.
# Без BASE_URL/FE_URL скрипт не запускает проверки: «пустой прогон» не считается приёмкой.
#
# Использование:
#   FE_URL=https://staging.nova.example API_URL=https://api.staging.nova.example \
#   TOKEN=... MANAGER_EMAIL=... MANAGER_PASSWORD=... bash scripts/smoke/product-smoke.sh
#
# Метки A14.1 подтверждают сценарии §4; каждая проверка печатает свой ID.
set -euo pipefail

FE_URL="${FE_URL:-}"
API_URL="${API_URL:-}"
TOKEN="${TOKEN:-}"

if [[ -z "$FE_URL" || -z "$API_URL" ]]; then
  echo "SKIP-NOT-RUN: FE_URL/API_URL не заданы — контура нет, приёмка не выполнялась" >&2
  echo "Это не успех: product-smoke требует поднятого staging (см. docs/runbooks/product-smoke.md)" >&2
  exit 2
fi

pass=0
fail=0

ok()   { echo "  OK   $1 — $2"; pass=$((pass + 1)); }
bad()  { echo "  FAIL $1 — $2"; fail=$((fail + 1)); }

code() { curl -sS -o /dev/null -w "%{http_code}" "$@" || true; }

# --- A14.1: 17 сценариев §4 в порядке срезов ---------------------------------
echo "=== product smoke @ ${FE_URL} ==="

# 1. Контур отвечает
[[ "$(code "${FE_URL}/login")" == "200" ]] && ok A14.1 "1 вход: /login отвечает" || bad A14.1 "1 вход: /login"
[[ "$(code "${API_URL}/health")" == "200" ]] && ok A14.1 "2 api: /health" || bad A14.1 "2 api: /health"

# 2. Открытая регистрация отключена
[[ "$(code -X POST "${API_URL}/auth/v1/signup" -H 'Content-Type: application/json' -d '{"email":"x@example.invalid"}')" != "200" ]] \
  && ok A14.1 "3 регистрация закрыта" || bad A14.1 "3 регистрация открыта"

# 3. Репликация и отчёты
[[ "$(code "${API_URL}/health/replication")" == "200" ]] && ok A14.1 "4 репликация: health" || bad A14.1 "4 репликация"
[[ "$(code -H "Authorization: Bearer ${TOKEN}" "${API_URL}/api/reports/objects?limit=5")" == "200" ]] \
  && ok A14.1 "5 отчёт объектов" || bad A14.1 "5 отчёт объектов"

# 4. Запрет записи в backend
[[ "$(code -X POST "${API_URL}/api/reports/objects")" == "405" ]] && ok A14.1 "6 запись в backend запрещена" || bad A14.1 "6 запись в backend"

# 5. Запрет прямого изменения статуса в обход RPC
[[ "$(code -X PATCH "${API_URL}/rest/v1/tasks?id=eq.00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' -d '{"status":"accepted"}')" != "204" ]] \
  && ok A14.1 "7 прямой PATCH статуса отклонён" || bad A14.1 "7 прямой PATCH статуса"

# 6. Метрики и заголовки безопасности
[[ "$(code "${API_URL}/metrics")" == "200" ]] && ok A14.1 "8 метрики" || bad A14.1 "8 метрики"
csp=$(curl -sSI "${FE_URL}/" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-security-policy"{print $2}')
[[ -n "$csp" && "$csp" != *"unsafe-eval"* ]] && ok A14.1 "9 CSP без unsafe-eval" || bad A14.1 "9 CSP"

# 7. Деградация отчётов не ломает продукт — проверяется вручную по runbook
echo "  OPS  A14.1 — 10–17: MFA, объекты, задачи, переходы, изоляция, «Мои задачи» — см. runbook"

# --- A14.2: security-гейты ----------------------------------------------------
echo "=== security gates ==="
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --redact --no-banner >/dev/null 2>&1 && ok A14.2 "gitleaks: 0 находок" || bad A14.2 "gitleaks"
else
  echo "  OPS  A14.2 — gitleaks не установлен, проверка в CI"
fi
grep -Rqs "service_role" dist/ 2>/dev/null && bad A14.2 "service_role в dist" || ok A14.2 "service_role отсутствует в dist"

echo
echo "PASS=$pass FAIL=$fail"
[[ "$fail" -eq 0 ]] || exit 1
