# Progress — выполнение разработки

> Создаётся на шаге 09. **Обновляет агент после каждого D** (и человек при ручной правке).  
> Новый чат: **сначала прочитай этот файл**, потом `START_HERE.md` / нужный D-промпт.

## Охват roadmap

| Слой | Где | Что покрывает |
|------|-----|----------------|
| **P0 (весь продукт v1)** | `00_overview.md` + D01…Dn | Полная вертикаль до acceptance из ТЗ |
| **v2+ / later** | `improvement-backlog.md` | Не в текущем прогоне D |

Roadmap **включает разработку всего P0**. Out-of-scope и later — только backlog.

## Статусы (обязательные значения)

| Статус | Значение |
|--------|----------|
| `not_started` | Кода/миграций по PRODUCES ещё нет |
| `in_progress` | Начато; PRODUCES неполные или PRE-CHECK / pre_ci не зелёные |
| `done` | PRODUCES + **VerificationTax pre_ci** (`OUTPUT/evidence/Dxx.json`, `tax_pass`, `acceptance_ids`) + кейсы test-plan / Axx |
| `needs_rework` | Было «done», но найдены дыры/баги / fit fail — доработать до `done` |
| `blocked` | Ждёт GATE / человека / внешний BLOCKER |

> Канон: `catalogs/verification-tax.md`. `done` **запрещён** без свежего evidence `gate=pre_ci`.  
> L1+: в evidence обязателен непустой `fit.acceptance_ids` (кроме явного N/A в ACCEPTANCE).  
> L2/L3: `fit.ops_checked` с ≥1 `METHOD /path`. Contours: `catalogs/contour-smoke.md`.

## Таблица D (заполнить на шаге 09; статусы — в ходе разработки)

| D | Кратко | split_group | Статус | evidence_ref | Доказательства (пути/PR) | Обновлено | Заметки |
|---|--------|-------------|--------|--------------|--------------------------|-----------|---------|
| D01 | … | none | not_started | — | — | — | size_ok; tax L1; A01.* |

## Сводка

- **Следующий D:** (первый не `done` в порядке из `00_overview.md`)
- **Открытые needs_rework / blocked:** —
- **P0 acceptance** (`00_overview.md`): не начат | частично | готов
- **Wave pending:** (split_group без contour smoke) —

## Командная работа: фрагменты

При работе вдвоём/несколькими агентами строки не правятся прямо здесь. Каждый пишет
`roadmaps/progress.d/<Dxx>.md` (формат — `TEMPLATES/progress.d-fragment.md`), сборка:

```bash
node witness-done/SEED/sp-tools/sp.mjs progress --merge   # собрать progress.md из фрагментов
node witness-done/SEED/sp-tools/sp.mjs progress --check   # сверить фрагменты с собранным файлом
```

Конфликт одного `D` в двух фрагментах решается более новым `updated_at`; при равенстве — отказ со списком.
`sp doctor --team` проверяет `evidence_ref` у всех `done`, непустые review и отсутствие дублей.

## Правила для агента

1. В начале чата: прочитай `progress.md` → не переписывай уже `done` без явной просьбы.
2. Перед кодом: открой D + CONTEXT_PACK + HOW/ACCEPTANCE, выставь строке `in_progress`.
3. После кода: тесты по каждому `Axx.*` → `sp-verify --d Dxx --gate pre_ci` → при pass: `done` + `evidence_ref` (проверь `acceptance_ids`) + test-plan.
4. Нашёл регрессию / fit fail → `needs_rework` + заметка.
5. Не ставь `done`, если pre_ci scopes красные, GATE провален, или `acceptance_ids` пустой (L1+).
6. JS → только TypeScript strict; без автотестов на runtime — не `done`.
7. Закрыл `split_group` → wave API-smoke (`catalogs/contour-smoke.md`).
8. Перед релизом: `sp-verify --gate pre_release` + полный product-smoke на staging.
