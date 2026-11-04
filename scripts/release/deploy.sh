#!/usr/bin/env sh
# deploy.sh — воспроизводимый релиз NOVA CRM: staging → приёмка → production.
#
# Порядок (NFR9, NFR18):
#  1) проверка чистого дерева и неизменяемого тега версии;
#  2) forward-only миграции Supabase (откат миграций запрещён);
#  3) выкат staging и product smoke на staging;
#  4) переключение production на тот же тег;
#  5) запись в журнал релизов с хронометражем.
#
# Откат: `deploy.sh --rollback` переключает production на предыдущий неизменяемый тег
# одной командой. Миграции не откатываются: схема forward-only, несовместимость
# предотвращается расширяющими миграциями.
#
# DRY_RUN=1 печатает шаги без внешних вызовов — используется тестом deploy.test.sh.
set -eu

ROOT="${DEPLOY_ROOT:-$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)}"
JOURNAL="${RELEASE_JOURNAL:-$ROOT/docs/releases.md}"
VERSION="${VERSION:-}"
PREVIOUS_TAG="${PREVIOUS_TAG:-}"
DRY_RUN="${DRY_RUN:-0}"
MODE="deploy"
[ "${1:-}" = "--rollback" ] && MODE="rollback"

MIGRATE_CMD="${MIGRATE_CMD:-npx supabase db push --linked}"
STAGING_CMD="${STAGING_CMD:-vercel deploy --prebuilt --env=staging}"
SMOKE_CMD="${SMOKE_CMD:-bash scripts/smoke/product-smoke.sh}"
PROD_CMD="${PROD_CMD:-vercel deploy --prebuilt --prod}"
ROLLBACK_CMD="${ROLLBACK_CMD:-vercel rollback}"

started=$(date +%s)
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
step() { echo "==> $*"; }
run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "DRY-RUN: $*"
    return 0
  fi
  ( cd "$ROOT" && sh -c "$*" )
}

ensure_journal() {
  if [ ! -f "$JOURNAL" ]; then
    mkdir -p "$(dirname "$JOURNAL")"
    printf '# Журнал релизов NOVA CRM\n\n| Время UTC | Версия | Действие | Предыдущий тег | Длительность, с | Итог |\n|---|---|---|---|---|---|\n' >"$JOURNAL"
    echo "INFO: создан журнал релизов $JOURNAL"
  fi
}

require_version() {
  if [ -z "$VERSION" ] && [ "$DRY_RUN" != "1" ]; then
    echo "FAIL: не задан VERSION — релиз без неизменяемого тега запрещён" >&2
    exit 1
  fi
  [ -n "$VERSION" ] || VERSION="v0.0.0-dry-run"
}

write_journal() {
  action="$1"
  result="$2"
  duration="$3"
  ensure_journal
  printf '| %s | %s | %s | %s | %s | %s |\n' "$(now)" "$VERSION" "$action" "${PREVIOUS_TAG:-—}" "$duration" "$result" >>"$JOURNAL"
}

finish() {
  elapsed=$(( $(date +%s) - started ))
  echo "Хронометраж ${MODE}: ${elapsed} с (лимит 900 с)"
  if [ "$elapsed" -gt 900 ]; then
    echo "FAIL: ${MODE} превысил 15 минут (NFR9/NFR18)" >&2
    exit 1
  fi
}

if [ "$MODE" = "rollback" ]; then
  require_version
  if [ -z "$PREVIOUS_TAG" ]; then
    echo "FAIL: для отката нужен PREVIOUS_TAG (неизменяемый тег, не ветка)" >&2
    exit 1
  fi
  step "откат production на $PREVIOUS_TAG"
  run "$ROLLBACK_CMD $PREVIOUS_TAG"
  step "smoke после отката"
  run "$SMOKE_CMD"
  elapsed=$(( $(date +%s) - started ))
  write_journal "rollback на $PREVIOUS_TAG" "OK" "$elapsed"
  finish
  exit 0
fi

require_version

step "проверка чистого дерева"
if [ "$DRY_RUN" != "1" ] && [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
  echo "FAIL: рабочее дерево грязное — релиз только из тега" >&2
  exit 1
fi
run "git tag -f $VERSION"
run "git push origin $VERSION"

step "миграции forward-only"
run "$MIGRATE_CMD"

step "выкат staging"
run "$STAGING_CMD"

step "product smoke на staging"
run "$SMOKE_CMD"

step "переключение production"
run "$PROD_CMD"

elapsed=$(( $(date +%s) - started ))
write_journal "deploy $VERSION" "OK" "$elapsed"
echo "Релиз $VERSION выкачен, запись в журнале: $JOURNAL"
finish
