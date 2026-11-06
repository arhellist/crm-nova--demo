#!/usr/bin/env bash
# product-smoke.sh — контурная приёмка NOVA CRM на staging.
# Канон: witness-done/catalogs/verification-tax.md, OUTPUT/docs/runbooks/product-smoke.md.
#
# Что проверяет: живой контур (frontend + отчётный API + Supabase + реплика) отвечает
# ровно так, как требует продукт. Полные 17 сценариев §4 проверяет `npm run e2e`
# (e2e/smoke.spec.ts); этот скрипт — внешняя проверка контура после выката и перед
# переключением production, поэтому он не дублирует UI-шаги, а держит инварианты:
# отчёты читаются только с реплики, запись в backend запрещена, статус меняется только
# через RPC, CSP и заголовки безопасности отдаёт production-сборка.
#
# Использование:
#   FE_URL=https://staging.nova.example API_URL=https://api.staging.nova.example \
#   SUPABASE_URL=https://<project>.supabase.co SUPABASE_ANON_KEY=... TOKEN=... \
#   bash scripts/smoke/product-smoke.sh
#
# Метки A14.1 подтверждают фразы приёмки; каждая проверка печатает свой ID.
set -euo pipefail

FE_URL="${FE_URL:-}"
API_URL="${API_URL:-}"
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"
TOKEN="${TOKEN:-}"

if [[ -z "$FE_URL" || -z "$API_URL" || -z "$SUPABASE_URL" ]]; then
  echo "SKIP-NOT-RUN: FE_URL/API_URL/SUPABASE_URL не заданы — контура нет, приёмка не выполнялась" >&2
  echo "Это не успех: product-smoke требует поднятого staging (см. docs/runbooks/product-smoke.md)" >&2
  exit 2
fi

pass=0
fail=0

ok()   { echo "  OK   $1 — $2"; pass=$((pass + 1)); }
bad()  { echo "  FAIL $1 — $2"; fail=$((fail + 1)); }

code() { curl -sS -o /dev/null -w "%{http_code}" "$@" || true; }

# --- A14.1: контур приёмки ----------------------------------------------------
echo "=== product smoke @ ${FE_URL} ==="

# 1. SPA production-сборки: и корень, и клиентский маршрут отдают приложение.
[[ "$(code "${FE_URL}/login")" == "200" ]] && ok A14.1 "1 SPA: /login отвечает" || bad A14.1 "1 SPA: /login"
[[ "$(code "${FE_URL}/reports")" == "200" ]] && ok A14.1 "2 SPA: маршрут /reports отдаёт приложение" || bad A14.1 "2 SPA: /reports"

# 2. Отчётный API жив и читает реплику.
[[ "$(code "${API_URL}/health")" == "200" ]] && ok A14.1 "3 api: /health" || bad A14.1 "3 api: /health"
replication="$(curl -sS "${API_URL}/health/replication" || true)"
[[ "$replication" == *'"status":"streaming"'* ]] \
  && ok A14.1 "4 репликация: status streaming" || bad A14.1 "4 репликация: ${replication:0:80}"

# 3. Отчёты: без токена — 401, с токеном — 200 и источник replica.
# API_URL — корень BFF как снаружи (демо: …/crm-nova/api → /health и /reports/*).
[[ "$(code "${API_URL}/reports/objects")" == "401" ]] \
  && ok A14.1 "5 отчёты требуют Bearer" || bad A14.1 "5 отчёты: нет 401 без токена"
report="$(curl -sS -H "Authorization: Bearer ${TOKEN}" "${API_URL}/reports/objects?limit=5" || true)"
case "$report" in
  *'"source":"replica"'*) ok A14.1 "6 отчёт объектов помечен source: replica" ;;
  *) bad A14.1 "6 отчёт объектов: ${report:0:80}" ;;
esac

# 4. Backend только читает: запись отклоняется 405 на всех отчётных маршрутах.
for route in objects workload status-ages; do
  [[ "$(code -X POST "${API_URL}/reports/${route}")" == "405" ]] \
    && ok A14.1 "7 backend не принимает POST /reports/${route}" \
    || bad A14.1 "7 backend принял POST /reports/${route}"
done

# 5. Метрики защищены токеном и содержат серии алертов (A13.1).
[[ "$(code "${API_URL}/metrics")" == "401" ]] && ok A14.1 "8 метрики закрыты токеном" || bad A14.1 "8 метрики без токена"
metrics="$(curl -sS -H "Authorization: Bearer ${TOKEN}" "${API_URL}/metrics" || true)"
for series in http_request_duration_seconds replica_lag_seconds db_pool_waiting; do
  [[ "$metrics" == *"$series"* ]] && ok A14.1 "9 метрики содержат ${series}" || bad A14.1 "9 метрики без ${series}"
done

# 6. Заголовки безопасности production-сборки (INV-010).
headers="$(curl -sSI "${FE_URL}/" | tr -d '\r')"
csp="$(printf '%s\n' "$headers" | awk -F': ' 'tolower($1)=="content-security-policy"{sub(/^[^:]*: /,""); print}')"
[[ -n "$csp" && "$csp" != *"unsafe-eval"* ]] && ok A14.1 "10 CSP без unsafe-eval" || bad A14.1 "10 CSP отсутствует или с unsafe-eval"
[[ "$csp" == *"frame-ancestors 'none'"* ]] && ok A14.1 "11 CSP: frame-ancestors 'none'" || bad A14.1 "11 CSP без frame-ancestors"
[[ "$headers" == *"x-content-type-options: nosniff"* || "$headers" == *"X-Content-Type-Options: nosniff"* ]] \
  && ok A14.1 "12 X-Content-Type-Options: nosniff" || bad A14.1 "12 нет X-Content-Type-Options"

# 7. Supabase: открытая регистрация выключена, прямой UPDATE статуса отклонён.
if [[ -n "$SUPABASE_ANON_KEY" ]]; then
  signup="$(code -X POST "${SUPABASE_URL}/auth/v1/signup" \
    -H "apikey: ${SUPABASE_ANON_KEY}" -H 'Content-Type: application/json' \
    -d '{"email":"smoke@example.invalid","password":"smoke-password-123"}')"
  [[ "$signup" != "200" ]] && ok A14.1 "13 регистрация закрыта" || bad A14.1 "13 регистрация открыта"

  patch="$(code -X PATCH "${SUPABASE_URL}/rest/v1/tasks?id=eq.00000000-0000-0000-0000-000000000000" \
    -H "apikey: ${SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H 'Content-Type: application/json' -d '{"status":"accepted"}')"
  [[ "$patch" != "204" && "$patch" != "200" ]] \
    && ok A14.1 "14 прямой PATCH статуса отклонён (${patch})" || bad A14.1 "14 прямой PATCH статуса прошёл"
else
  echo "  OPS  A14.1 — 13–14: SUPABASE_ANON_KEY не задан, проверки Supabase пропущены"
fi

# 8. UI-сценарии §4 (MFA, объекты, задачи, переходы, изоляция, «Мои задачи», отчёты)
echo "  OPS  A14.1 — 15–17: UI-сценарии §4 выполняет npm run e2e (e2e/smoke.spec.ts, 17 сценариев)"

# --- A14.2: security-гейты ----------------------------------------------------
echo "=== security gates ==="
if [[ "${SKIP_GITLEAKS:-0}" = "1" ]]; then
  echo "  OPS  A14.2 — gitleaks пропущен по SKIP_GITLEAKS=1"
elif command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --redact --no-banner >/dev/null 2>&1 && ok A14.2 "gitleaks: 0 находок" || bad A14.2 "gitleaks"
else
  echo "  OPS  A14.2 — gitleaks не установлен, проверка выполняется в CI"
fi
if grep -RIqs "service_role" dist/web 2>/dev/null; then
  bad A14.2 "service_role попал в production-сборку"
else
  ok A14.2 "service_role отсутствует в dist/web"
fi

echo
echo "PASS=$pass FAIL=$fail"
[[ "$fail" -eq 0 ]] || exit 1

# Пустая проверка не считается приёмкой: должен пройти хотя бы один контурный шаг.
[[ "$pass" -gt 0 ]] || { echo "FAIL: ни одна проверка не выполнена" >&2; exit 2; }
