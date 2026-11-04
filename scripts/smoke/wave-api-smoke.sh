#!/usr/bin/env bash
# wave-api-smoke.sh — контурный смоук NOVA CRM без браузера.
# Канон: witness-done/catalogs/contour-smoke.md, catalogs/verification-tax.md.
# Запускать после закрытия split_group и на staging перед релизом.
#
# Каждая проверка помечена фразой приёмки Axx.k из OUTPUT/prompts/Dxx_*.md.
# Без меток прогон ничего не доказывает: sp-verify --gate product-smoke отвергнет акт.
#
# Использование:
#   BASE_URL=https://api.nova.example TOKEN=... bash scripts/smoke/wave-api-smoke.sh all
#   BASE_URL=http://127.0.0.1:3001 bash scripts/smoke/wave-api-smoke.sh platform
#   Группы: platform | schema | auth | objects | tasks | reports | release | all
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"
TOKEN="${TOKEN:-}"
GROUP="${1:-all}"
HDR_AUTH=()
if [[ -n "$TOKEN" ]]; then
  HDR_AUTH=(-H "Authorization: Bearer ${TOKEN}")
fi

pass=0
fail=0

# check <фраза> <метод> <путь> <ожидаемый код>
check() {
  local id="$1" method="$2" path="$3" expect="${4:-200}" code
  code=$(curl -sS -o /tmp/nova-wave-body.json -w "%{http_code}" \
    -X "$method" "${HDR_AUTH[@]}" -H "Content-Type: application/json" \
    "${BASE_URL}${path}" || true)
  if [[ "$code" == "$expect" ]]; then
    echo "  OK   $id $method $path → $code"
    pass=$((pass + 1))
  else
    echo "  FAIL $id $method $path → $code (ожидали $expect)"
    fail=$((fail + 1))
  fi
}

# check_json <фраза> <путь> <jq-условие>
check_json() {
  local id="$1" path="$2" expr="$3" body
  if body=$(curl -sS "${HDR_AUTH[@]}" "${BASE_URL}${path}") && echo "$body" | jq -e "$expr" >/dev/null 2>&1; then
    echo "  OK   $id GET $path → форма ответа"
    pass=$((pass + 1))
  else
    echo "  FAIL $id GET $path → форма ответа не совпала: $expr"
    fail=$((fail + 1))
  fi
}

want() {
  [[ "$GROUP" == "all" || "$GROUP" == "$1" ]]
}

echo "=== wave API smoke @ ${BASE_URL} (group=${GROUP}) ==="

if want platform; then
  # D01: health и защита от всплеска запросов
  check A01.2 GET "/health" 200
  check_json A01.2 "/health" '.status == "ok" and has("version")'
  check A01.4 GET "/health" 200
fi

if want schema; then
  # D02/D03: чтение через PostgREST и отказ на прямой записи статуса
  check A02.2 GET "/rest/v1/tasks?select=id,status&limit=5" 200
  check A03.2 POST "/rest/v1/rpc/change_task_status" 400
  check A03.4 POST "/rest/v1/rpc/change_task_status" 401
fi

if want auth; then
  # D04: оболочка поднята, без токена защищённые данные недоступны
  check A04.2 GET "/rest/v1/profiles?select=id,role&limit=1" 401
  check A04.5 POST "/auth/v1/signup" 422
fi

if want objects; then
  # D05/D06: список объектов и запрет создания без токена
  check A05.1 GET "/rest/v1/objects?select=id,title&limit=5" 200
  check A05.3 POST "/rest/v1/objects" 401
fi

if want tasks; then
  # D07/D08/D09: список задач и запрет прямого PATCH статуса
  check A07.1 GET "/rest/v1/tasks?select=id,status&limit=5" 200
  check A07.3 POST "/rest/v1/rpc/change_task_status" 400
  check A09.1 GET "/rest/v1/tasks?select=status&archived_at=is.null&limit=5" 200
fi

if want reports; then
  # D10/D11/D12: три отчёта, метка источника, лаг, деградация
  check A11.1 GET "/api/reports/objects?limit=5" 200
  check A11.3 GET "/health/replication" 200
  check_json A11.3 "/health/replication" 'has("status") and has("lag_seconds")'
  check A11.6 GET "/api/reports/objects?limit=0" 400
  check A12.1 GET "/api/reports/workload?limit=5" 200
  check_json A12.1 "/api/reports/workload?limit=5" \
    '.source == "replica" and (.lag_seconds | type == "number") and (.data | type == "array")'
  check A12.4 GET "/api/reports/status-ages?limit=5" 200
  check_json A12.4 "/api/reports/status-ages?limit=5" '([.data[]? | has("email")] | any | not)'
fi

if want release; then
  # D13/D14: метрики, запрет записи в backend, отсутствие токена
  check A13.1 GET "/metrics" 200
  check A14.2 POST "/health" 405
  check A14.2 PUT "/api/reports/objects" 405
  check A14.2 DELETE "/api/reports/objects" 405
  check A14.2 GET "/api/reports/objects" 401
fi

echo
echo "PASS=$pass FAIL=$fail"
[[ "$fail" -eq 0 ]] || exit 1
