# Progress — выполнение разработки

> Создан на шаге 09. Обновляет агент после каждого D (и человек при ручной правке).
> Новый чат: сначала этот файл, потом `START_HERE.md` / нужный D-промпт.

## Охват roadmap

| Слой | Где | Что покрывает |
|------|-----|----------------|
| P0 (весь продукт) | `00_overview.md` + D01…D14 | Полная вертикаль до acceptance из ТЗ §12 |
| v2+ / later | `improvement-backlog.md` | Не в текущем прогоне D |

## Статусы

- `not_started` — кода/миграций по PRODUCES ещё нет.
- `in_progress` — начато; PRODUCES неполные или PRE-CHECK / pre_ci не зелёные.
- `done` — PRODUCES + VerificationTax pre_ci (`OUTPUT/evidence/Dxx.json`, `tax_pass`, `acceptance_ids`) + кейсы test-plan.
- `needs_rework` — было `done`, найдены дыры/баги.
- `blocked` — ждёт GATE / человека / внешний BLOCKER.

## Таблица D

| D | Кратко | split_group | Статус | evidence_ref | Доказательства (пути/PR) | Обновлено | Заметки |
|---|--------|-------------|--------|--------------|--------------------------|-----------|---------|
| D01 | Каркас, env, логгер, health | platform | not_started | — | — | — | L1; A01.1–A01.4 |
| D02 | Схема, enum, RLS | schema | not_started | — | — | — | L1; A02.1–A02.4 |
| D03 | Машина статусов и история | schema | not_started | — | — | — | L2; A03.1–A03.7 |
| D04 | Вход с MFA и оболочка | auth | not_started | — | — | — | L2; A04.1–A04.6 |
| D05 | Объекты: контракт записи | objects | not_started | — | — | — | L2; A05.1–A05.6 |
| D06 | Объекты: экран | objects | not_started | — | — | — | L2; A06.1–A06.6 |
| D07 | Задачи: контракт записи | tasks | not_started | — | — | — | L2; A07.1–A07.6 |
| D08 | Задачи: экран | tasks | not_started | — | — | — | L2; A08.1–A08.6 |
| D09 | Мои задачи | tasks | not_started | — | — | — | L2; A09.1–A09.6 |
| D10 | Реплика и отчётные вьюхи | reports | not_started | — | — | — | L1; A10.1–A10.4 |
| D11 | API отчётов | reports | not_started | — | — | — | L2; A11.1–A11.7 |
| D12 | Отчёты в UI | reports | not_started | — | — | — | L2; A12.1–A12.6 |
| D13 | Наблюдаемость и восстановление | release | not_started | — | — | — | L1; A13.1–A13.4 |
| D14 | Релиз и приёмка | release | not_started | — | — | — | L1; A14.1–A14.4 |

## Сводка

- **Следующий D:** D01
- **Открытые needs_rework / blocked:** —
- **P0 acceptance:** не начат (кода ещё нет; задания выданы и проверены гейтами)
- **Wave pending:** все группы (`platform`…`release`) — smoke после закрытия D

## Командная работа: фрагменты

Каждый агент пишет `roadmaps/progress.d/<Dxx>.md` (формат `TEMPLATES/progress.d-fragment.md`),
сборка: `node witness-done/SEED/sp-tools/sp.mjs progress --merge`, сверка: `progress --check`.
Пустой `evidence_ref` у `done` — нарушение, `sp doctor --team` его ловит.

## Правила для агента

1. В начале чата: прочитай `progress.md` → не переписывай уже `done` без просьбы.
2. Перед кодом: D + CONTEXT_PACK + HOW/ACCEPTANCE, выстави `in_progress`.
3. После кода: тесты по `Axx.*` → `sp-verify --d Dxx --gate pre_ci` → `done` + `evidence_ref` + test-plan.
4. Регрессия / fit fail → `needs_rework` + заметка.
5. `done` без pre_ci scopes, GATE или `acceptance_ids` (L1+) запрещён.
6. JS → только TypeScript strict; без тестов на runtime — не `done`.
7. Закрыл `split_group` → wave API-smoke (`catalogs/contour-smoke.md`).
8. Перед релизом: `sp-verify --gate pre_release` + product-smoke на staging.
