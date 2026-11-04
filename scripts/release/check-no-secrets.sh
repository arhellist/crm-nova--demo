#!/usr/bin/env sh
# check-no-secrets.sh — security-гейт релиза NOVA CRM (A14.2).
#
# Что проверяется:
#  1) утечки в репозитории: gitleaks, а без него — встроенный скан production-сборки;
#  2) production-зависимости: npm audit без high/critical, кроме явно принятых рисков;
#  3) production-сборка не содержит service_role, пароля БД и строки подключения к primary;
#  4) CSP отдаётся production-сборкой: нет unsafe-eval, frame-ancestors 'none'.
#
# Принятые риски перечисляются в docs/decisions.md строками `audit-accepted: GHSA-…`:
# это не «выключить аудит», а явное решение с причиной. Любой новый high/critical валит релиз.
#
# Использование:
#   FE_URL=https://staging.nova.example sh scripts/release/check-no-secrets.sh
#   AUDIT_JSON_FILE=audit.json CSP_HEADER_FILE=headers.txt CHECK_ROOT=. sh scripts/release/check-no-secrets.sh
set -eu

ROOT="${CHECK_ROOT:-$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)}"
FE_URL="${FE_URL:-}"
AUDIT_JSON_FILE="${AUDIT_JSON_FILE:-}"
CSP_HEADER_FILE="${CSP_HEADER_FILE:-}"
SKIP_GITLEAKS="${SKIP_GITLEAKS:-0}"
FAIL=0

fail() { echo "FAIL: $*" >&2; FAIL=1; }
ok() { echo "OK: $*"; }

# --- 1. Утечки в git ---------------------------------------------------------
if [ "$SKIP_GITLEAKS" = "1" ]; then
  echo "INFO: gitleaks пропущен (SKIP_GITLEAKS=1) — только для теста самого гейта"
elif command -v gitleaks >/dev/null 2>&1; then
  if gitleaks detect --redact --no-banner --source "$ROOT" >/dev/null 2>&1; then
    ok "gitleaks: находок нет"
  else
    fail "gitleaks нашёл секреты в истории/рабочем дереве"
  fi
else
  echo "INFO: gitleaks не установлен — используется встроенный скан production-сборки"
fi

# --- 2. Production-сборка без секретов --------------------------------------
DIST="$ROOT/dist"
if [ -d "$DIST" ]; then
  if grep -RIlE 'service_role|SUPABASE_DB_PASSWORD|DATABASE_URL_PRIMARY|sb_secret_' "$DIST" >/dev/null 2>&1; then
    fail "в dist/ найдены service_role/пароль БД/строка primary"
  else
    ok "dist/: service_role и строки primary отсутствуют"
  fi
  if grep -RIl 'unsafe-eval' "$DIST" >/dev/null 2>&1; then
    fail "в dist/ найден unsafe-eval (INV-010)"
  else
    ok "dist/: unsafe-eval отсутствует"
  fi
else
  echo "INFO: dist/ отсутствует — скан сборки выполнит CI после npm run build"
fi

# --- 3. npm audit ------------------------------------------------------------
audit_json="$AUDIT_JSON_FILE"
if [ -z "$audit_json" ]; then
  audit_json="$(mktemp)"
  ( cd "$ROOT" && npm audit --omit=dev --json >"$audit_json" 2>/dev/null ) || true
fi
if [ -s "$audit_json" ]; then
  unaccepted="$(
    AUDIT_JSON="$audit_json" DECISIONS="$ROOT/docs/decisions.md" node --input-type=module -e '
      import { readFileSync, existsSync } from "node:fs";
      const report = JSON.parse(readFileSync(process.env.AUDIT_JSON, "utf8"));
      const decisions = existsSync(process.env.DECISIONS) ? readFileSync(process.env.DECISIONS, "utf8") : "";
      const accepted = new Set([...decisions.matchAll(/audit-accepted:\s*(GHSA-[a-z0-9-]+)/gi)].map((m) => m[1].toLowerCase()));
      const found = [];
      for (const [name, item] of Object.entries(report.vulnerabilities ?? {})) {
        if (item.severity !== "high" && item.severity !== "critical") continue;
        const vias = item.via ?? [];
        // via из одних строк — транзитивный указатель, само advisory уже учтено у зависимости.
        if (vias.every((v) => typeof v === "string")) continue;
        const ids = vias.map((v) => (typeof v === "string" ? v : v.url ?? "")).join(" ").toLowerCase();
        const ghsas = [...ids.matchAll(/ghsa-[a-z0-9-]+/g)].map((m) => m[0]);
        const unacceptedIds = ghsas.filter((id) => !accepted.has(id));
        if (ghsas.length === 0 || unacceptedIds.length > 0) found.push(`${name}:${item.severity}:${unacceptedIds.join(",") || "no-ghsa"}`);
      }
      process.stdout.write(found.join("\n"));
    '
  )"
  if [ -n "$unaccepted" ]; then
    fail "npm audit: high/critical без принятого риска: $(echo "$unaccepted" | tr '\n' ' ')"
  else
    ok "npm audit: high/critical только принятые риски (docs/decisions.md)"
  fi
else
  fail "npm audit не дал отчёта: гейт не может подтвердить отсутствие high/critical"
fi

# --- 4. CSP production-сборки ------------------------------------------------
csp=""
if [ -n "$CSP_HEADER_FILE" ]; then
  csp="$(tr -d '\r' <"$CSP_HEADER_FILE" | awk -F': ' 'tolower($1)=="content-security-policy"{print substr($0, index($0, ": ") + 2)}')"
elif [ -n "$FE_URL" ]; then
  csp="$(curl -sSI "$FE_URL/" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-security-policy"{print substr($0, index($0, ": ") + 2)}')"
fi
if [ -z "$csp" ]; then
  fail "CSP не получен: задайте FE_URL или CSP_HEADER_FILE (production-сборка обязательна)"
else
  case "$csp" in *unsafe-eval*) fail "CSP содержит unsafe-eval (INV-010)";; esac
  case "$csp" in *"frame-ancestors 'none'"*) ok "CSP: frame-ancestors 'none'";; *) fail "CSP без frame-ancestors 'none'";; esac
  case "$csp" in *"script-src"*) ok "CSP: script-src задан";; *) fail "CSP без script-src";; esac
fi

if [ "$FAIL" -ne 0 ]; then
  echo "SECURITY GATE FAILED" >&2
  exit 1
fi
echo "SECURITY GATE PASSED"
