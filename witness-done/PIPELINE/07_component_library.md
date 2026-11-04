# PIPELINE 07 — План модулей LIBRARY (без копирования в OUTPUT)

## Роль

Выбрать, какие модули из **глобальной** `LIBRARY/` нужны проекту.  
**Запрещено** копировать `SPEC.md` / плодить `OUTPUT/library/<id>/`. Библиотека живёт только в `LIBRARY/`.

`id` модуля (`logging-pino`, `email-nodemailer`, `websocket-socketio`, …) — это **id контракта**, а не
обязательная библиотека: имя отражает референсную реализацию, в которой писался SPEC. На другом
языке/фреймворке контракт переносится, реализация берётся своя — вердикт `adapt`
(`catalogs/stack-policy.md`).

## Вход

- ТЗ §11, analysis, `@witness-done/README.md` (категории)
- `@witness-done/PROFILES.md`
- `@witness-done/LIBRARY/*/SPEC.md` (читать на месте)
- `@witness-done/catalogs/stack-policy.md`
- `@witness-done/catalogs/language-policy.md`

## Правило

| Вердикт | Значение |
|---------|----------|
| `include` | Берём контракт из `LIBRARY/<id>/SPEC.md` как CONSUMES в D-промптах |
| `adapt` | То же + краткие отличия проекта в плане модулей (не копия SPEC); **обязателен**, если стек проекта отличается от референсной реализации в SPEC |
| `skip` | Не нужен (+причина) |
| `later` | v2+, в improvement-backlog |

Не тащить optional без ТЗ. Email, поиск, Stripe, websocket — только если явно в IN SCOPE.

## CONFLICTS

По парам `include`/`adapt` прочитай секции CONFLICTS в `LIBRARY/*/SPEC.md`.  
Результат — **один** файл `OUTPUT/docs/07_conflicts.md` (таблица + смягчения текстом).  
Blocker без решения → `needs_human`.

## Сделай (только эти файлы)

### 1. `OUTPUT/docs/07_module_plan.md`

На **русском**:

- таблица: id | вердикт | зачем | путь к SPEC (`LIBRARY/<id>/SPEC.md`) | целевые Dxx
- блок «Отличия от SPEC» (кратко, bullet’ы на модуль с `adapt`/`include` — cookie names, path prefix, mock PSP…)
- ссылка на `catalogs/stack-policy.md` (если стек проекта отличается от примера в SPEC — что именно
  адаптировать в реализации: эквиваленты библиотек, cookie names, path prefix, mock PSP…)
- **не** вставлять полный текст SPEC

### 2. `OUTPUT/docs/07_conflicts.md`

Таблица конфликтов и смягчений.

### 3. `OUTPUT/docs/07_methodology_apply.md` (кратко)

must/should/later из methodology — без копирования канона.

### 4. Синхронизация контрактов

Допиши в openapi/data-model недостающие эндпоинты из **включённых** SPEC (пометка `from: LIBRARY/<id>`).

### 5. Gaps

Если нужен модуль, которого нет в LIBRARY (например RU-платежи) — **один** файл  
`OUTPUT/docs/07_gap_<id>.md` (краткое ТЗ-дополнение), **не** дерево `OUTPUT/library/`.

Либо предложи добавить в глобальную `LIBRARY/` фабрики (для следующих проектов).

## Явно запрещено

```text
OUTPUT/library/**
копирование SPEC.md в OUTPUT
ADAPTATION.md / INTEGRATION.md на каждый модуль как дубликаты библиотеки
```

## STOP

```text
MODULES: OK | NEEDS_HUMAN
include/adapt/skip/later: …
CONFLICTS blockers: N
Следующий: PIPELINE/08_tooling_lint_cicd.md
```
