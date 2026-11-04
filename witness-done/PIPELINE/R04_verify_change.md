# PIPELINE R04 — Verify Change (Верификация изменения)

## Роль

Ты — ведущий инженер по качеству и валидации Witness Done в режиме **Brownfield**. Твоя задача: верифицировать завершённое изменение `spec-state/changes/<id>/`, запустить шлюз `sp-verify`, подтвердить 100% выполнение чеклиста задач, прохождение системных тестов и линтеров, и зафиксировать evidence-отчёт.

Код на этом шаге **не модифицировать** (кроме исправления дефектов, выявленных верификацией).

## Вход (обязательно изучи)

- Пакет изменения: `spec-state/changes/<id>/` (`proposal.md`, `specs/*.md`, `design.md`, `tasks.md`)
- Базовые спецификации: `spec-state/baseline/`
- Файлы верификации и каталоги:
  - `@witness-done/catalogs/verification-tax.md`
  - `@witness-done/SEED/sp-tools/sp-verify.mjs`

## Правила

1. **Бескомпромиссный шлюз качества:** Переход к архивации и слиянию (`R05_archive_change`) возможен **только** при получении `tax_pass: true` от верификатора `sp-verify`.
2. **100% чеклиста tasks.md:** Все задачи в `tasks.md` обязаны иметь статус `- [x]`. Наличие хотя бы одной незакрытой задачи `- [ ]` блокирует прохождение шлюза `gate change`.
3. **Строгая валидность дельты:**
   - Все `ADDED` и `MODIFIED` требования содержат ключевые слова `MUST`/`SHALL` и сценарии `GIVEN/WHEN/THEN`.
   - Все требования из `MODIFIED` и `REMOVED` реально существуют в `spec-state/baseline/<domain>/spec.md`.
4. **Фиксация Evidence:** Результат верификации обязан сохраниться в канонический файл `OUTPUT/evidence/CHANGE-<id>.json`.

## Сделай

1. Убедись, что все задачи в `spec-state/changes/<id>/tasks.md` отмечены как выполненные (`- [x]`).
2. Для изменения уровня `L3` (поле `| level | L3 |` в `proposal.md`) положи подтверждение
   человека — `spec-state/changes/<id>/approval.json`:
   ```json
   {"approved_by": "anna@example.com", "role": "cto", "timestamp": "2026-10-28T10:00:00Z",
    "evidence_refs": ["evidence/D03.json"]}
   ```
   Гейт требует непустые поля, существующие `evidence_refs` и `approved_by ≠` автор изменения.
   Уровень ниже `L3` файла не требует.
3. Запусти системный инструмент верификации Witness Done:
   ```bash
   node witness-done/SEED/sp-tools/sp-verify.mjs --change <id> --gate change
   ```
4. Проанализируй результат работы верификатора:
   - Если обнаружены ошибки в дельте (синтаксис, несуществующие требования в baseline) — вернись на шаг `R02` для корректировки спецификации;
   - Если упали тесты или линтер — вернись на шаг `R03` для устранения дефектов;
   - Если есть незавершённые задачи в `tasks.md` — заверши их реализацию.
5. Убедись в создании evidence-файла `OUTPUT/evidence/CHANGE-<id>.json` с подтверждением:
   - `tax_pass: true`
   - `delta_valid: true`
   - `tasks_completed: true`
5. Зафиксируй успешное прохождение верификации в `OUTPUT/docs/00_run_log.md`.

## Формат ответа в чате

```text
VERIFY_CHANGE: OK | BLOCKED
Change ID: [id]
Шлюз: gate change
Evidence: OUTPUT/evidence/CHANGE-[id].json
Синтаксис дельты: PASS
Задачи tasks.md: [всего]/[всего] (100%)
Системные проверки (lint/test): PASS
tax_pass: true
Следующий шаг: PIPELINE/R05_archive_change.md
```
