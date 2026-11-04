# PIPELINE R05 — Archive Change (Слияние дельты и архивация изменения)

## Роль

Ты — хранитель репозитория спецификаций Witness Done в режиме **Brownfield**. Твоя задача: применить прошедшую верификацию дельту спецификаций из `spec-state/changes/<id>/` к базовым спецификациям `spec-state/baseline/`, переместить пакет изменения в архив `spec-state/archive/` и обновить поисковый индекс `sp-retrieve`.

## Вход (обязательно изучи)

- Пакет изменения: `spec-state/changes/<id>/` (`proposal.md`, `specs/*.md`, `design.md`, `tasks.md`)
- Отчёт верификации: `OUTPUT/evidence/CHANGE-<id>.json` (обязательно `tax_pass: true`)
- Базовые спецификации: `spec-state/baseline/<domain>/spec.md`
- Инструмент контекстного поиска: `@witness-done/SEED/sp-tools/sp-retrieve.mjs`

## Правила

1. **Предварительное условие:** Архивация разрешена **только** при наличии успешного отчёта `OUTPUT/evidence/CHANGE-<id>.json` с `tax_pass: true`.
2. **Атомарность слияния дельты (Delta Merge):**
   - **ADDED:** Новые требования вместе со всеми их сценариями добавляются в соответствующую секцию `spec-state/baseline/<domain>/spec.md`.
   - **MODIFIED:** Существующие требования в baseline полностью заменяются новым текстом и новыми сценариями из дельты.
   - **REMOVED:** Удаляемые требования исключаются из `spec-state/baseline/<domain>/spec.md`.
3. **Неизменяемый архив:** Завершённый пакет изменения переносится в `spec-state/archive/YYYY-MM-DD-<id>/` и остаётся неизменяемым историческим следом.
4. **Обновление индекса:** Обязательный запуск переиндексации контекста, чтобы агенты видели актуальное состояние спецификаций.

## Сделай

1. Проверь наличие и успешность `OUTPUT/evidence/CHANGE-<id>.json` (`tax_pass: true`).
2. Для каждого файла дельты `spec-state/changes/<id>/specs/<domain>.md`:
   - Открой соответствующий `spec-state/baseline/<domain>/spec.md`;
   - Примени секцию `## ADDED Requirements`: добавь формулировки требований и сценарии в baseline;
   - Примени секцию `## MODIFIED Requirements`: полностью замени старые формулировки требований новыми версиями;
   - Примени секцию `## REMOVED Requirements`: удали указанные требования из baseline;
   - Сохрани обновлённый `spec-state/baseline/<domain>/spec.md`.
3. Получи текущую дату в формате `YYYY-MM-DD` и создай целевую архивную папку:
   - `spec-state/archive/YYYY-MM-DD-<id>/`
4. Перемести всё содержимое каталога `spec-state/changes/<id>/` в созданную архивную папку.
5. Запусти переиндексацию базы знаний и спецификаций:
   ```bash
   node witness-done/SEED/sp-tools/sp-retrieve.mjs --reindex
   ```
6. Проверь базовую линию после слияния:
   ```bash
   node witness-done/SEED/sp-tools/sp-verify.mjs --gate baseline
   ```
   `tax_pass: true` обязателен: слияние не должно оставить требование без `MUST/SHALL` или без двух сценариев.
7. Обнови `OUTPUT/roadmaps/progress.md`: строку изменения переведи в `done`, укажи `evidence/CHANGE-<id>.json` и перечень обновлённых доменов.
8. Обнови `OUTPUT/MANIFEST.md` (статус `R05` → `done`, текущий шаг) и сделай запись об успешной архивации в `OUTPUT/docs/00_run_log.md`.

## Формат ответа в чате

```text
ARCHIVE_CHANGE: OK | BLOCKED
Change ID: [id]
Архивный каталог: spec-state/archive/YYYY-MM-DD-[id]/
Обновлённые домены baseline: [список доменов]
Переиндексация sp-retrieve: PASS
Baseline gate: PASS | FAIL
progress.md обновлён: yes
Статус: Изменение успешно применено к baseline и заархивировано. Репозиторий готов к следующему изменению (R02).
```
