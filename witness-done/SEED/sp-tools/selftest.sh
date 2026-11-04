#!/usr/bin/env bash
# Самопроверка sp.mjs на одноразовых фикстурах. Репозиторий не трогает.
# Запуск: bash SEED/sp-tools/selftest.sh   (из корня фабрики)
# Код возврата: 0 — все проверки прошли, 1 — есть провал.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI="$ROOT/SEED/sp-tools/sp.mjs"
VERIFY="$ROOT/SEED/sp-tools/sp-verify.mjs"
RETRIEVE="$ROOT/SEED/sp-tools/sp-retrieve.mjs"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/sp-selftest.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
ERR=0

ok() { echo "  OK   $*"; }
bad() { echo "  FAIL $*"; ERR=1; }

# expect <код> <описание> <команда...>
expect() {
  local want="$1" what="$2"
  shift 2
  "$@" >/dev/null 2>&1
  local got=$?
  if [[ "$got" -eq "$want" ]]; then
    ok "$what (exit $got)"
  else
    bad "$what: ожидали exit $want, получили $got"
  fi
}

# new_project <имя> — пустой проект с установленной фабрикой
new_project() {
  local name="$1"
  rm -rf "$TMP/$name"
  mkdir -p "$TMP/$name/witness-done/OUTPUT"
  cp -r "$ROOT/SEED" "$ROOT/TEMPLATES" "$ROOT/INPUT" "$ROOT/ORCHESTRATOR.md" "$ROOT/VERSION" "$TMP/$name/witness-done/"
  cp "$ROOT/AGENTS.md" "$TMP/$name/AGENTS.md"
}

# start_run <проект> <MODE> <шаг> — паспорт прогона из шаблона
start_run() {
  local dir="$1" mode="$2" step="$3"
  sed -e "s/^| MODE | greenfield \\\\| brownfield |/| MODE | $mode |/" \
      -e "s/^| last_completed_step | — |/| last_completed_step | $step |/" \
      -e "s/^| Профиль |.*/| Профиль | web-app |/" \
      "$ROOT/TEMPLATES/manifest.md" > "$dir/witness-done/OUTPUT/MANIFEST.md"
}

# bind_tests_from_prompt <проект> <D> — тестовый файл, где каждая фраза объявлена тестом.
# С v1.27 pre_ci проверяет связь «фраза ACCEPTANCE ↔ тест» (DEC-027), поэтому фикстурам нужен
# не пустой файл, а тесты с аннотацией @acceptance и утверждением.
bind_tests_from_prompt() {
  local proj="$1" d="$2" prompt testrel
  prompt="$(ls "$proj/witness-done/OUTPUT/prompts/${d}"*.md 2>/dev/null | head -1)"
  [[ -n "$prompt" ]] || { bad "bind_tests_from_prompt: нет промпта $d"; return 1; }
  mkdir -p "$proj/tests"
  testrel="tests/${d}_acceptance.test.ts"
  {
    echo "// Тесты приёмки ${d}: фраза объявлена аннотацией, утверждение обязательно."
    grep -oE '\bA[0-9]+\.[0-9]+\b' "$prompt" | sort -u | while read -r id; do
      echo "it('${id} — фраза приёмки', () => {"
      echo "  const actual = runCase('${id}');"
      echo "  // @acceptance ${id}"
      echo "  expect(actual).toBe('ok');"
      echo "});"
    done
  } > "$proj/$testrel"
  python3 - "$prompt" "$testrel" <<'PYBIND'
import sys
p, rel = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
if rel not in s:
    s = s.replace('## PRODUCES', '## PRODUCES\n\n- ' + rel, 1)
    open(p, 'w', encoding='utf-8').write(s)
PYBIND
}

echo "=== selftest sp.mjs ==="

# 1. Пустой проект → new, маршрут установки
P="$TMP/p1"
new_project p1
expect 0 "status без MANIFEST" node "$CLI" status --root "$P"
node "$CLI" intake "Сделай сервис заметок" --root "$P" > "$TMP/p1.out" 2>&1
if grep -q 'kind: new' "$TMP/p1.out" && grep -q 'PIPELINE/00_bootstrap.md' "$TMP/p1.out"; then
  ok "классификация new → маршрут 00"
else
  bad "классификация new: $(cat "$TMP/p1.out")"
fi
if grep -q '^next: PIPELINE/00_bootstrap.md' "$P/journal/intake/"*.md 2>/dev/null; then
  ok "в записи входа есть next:"
else
  bad "в записи входа нет next:"
fi

# 2. Адаптеры: sync → check → drift → check 2 → sync → 0
expect 0 "rules --sync" node "$CLI" rules --sync --root "$P"
expect 0 "rules --check после sync" node "$CLI" rules --check --root "$P"
[[ -f "$P/.cursorrules" && -f "$P/CLAUDE.md" && -f "$P/.cursor/rules/witness-done.mdc" ]] \
  && ok "адаптеры созданы" || bad "адаптеры не созданы"
echo "правка" >> "$P/AGENTS.md"
expect 2 "rules --check ловит дрейф" node "$CLI" rules --check --root "$P"
expect 0 "повторный sync" node "$CLI" rules --sync --root "$P"
expect 0 "rules --check снова чист" node "$CLI" rules --check --root "$P"
touch "$P/.rules"
expect 2 "rules --check видит запрещённый .rules" node "$CLI" rules --check --root "$P"
rm -f "$P/.rules"

# 3. Начатый прогон: question / неоднозначность / task
P2="$TMP/p2"
new_project p2
start_run "$P2" greenfield 04
node "$CLI" intake "Можно ли хранить сессии в Redis?" --root "$P2" > "$TMP/q.out" 2>&1
grep -q 'kind: question' "$TMP/q.out" && ok "классификация question" || bad "ожидали question: $(cat "$TMP/q.out")"
expect 3 "неоднозначный вопрос → exit 3" node "$CLI" intake "Добавь Redis?" --root "$P2"
node "$CLI" intake "Добавь кнопку экспорта" --root "$P2" > "$TMP/t.out" 2>&1
grep -q 'kind: task' "$TMP/t.out" && ok "классификация task (greenfield)" || bad "ожидали task: $(cat "$TMP/t.out")"

# 4. Brownfield с активным change → change
P3="$TMP/p3"
new_project p3
start_run "$P3" brownfield R01
mkdir -p "$P3/spec-state/changes/add-avatar"
node "$CLI" intake "Поменяй формат аватара" --root "$P3" > "$TMP/c.out" 2>&1
grep -q 'kind: change' "$TMP/c.out" && ok "классификация change (активный change)" || bad "ожидали change: $(cat "$TMP/c.out")"
# DEC-031: вопрос не становится change-пакетом, даже если change уже открыт
node "$CLI" intake "Почему аватар грузится медленно?" --root "$P3" > "$TMP/cq.out" 2>&1
grep -q 'kind: question' "$TMP/cq.out" && ok "1.30: вопрос при активном change остаётся question (DEC-031)" \
  || bad "вопрос уехал в change: $(cat "$TMP/cq.out")"
rm -rf "$P3/spec-state/changes/add-avatar"
node "$CLI" intake "Поменяй формат аватара" --root "$P3" > "$TMP/c2.out" 2>&1
grep -q 'kind: change' "$TMP/c2.out" && ok "классификация change (brownfield)" || bad "ожидали change: $(cat "$TMP/c2.out")"

# 5. decide / close
P4="$TMP/p4"
new_project p4
start_run "$P4" greenfield 04
node "$CLI" intake "Можно ли хранить сессии в Redis?" --root "$P4" >/dev/null 2>&1
ID=$(ls "$P4/journal/intake" | grep -v gitkeep | sed 's/\.md$//')
expect 0 "decide создаёт журнал" node "$CLI" decide "Сессии в Redis" --intake "$ID" --root "$P4"
DECFILE=$(ls "$P4/journal/decisions" | grep '^DEC-001' | head -1)
[[ -n "$DECFILE" ]] && ok "DEC-001 отдельным файлом в journal/decisions/" || bad "DEC-001 не найден"
grep -q 'DEC-001' "$P4/journal/decisions.md" && ok "индекс decisions.md собран" || bad "индекс пуст"
expect 2 "close с несуществующим DEC" node "$CLI" close "$ID" --ref DEC-009 --root "$P4"
expect 2 "close с незаполненным решением" node "$CLI" close "$ID" --ref DEC-001 --root "$P4"
# заполняем блоки решения — без этого close не пропускает (шаблон не считается доказательством)
python3 - "$P4/journal/decisions/$DECFILE" <<'FILL'
import sys
p = sys.argv[1]
t = open(p, encoding='utf-8').read()
t = t.replace('**Контекст.** Что вынудило выбирать и какие ограничения нельзя обойти.',
              '**Контекст.** Сессии живут дольше процесса; нужен общий store.')
t = t.replace('**Альтернативы.** Что отвергли и почему. Если альтернатив нет — так и написать.',
              '**Альтернативы.** Файлы на диске и память процесса — не переживают рестарт.')
t = t.replace('**Чем подтверждено.** `Axx.k`, тест, артефакт, раздел спецификации. Решение без подтверждения\nне закрывает intake.',
              '**Чем подтверждено.** A01.2, тест session-store.test.ts.')
open(p, 'w', encoding='utf-8').write(t)
FILL
expect 0 "close с DEC-001" node "$CLI" close "$ID" --ref DEC-001 --root "$P4"
grep -q 'статус | closed' "$P4/journal/intake/$ID.md" \
  && ok "запись входа закрыта" || bad "запись входа не закрыта"
# журнал должен быть в проекте (коммитится), а не внутри witness-done/
[[ -d "$P4/journal" && ! -d "$P4/witness-done/OUTPUT/intake" ]] \
  && ok "журнал в корне проекта: journal/" || bad "журнал не там: $(ls -d "$P4"/*/ 2>/dev/null | tr '\n' ' ')"
node "$CLI" rules --sync --root "$P4" >/dev/null 2>&1
expect 0 "doctor --strict после полного цикла" node "$CLI" doctor --strict --root "$P4"

# 6. doctor: done без evidence, дубль ORCHESTRATOR, чистый прогон
P5="$TMP/p5"
new_project p5
start_run "$P5" greenfield 04
node "$CLI" rules --sync --root "$P5" >/dev/null 2>&1
expect 0 "doctor на чистом прогоне" node "$CLI" doctor --root "$P5"
mkdir -p "$P5/witness-done/OUTPUT/roadmaps"
printf '| D | Статус |\n|---|---|\n| D01 | done |\n' > "$P5/witness-done/OUTPUT/roadmaps/progress.md"
expect 2 "doctor: done без evidence" node "$CLI" doctor --root "$P5"
cp "$P5/witness-done/ORCHESTRATOR.md" "$P5/witness-done/OUTPUT/ORCHESTRATOR.md"
node "$CLI" doctor --root "$P5" > "$TMP/d.out" 2>&1
grep -q 'должен быть один' "$TMP/d.out" \
  && ok "doctor: дубль ORCHESTRATOR.md" || bad "doctor не увидел дубль ORCHESTRATOR.md"
rm -f "$P5/witness-done/OUTPUT/ORCHESTRATOR.md"

# 7. doctor: DEC-ссылка без записи в журнале
P6="$TMP/p6"
new_project p6
start_run "$P6" greenfield 04
node "$CLI" rules --sync --root "$P6" >/dev/null 2>&1
node "$CLI" intake "Можно ли X?" --root "$P6" >/dev/null 2>&1
I6=$(ls "$P6/journal/intake" | grep -v gitkeep | sed 's/\.md$//')
sed -i.bak "s/^| связано | — |/| связано | DEC-777 |/" "$P6/journal/intake/$I6.md"
rm -f "$P6/journal/intake/$I6.md.bak"
expect 2 "doctor: DEC-777 без записи" node "$CLI" doctor --root "$P6"

# 7b. journal: один файл на решение, дубли, индекс, migrate
expect 0 "journal --list" node "$CLI" journal --list --root "$P4"
cp "$P4/journal/decisions/$DECFILE" "$P4/journal/decisions/DEC-001-copy.md"
expect 2 "journal --check: дубль DEC-001" node "$CLI" journal --check --root "$P4"
rm -f "$P4/journal/decisions/DEC-001-copy.md"
expect 0 "journal --check после удаления дубля" node "$CLI" journal --check --root "$P4"
expect 0 "journal --index" node "$CLI" journal --index --root "$P4"
grep -q 'DEC-001' "$P4/journal/decisions.md" && ok "индекс пересобран" || bad "индекс пуст после --index"

# migrate: старый журнал в OUTPUT/ переезжает в journal/
P8="$TMP/p8"
new_project p8
start_run "$P8" greenfield 04
mkdir -p "$P8/witness-done/OUTPUT/intake" "$P8/witness-done/OUTPUT/docs"
printf '# INTAKE 20260101-0000-old\n\n| Поле | Значение |\n|------|----------|\n| kind | change |\n| статус | open |\n| связано | — |\n\nnext: PIPELINE/R02_propose_change.md\n' \
  > "$P8/witness-done/OUTPUT/intake/20260101-0000-old.md"
printf '# Журнал\n\n### DEC-007 — Старое решение\n\n| Поле | Значение |\n|------|----------|\n| Дата | 2026-01-01 |\n| Intake | — |\n| Статус | принято |\n\n**Решение.** так было\n' \
  > "$P8/witness-done/OUTPUT/docs/decisions.md"
expect 0 "journal --migrate" node "$CLI" journal --migrate --root "$P8"
[[ -f "$P8/journal/intake/20260101-0000-old.md" ]] && ok "intake перенесён в journal/" || bad "intake не перенесён"
grep -q 'DEC-007' "$P8/journal/decisions.md" && ok "старое решение в индексе" || bad "DEC-007 не попал в индекс"
[[ -f "$P8/journal/decisions/DEC-007-staroe-reshenie.md" ]] && ok "DEC-007 отдельным файлом" || bad "DEC-007 не разложен на файл"

# 7c. pre_ci не мягче d-prompt-quality: порог ACCEPTANCE, conflicts, out_of_produces
P9="$TMP/p9"
new_project p9
start_run "$P9" greenfield 04
mkdir -p "$P9/src/events" "$P9/witness-done/OUTPUT/prompts" "$P9/witness-done/OUTPUT/docs"
printf 'log\n' > "$P9/src/events/log.py"
printf '# Модули\n\n| id | вердикт |\n|---|---|\n| events | include |\n' > "$P9/witness-done/OUTPUT/docs/07_module_plan.md"
# Plan-to-Proof требует git: без него pre_ci для L1+ честно падает
git init -q "$P9" 2>/dev/null || true
git -C "$P9" config user.email dev@sp.test
git -C "$P9" config user.name sp
git -C "$P9" add -A >/dev/null 2>&1 && git -C "$P9" commit -qm base >/dev/null 2>&1

write_prompt() { # write_prompt <сколько Axx> <conflicts_applied|none>
  local n="$1" conflicts="$2"
  {
    echo '# D01 — журнал событий'
    echo
    echo '## VERIFICATION_TAX'
    echo
    echo '| Поле | Значение |'
    echo '|------|----------|'
    echo '| level | L1 |'
    echo
    echo '## HOW'
    echo
    echo '1. Взять события из очереди.'
    echo '2. Записать на диск и только потом уведомить подписчиков.'
    echo
    echo '## PRODUCES'
    echo
    echo '- src/events/log.py'
    echo
    echo '## FIT_CHECKS'
    echo
    echo '| Поле | Значение |'
    echo '|------|----------|'
    echo '| module | events |'
    echo '| conflicts_ref | none |'
    echo "| conflicts_applied | $conflicts |"
    echo
    echo '## ACCEPTANCE'
    echo
    echo '| ID | Фраза |'
    echo '|----|-------|'
    for i in $(seq 1 "$n"); do echo "| A01.$i | фраза $i |"; done
  } > "$P9/witness-done/OUTPUT/prompts/D01_events.md"
  bind_tests_from_prompt "$P9" D01
}

write_prompt 2 "—"
expect 2 "pre_ci: L1 с 2 Axx отвергается (порог ≥3)" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P9"

write_prompt 3 "—"
expect 0 "pre_ci: L1 с 3 Axx проходит" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P9"

# out_of_produces: посторонний файл должен попасть в акт
printf 'x\n' > "$P9/src/extra.txt"
node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P9" >/dev/null 2>&1
if grep -q 'src/extra.txt' "$P9/witness-done/OUTPUT/evidence/D01.json"; then
  ok "out_of_produces заполняется из git status"
else
  bad "out_of_produces пуст при постороннем файле"
fi
rm -f "$P9/src/extra.txt"

# conflicts: blocker из 07_conflicts.md обязан быть применён
printf '# Конфликты\n\n| id | модуль | уровень | смягчение |\n|----|--------|---------|-----------|\n| C1 | events | blocker | очередь с подтверждением |\n' \
  > "$P9/witness-done/OUTPUT/docs/07_conflicts.md"
write_prompt 3 "—"
expect 2 "pre_ci: blocker не применён → отказ" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P9"
write_prompt 3 "C1"
expect 0 "pre_ci: blocker применён → проходит" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P9"

# 7d. Акт не может устареть: чужие Axx ловятся на pre_release/self-audit
cp "$P9/witness-done/OUTPUT/evidence/D01.json" "$TMP/d01.bak"
python3 - "$P9/witness-done/OUTPUT/evidence/D01.json" <<'EDIT'
import json, sys
p = sys.argv[1]
d = json.load(open(p, encoding='utf-8'))
d['fit']['acceptance_ids'] = ['A99.1', 'A99.2', 'A99.3']
json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
EDIT
mkdir -p "$P9/witness-done/OUTPUT/roadmaps"
printf '# Прогресс\n\n| D | Статус |\n|---|---|\n| D01 | done |\n' > "$P9/witness-done/OUTPUT/roadmaps/progress.md"
node "$VERIFY" --gate pre_release --root "$P9" > "$TMP/rel.out" 2>&1
grep -q 'stale evidence' "$TMP/rel.out" && ok "pre_release: чужой акт отвергнут" || bad "pre_release не увидел чужой акт"
cp "$TMP/d01.bak" "$P9/witness-done/OUTPUT/evidence/D01.json"

# 7e. sp-retrieve: лимит чанков не поднимается флагом и заявляется в Meta пака
expect 1 "retrieve: --max-chunks 50 отвергнут" node "$RETRIEVE" --max-chunks 50 --reindex --root "$P9"
mkdir -p "$P9/witness-done/OUTPUT/context/packs"
printf '# Pack\n\n## Meta\n\n| Поле | Значение |\n|------|----------|\n| pack_id | P01 |\n| max_chunks | 50 |\n\n## Must-hit anchors\n\n- anchor\n\n| 1 | `OUTPUT/src/events/log.py` | x | yes |\n' \
  > "$P9/witness-done/OUTPUT/context/packs/P01.md"
expect 2 "retrieve: Meta max_chunks 50 → fail" node "$RETRIEVE" --d D01 --pack P01 --validate --root "$P9"

# 7f. doctor: Intake в proposal.md должен существовать
mkdir -p "$P9/spec-state/changes/add-x"
printf '# Change\n\n| Поле | Значение |\n|------|----------|\n| Intake | 20200101-0000-net-takogo |\n' \
  > "$P9/spec-state/changes/add-x/proposal.md"
node "$CLI" rules --sync --root "$P9" >/dev/null 2>&1
node "$CLI" doctor --root "$P9" > "$TMP/doc.out" 2>&1
grep -q 'не найден в journal/intake' "$TMP/doc.out" && ok "doctor: битый Intake в proposal.md" || bad "doctor не увидел битый Intake"

# 7g. 1.18: акт опечатан, review для L2+ обязателен, подмена ловится без транскрипта
P10="$TMP/p10"
new_project p10
start_run "$P10" greenfield 04
mkdir -p "$P10/src/events" "$P10/witness-done/OUTPUT/prompts" "$P10/witness-done/OUTPUT/specs"
printf 'log\n' > "$P10/src/events/log.py"
printf 'paths:\n  /events:\n    post:\n' > "$P10/witness-done/OUTPUT/specs/openapi.yaml"
{
  echo '# D01 — журнал событий'
  echo
  echo '## VERIFICATION_TAX'
  echo
  echo '| Поле | Значение |'
  echo '|------|----------|'
  echo '| level | L2 |'
  echo
  echo '## HOW'
  echo
  echo '1. Взять события из очереди.'
  echo '2. Записать на диск и только потом уведомить подписчиков.'
  echo
  echo '## PRODUCES'
  echo
  echo '- src/events/log.py'
  echo
  echo '## FIT_CHECKS'
  echo
  echo '| Поле | Значение |'
  echo '|------|----------|'
  echo '| module | none |'
  echo '| conflicts_ref | none |'
  echo '| conflicts_applied | — |'
  echo '| app_contracts | POST /events |'
  echo
  echo '## ACCEPTANCE'
  echo
  echo '| ID | Фраза |'
  echo '|----|-------|'
  for i in 1 2 3 4 5 6; do echo "| A01.$i | фраза $i |"; done
} > "$P10/witness-done/OUTPUT/prompts/D01_events.md"
bind_tests_from_prompt "$P10" D01
git init -q "$P10" 2>/dev/null || true
git -C "$P10" config user.email dev@sp.test
git -C "$P10" config user.name sp
printf 'witness-done/.sp-cache/\n' > "$P10/.gitignore"
git -C "$P10" add -A >/dev/null 2>&1 && git -C "$P10" commit -qm init >/dev/null 2>&1

expect 2 "1.18: L2 без review отвергается" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P10"
grep -q '"evidence_hash"' "$P10/witness-done/OUTPUT/evidence/D01.json" \
  && ok "акт опечатан evidence_hash" || bad "в акте нет evidence_hash"
grep -q '"produces_digest"' "$P10/witness-done/OUTPUT/evidence/D01.json" \
  && ok "акт привязан к code_hash" || bad "в акте нет code_hash.produces_digest"
expect 2 "1.18: review автором акта отвергается" \
  node "$CLI" review D01 --verdict supports --reviewer dev@sp.test --root "$P10"
expect 0 "1.18: review независимым ревьюером" \
  node "$CLI" review D01 --verdict unclear --reviewer anna@sp.test --root "$P10"
expect 2 "1.18: verdict unclear не пропускает акт" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P10"
expect 0 "1.18: review supports + pre_ci" \
  bash -c "node '$CLI' review D01 --verdict supports --reviewer anna@sp.test --root '$P10' >/dev/null && node '$VERIFY' --d D01 --gate pre_ci --skip-commands --root '$P10'"

expect 0 "1.18: --verify-evidence на чистом акте" \
  node "$VERIFY" --verify-evidence OUTPUT/evidence/D01.json --root "$P10"
python3 - "$P10/witness-done/OUTPUT/evidence/D01.json" <<'TAMPER'
import json, sys
p = sys.argv[1]
d = json.load(open(p, encoding='utf-8'))
d['fit']['acceptance_ids'] = list(d['fit']['acceptance_ids']) + ['A01.7']
json.dump(d, open(p, 'w', encoding='utf-8'), indent=2)
TAMPER
expect 2 "1.18: --verify-evidence ловит подмену" \
  node "$VERIFY" --verify-evidence OUTPUT/evidence/D01.json --root "$P10"

expect 0 "1.18: пересоздание акта" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P10"
printf 'log v2\n' > "$P10/src/events/log.py"
expect 2 "1.18: правка кода обесценивает review" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P10"

# 7h. 1.19: глобальные инварианты — селектор по module+уровню, ссылка по ID, waiver со сроком
P11="$TMP/p11"
new_project p11
start_run "$P11" greenfield 04
mkdir -p "$P11/src/events" "$P11/witness-done/OUTPUT/prompts" "$P11/witness-done/OUTPUT/docs" "$P11/witness-done/OUTPUT/specs"
printf 'log\n' > "$P11/src/events/log.py"
printf 'paths:\n  /events:\n    post:\n' > "$P11/witness-done/OUTPUT/specs/openapi.yaml"
printf '| id | вердикт |\n|---|---|\n| events | include |\n' > "$P11/witness-done/OUTPUT/docs/07_module_plan.md"
git init -q "$P11" 2>/dev/null || true
git -C "$P11" config user.email dev@sp.test
git -C "$P11" config user.name sp
git -C "$P11" add -A >/dev/null 2>&1 && git -C "$P11" commit -qm base >/dev/null 2>&1
cat > "$P11/witness-done/OUTPUT/docs/project-invariants.md" <<'INV'
# Инварианты

### INV-001 — Деньги в минорных единицах

| Поле | Значение |
|------|----------|
| Область | module:events |
| Уровни | L2+ |
| Проверка | Целые минорные единицы |
| Waiver | — |
INV

write_inv_prompt() { # write_inv_prompt <level> <строка INVARIANTS> <extra FIT_CHECKS>
  {
    echo '# D01 — журнал событий'
    echo
    echo '## VERIFICATION_TAX'
    echo
    echo '| Поле | Значение |'
    echo '|------|----------|'
    echo "| level | $1 |"
    echo
    echo '## HOW'
    echo
    echo '1. Взять события из очереди.'
    echo '2. Записать на диск и только потом уведомить подписчиков.'
    echo
    echo '## INVARIANTS'
    echo
    echo "$2"
    echo
    echo '## PRODUCES'
    echo
    echo '- src/events/log.py'
    echo
    echo '## FIT_CHECKS'
    echo
    echo '| Поле | Значение |'
    echo '|------|----------|'
    echo '| module | events |'
    echo '| conflicts_ref | none |'
    echo '| conflicts_applied | — |'
    echo '| app_contracts | POST /events |'
    [ -n "${3:-}" ] && echo "| invariants_skip | $3 |"
    echo
    echo '## ACCEPTANCE'
    echo
    echo '| ID | Фраза |'
    echo '|----|-------|'
    for i in 1 2 3 4 5 6; do echo "| A01.$i | фраза $i |"; done
  } > "$P11/witness-done/OUTPUT/prompts/D01_events.md"
  bind_tests_from_prompt "$P11" D01
}

write_inv_prompt L2 "- тратить только целые"
expect 2 "1.19: инвариант без ссылки по ID → отказ" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P11"
pass_inv() { # pass_inv <описание> — L2 проходит только вместе с review
  node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P11" >/dev/null 2>&1
  node "$CLI" review D01 --verdict supports --reviewer anna@sp.test --root "$P11" >/dev/null 2>&1
  expect 0 "$1" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P11"
}

write_inv_prompt L2 "- INV-001: только целые"
pass_inv "1.19: инвариант упомянут по ID → проходит"
write_inv_prompt L1 "- тратить только целые"
expect 0 "1.19: L1 не попадает под L2+ инвариант" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P11"
write_inv_prompt L2 "- INV-999: чужое правило"
expect 2 "1.19: висячая ссылка INV-999 → отказ" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P11"
sed -i.bak 's/| Waiver | — |/| Waiver | причина: legacy; до: 2020-01-01 |/' "$P11/witness-done/OUTPUT/docs/project-invariants.md"
rm -f "$P11/witness-done/OUTPUT/docs/project-invariants.md.bak"
write_inv_prompt L2 "- тратить только целые"
expect 2 "1.19: просроченный waiver → отказ" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P11"
write_inv_prompt L2 "- тратить только целые" "каталог к задаче не относится"
pass_inv "1.19: invariants_skip с причиной → проходит"

# 7i. 1.19: Lite-режим и spec-packet
P12="$TMP/p12"
new_project p12
start_run "$P12" greenfield 04
mkdir -p "$P12/witness-done/OUTPUT/roadmaps" "$P12/witness-done/OUTPUT/evidence"
printf '| D | Статус |\n|---|---|\n| D01 | done |\n' > "$P12/witness-done/OUTPUT/roadmaps/progress.md"
# Акт пишется через seal: с v1.24 self-audit проверяет печать акта, а не только tax_pass.
node --input-type=module -e "
import fs from 'node:fs';
import { seal } from '$ROOT/SEED/sp-tools/evidence-lib.mjs';
const data = { d: 'D01', level: 'L0', gate: 'pre_ci', tax_pass: true, fit: { acceptance_ids: [] }, timestamp: '2026-01-01T00:00:00Z' };
fs.writeFileSync('$P12/witness-done/OUTPUT/evidence/D01.json', JSON.stringify(seal('$P12', data), null, 2));
"
SP_LITE=1 node "$CLI" status --root "$P12" > "$TMP/lite.out" 2>&1
grep -q 'Режим: LITE' "$TMP/lite.out" && ok "1.19: status печатает LITE по SP_LITE=1" || bad "status без LITE: $(cat "$TMP/lite.out")"
sed -i.bak 's/^| Режим прогона | full |/| Режим прогона | lite |/' "$P12/witness-done/OUTPUT/MANIFEST.md"
rm -f "$P12/witness-done/OUTPUT/MANIFEST.md.bak"
grep -q 'Режим прогона | lite' "$P12/witness-done/OUTPUT/MANIFEST.md" && ok "1.19: MANIFEST знает режим lite" || bad "MANIFEST без режима lite"
expect 0 "1.19: lite self-audit без coverage-matrix" node "$VERIFY" --gate self-audit --root "$P12"
sed -i.bak 's/^| Режим прогона | lite |/| Режим прогона | full |/' "$P12/witness-done/OUTPUT/MANIFEST.md"
rm -f "$P12/witness-done/OUTPUT/MANIFEST.md.bak"
expect 2 "1.19: full self-audit требует coverage-matrix" node "$VERIFY" --gate self-audit --root "$P12"

node "$CLI" intake "Добавь кнопку экспорта" --kind task --root "$P12" > "$TMP/packet.out" 2>&1
PACKET=$(ls "$P12/journal/intake" | grep -- '-packet.md$' | head -1)
[[ -n "$PACKET" ]] && ok "1.19: intake --kind task пишет spec-packet" || bad "spec-packet не создан"
PID="${PACKET%-packet.md}"
expect 2 "1.19: незаполненный spec-packet не проходит" node "$VERIFY" --gate spec-packet --intake "$PID" --root "$P12"
python3 - "$P12/journal/intake/$PACKET" <<'FILLPACKET'
import sys
p = sys.argv[1]
t = open(p, encoding='utf-8').read()
t = t.replace('## Цель\n\n—', '## Цель\n\nКнопка экспорта отчёта в CSV.')
t = t.replace('- —', '- Не делаем PDF и email-доставку', 1)
t = t.replace('| A01.1 | — |', '| A01.1 | Кнопка видна |')
t = t.replace('| A01.2 | — |', '| A01.2 | Файл скачивается |')
t = t.replace('| A01.3 | — |', '| A01.3 | Пустой отчёт даёт заголовок |')
t = t.replace('## Evidence\n\n- —', '## Evidence\n\n- tests/export.test.ts')
open(p, 'w', encoding='utf-8').write(t)
FILLPACKET
expect 0 "1.19: заполненный spec-packet проходит" node "$VERIFY" --gate spec-packet --intake "$PID" --root "$P12"
expect 0 "1.19: journal --check видит пару intake+packet" node "$CLI" journal --check --root "$P12"
expect 0 "1.19: feedback --lite" node "$CLI" feedback --lite --root "$P12"
[[ -f "$P12/witness-done/OUTPUT/docs/feedback-lite.md" ]] && ok "1.19: feedback-lite.md записан" || bad "feedback-lite.md не создан"

# 7j. 1.20: Plan-to-Proof — proof_debt входит в tax_pass
P13="$TMP/p13"
new_project p13
start_run "$P13" greenfield 04
mkdir -p "$P13/src/events" "$P13/witness-done/OUTPUT/prompts"
printf 'log\n' > "$P13/src/events/log.py"
in_plan_prompt() { # in_plan_prompt <PRODUCES|многострочно>
  {
    echo '# D01 — журнал событий'
    echo
    echo '## VERIFICATION_TAX'
    echo
    echo '| Поле | Значение |'
    echo '|------|----------|'
    echo '| level | L1 |'
    echo
    echo '## HOW'
    echo
    echo '1. Взять события из очереди.'
    echo '2. Записать на диск.'
    echo
    echo '## PRODUCES'
    echo
    printf '%s\n' "$1"
    echo
    echo '## FIT_CHECKS'
    echo
    echo '| Поле | Значение |'
    echo '|------|----------|'
    echo '| module | none |'
    echo '| conflicts_ref | none |'
    echo '| conflicts_applied | — |'
    echo '| app_contracts | — |'
    echo
    echo '## ACCEPTANCE'
    echo
    echo '| ID | Фраза |'
    echo '|----|-------|'
    echo '| A01.1 | раз |'
    echo '| A01.2 | два |'
    echo '| A01.3 | три |'
  } > "$P13/witness-done/OUTPUT/prompts/D01_events.md"
  bind_tests_from_prompt "$P13" D01
}
in_plan_prompt '- src/events/log.py'
expect 2 "1.20: без git pre_ci для L1 падает, а не молчит" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P13"
grep -q 'plan:' "$P13/witness-done/OUTPUT/evidence/D01.json" && ok "1.20: причина в акте (plan.note)" || bad "в акте нет plan.note"
# акт, написанный вне git, не должен попасть в базовый коммит: иначе он «изменён после коммита»
rm -rf "$P13/witness-done/OUTPUT/evidence"

git init -q "$P13" 2>/dev/null || true
git -C "$P13" config user.email dev@sp.test
git -C "$P13" config user.name sp
git -C "$P13" add -A >/dev/null 2>&1 && git -C "$P13" commit -qm base >/dev/null 2>&1
expect 0 "1.20: чистое дерево не даёт proof_debt" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P13"
printf 'x\n' > "$P13/src/extra.py"
expect 2 "1.20: незаявленный файл = proof_debt" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P13"
rm -f "$P13/src/extra.py"
mkdir -p "$P13/src/events/sub" && printf 'y\n' > "$P13/src/events/sub/y.py"
in_plan_prompt '- src/events/**'
expect 0 "1.20: glob в PRODUCES покрывает вложенный файл" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P13"
# glob раскрывается в файлы: подмена содержимого под glob меняет produces_digest
expect 0 "1.20: чистый акт проходит --verify-evidence" node "$VERIFY" --verify-evidence OUTPUT/evidence/D01.json --root "$P13"
printf 'z\n' > "$P13/src/events/log.py"
expect 2 "1.20: правка файла под glob ломает печать акта" node "$VERIFY" --verify-evidence OUTPUT/evidence/D01.json --root "$P13"
printf 'log\n' > "$P13/src/events/log.py"
expect 0 "1.20: возврат файла восстанавливает печать" node "$VERIFY" --verify-evidence OUTPUT/evidence/D01.json --root "$P13"
git -C "$P13" add -A >/dev/null 2>&1 && git -C "$P13" commit -qm "accept D01" >/dev/null 2>&1
expect 0 "1.20: коммит акта не обнуляет печать (git-якорь)" node "$VERIFY" --verify-evidence OUTPUT/evidence/D01.json --root "$P13"
rm -rf "$P13/src/events/sub"
printf 'q\n' > "$P13/src/events/sub_extra.py"
expect 0 "1.20: файл под glob не попадает в out_of_produces" \
  bash -c "node '$VERIFY' --d D01 --gate pre_ci --skip-commands --root '$P13' >/dev/null 2>&1; python3 -c \"import json,sys; d=json.load(open('$P13/witness-done/OUTPUT/evidence/D01.json')); sys.exit(0 if d['fit']['out_of_produces']==[] else 1)\""
rm -f "$P13/src/events/sub_extra.py"

# 7k. 1.20: runtime trace для L3 — форма и целостность
P14="$TMP/p14"
new_project p14
start_run "$P14" greenfield 04
mkdir -p "$P14/src/pay" "$P14/witness-done/OUTPUT/prompts" "$P14/witness-done/OUTPUT/specs" "$P14/witness-done/OUTPUT/evidence"
printf 'pay\n' > "$P14/src/pay/charge.py"
printf 'paths:\n  /charge:\n    post:\n' > "$P14/witness-done/OUTPUT/specs/openapi.yaml"
{
  echo '# D01 — оплата'
  echo
  echo '## VERIFICATION_TAX'
  echo
  echo '| Поле | Значение |'
  echo '|------|----------|'
  echo '| level | L3 |'
  echo
  echo 'GATE: human confirm before coding'
  echo
  echo '## HOW'
  echo
  echo '1. Принять запрос.'
  echo '2. Списать и записать.'
  echo
  echo '## PRODUCES'
  echo
  echo '- src/pay/charge.py'
  echo
  echo '## FIT_CHECKS'
  echo
  echo '| Поле | Значение |'
  echo '|------|----------|'
  echo '| module | none |'
  echo '| conflicts_ref | none |'
  echo '| conflicts_applied | — |'
  echo '| app_contracts | POST /charge |'
  echo '| runtime_trace_required | yes |'
  echo
  echo '## ACCEPTANCE'
  echo
  echo '| ID | Фраза |'
  echo '|----|-------|'
  for i in 1 2 3 4 5 6; do echo "| A01.$i | фраза $i |"; done
} > "$P14/witness-done/OUTPUT/prompts/D01_pay.md"
bind_tests_from_prompt "$P14" D01
git init -q "$P14" 2>/dev/null || true
git -C "$P14" config user.email dev@sp.test
git -C "$P14" config user.name sp
git -C "$P14" add -A >/dev/null 2>&1 && git -C "$P14" commit -qm base >/dev/null 2>&1

expect 2 "1.20: L3 без trace отвергается" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P14"
printf '{"status":"ok"}' > "$P14/witness-done/OUTPUT/evidence/api.json"
printf 'log line\n' > "$P14/witness-done/OUTPUT/evidence/console.txt"
# Трейс привязывается к коду: commit и code_hash обязательны (DEC-019)
HEAD14="$(git -C "$P14" rev-parse HEAD)"
DIGEST14="$(node -e "
import('$ROOT/SEED/sp-tools/evidence-lib.mjs').then(m => {
  const fs = require('node:fs');
  const ev = JSON.parse(fs.readFileSync('$P14/witness-done/OUTPUT/evidence/D01.json', 'utf8'));
  const h = m.codeHash('$P14', ev.fit.produces);
  process.stdout.write(h.produces_digest);
});")"
cat > "$P14/witness-done/OUTPUT/evidence/D01.trace.json" <<TRACE
{"d":"D01","captured_at":"2026-10-28T12:00:00Z","source":"preview run","commit":"$HEAD14","code_hash":{"produces_digest":"$DIGEST14"},"entries":[{"type":"api_response","ref":"evidence/api.json"},{"type":"console_log","ref":"evidence/console.txt"}]}
TRACE
node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P14" >/dev/null 2>&1
node "$CLI" review D01 --verdict supports --reviewer anna@sp.test --root "$P14" >/dev/null 2>&1
expect 0 "1.20: L3 с валидным trace и review проходит" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P14"
# Трейс без привязки к коммиту — не доказательство: форму проверять недостаточно
python3 - "$P14/witness-done/OUTPUT/evidence/D01.trace.json" "$HEAD14" <<'TRACEUNBIND'
import json, sys
p, head = sys.argv[1], sys.argv[2]
d = json.load(open(p, encoding='utf-8'))
d['commit'] = 'deadbee'
json.dump(d, open(p, 'w', encoding='utf-8'), indent=2)
TRACEUNBIND
node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P14" > "$TMP/unbind.out" 2>&1
grep -q 'трейс от другого кода' "$TMP/unbind.out" && ok "1.20: трейс от другого коммита отвергается" || bad "commit в трейсе не проверяется"
python3 - "$P14/witness-done/OUTPUT/evidence/D01.trace.json" "$HEAD14" <<'TRACEREBIND'
import json, sys
p, head = sys.argv[1], sys.argv[2]
d = json.load(open(p, encoding='utf-8'))
d['commit'] = head
json.dump(d, open(p, 'w', encoding='utf-8'), indent=2)
TRACEREBIND
python3 - "$P14/witness-done/OUTPUT/evidence/D01.trace.json" <<'TRACENOHASH'
import json, sys
p = sys.argv[1]
d = json.load(open(p, encoding='utf-8'))
d.pop('code_hash', None)
json.dump(d, open(p, 'w', encoding='utf-8'), indent=2)
TRACENOHASH
node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P14" > "$TMP/nohash.out" 2>&1
grep -q 'code_hash отсутствует' "$TMP/nohash.out" && ok "1.20: трейс без code_hash отвергается" || bad "code_hash в трейсе не требуется"
python3 - "$P14/witness-done/OUTPUT/evidence/D01.trace.json" "$DIGEST14" <<'TRACEREHASH'
import json, sys
p, digest = sys.argv[1], sys.argv[2]
d = json.load(open(p, encoding='utf-8'))
d['code_hash'] = {'produces_digest': digest}
json.dump(d, open(p, 'w', encoding='utf-8'), indent=2)
TRACEREHASH
node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P14" >/dev/null 2>&1
node "$CLI" review D01 --verdict supports --reviewer anna@sp.test --root "$P14" >/dev/null 2>&1
expect 0 "1.20: трейс с commit и code_hash принят" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P14"
expect 0 "1.20: --verify-evidence видит trace_hash" node "$VERIFY" --verify-evidence OUTPUT/evidence/D01.json --root "$P14"
python3 - "$P14/witness-done/OUTPUT/evidence/D01.trace.json" <<'TRACETAMPER'
import json, sys
p = sys.argv[1]
d = json.load(open(p, encoding='utf-8'))
d['entries'].append({'type': 'screenshot', 'ref': 'evidence/console.txt'})
json.dump(d, open(p, 'w', encoding='utf-8'), indent=2)
TRACETAMPER
expect 2 "1.20: трейс подменён после приёмки — акт недействителен" node "$VERIFY" --verify-evidence OUTPUT/evidence/D01.json --root "$P14"

# 7l. 1.21: фрагменты прогресса, doctor --team, approval L3, coverage_confidence
P15="$TMP/p15"
new_project p15
start_run "$P15" greenfield 04
mkdir -p "$P15/src" "$P15/tests" "$P15/witness-done/OUTPUT/prompts" "$P15/witness-done/OUTPUT/roadmaps/progress.d"
printf 'v1\n' > "$P15/src/a.py"
printf 'A01.1 A01.2 A01.3\n' > "$P15/tests/test_a.py"
{
  echo '# D01 — A'
  echo
  echo '## VERIFICATION_TAX'
  echo
  echo '| Поле | Значение |'
  echo '|------|----------|'
  echo '| level | L1 |'
  echo
  echo '## HOW'
  echo
  echo '1. a'
  echo '2. b'
  echo
  echo '## PRODUCES'
  echo
  echo '- src/a.py'
  echo
  echo '## FIT_CHECKS'
  echo
  echo '| Поле | Значение |'
  echo '|------|----------|'
  echo '| module | none |'
  echo '| conflicts_ref | none |'
  echo '| conflicts_applied | — |'
  echo '| app_contracts | — |'
  echo
  echo '## ACCEPTANCE'
  echo
  echo '| ID | Фраза |'
  echo '|----|-------|'
  echo '| A01.1 | раз |'
  echo '| A01.2 | два |'
  echo '| A01.3 | три |'
} > "$P15/witness-done/OUTPUT/prompts/D01_a.md"
bind_tests_from_prompt "$P15" D01
git init -q "$P15" 2>/dev/null || true
git -C "$P15" config user.email dev@sp.test
git -C "$P15" config user.name sp
git -C "$P15" add -A >/dev/null 2>&1 && git -C "$P15" commit -qm base >/dev/null 2>&1
printf 'v2\n' > "$P15/src/a.py"
expect 0 "1.21: pre_ci для будущего акта" node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P15"

cat > "$P15/witness-done/OUTPUT/roadmaps/progress.md" <<'PROG'
# Progress

| D | Кратко | split_group | Статус | evidence_ref | Доказательства | Обновлено | Заметки |
|---|---|---|---|---|---|---|---|
| D01 | a | — | in_progress | — | — | 2026-10-01 | — |

## Сводка

Итого: 0 done.
PROG
cat > "$P15/witness-done/OUTPUT/roadmaps/progress.d/D01.md" <<'FRAG'
# D01

| Поле | Значение |
|------|----------|
| updated_at | 2026-10-28T12:00:00Z |

| D | Кратко | split_group | Статус | evidence_ref | Доказательства | Обновлено | Заметки |
|---|---|---|---|---|---|---|---|
| D01 | a | — | done | evidence/D01.json | tests/test_a.py | 2026-10-28 | ок |
FRAG
expect 2 "1.21: progress --check видит расхождение" node "$CLI" progress --check --root "$P15"
expect 0 "1.21: progress --merge собирает progress.md" node "$CLI" progress --merge --root "$P15"
expect 0 "1.21: progress --check после сборки" node "$CLI" progress --check --root "$P15"
# фантомный done без фрагмента внутри таблицы — расхождение, а не «ручная правка»
python3 - "$P15/witness-done/OUTPUT/roadmaps/progress.md" <<'PHANTOM'
import sys
p = sys.argv[1]
lines = open(p, encoding='utf-8').read().split('\n')
i = next(k for k, l in enumerate(lines) if l.startswith('| D01 |'))
lines.insert(i + 1, '| D99 | phantom | — | done | evidence/D99.json | — | 2026-10-01 | — |')
open(p, 'w', encoding='utf-8').write('\n'.join(lines))
PHANTOM
expect 2 "1.21: progress --check ловит строку без фрагмента" node "$CLI" progress --check --root "$P15"
node "$CLI" progress --merge --root "$P15" >/dev/null 2>&1
expect 0 "1.21: merge убирает фантомную строку" node "$CLI" progress --check --root "$P15"
cp "$P15/witness-done/OUTPUT/roadmaps/progress.d/D01.md" "$P15/witness-done/OUTPUT/roadmaps/progress.d/D01-dup.md"
expect 2 "1.21: дубль D в фрагментах отвергается" node "$CLI" progress --merge --root "$P15"
rm -f "$P15/witness-done/OUTPUT/roadmaps/progress.d/D01-dup.md"

node "$CLI" rules --sync --root "$P15" >/dev/null 2>&1
expect 0 "1.21: doctor --team на согласованном прогрессе" node "$CLI" doctor --team --root "$P15"
sed -i.bak 's/| evidence\/D01.json |/| — |/' "$P15/witness-done/OUTPUT/roadmaps/progress.d/D01.md"
rm -f "$P15/witness-done/OUTPUT/roadmaps/progress.d/D01.md.bak"
node "$CLI" progress --merge --root "$P15" >/dev/null 2>&1
node "$CLI" doctor --team --root "$P15" > "$TMP/team.out" 2>&1
grep -q 'done без evidence_ref' "$TMP/team.out" && ok "1.21: doctor --team требует evidence_ref" || bad "doctor --team не увидел отсутствие evidence_ref"
cp "$P15/witness-done/OUTPUT/roadmaps/progress.d/D01.md" "$TMP/frag.bak"
python3 - "$P15/witness-done/OUTPUT/roadmaps/progress.d/D01.md" <<'REFBACK'
import sys
p = sys.argv[1]
t = open(p, encoding='utf-8').read().replace('| — | — | 2026-10-28 |', '| evidence/D01.json | — | 2026-10-28 |')
open(p, 'w', encoding='utf-8').write(t)
REFBACK
node "$CLI" progress --merge --root "$P15" >/dev/null 2>&1

# approval для L3 в пакете изменения
mkdir -p "$P15/spec-state/changes/add-pay"
printf '# Change\n\n| Поле | Значение |\n|------|----------|\n| level | L3 |\n\n## Backwards Compatibility\n\nNo impact: новый эндпоинт.\n' \
  > "$P15/spec-state/changes/add-pay/proposal.md"
printf -- '- [x] task\n' > "$P15/spec-state/changes/add-pay/tasks.md"
node "$VERIFY" --change add-pay --gate change --skip-commands --root "$P15" > "$TMP/ch.out" 2>&1
grep -q 'L3 requires approval.json' "$TMP/ch.out" && ok "1.21: L3 без approval.json отвергается" || bad "approval не требуется для L3"
printf '{"approved_by":"dev@sp.test","role":"cto","timestamp":"2026-10-28T10:00:00Z","evidence_refs":["evidence/D01.json"]}' \
  > "$P15/spec-state/changes/add-pay/approval.json"
node "$VERIFY" --change add-pay --gate change --skip-commands --root "$P15" > "$TMP/ch2.out" 2>&1
grep -q 'approved_by совпадает с автором' "$TMP/ch2.out" && ok "1.21: approval от автора изменения отвергается" || bad "approval автора прошёл"

# approval от другого человека пропускает L3-изменение (полный пакет изменения)
mkdir -p "$P15/spec-state/baseline/core" "$P15/spec-state/changes/add-pay/specs"
printf '# Base\n\n### Requirement: Old\n\nThe system MUST exist.\n' > "$P15/spec-state/baseline/core/spec.md"
cat > "$P15/spec-state/changes/add-pay/specs/core.md" <<'SPEC'
## ADDED Requirements

### Requirement: Pay

The system MUST pay.

#### Scenario: ok
- GIVEN a
- WHEN b
- THEN c

#### Scenario: negative
- GIVEN a
- WHEN b
- THEN c
SPEC
printf '{"approved_by":"anna@sp.test","role":"cto","timestamp":"2026-10-28T10:00:00Z","evidence_refs":["evidence/D01.json"]}' \
  > "$P15/spec-state/changes/add-pay/approval.json"
expect 0 "1.21: approval от другого человека пропускает L3" node "$VERIFY" --change add-pay --gate change --skip-commands --root "$P15"

# coverage_confidence в RELEASE.json и feedback.md
printf '| Requirement | D |\n|---|---|\n| R1 | D01 |\n' > "$P15/witness-done/OUTPUT/roadmaps/coverage-matrix.md"
# Акт, снятый с --skip-commands, релиз не принимает: пересоздаём его с реально выполненными
# командами (lint/typecheck/test = true), иначе проверяем не релиз, а shortcut.
mkdir -p "$P15/witness-done/OUTPUT/tooling"
printf '# Verify commands\n\n- lint: `true`\n- typecheck: `true`\n- test: `true`\n' > "$P15/witness-done/OUTPUT/tooling/verify-commands.md"
node "$VERIFY" --d D01 --gate pre_ci --root "$P15" >/dev/null 2>&1
# Контур 3: релиз с runtime-кодом требует смоук-прогон (DEC-021) и метки Axx в нём (DEC-020)
expect 2 "1.21: pre_release без product-smoke не проходит" node "$VERIFY" --gate pre_release --root "$P15"
mkdir -p "$P15/witness-done/OUTPUT/docs/runbooks" "$P15/scripts/smoke"
printf '# Product smoke\n\nA1 health: GET /health → 200\n' > "$P15/witness-done/OUTPUT/docs/runbooks/product-smoke.md"
printf '#!/usr/bin/env bash\nset -e\necho "A01.1: A=200"\n' > "$P15/scripts/smoke/product-smoke.sh"
expect 0 "1.21: product-smoke с меткой Axx проходит" node "$VERIFY" --gate product-smoke --skip-commands --root "$P15"
python3 - "$P15/witness-done/OUTPUT/evidence/RELEASE-product-smoke.json" <<'SMOKEACT'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
assert d['runtime']['labels'] == ['A01.1'], d.get('runtime')
assert d['code_hash'].get('git_tree') or d['code_hash'].get('produces_digest'), d['code_hash']
SMOKEACT
[[ $? -eq 0 ]] && ok "1.21: акт смоука несёт метки Axx и привязку к дереву" || bad "акт смоука без атрибуции"
printf '#!/usr/bin/env bash\nset -e\necho "smoke ok"\n' > "$P15/scripts/smoke/product-smoke.sh"
node "$VERIFY" --gate product-smoke --skip-commands --root "$P15" > "$TMP/nolabel.out" 2>&1
grep -q 'не помечает проверки номерами Axx' "$TMP/nolabel.out" && ok "1.21: смоук без меток Axx отвергается" || bad "смоук без меток прошёл"
printf '#!/usr/bin/env bash\nset -e\necho "A01.1: A=200"\n' > "$P15/scripts/smoke/product-smoke.sh"
# Смоук исполняется по-настоящему: акт без исполнения (--skip-commands) релиз не принимает.
node "$VERIFY" --gate product-smoke --root "$P15" >/dev/null 2>&1
expect 0 "1.21: pre_release проходит на согласованном проекте" node "$VERIFY" --gate pre_release --root "$P15"
python3 - "$P15/witness-done/OUTPUT/evidence/RELEASE.json" <<'CONF'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
c = d.get('coverage_confidence') or {}
assert d.get('tax_pass') is True, d.get('issues')
assert c.get('value') == 1, c          # L1 без L3: веса перераспределены, полное покрытие = 1
assert 'residual_risk' in c, c
print(c['value'])
CONF
[[ $? -eq 0 ]] && ok "1.21: coverage_confidence в RELEASE.json (полное покрытие = 1)" || bad "coverage_confidence неверен"

# подмена акта после приёмки: pre_release обязан её увидеть, а не «не найти акт»
cp "$P15/witness-done/OUTPUT/evidence/D01.json" "$TMP/d01.bak"
python3 - "$P15/witness-done/OUTPUT/evidence/D01.json" <<'EVTAMPER'
import sys
p = sys.argv[1]
t = open(p, encoding='utf-8').read()
open(p, 'w', encoding='utf-8').write(t.replace('"tax_pass": true', '"tax_pass": false', 1))
EVTAMPER
node "$VERIFY" --gate pre_release --root "$P15" > "$TMP/tamper.out" 2>&1
grep -q 'evidence_hash не совпадает' "$TMP/tamper.out" \
  && ok "1.21: pre_release ловит подмену акта" || bad "pre_release не увидел подмену: $(grep -o 'акт не найден[^\"]*' "$TMP/tamper.out" | head -1)"
expect 2 "1.21: испорченный акт не проходит pre_release" node "$VERIFY" --gate pre_release --root "$P15"
cp "$TMP/d01.bak" "$P15/witness-done/OUTPUT/evidence/D01.json"
expect 0 "1.21: sp feedback" node "$CLI" feedback --root "$P15"
grep -q 'coverage_confidence' "$P15/witness-done/OUTPUT/docs/feedback.md" \
  && ok "1.21: число дублируется в feedback.md" || bad "feedback.md без coverage_confidence"

# 7m. 1.26: ярлыки неполноты — гейт d-prompt-quality ловит MVP/PoC/v1-как-статус
P25="$TMP/p25"
new_project p25
start_run "$P25" greenfield 04
mkdir -p "$P25/src/events" "$P25/witness-done/OUTPUT/prompts"
printf 'log\n' > "$P25/src/events/log.py"

write_d25() { # write_d25 <дополнительная строка | ->
  local extra="$1"
  {
    echo '# D01 — журнал событий'
    echo
    echo '## VERIFICATION_TAX'
    echo
    echo '| Поле | Значение |'
    echo '|------|----------|'
    echo '| level | L1 |'
    echo
    echo '## HOW'
    echo
    echo '1. Взять события из очереди и присвоить монотонный seq.'
    echo '2. Записать на диск и только потом уведомить подписчиков.'
    echo
    echo '## PRODUCES'
    echo
    echo '- src/events/log.py'
    echo
    echo '## ОГРАНИЧЕНИЯ'
    echo
    echo '- Формат записи append-only, без правок прошлых строк.'
    if [[ "$extra" != "-" ]]; then echo "- $extra"; fi
    echo
    echo '## SIZE_BUDGET'
    echo
    echo '| Поле | Значение |'
    echo '|------|----------|'
    echo '| size_ok | yes |'
    echo '| delivery_slice | S1 |'
    echo '| produces_count | 1 |'
    echo '| surfaces | api |'
    echo
    echo '## CONTEXT_PACK'
    echo
    echo '| Поле | Значение |'
    echo '|------|----------|'
    echo '| pack_path | none |'
    echo '| retrieve_query | none |'
    echo
    echo '## INVARIANTS'
    echo
    echo '1. seq монотонно растёт и не переиспользуется.'
    echo '2. Запись на диск предшествует уведомлению подписчиков.'
    echo '3. Повторная доставка того же события не удваивает seq.'
    echo '4. Ошибка записи не подтверждает событие вызывающему.'
    echo '5. Журнал только дополняется, строки не переписываются.'
    echo
    echo '## ACCEPTANCE'
    echo
    echo '| ID | Фраза |'
    echo '|----|-------|'
    echo '| A01.1 | событие записано до уведомления |'
    echo '| A01.2 | seq не переиспользуется после рестарта |'
    echo '| A01.3 | сбой записи возвращает ошибку |'
  } > "$P25/witness-done/OUTPUT/prompts/D01_events.md"
}

write_d25 "-"
expect 0 "1.26: чистый D проходит d-prompt-quality" node "$VERIFY" --gate d-prompt-quality --root "$P25"

write_d25 "Это MVP журнала событий: авторизацию добавим позже."
expect 2 "1.26: «MVP» в D отвергается" node "$VERIFY" --gate d-prompt-quality --root "$P25"

write_d25 "Сделаем v1 без аудита и без идемпотентности."
expect 2 "1.26: «v1 без…» как статус отвергается" node "$VERIFY" --gate d-prompt-quality --root "$P25"

write_d25 "MVP запрещён каноном: объём — полная комплектация из IN SCOPE."
expect 0 "1.26: цитата запрета не считается ярлыком" node "$VERIFY" --gate d-prompt-quality --root "$P25"

write_d25 "Флаг beta-доступа к кабинету выдаётся по инвайту и входит в IN SCOPE."
expect 0 "1.26: beta как фича не ярлык (нет ложного срабатывания)" node "$VERIFY" --gate d-prompt-quality --root "$P25"

# 8. update: сравнение версий без сети
P7="$TMP/p7"
new_project p7
expect 3 "update --offline без кэша" node "$CLI" update --root "$P7" --offline --json
if command -v git >/dev/null 2>&1; then
  git init -q --bare "$TMP/remote7.git"
  git clone -q "$TMP/remote7.git" "$TMP/w7" 2>/dev/null || true
  ( cd "$TMP/w7" && git checkout -q -b main \
    && echo 1.99.0 > VERSION && git add -A \
    && git -c user.email=sp@test -c user.name=sp commit -qm v1.99.0 \
    && git tag v1.99.0 && git push -q origin main --tags ) >/dev/null 2>&1
  ( cd "$P7" && git init -q && git remote add origin "$TMP/remote7.git" ) >/dev/null 2>&1
  expect 2 "update: новая версия в mirror" node "$CLI" update --root "$P7"
  node "$CLI" update --root "$P7" > "$TMP/u.out" 2>&1
  if grep -q 'доступно обновление' "$TMP/u.out" && grep -q 'git -C' "$TMP/u.out"; then
    ok "update печатает шаги обновления"
  else
    bad "update не напечатал шаги: $(cat "$TMP/u.out")"
  fi
  if [[ -f "$P7/witness-done/.sp-cache/update.json" ]] && grep -q '1.99.0' "$P7/witness-done/.sp-cache/update.json"; then
    ok "update пишет кэш .sp-cache/update.json"
  else
    bad "update не записал кэш"
  fi
  expect 2 "update: повторный вызов из кэша" node "$CLI" update --root "$P7"
  node "$CLI" status --root "$P7" > "$TMP/st.out" 2>&1
  LV="$(cat "$P7/witness-done/VERSION")"
  grep -q "Версия фабрики: $LV (обновление: $LV → 1.99.0" "$TMP/st.out" \
    && ok "status показывает версию и обновление" || bad "status без строки обновления: $(grep -i версия "$TMP/st.out")"
  # ложное «актуально» недопустимо: локальная версия выше удалённой тоже current
  echo 2.0.0 > "$P7/witness-done/VERSION"
  expect 0 "update: локально новее удалённого" node "$CLI" update --root "$P7" --no-cache
  rm -rf "$P7/witness-done/.sp-cache"
  expect 3 "update: нет конфига" bash -c "rm -f '$P7/witness-done/SEED/update.json' && node '$CLI' update --root '$P7' --no-cache"
fi

# 9. doctor в корне канона: проверяется канон, а не прогон
C="$TMP/canon"
rm -rf "$C"
mkdir -p "$C/OUTPUT"
cp -r "$ROOT/SEED" "$ROOT/TEMPLATES" "$ROOT/PIPELINE" "$ROOT/catalogs" "$ROOT/INPUT" \
      "$ROOT/ORCHESTRATOR.md" "$ROOT/VERSION" "$ROOT/AGENTS.md" "$C/"
touch "$C/OUTPUT/.gitkeep"
expect 2 "canon: doctor без адаптеров" node "$CLI" doctor --strict --root "$C" --factory "$C"
node "$CLI" rules --sync --root "$C" --factory "$C" >/dev/null 2>&1
expect 0 "canon: doctor --strict после rules --sync" node "$CLI" doctor --strict --root "$C" --factory "$C"
touch "$C/OUTPUT/MANIFEST.md"
expect 2 "canon: артефакт в OUTPUT" node "$CLI" doctor --strict --root "$C" --factory "$C"
rm -f "$C/OUTPUT/MANIFEST.md"
expect 2 "canon: rules --check ловит рассинхрон" bash -c "printf 'правка\n' >> '$C/.cursorrules' && node '$CLI' rules --check --root '$C' --factory '$C'"

# 10. План рантайма: подъём, верификация по фразам, teardown, автотрейс
P16="$TMP/p16"
new_project p16
start_run "$P16" greenfield 08
mkdir -p "$P16/witness-done/OUTPUT/evidence" "$P16/witness-done/OUTPUT/runtime" "$P16/src"
printf 'v1\n' > "$P16/src/a.py"
cat > "$P16/witness-done/OUTPUT/evidence/D03.json" <<'ACT16'
{"d":"D03","gate":"pre_ci","level":"L1","tax_pass":true,"fit":{"acceptance_ids":["A03.1"],"produces":["src/a.py"]}}
ACT16
git -C "$P16" init -q
git -C "$P16" -c user.email=sp@test -c user.name=sp add -A
git -C "$P16" -c user.email=sp@test -c user.name=sp commit -qm init

write_plan() {
  cat > "$P16/witness-done/OUTPUT/runtime/runtime-plan.json"
}
write_plan <<'PLAN16'
{
  "version": 1,
  "stack": ["node"],
  "up": [{ "id": "noop", "cmd": "true", "ready": { "type": "cmd", "cmd": "true", "timeout_s": 5 } }],
  "seed": [{ "id": "fixtures", "cmd": "true", "idempotent": true }],
  "down": [{ "cmd": "true" }],
  "verify": [{ "acceptance": "A03.1", "cmd": "true", "expect_exit": 0 }]
}
PLAN16

expect 0 "1.23: --gate runtime-plan (статика) проходит" node "$VERIFY" --gate runtime-plan --skip-commands --root "$P16"
EXEC16="$TMP/rt-exec.json"
node "$VERIFY" --gate runtime --root "$P16" > "$EXEC16" 2>&1
[[ $? -eq 0 ]] && ok "1.23: --gate runtime исполняет план (exit 0)" || bad "исполнение плана провалилось: $(head -c 400 "$EXEC16")"
python3 - "$P16/witness-done/OUTPUT/evidence/RELEASE-runtime-verify.json" <<'ACTRT'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
assert d['tax_pass'] is True, d
assert d['executed'] is not False, d
assert d['verify'][0]['acceptance'] == 'A03.1' and d['verify'][0]['ok'], d['verify']
assert d['down'], 'teardown не выполнен'
assert d['plan_hash'], 'plan_hash отсутствует'
ACTRT
[[ $? -eq 0 ]] && ok "1.23: акт runtime несёт per-acceptance результат и teardown" || bad "акт runtime неполон"

python3 - "$P16" <<'AUTOTRACE'
import json, subprocess, sys
root = sys.argv[1]
t = json.load(open(root + '/witness-done/OUTPUT/evidence/D03.trace.json', encoding='utf-8'))
head = subprocess.run(['git', '-C', root, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
assert t['d'] == 'D03', t
assert t['commit'] == head, (t['commit'], head)
assert t['code_hash'].get('produces_digest'), t['code_hash']
assert t['produced_by']['gate'] == 'runtime' and t['produced_by']['plan_hash'], t['produced_by']
assert t['entries'] and t['entries'][0]['sha256'], t['entries']
AUTOTRACE
[[ $? -eq 0 ]] && ok "1.23: фабрика порождает трейс с commit, code_hash и plan_hash" || bad "автотрейс негоден"

# Фраза принята, но план её не покрывает — провал: рантайм не подтверждает принятое
write_plan <<'PLANUNCOV'
{
  "version": 1,
  "stack": ["node"],
  "up": [{ "id": "noop", "cmd": "true", "ready": { "type": "cmd", "cmd": "true", "timeout_s": 5 } }],
  "down": [{ "cmd": "true" }],
  "verify": [{ "acceptance": "A09.1", "cmd": "true" }]
}
PLANUNCOV
node "$VERIFY" --gate runtime-plan --skip-commands --root "$P16" > "$TMP/uncov.out" 2>&1
grep -q 'не покрывает принятые фразы' "$TMP/uncov.out" && ok "1.23: непокрытая принятая фраза — провал" || bad "полнота покрытия не проверяется"

# N/A без причины и отсутствие teardown — не план, а отписка
write_plan <<'PLANNA'
{
  "version": 1,
  "stack": ["node"],
  "up": [{ "id": "noop", "cmd": "true", "ready": { "type": "cmd", "cmd": "true", "timeout_s": 5 } }],
  "down": [{ "cmd": "true" }],
  "verify": [{ "acceptance": "A03.1", "na": "не успели" }]
}
PLANNA
node "$VERIFY" --gate runtime-plan --skip-commands --root "$P16" > "$TMP/na.out" 2>&1
grep -q 'N/A без reason' "$TMP/na.out" && ok "1.23: N/A без причины отвергается" || bad "N/A без reason прошёл"

write_plan <<'PLANDOWN'
{
  "version": 1,
  "stack": ["node"],
  "up": [{ "id": "noop", "cmd": "true", "ready": { "type": "cmd", "cmd": "true", "timeout_s": 5 } }],
  "verify": [{ "acceptance": "A03.1", "cmd": "true" }]
}
PLANDOWN
node "$VERIFY" --gate runtime-plan --skip-commands --root "$P16" > "$TMP/down.out" 2>&1
grep -q 'down пуст' "$TMP/down.out" && ok "1.23: план без teardown отвергается" || bad "план без down прошёл"

write_plan <<'PLANPH'
{
  "version": 1,
  "stack": ["node"],
  "up": [{ "id": "api", "cmd": "npm run dev --port {{PORT}}", "ready": { "type": "http", "url": "http://localhost:{{PORT}}/health", "timeout_s": 30 } }],
  "down": [{ "cmd": "true" }],
  "verify": [{ "acceptance": "A03.1", "cmd": "bash scripts/smoke/{{SCRIPT}}" }]
}
PLANPH
node "$VERIFY" --gate runtime-plan --skip-commands --root "$P16" > "$TMP/ph.out" 2>&1
grep -q 'заглушка' "$TMP/ph.out" && ok "1.23: заглушки шаблона отвергаются" || bad "плейсхолдер прошёл"

# pre_release: план есть, исполнения не было — релиз не проходит
write_plan <<'PLANOK'
{
  "version": 1,
  "stack": ["node"],
  "up": [{ "id": "noop", "cmd": "true", "ready": { "type": "cmd", "cmd": "true", "timeout_s": 5 } }],
  "down": [{ "cmd": "true" }],
  "verify": [{ "acceptance": "A03.1", "cmd": "true" }]
}
PLANOK
rm -f "$P16/witness-done/OUTPUT/evidence/RELEASE-runtime-verify.json"
node "$VERIFY" --gate pre_release --root "$P16" > "$TMP/prt.out" 2>&1
grep -q 'план есть, верификация в рантайме не прогонялась' "$TMP/prt.out" && ok "1.23: pre_release требует исполненный план" || bad "pre_release пропустил неисполненный план"

# 10. 1.24: гейты не пропускают неразобранное (fail-closed)
P24="$TMP/p24"
new_project p24
start_run "$P24" greenfield 10b
mkdir -p "$P24/src" "$P24/tests" "$P24/scripts/smoke" "$P24/witness-done/OUTPUT/prompts" \
  "$P24/witness-done/OUTPUT/specs" "$P24/witness-done/OUTPUT/roadmaps" "$P24/witness-done/OUTPUT/tooling" \
  "$P24/witness-done/OUTPUT/docs/runbooks"
printf 'export const a = 1;\n' > "$P24/src/index.ts"
printf 'A01.1 A01.2 A01.3 A01.4 A01.5 A01.6\n' > "$P24/tests/a.test.ts"
cat > "$P24/witness-done/OUTPUT/specs/openapi.yaml" <<'OA'
openapi: 3.0.0
paths:
  /orders:
    post:
      summary: create
  /users:
    get:
      summary: list
OA
# Три команды через бэктики на разных строках: до 1.24 загрузчик склеивал строки и исполнял мусор.
printf '# Verify\n\n- lint: `true`\n- typecheck: `true`\n- test: `true`\n' > "$P24/witness-done/OUTPUT/tooling/verify-commands.md"
cat > "$P24/witness-done/OUTPUT/prompts/D01.md" <<'P24D01'
# D01 — заказы

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| level | L2 |
| module | none |
| app_contracts | POST /orders |

## PRODUCES

- `src/**/*.ts`

## ACCEPTANCE

A01.1 A01.2 A01.3 A01.4 A01.5 A01.6

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L2 |
P24D01
bind_tests_from_prompt "$P24" D01
git init -q "$P24" 2>/dev/null || true
git -C "$P24" config user.email dev@sp.test
git -C "$P24" config user.name sp
git -C "$P24" add -A >/dev/null 2>&1 && git -C "$P24" commit -qm base >/dev/null 2>&1

node "$VERIFY" --d D01 --gate pre_ci --root "$P24" > "$TMP/p24rev.out" 2>&1
grep -q 'Review fail' "$TMP/p24rev.out" && ok "1.24: L2 без review не принимается" || bad "L2 прошёл без review"
node "$CLI" review D01 --verdict supports --reviewer anna@sp.test --root "$P24" >/dev/null 2>&1
expect 0 "1.24: glob **/ совпадает с файлом в корне каталога" node "$VERIFY" --d D01 --gate pre_ci --root "$P24"
node --input-type=module -e "
import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync('$P24/witness-done/OUTPUT/evidence/D01.json', 'utf8'));
if (!j.code_hash.produces.includes('src/index.ts')) { console.error('нет src/index.ts в code_hash'); process.exit(1); }
if (j.commands.map((c) => c.cmd).join(',') !== 'true,true,true') { console.error('команды: ' + JSON.stringify(j.commands)); process.exit(1); }
" >/dev/null 2>&1 && ok "1.24: code_hash видит файл из glob, verify-commands загружен по строкам" \
  || bad "glob не покрыл файл или verify-commands склеил строки"

# метод и путь сверяются вместе: GET /orders нет в контракте (есть POST /orders и GET /users)
sed -i.bak 's/| app_contracts | POST \/orders |/| app_contracts | GET \/orders |/' "$P24/witness-done/OUTPUT/prompts/D01.md"
rm -f "$P24/witness-done/OUTPUT/prompts/D01.md.bak"
node "$VERIFY" --d D01 --gate pre_ci --root "$P24" > "$TMP/p24api.out" 2>&1
grep -q 'контракт не содержит GET /orders' "$TMP/p24api.out" && ok "1.24: app_contracts сверяет пару метод-путь" || bad "чужой метод прошёл"
sed -i.bak 's/| app_contracts | GET \/orders |/| app_contracts | POST \/orders |/' "$P24/witness-done/OUTPUT/prompts/D01.md"
rm -f "$P24/witness-done/OUTPUT/prompts/D01.md.bak"

# review без code_hash — не привязан к коду
cp "$P24/witness-done/OUTPUT/evidence/D01.review.json" "$TMP/rev.bak"
python3 - "$P24/witness-done/OUTPUT/evidence/D01.review.json" <<'NOREVHASH'
import json, sys
p = sys.argv[1]
d = json.load(open(p, encoding='utf-8'))
d.pop('code_hash', None)
json.dump(d, open(p, 'w', encoding='utf-8'), indent=2)
NOREVHASH
node "$VERIFY" --d D01 --gate pre_ci --root "$P24" > "$TMP/norevh.out" 2>&1
grep -q 'review без code_hash' "$TMP/norevh.out" && ok "1.24: review без привязки к коду отвергается" || bad "review без code_hash прошёл"
cp "$TMP/rev.bak" "$P24/witness-done/OUTPUT/evidence/D01.review.json"

# conflicts_ref не указан — это «конфликтов нет», а не ошибка
node "$VERIFY" --d D01 --gate pre_ci --root "$P24" > "$TMP/noconf.out" 2>&1
grep -q 'conflicts_ref set but conflicts_applied' "$TMP/noconf.out" && bad "пустой conflicts_ref дал ложный провал" \
  || ok "1.24: отсутствие conflicts_ref не ломает pre_ci"

# зависитмость с дефисом всё равно проверяется (диапазон разворачивается в D09 и D10)
printf '| D | Кратко | split_group | Статус | evidence_ref | Доказательства | Обновлено | Заметки |\n|---|---|---|---|---|---|---|---|\n| D09 | API | — | in_progress | — | — | — | — |\n| D10 | UI | — | not_started | — | — | — | — |\n' \
  > "$P24/witness-done/OUTPUT/roadmaps/progress.md"
sed -i.bak 's/| module | none |/| module | none |\n| depends_done | D09-D10 |/' "$P24/witness-done/OUTPUT/prompts/D01.md"
rm -f "$P24/witness-done/OUTPUT/prompts/D01.md.bak"
node "$VERIFY" --d D01 --gate pre_ci --root "$P24" > "$TMP/deps.out" 2>&1
grep -q 'Depends: D09, D10' "$TMP/deps.out" && ok "1.24: depends_done с дефисом не обходит проверку" || bad "зависимость с дефисом пропущена"
sed -i.bak '/| depends_done | D09-D10 |/d' "$P24/witness-done/OUTPUT/prompts/D01.md"
rm -f "$P24/witness-done/OUTPUT/prompts/D01.md.bak"

# L0: объявление уровня не отменяет проверку на код
cat > "$P24/witness-done/OUTPUT/prompts/D02.md" <<'P24L0'
# D02 — документы

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | none |

## PRODUCES

— нет

## ACCEPTANCE

N/A — не требуется

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L0 |
P24L0
printf 'print("hack")\n' > "$P24/src/hack.py"
node "$VERIFY" --d D02 --gate pre_ci --root "$P24" > "$TMP/l0.out" 2>&1
grep -q 'L0 с изменённым кодом' "$TMP/l0.out" && ok "1.24: L0 с изменённым кодом отвергается" || bad "L0 пропустил код"
rm -f "$P24/src/hack.py"

# L0 — законный структурный акт: релиз не путает его с «акт снят без команд»
node "$VERIFY" --d D02 --gate pre_ci --root "$P24" >/dev/null 2>&1
printf '| D | Кратко | split_group | Статус | evidence_ref | Доказательства | Обновлено | Заметки |\n|---|---|---|---|---|---|---|---|\n| D02 | Docs | — | done | evidence/D02.json | — | — | — |\n' \
  > "$P24/witness-done/OUTPUT/roadmaps/progress.md"
node "$VERIFY" --gate pre_release --root "$P24" > "$TMP/l0rel.out" 2>&1
if grep -q 'D02: акт снят без команд\|evidence D02 tax_pass=false' "$TMP/l0rel.out"; then
  bad "L0 ошибочно считается непроверенным"
else
  ok "1.24: L0-акт не путается с --skip-commands"
fi

# verify-evidence: акт о несуществующем файле — не «ок»
node --input-type=module -e "
import fs from 'node:fs';
import { seal } from '$ROOT/SEED/sp-tools/evidence-lib.mjs';
const data = { d: 'D09', level: 'L1', gate: 'pre_ci', producer: 'x', scopes: { unit: true },
  fit: { acceptance_ids: ['A09.1', 'A09.2', 'A09.3'], produces: ['src/ghost.py'], ops_checked: [] },
  issues: [], tax_pass: true, timestamp: new Date().toISOString() };
fs.writeFileSync('$P24/witness-done/OUTPUT/evidence/D09.json', JSON.stringify(seal('$P24', data), null, 2));
" >/dev/null 2>&1
node "$VERIFY" --verify-evidence OUTPUT/evidence/D09.json --root "$P24" > "$TMP/abs.out" 2>&1
grep -q 'содержит отсутствующие файлы' "$TMP/abs.out" && ok "1.24: --verify-evidence ловит акт об отсутствующем файле" || bad "акт о ghost.py прошёл"
rm -f "$P24/witness-done/OUTPUT/evidence/D09.json"

# progress: украшенный статус — это done (а не пропуск), нераспознанный — провал
printf '| D | Кратко | split_group | Статус | evidence_ref | Доказательства | Обновлено | Заметки |\n|---|---|---|---|---|---|---|---|\n| D07 | Docs | — | done ✅ | — | — | — | — |\n' \
  > "$P24/witness-done/OUTPUT/roadmaps/progress.md"
node "$VERIFY" --gate pre_release --root "$P24" > "$TMP/decor.out" 2>&1
grep -q 'done D07 without evidence' "$TMP/decor.out" && ok "1.24: done ✅ читается как done" || bad "украшенный статус выпал из проверок"
printf '| D | Кратко | split_group | Статус | evidence_ref | Доказательства | Обновлено | Заметки |\n|---|---|---|---|---|---|---|---|\n| D01 | API | — | готово | — | — | — | — |\n' \
  > "$P24/witness-done/OUTPUT/roadmaps/progress.md"
node "$VERIFY" --gate pre_release --root "$P24" > "$TMP/unknown.out" 2>&1
grep -q 'статус не распознан' "$TMP/unknown.out" && ok "1.24: нераспознанный статус — провал, а не пропуск" || bad "нераспознанный статус пропущен"
printf '| D | Статус |\n|---|---|\n' > "$P24/witness-done/OUTPUT/roadmaps/progress.md"
node "$VERIFY" --gate pre_release --root "$P24" > "$TMP/empty.out" 2>&1
grep -q 'ни одной строки задания' "$TMP/empty.out" && ok "1.24: пустой progress не проходит релиз" || bad "пустой progress прошёл"

# акт релиза проверяется как акт: печать, метки, привязка
printf '| D | Кратко | split_group | Статус | evidence_ref | Доказательства | Обновлено | Заметки |\n|---|---|---|---|---|---|---|---|\n| D01 | API | — | done | evidence/D01.json | — | — | — |\n' \
  > "$P24/witness-done/OUTPUT/roadmaps/progress.md"
printf '# smoke\n' > "$P24/witness-done/OUTPUT/docs/runbooks/product-smoke.md"
printf '#!/usr/bin/env bash\necho "A01.1 ok"\n' > "$P24/scripts/smoke/product-smoke.sh"
echo '{"tax_pass":true}' > "$P24/witness-done/OUTPUT/evidence/RELEASE-product-smoke.json"
node "$VERIFY" --gate pre_release --root "$P24" > "$TMP/forged.out" 2>&1
grep -q 'нет поля evidence_hash' "$TMP/forged.out" && ok "1.24: поддельный акт смоука отвергается" || bad "18-байтный акт смоука прошёл"
node "$VERIFY" --gate product-smoke --skip-commands --root "$P24" >/dev/null 2>&1
node "$VERIFY" --gate pre_release --root "$P24" > "$TMP/skipsmoke.out" 2>&1
grep -q 'смоук снят без исполнения' "$TMP/skipsmoke.out" && ok "1.24: смоук без исполнения не принимается релизом" || bad "смоук --skip-commands прошёл"
node "$VERIFY" --gate product-smoke --root "$P24" >/dev/null 2>&1
printf '#!/usr/bin/env bash\nexit 1\n' > "$P24/scripts/smoke/product-smoke.sh"
node "$VERIFY" --gate pre_release --root "$P24" > "$TMP/scriptchg.out" 2>&1
grep -q 'смоук-скрипт изменён после прогона' "$TMP/scriptchg.out" && ok "1.24: правка смоук-скрипта обнуляет акт" || bad "акт смоука пережил правку скрипта"

# удаление скрипта после прогона — тоже устаревший акт
printf '#!/usr/bin/env bash\necho "A01.1 ok"\n' > "$P24/scripts/smoke/product-smoke.sh"
node "$VERIFY" --gate product-smoke --root "$P24" >/dev/null 2>&1
rm -f "$P24/scripts/smoke/product-smoke.sh"
node "$VERIFY" --gate pre_release --root "$P24" > "$TMP/scriptdel.out" 2>&1
grep -q 'из акта не найден' "$TMP/scriptdel.out" && ok "1.24: удалённый смоук-скрипт обнуляет акт" || bad "акт смоука пережил удаление скрипта"

# акт задания, снятый с --skip-commands, релиз не принимает
printf '#!/usr/bin/env bash\necho "A01.1 ok"\n' > "$P24/scripts/smoke/product-smoke.sh"
node "$VERIFY" --gate product-smoke --root "$P24" >/dev/null 2>&1
node "$VERIFY" --d D01 --gate pre_ci --skip-commands --root "$P24" >/dev/null 2>&1
node "$VERIFY" --gate pre_release --root "$P24" > "$TMP/skipact.out" 2>&1
grep -q 'акт снят без команд' "$TMP/skipact.out" && ok "1.24: релиз не принимает акт с --skip-commands" || bad "акт без команд прошёл релиз"
node "$VERIFY" --d D01 --gate pre_ci --root "$P24" >/dev/null 2>&1

# план: правка после прогона обнуляет акт, свой автотрейс обновляется
mkdir -p "$P24/witness-done/OUTPUT/runtime"
cat > "$P24/witness-done/OUTPUT/runtime/runtime-plan.json" <<'P24PLAN'
{
  "version": 1,
  "stack": ["node"],
  "up": [{ "id": "noop", "cmd": "true", "ready": { "type": "cmd", "cmd": "true", "timeout_s": 5 } }],
  "down": [{ "cmd": "true" }],
  "verify": [
    { "acceptance": "A01.1", "cmd": "true" }, { "acceptance": "A01.2", "cmd": "true" },
    { "acceptance": "A01.3", "cmd": "true" }, { "acceptance": "A01.4", "cmd": "true" },
    { "acceptance": "A01.5", "cmd": "true" }, { "acceptance": "A01.6", "cmd": "true" }
  ]
}
P24PLAN
expect 0 "1.24: план исполняется" node "$VERIFY" --gate runtime --root "$P24"
python3 - "$P24/witness-done/OUTPUT/runtime/runtime-plan.json" <<'PLANMUT'
import json, sys
p = sys.argv[1]
d = json.load(open(p, encoding='utf-8'))
d['verify'][0]['cmd'] = 'false'
json.dump(d, open(p, 'w', encoding='utf-8'), indent=2)
PLANMUT
node "$VERIFY" --gate pre_release --root "$P24" > "$TMP/planstale.out" 2>&1
grep -q 'план изменён после прогона' "$TMP/planstale.out" && ok "1.24: правка плана обнуляет акт runtime" || bad "устаревший акт runtime прошёл"
python3 - "$P24/witness-done/OUTPUT/runtime/runtime-plan.json" <<'PLANBACK'
import json, sys
p = sys.argv[1]
d = json.load(open(p, encoding='utf-8'))
d['verify'][0]['cmd'] = 'true'
json.dump(d, open(p, 'w', encoding='utf-8'), indent=2)
PLANBACK
node "$VERIFY" --gate runtime --root "$P24" >/dev/null 2>&1
git -C "$P24" add -A >/dev/null 2>&1 && git -C "$P24" commit -qm plan >/dev/null 2>&1
printf 'export const a = 2;\n' > "$P24/src/index.ts"
git -C "$P24" add -A >/dev/null 2>&1 && git -C "$P24" commit -qm code >/dev/null 2>&1
node "$VERIFY" --gate runtime --root "$P24" >/dev/null 2>&1
node --input-type=module -e "
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const head = execFileSync('git', ['-C', '$P24', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const t = JSON.parse(fs.readFileSync('$P24/witness-done/OUTPUT/evidence/D01.trace.json', 'utf8'));
if (t.commit !== head) { console.error('трейс не обновлён'); process.exit(1); }
" >/dev/null 2>&1 && ok "1.24: автотрейс обновляется после смены кода" || bad "автотрейс остался на старом коммите"

# evidence-sync — отдельный гейт сверки progress ↔ evidence, а не псевдоним pre_release
printf '| D | Статус |\n|---|---|\n| D01 | done |\n' > "$P24/witness-done/OUTPUT/roadmaps/progress.md"
node --input-type=module -e "
import fs from 'node:fs';
import { seal } from '$ROOT/SEED/sp-tools/evidence-lib.mjs';
const data = { d: 'D10', level: 'L1', gate: 'pre_ci', producer: 'x', scopes: { unit: true },
  fit: { acceptance_ids: ['A10.1'], produces: [], ops_checked: [] }, issues: [], tax_pass: true, timestamp: new Date().toISOString() };
fs.writeFileSync('$P24/witness-done/OUTPUT/evidence/D10.json', JSON.stringify(seal('$P24', data), null, 2));
" >/dev/null 2>&1
node "$VERIFY" --gate evidence-sync --root "$P24" > "$TMP/sync.out" 2>&1
grep -q 'evidence/D10.json без строки в progress.md' "$TMP/sync.out" && ok "1.24: evidence-sync ловит акт без строки прогресса" || bad "evidence-sync не заметил сироту"
grep -q '"gate": "evidence-sync"' "$TMP/sync.out" && ok "1.24: evidence-sync пишет свой акт, а не RELEASE.json" || bad "evidence-sync остался псевдонимом"
rm -f "$P24/witness-done/OUTPUT/evidence/D10.json"

# doctor --strict не падает на собственных адаптерах после rules --sync
node "$CLI" rules --sync --root "$P24" >/dev/null 2>&1
node "$CLI" doctor --strict --root "$P24" > "$TMP/strict24.out" 2>&1
grep -q 'вне PRODUCES' "$TMP/strict24.out" && bad "doctor считает адаптеры файлами вне PRODUCES" \
  || ok "1.24: doctor --strict не спорит с sp rules --sync"

# 7n. 1.27: связь «фраза ACCEPTANCE ↔ тест» — машинная, а не по договорённости (DEC-027)
P26="$TMP/p26"
new_project p26
start_run "$P26" greenfield 04
mkdir -p "$P26/src" "$P26/tests" "$P26/witness-done/OUTPUT/prompts" "$P26/witness-done/OUTPUT/tooling"
printf 'x\n' > "$P26/src/a.py"
printf -- '- lint: `true`\n- typecheck: `true`\n- test: `true`\n' > "$P26/witness-done/OUTPUT/tooling/verify-commands.md"
write_bind_prompt() { # write_bind_prompt <фраза A01.1>
  {
    echo '# D01 — связь'
    echo
    echo '## VERIFICATION_TAX'
    echo
    echo '| Поле | Значение |'
    echo '|------|----------|'
    echo '| level | L1 |'
    echo
    echo '## HOW'
    echo
    echo '1. взять'
    echo '2. записать'
    echo
    echo '## PRODUCES'
    echo
    echo '- src/a.py'
    echo
    echo '## FIT_CHECKS'
    echo
    echo '| Поле | Значение |'
    echo '|------|----------|'
    echo '| module | none |'
    echo '| conflicts_ref | none |'
    echo '| conflicts_applied | — |'
    echo '| app_contracts | — |'
    [ -n "${1:-}" ] && echo "| acceptance_ops | $1 |"
    echo
    echo '## ACCEPTANCE'
    echo
    echo '| ID | Given | When | Then |'
    echo '|----|-------|------|------|'
    echo '| A01.1 | событие в очереди | воркер взял его | запись на диске раньше уведомления |'
    echo '| A01.2 | рестарт после сбоя | очередь перечитана | seq не переиспользован |'
    echo '| A01.3 | сбой записи | воркер повторяет | вызывающий получает ошибку |'
  } > "$P26/witness-done/OUTPUT/prompts/D01_bind.md"
  bind_tests_from_prompt "$P26" D01
}
write_bind_prompt
git init -q "$P26" 2>/dev/null || true
git -C "$P26" config user.email dev@sp.test
git -C "$P26" config user.name sp
git -C "$P26" add -A >/dev/null 2>&1 && git -C "$P26" commit -qm base >/dev/null 2>&1

expect 0 "1.27: фразы объявлены тестами с утверждениями → pre_ci" \
  node "$VERIFY" --d D01 --gate pre_ci --root "$P26"
node --input-type=module -e "
import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync('$P26/witness-done/OUTPUT/evidence/D01.json', 'utf8'));
if (!j.fit.acceptance_binding || j.fit.acceptance_binding.binding_hash.length !== 64) { console.error('нет binding_hash'); process.exit(1); }
if (j.fit.acceptance_binding.bound_ids.length !== 3) { console.error('bound: ' + j.fit.acceptance_binding.bound_ids); process.exit(1); }
" >/dev/null 2>&1 && ok "1.27: акт несёт отпечаток связи и список закрытых фраз" \
  || bad "в акте нет машинной связи фраз и тестов"

# 1) фраза без теста
mv "$P26/tests/D01_acceptance.test.ts" "$TMP/d01bind.bak"
node "$VERIFY" --d D01 --gate pre_ci --root "$P26" > "$TMP/bn1.out" 2>&1
grep -q 'фраза A01.1 без теста' "$TMP/bn1.out" && ok "1.27: фраза без теста — провал, а не «тесты зелёные»" \
  || bad "связь не проверяется: $(cat "$TMP/bn1.out")"
mv "$TMP/d01bind.bak" "$P26/tests/D01_acceptance.test.ts"

# 2) тест объявил фразу, но ничего не утверждает
cp "$P26/tests/D01_acceptance.test.ts" "$TMP/d01bind.orig"
python3 - "$P26/tests/D01_acceptance.test.ts" <<'HOLLOW'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = s.replace("  expect(actual).toBe('ok');", "  actual;")
open(p, 'w', encoding='utf-8').write(s)
HOLLOW
node "$VERIFY" --d D01 --gate pre_ci --root "$P26" > "$TMP/bn2.out" 2>&1
grep -q 'утверждения в нём нет' "$TMP/bn2.out" && ok "1.27: тест без утверждения — пустая связь" \
  || bad "тест без assertion прошёл"
cp "$TMP/d01bind.orig" "$P26/tests/D01_acceptance.test.ts"

# 3) тест пропущен
printf "@acceptance A01.1\nit.skip('A01.1 — фраза приёмки', () => { expect(1).toBe(1); });\n" > "$P26/tests/D01_acceptance.test.ts"
node "$VERIFY" --d D01 --gate pre_ci --root "$P26" > "$TMP/bn3.out" 2>&1
grep -q 'пропущен (skip/todo)' "$TMP/bn3.out" && ok "1.27: skip-тест не закрывает фразу" || bad "skip-тест засчитан"

# 4) ссылка на несуществующую фразу
printf "// @acceptance A01.9\nit('A01.9 — чужая фраза', () => { expect(1).toBe(1); });\n" > "$P26/tests/D01_acceptance.test.ts"
node "$VERIFY" --d D01 --gate pre_ci --root "$P26" > "$TMP/bn4.out" 2>&1
grep -q 'такой фразы нет в ACCEPTANCE' "$TMP/bn4.out" && ok "1.27: висячая ссылка на фразу отвергается" \
  || bad "фантомный ID прошёл"
rm -f "$P26/tests/D01_acceptance.test.ts"

# 5) освобождение через acceptance_ops — явное, с записью в акте
write_bind_prompt "A01.3"
node "$VERIFY" --d D01 --gate pre_ci --root "$P26" > "$TMP/bn5.out" 2>&1
grep -q '"A01.3"' "$P26/witness-done/OUTPUT/evidence/D01.json" && ok "1.27: acceptance_ops снимает фразу с кодового теста явно" \
  || bad "acceptance_ops не попал в акт"

# 6) test-plan: гейт acceptance сверяет план с тестами
write_bind_prompt
mkdir -p "$P26/witness-done/OUTPUT/tests"
cat > "$P26/witness-done/OUTPUT/tests/test-plan-D01.md" <<'PLAN'
| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A01.1 | запись раньше уведомления | tests/D01_acceptance.test.ts | covered |
| A01.2 | seq не переиспользован | tests/D01_acceptance.test.ts | covered |
| A01.3 | ошибка записи | tests/D01_acceptance.test.ts | covered |
PLAN
expect 0 "1.27: --gate acceptance с согласованным test-plan" node "$VERIFY" --gate acceptance --d D01 --root "$P26"
sed -i.bak 's#tests/D01_acceptance.test.ts | covered |#tests/other.test.ts | covered |#' "$P26/witness-done/OUTPUT/tests/test-plan-D01.md"
rm -f "$P26/witness-done/OUTPUT/tests/test-plan-D01.md.bak"
node "$VERIFY" --gate acceptance --d D01 --root "$P26" > "$TMP/bn6.out" 2>&1
grep -q 'этот тест фразу не объявляет' "$TMP/bn6.out" && ok "1.27: test-plan с чужим тестом отвергается" \
  || bad "план разошёлся с тестами, гейт молчит"
rm -rf "$P26/witness-done/OUTPUT/tests"

# 7) фраза переписана после приёмки — акт устарел
mkdir -p "$P26/witness-done/OUTPUT/roadmaps"
printf '| D | Статус |\n|---|---|\n| D01 | done |\n' > "$P26/witness-done/OUTPUT/roadmaps/progress.md"
node "$VERIFY" --gate pre_release --root "$P26" > "$TMP/bn7a.out" 2>&1
grep -q 'связь фраз и тестов изменилась после приёмки' "$TMP/bn7a.out" && bad "свежий акт считается устаревшим" \
  || ok "1.27: свежая связь не ложно устаревает"
sed -i.bak 's#| запись на диске раньше уведомления |#| запись на диске позже уведомления |#' "$P26/witness-done/OUTPUT/prompts/D01_bind.md"
rm -f "$P26/witness-done/OUTPUT/prompts/D01_bind.md.bak"
node "$VERIFY" --gate pre_release --root "$P26" > "$TMP/bn7b.out" 2>&1
grep -q 'связь фраз и тестов изменилась после приёмки' "$TMP/bn7b.out" \
  && ok "1.27: правка фразы после приёмки видна в релизе" \
  || bad "фразу переписали, акт остался «принятым»"

echo
# 11. 1.30: регрессии аудита — DEC-031 (вопрос при change), DEC-032 (русский негативный
#     сценарий), DEC-033 (PROJECT_ROOT, когда CLI запущен из каталога фабрики).
P30="$TMP/p30"
new_project p30
start_run "$P30" brownfield R01
mkdir -p "$P30/witness-done/spec-state/baseline/auth"
cp "$ROOT/TEMPLATES/spec-state-config.yaml" "$P30/witness-done/spec-state/config.yaml"
cat > "$P30/witness-done/spec-state/baseline/auth/spec.md" <<'BASE'
# Auth — baseline

### Requirement: Login
Система MUST авторизовывать пользователя по логину и паролю.

#### Scenario: Успешный вход
- GIVEN пользователь зарегистрирован
- WHEN он вводит верные данные
- THEN он получает сессию

#### Scenario: Неверный пароль
- GIVEN пользователь зарегистрирован
- WHEN он вводит неверный пароль
- THEN он получает отказ
BASE
node "$VERIFY" --gate baseline --root "$P30" > "$TMP/nb1.out" 2>&1
grep -q '"tax_pass": true' "$TMP/nb1.out" && ok "1.30: русский негативный сценарий проходит baseline (DEC-032)" \
  || bad "«Неверный пароль» отвергнут как не-негативный: $(tail -5 "$TMP/nb1.out")"
sed -i.bak 's/#### Scenario: Неверный пароль/#### Scenario: Повторный вход/' "$P30/witness-done/spec-state/baseline/auth/spec.md"
rm -f "$P30/witness-done/spec-state/baseline/auth/spec.md.bak"
expect 2 "1.30: baseline без негативного сценария по-прежнему падает" node "$VERIFY" --gate baseline --root "$P30"
sed -i.bak 's/#### Scenario: Повторный вход/#### Scenario: Неверный пароль/' "$P30/witness-done/spec-state/baseline/auth/spec.md"
rm -f "$P30/witness-done/spec-state/baseline/auth/spec.md.bak"
# из каталога фабрики её собственный CLI обязан найти корень проекта, а не искать spec-state в себе
( cd "$P30/witness-done" && node SEED/sp-tools/sp-verify.mjs --gate baseline ) > "$TMP/nb2.out" 2>&1
if grep -q '"tax_pass": true' "$TMP/nb2.out"; then
  ok "1.30: sp-verify из witness-done/ находит PROJECT_ROOT (DEC-033)"
else
  bad "sp-verify из witness-done/ не нашёл проект: $(tail -5 "$TMP/nb2.out")"
fi

# 12. 1.31: регрессии второго аудита — DEC-035 (runtime-plan не исполняет),
#     DEC-036 (кириллица в регулярках: совместимость, ярлыки, блокеры), DEC-037 (объяснение
#     — вопрос), DEC-038 (чужой PRODUCES не долг).
P35="$TMP/p35"
new_project p35
start_run "$P35" greenfield 08
mkdir -p "$P35/witness-done/OUTPUT/evidence" "$P35/witness-done/OUTPUT/runtime" "$P35/src"
printf 'v1\n' > "$P35/src/a.py"
cat > "$P35/witness-done/OUTPUT/evidence/D03.json" <<'ACT35'
{"d":"D03","gate":"pre_ci","level":"L1","tax_pass":true,"fit":{"acceptance_ids":["A03.1"],"produces":["src/a.py"]}}
ACT35
git -C "$P35" init -q
git -C "$P35" -c user.email=sp@test -c user.name=sp add -A
git -C "$P35" -c user.email=sp@test -c user.name=sp commit -qm init
cat > "$P35/witness-done/OUTPUT/runtime/runtime-plan.json" <<PLAN35
{
  "version": 1,
  "stack": ["node"],
  "up": [{ "id": "noop", "cmd": "true", "ready": { "type": "cmd", "cmd": "true", "timeout_s": 5 } }],
  "down": [{ "cmd": "true" }],
  "verify": [{ "acceptance": "A03.1", "cmd": "touch $P35/EXECUTED.marker", "expect_exit": 0 }]
}
PLAN35
# Гейт «проверить план» не имеет права трогать окружение: до v1.31 он исполнял план и писал
# акт исполнения, который релиз принимал за прогон (DEC-035).
node "$VERIFY" --gate runtime-plan --root "$P35" > "$TMP/rp35.out" 2>&1
if [[ $? -eq 0 ]] && grep -q '"executed": false' "$TMP/rp35.out"; then
  ok "1.31: --gate runtime-plan без флагов — статика (DEC-035)"
else
  bad "--gate runtime-plan не статичен: $(tail -5 "$TMP/rp35.out")"
fi
[[ -f "$P35/witness-done/OUTPUT/evidence/RELEASE-runtime-plan.json" ]] \
  && ok "1.31: статика пишет RELEASE-runtime-plan.json" || bad "акт статического гейта не создан"
[[ ! -f "$P35/witness-done/OUTPUT/evidence/RELEASE-runtime-verify.json" ]] \
  && ok "1.31: статика не выдаёт акт исполнения" || bad "статика пишет RELEASE-runtime-verify.json"
[[ ! -f "$P35/EXECUTED.marker" ]] \
  && ok "1.31: статика не выполнила verify[] из плана" || bad "статика исполнила команду плана"
expect 0 "1.31: --gate runtime исполняет план" node "$VERIFY" --gate runtime --root "$P35"
[[ -f "$P35/EXECUTED.marker" ]] && ok "1.31: исполнение действительно гоняет verify[]" || bad "runtime не исполнил план"

# DEC-036: предложение изменения на русском (как требует R02 и language-policy)
P36="$TMP/p36"
new_project p36
start_run "$P36" brownfield R02
mkdir -p "$P36/witness-done/spec-state/baseline/core" "$P36/witness-done/spec-state/changes/ru/specs"
cp "$ROOT/TEMPLATES/spec-state-config.yaml" "$P36/witness-done/spec-state/config.yaml"
printf '# Base\n\n### Requirement: Old\n\nThe system MUST exist.\n' > "$P36/witness-done/spec-state/baseline/core/spec.md"
cat > "$P36/witness-done/spec-state/changes/ru/specs/core.md" <<'SPEC36'
## ADDED Requirements

### Requirement: Экспорт

Система MUST выгружать отчёт.

#### Scenario: Успешный экспорт
- GIVEN есть данные
- WHEN администратор запрашивает выгрузку
- THEN он получает файл

#### Scenario: Пустой список
- GIVEN данных нет
- WHEN администратор запрашивает выгрузку
- THEN он получает файл с заголовком
SPEC36
printf '# Proposal\n\n## 5. Риски и обратная совместимость\n\nИзменение breaking: поле переименовано.\n' \
  > "$P36/witness-done/spec-state/changes/ru/proposal.md"
printf -- '- [x] задача\n' > "$P36/witness-done/spec-state/changes/ru/tasks.md"
node "$VERIFY" --change ru --gate change --skip-commands --root "$P36" > "$TMP/ch36.out" 2>&1
if [[ $? -eq 0 ]]; then
  ok "1.31: «Обратная совместимость» по-русски проходит change (DEC-036)"
else
  bad "русский заголовок совместимости отвергнут: $(grep -o 'missing[^\"]*' "$TMP/ch36.out" | head -1)"
fi
sed -i.bak 's/обратная совместимость/Backwards Compatibility/' "$P36/witness-done/spec-state/changes/ru/proposal.md"
rm -f "$P36/witness-done/spec-state/changes/ru/proposal.md.bak"
expect 0 "1.31: английский заголовок совместимости тоже проходит" node "$VERIFY" --change ru --gate change --skip-commands --root "$P36"

# DEC-036: ярлык неполноты по-русски ловится, а его опровержение — нет
node --input-type=module -e "
import { findIncompletenessLabels } from '$ROOT/SEED/sp-tools/evidence-lib.mjs';
const bad = findIncompletenessLabels('Сделаем упрощённую версию отчёта');
const ok1 = findIncompletenessLabels('MVP запрещён: объём описывается полной комплектацией');
if (!bad.length) { console.error('ярлык не найден'); process.exit(1); }
if (ok1.length) { console.error('опровержение принято за нарушение'); process.exit(1); }
" > /dev/null 2>&1 && ok "1.31: «упрощённая версия» — ярлык неполноты (DEC-036)" \
  || bad "ярлыки неполноты на кириллице не работают"

# DEC-036: открытый блокер по-русски обязан валить релиз
P37="$TMP/p37"
new_project p37
start_run "$P37" greenfield 10
mkdir -p "$P37/witness-done/OUTPUT/roadmaps" "$P37/witness-done/OUTPUT/docs"
printf '| D | Кратко | split_group | Статус | evidence_ref | Доказательства | Обновлено | Заметки |\n|---|---|---|---|---|---|---|---|\n| D01 | x | — | pending | — | — | 2026-10-31 | — |\n' \
  > "$P37/witness-done/OUTPUT/roadmaps/progress.md"
printf '| ID | Конфликт | Статус |\n|----|----------|--------|\n| C1 | blocker: два источника правды | открыт |\n' \
  > "$P37/witness-done/OUTPUT/docs/07_conflicts.md"
node "$VERIFY" --gate pre_release --root "$P37" > "$TMP/pr37.out" 2>&1
grep -q '07_conflicts.md: 1 строк' "$TMP/pr37.out" && ok "1.31: открытый блокер по-русски валит pre_release (DEC-036)" \
  || bad "русский открытый блокер прошёл релиз"

# DEC-037: просьба об объяснении — вопрос, а не изменение
P38="$TMP/p38"
new_project p38
start_run "$P38" greenfield 09
node "$CLI" intake "Объясни как работает intake" --root "$P38" > "$TMP/in37.out" 2>&1
grep -q '^kind: question' "$TMP/in37.out" && ok "1.31: «Объясни как…» — question (DEC-037)" \
  || bad "просьба об объяснении ушла в change: $(grep '^kind' "$TMP/in37.out")"
node "$CLI" intake "Добавь колонку в отчёт" --root "$P38" > "$TMP/in38.out" 2>&1
grep -q '^kind: task' "$TMP/in38.out" && ok "1.31: запрос без глагола объяснения остаётся работой" \
  || bad "обычный запрос классифицирован неверно: $(grep '^kind' "$TMP/in38.out")"

# DEC-036/037 (хвост): упоминание `Axx.k` в решении — не признак незаполненного шаблона
P39="$TMP/p39"
new_project p39
start_run "$P39" greenfield 09
node "$CLI" decide "Смоук обязан метить фразы Axx.k, иначе атрибуция ручная" --root "$P39" >/dev/null 2>&1
python3 - "$P39" <<'DEC39'
import glob, sys
p = glob.glob(sys.argv[1] + '/journal/decisions/DEC-001-*.md')[0]
t = open(p, encoding='utf-8').read()
t = t.replace('**Контекст.** Что вынудило выбирать и какие ограничения нельзя обойти.', '**Контекст.** Смоук не называл фразы, атрибуция была ручной.')
t = t.replace('**Альтернативы.** Что отвергли и почему. Если альтернатив нет — так и написать.', '**Альтернативы.** Оставить нумерацию контура — отвергнуто: номера не связаны с контрактом.')
t = t.replace('**Чем подтверждено.** `Axx.k`, тест, артефакт, раздел спецификации. Решение без подтверждения\nне закрывает intake.', '**Чем подтверждено.** Скрипт метит `Axx.k`; проверка в selftest.')
open(p, 'w', encoding='utf-8').write(t)
DEC39
node "$CLI" journal --check --root "$P39" > "$TMP/jr39.out" 2>&1
if grep -q 'DEC-001' "$TMP/jr39.out"; then
  bad "решение с упоминанием Axx.k ложно считается незаполненным"
else
  ok "1.31: упоминание Axx.k в решении не делает его незаполненным"
fi
node "$CLI" decide "Пустой шаблон" --root "$P39" >/dev/null 2>&1
node "$CLI" journal --check --root "$P39" > "$TMP/jr39b.out" 2>&1
grep -q 'DEC-002' "$TMP/jr39b.out" && ok "1.31: шаблон без правок по-прежнему считается незаполненным" \
  || bad "незаполненный шаблон решения прошёл проверку"

# DEC-040: вид bugfix распознаётся машинно, но только при принятом поведении.
# Фикстура: одно задание уже `done` — значит, ломать есть что.
P40="$TMP/p40"
new_project p40
start_run "$P40" greenfield 09
mkdir -p "$P40/witness-done/OUTPUT/roadmaps"
printf '| D | Кратко | split_group | Статус | evidence_ref | Доказательства | Обновлено | Заметки |\n|---|---|---|---|---|---|---|---|\n| D01 | экспорт | — | done | evidence/D01.json | tests/x.test.ts | 2026-10-31 | — |\n' \
  > "$P40/witness-done/OUTPUT/roadmaps/progress.md"
node "$CLI" intake "Ошибка 500 при выгрузке" --root "$P40" > "$TMP/in40.out" 2>&1
grep -q '^kind: bugfix' "$TMP/in40.out" && ok "1.31: жалоба на дефект — bugfix (DEC-040)" \
  || bad "дефект не распознан: $(grep '^kind' "$TMP/in40.out")"
grep -q 'proposal.md §1' "$TMP/in40.out" && ok "1.31: маршрут bugfix требует причину в §1" \
  || bad "маршрут bugfix не указывает причину: $(grep '^next' "$TMP/in40.out")"
node "$CLI" intake "Добавь обработку ошибок 500" --root "$P40" > "$TMP/in41.out" 2>&1
grep -q '^kind: task' "$TMP/in41.out" && ok "1.31: заказ новой работы дефектом не считается" \
  || bad "«добавь обработку ошибок» принято за дефект: $(grep '^kind' "$TMP/in41.out")"
node "$CLI" intake "Кнопка не работает" --root "$P40" > "$TMP/in42.out" 2>&1
grep -q '^kind: bugfix' "$TMP/in42.out" && ok "1.31: «не работает» — bugfix" \
  || bad "«не работает» не распознано: $(grep '^kind' "$TMP/in42.out")"
# Дефекта нет там, где нечего ломать: принятого поведения ещё нет
P41="$TMP/p41"
new_project p41
start_run "$P41" greenfield 05
node "$CLI" intake "Ошибка 500 при выгрузке" --root "$P41" > "$TMP/in43.out" 2>&1
grep -q '^kind: task' "$TMP/in43.out" && ok "1.31: дефект без принятого поведения — не bugfix" \
  || bad "bugfix без принятого поведения: $(grep '^kind' "$TMP/in43.out")"

echo
if [[ "$ERR" -eq 0 ]]; then
  echo "SELFTEST: PASS"
else
  echo "SELFTEST: FAIL"
fi
exit "$ERR"
