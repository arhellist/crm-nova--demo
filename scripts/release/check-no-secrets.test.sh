#!/usr/bin/env sh
# check-no-secrets.test.sh — проверка security-гейта A14.2 без сети и real-стенда.
#
# Тест подаёт гейту подготовленные входы (audit JSON, CSP-заголовок, dist) и проверяет
# коды возврата: чистый контур — 0, любая находка (секрет, high без принятого риска,
# unsafe-eval) — 1. Так проверяется сама логика гейта, а не наличие gitleaks в окружении.
set -eu

TESTS_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
CHECK="$TESTS_DIR/check-no-secrets.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM

pass=0
failed=0
check() {
  description="$1"
  expected="$2"
  actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "ok: $description"
    pass=$((pass + 1))
  else
    echo "FAIL: $description (ожидался код $expected, получен $actual)" >&2
    failed=$((failed + 1))
  fi
}

mkdir -p "$TMP/root/dist" "$TMP/root/docs"
echo 'clean bundle' >"$TMP/root/dist/app.js"
echo 'no accepted risks yet' >"$TMP/root/docs/decisions.md"
printf "Content-Security-Policy: default-src 'self'; script-src 'self'; frame-ancestors 'none'\r\n" >"$TMP/headers.txt"
echo '{"vulnerabilities":{}}' >"$TMP/audit-clean.json"

run_gate() {
  set +e
  CHECK_ROOT="$TMP/root" AUDIT_JSON_FILE="$1" CSP_HEADER_FILE="${2:-$TMP/headers.txt}" \
    SKIP_GITLEAKS=1 sh "$CHECK" >/dev/null 2>&1
  code=$?
  set -e
  echo "$code"
}

check 'чистый контур проходит' 0 "$(run_gate "$TMP/audit-clean.json")"

echo 'service_role=abc' >"$TMP/root/dist/leak.js"
check 'service_role в dist валит гейт' 1 "$(run_gate "$TMP/audit-clean.json")"
echo 'clean bundle' >"$TMP/root/dist/leak.js"

printf "Content-Security-Policy: script-src 'self' 'unsafe-eval'; frame-ancestors 'none'\r\n" >"$TMP/headers-bad.txt"
check 'unsafe-eval в CSP валит гейт' 1 "$(run_gate "$TMP/audit-clean.json" "$TMP/headers-bad.txt")"

cat >"$TMP/audit-high.json" <<'JSON'
{
  "vulnerabilities": {
    "example": {
      "severity": "high",
      "via": [{ "url": "https://github.com/advisories/GHSA-aaaa-bbbb-cccc" }]
    }
  }
}
JSON
check 'high без принятого риска валит гейт' 1 "$(run_gate "$TMP/audit-high.json")"

echo 'audit-accepted: GHSA-aaaa-bbbb-cccc — проверочный риск' >>"$TMP/root/docs/decisions.md"
check 'принятый риск не валит гейт' 0 "$(run_gate "$TMP/audit-high.json")"

echo 'audit-accepted: GHSA-aaaa-bbbb-cccc — проверочный риск' >>"$TMP/root/docs/decisions.md"
check 'повторная строка принятого риска не мешает' 0 "$(run_gate "$TMP/audit-high.json")"

echo
if [ "$failed" -ne 0 ]; then
  echo "check-no-secrets: $failed проверок провалено" >&2
  exit 1
fi
echo "check-no-secrets: все $pass проверок пройдены"
