#!/usr/bin/env bash
# Самолокализующийся запуск: работает и в репозитории фабрики, и в <project>/witness-done/.
# ROOT — корень фабрики (там, где лежит этот файл); PROJECT_ROOT — проект, в который она установлена.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PARENT="$(cd "$ROOT/.." && pwd)"
VER="$(tr -d '[:space:]' < "$ROOT/VERSION" 2>/dev/null || echo '?')"

echo "=== Witness Done v$VER ==="
echo "Фабрика (ROOT): $ROOT"
# Раскладка определяется по наличию OUTPUT/, а не по имени папки: имя не контракт.
if [[ -d "$ROOT/OUTPUT" ]]; then
  echo "Проект:         $PARENT"
  echo "Раскладка:      $ROOT/OUTPUT/  ← артефакты прогона"
else
  echo "Режим:          репозиторий фабрики (OUTPUT ещё не создан)"
  echo "При установке:  <project>/witness-done/OUTPUT/  ← артефакты прогона"
fi
echo
echo "1) Проверка канона:  bash \"$ROOT/validate.sh\""
echo "2) Заполни INPUT/TECH_SPEC.md (образец: TEMPLATES/examples/TECH_SPEC.demo.md)"
echo "3) Вход в проект:    node \"$ROOT/SEED/sp-tools/sp.mjs\" status → intake → next"
echo "4) В Cursor вставь ORCHESTRATOR.md (волны A→B→C→C4/10b)"
echo "5) При NEEDS_HUMAN → INPUT/ANSWERS.md → «ANSWERS готовы — продолжай»"
echo

if [[ -f "$ROOT/validate.sh" ]]; then
  bash "$ROOT/validate.sh" || true
fi
