#!/bin/sh
# @acceptance A13.3 — проверка свежести бэкапа и WAL-архива.
#
# Тест доказывает поведение `backup-check.sh` на временных каталогах: свежие точки — 0,
# устаревшие или отсутствующие — 1. Реальное учение восстановления описано в
# `docs/runbooks/backup-restore.md` и использует тот же контракт кодов возврата.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CHECK="$SCRIPT_DIR/backup-check.sh"

assert_eq() {
  expected=$1
  actual=$2
  label=$3
  if [ "$expected" != "$actual" ]; then
    echo "FAIL: $label: ожидалось $expected, получено $actual" >&2
    exit 1
  fi
  echo "ok: $label"
}

assert_contains() {
  haystack=$1
  needle=$2
  label=$3
  case "$haystack" in
    *"$needle"*) echo "ok: $label" ;;
    *)
      echo "FAIL: $label: нет «$needle» в выводе" >&2
      exit 1
      ;;
  esac
}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/backup" "$WORK/wal"

# Свежие точки: оба каталога только что получили файл.
: >"$WORK/backup/nova-$(date +%Y%m%d).dump"
: >"$WORK/wal/000000010000000000000001"
if output=$(BACKUP_DIR="$WORK/backup" WAL_ARCHIVE_DIR="$WORK/wal" sh "$CHECK" 2>&1); then
  rc=0
else
  rc=$?
fi
assert_eq 0 "$rc" "свежие backup и wal проходят"
assert_contains "$output" "backup: последняя точка" "печатает возраст backup"
assert_contains "$output" "wal: последняя точка" "печатает возраст wal"

# Устаревший backup: изолированный каталог, файл тронули 30 часов назад при пороге 24 часа.
mkdir -p "$WORK/backup-old"
touch -d '30 hours ago' "$WORK/backup-old/nova-old.dump"
if output=$(BACKUP_DIR="$WORK/backup-old" WAL_ARCHIVE_DIR="$WORK/wal" sh "$CHECK" 2>&1); then
  rc=0
else
  rc=$?
fi
assert_eq 1 "$rc" "устаревший backup даёт код 1"
assert_contains "$output" "точка устарела" "объясняет причину отказа"

# Устаревший WAL при свежем backup: отдельный каталог WAL.
mkdir -p "$WORK/wal-old"
touch -d '2 hours ago' "$WORK/wal-old/000000010000000000000002"
if output=$(BACKUP_DIR="$WORK/backup" WAL_ARCHIVE_DIR="$WORK/wal-old" sh "$CHECK" 2>&1); then
  rc=0
else
  rc=$?
fi
assert_eq 1 "$rc" "устаревший wal даёт код 1"

# Отсутствующий каталог — провал, а не «нечего проверять».
rm -rf "$WORK/wal"
if output=$(BACKUP_DIR="$WORK/backup" WAL_ARCHIVE_DIR="$WORK/wal" sh "$CHECK" 2>&1); then
  rc=0
else
  rc=$?
fi
assert_eq 1 "$rc" "отсутствующий каталог wal даёт код 1"
assert_contains "$output" "нет ни одной точки" "сообщает об отсутствии точек"

echo "backup-check: все проверки пройдены"
