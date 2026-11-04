#!/usr/bin/env sh
# deploy.test.sh — проверка сценария релиза и отката A14.4 без внешних вызовов.
#
# DRY_RUN=1 прогоняет тот же код, что и настоящий деплой, но не трогает git/Vercel/Supabase.
# Тест проверяет: запись в журнал, неизменяемый предыдущий тег при откате, хронометраж
# в пределах 15 минут и отказ при отсутствии предыдущего тега.
set -eu

TESTS_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
DEPLOY="$TESTS_DIR/deploy.sh"
ROOT="$(CDPATH='' cd -- "$TESTS_DIR/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM
JOURNAL="$TMP/releases.md"

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
    echo "FAIL: $description (ожидалось '$expected', получено '$actual')" >&2
    failed=$((failed + 1))
  fi
}

run_deploy() {
  set +e
  DEPLOY_ROOT="$ROOT" RELEASE_JOURNAL="$JOURNAL" DRY_RUN=1 VERSION="$1" PREVIOUS_TAG="$2" \
    sh "$DEPLOY" >/dev/null 2>&1
  code=$?
  set -e
  echo "$code"
}

check 'deploy проходит' 0 "$(run_deploy v1.2.3 v1.2.2)"
check 'журнал создан' yes "$([ -f "$JOURNAL" ] && echo yes || echo no)"
check 'deploy записан в журнал' yes "$(grep -q 'deploy v1.2.3' "$JOURNAL" && echo yes || echo no)"
check 'предыдущий тег записан' yes "$(grep -q 'v1.2.2' "$JOURNAL" && echo yes || echo no)"
check 'хронометраж записан' yes "$(grep -Eq '\| [0-9]+ \| OK \|' "$JOURNAL" && echo yes || echo no)"

set +e
DEPLOY_ROOT="$ROOT" RELEASE_JOURNAL="$JOURNAL" DRY_RUN=1 VERSION="v1.2.2" PREVIOUS_TAG="v1.2.1" \
  sh "$DEPLOY" --rollback >/dev/null 2>&1
rollback_code=$?
set -e
check 'rollback проходит' 0 "$rollback_code"
check 'rollback записан в журнал' yes "$(grep -q 'rollback на v1.2.1' "$JOURNAL" && echo yes || echo no)"

set +e
DEPLOY_ROOT="$ROOT" RELEASE_JOURNAL="$JOURNAL" DRY_RUN=1 VERSION="v1.2.4" PREVIOUS_TAG="" \
  sh "$DEPLOY" --rollback >/dev/null 2>&1
missing_tag_code=$?
set -e
check 'rollback без предыдущего тега отклонён' 1 "$missing_tag_code"

durations_ok="yes"
while IFS='|' read -r _ _ _ _ _ duration _; do
  trimmed="$(echo "$duration" | tr -d ' ')"
  case "$trimmed" in
    ''|*[!0-9]*) continue ;;
  esac
  [ "$trimmed" -le 900 ] || durations_ok="no"
done <"$JOURNAL"
check 'все хронометражи ≤ 900 с' yes "$durations_ok"

echo
if [ "$failed" -ne 0 ]; then
  echo "deploy: $failed проверок провалено" >&2
  exit 1
fi
echo "deploy: все $pass проверок пройдены"
