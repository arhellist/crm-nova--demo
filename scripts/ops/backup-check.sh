#!/bin/sh
# Проверка свежести резервных копий и WAL-архива (D13, NFR8).
#
# Инварианты:
#  - скрипт ничего не создаёт и не меняет: только читает каталоги из env;
#  - код возврата 0 — есть точка не старше порога, 1 — точки нет или она устарела;
#  - печатает возраст последней точки в секундах и её ISO-время, без путей с секретами;
#  - порог задаётся в часах: BACKUP_MAX_AGE_HOURS (по умолчанию 24),
#    WAL_MAX_AGE_HOURS (по умолчанию 1); параметры только из окружения;
#  - отсутствие каталога — это провал проверки, а не «нет данных, значит ок».
set -eu

: "${BACKUP_DIR:?BACKUP_DIR не задан}"
: "${WAL_ARCHIVE_DIR:?WAL_ARCHIVE_DIR не задан}"

BACKUP_MAX_AGE_HOURS=${BACKUP_MAX_AGE_HOURS:-24}
WAL_MAX_AGE_HOURS=${WAL_MAX_AGE_HOURS:-1}

# Метка времени самого свежего файла в каталоге; пусто — файлов нет.
newest_mtime() {
  directory=$1
  [ -d "$directory" ] || return 1
  # GNU coreutils: секунды epoch для каждого файла, затем максимум.
  find "$directory" -type f -exec stat -c '%Y' {} + 2>/dev/null | sort -nr | head -n 1
}

iso_utc() {
  date -u -d "@$1" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -r "$1" '+%Y-%m-%dT%H:%M:%SZ'
}

check_point() {
  label=$1
  directory=$2
  max_hours=$3
  now=$4

  timestamp=$(newest_mtime "$directory") || timestamp=""
  if [ -z "$timestamp" ]; then
    echo "$label: нет ни одной точки в $directory" >&2
    return 1
  fi
  max_seconds=$((max_hours * 3600))
  age=$((now - timestamp))
  [ "$age" -lt 0 ] && age=0
  echo "$label: последняя точка $(iso_utc "$timestamp"), возраст ${age} с (порог ${max_seconds} с)" >&2
  if [ "$age" -gt "$max_seconds" ]; then
    echo "$label: точка устарела" >&2
    return 1
  fi
  return 0
}

now=$(date +%s)
status=0
check_point "backup" "$BACKUP_DIR" "$BACKUP_MAX_AGE_HOURS" "$now" || status=1
check_point "wal" "$WAL_ARCHIVE_DIR" "$WAL_MAX_AGE_HOURS" "$now" || status=1
exit "$status"
