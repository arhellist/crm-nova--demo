# D-cut list — кандидаты в задания (C1)

> Источник: `OUTPUT/docs/01_analysis.md` (черновые срезы S0…S10), `OUTPUT/docs/07_module_plan.md`,
> `OUTPUT/specs/data-model.md`, `OUTPUT/specs/openapi.yaml`, `INPUT/TECH_SPEC.md` §2/§4/§12.
> Канон: `catalogs/completeness-policy.md`. Итог C1: **0 × OVER_BUDGET**.

## Легенда

- `delivery_slice` — проверяемый срез продукта: что можно запустить и проверить после куска.
- `budget` — `OK` (≤6 не-тестовых файлов, ≤2 surfaces) или `OVER` (требует сплита).
- `split_group` — маркер волны для contour smoke (`catalogs/contour-smoke.md`).
- `level` — налог верификации: L1 runtime, L2 API/UI, L3 деньги/квоты/реестр.

## Кандидаты

| Candidate | ЦЕЛЬ (черновик) | delivery_slice | surfaces | entity | est_produces | PRIMARY LIBRARY | level | budget | split_to |
|-----------|-----------------|----------------|----------|--------|--------------|-----------------|-------|--------|----------|
| D01 | Каркас: TS strict, env-контракт, логгер, health, проверки CI на месте | S0 | tooling, api | — | 6 | `logging-pino` (include), `rate-limiting` (include) | L1 | OK | — |
| D02 | Схема и права: 4 таблицы, 2 enum, индексы, RLS, помощники роли | S1 | db | profiles, objects, tasks | 5 | — | L1 | OK | — |
| D03 | Машина статусов: RPC перехода, guard-триггер, append-only история, архивирование | S2 | db | task_status_history | 4 | — | L2 | OK | — |
| D04 | Вход с MFA и оболочка по роли: экран входа, TOTP, guard, навигация | S3 | ui | profile | 6 | `auth-jwt` (adapt) | L2 | OK | — |
| D05 | Объекты, контракт записи: создание/правка/архивирование через PostgREST | S4 | api | object | 5 | `crud-table` (adapt) | L2 | OK | — |
| D06 | Объекты, экран: список, карточка, форма, подтверждение архива | S4 | ui | object | 6 | `crud-table` (adapt) | L2 | OK | — |
| D07 | Задачи, контракт записи: создание, правка, назначение, архивирование | S5 | api | task | 5 | `crud-table` (adapt) | L2 | OK | — |
| D08 | Задачи, экран: карточка, форма создания, смена исполнителя, статус-панель | S5 | ui | task | 6 | — | L2 | OK | — |
| D09 | «Мои задачи»: список по статусам, счётчики, одна кнопка перехода | S6 | ui | task | 5 | — | L2 | OK | — |
| D10 | Реплика и вьюхи: публикация, подписка, `nova_ro`, три отчётные вьюхи | S7 | db | — | 5 | — | L1 | OK | — |
| D11 | API отчётов: read-only Fastify, три эндпоинта, лаг, деградация | S7 | api | report | 5 | — | L2 | OK | — |
| D12 | Отчёты в UI: экран, актуальность, состояние деградации | S8 | ui | report | 5 | — | L2 | OK | — |
| D13 | Наблюдаемость и восстановление: метрики, алерты, бэкап, runbooks | S9 | tooling | — | 5 | — | L1 | OK | — |
| D14 | Релиз: e2e, security-гейты, деплой, журнал релиза | S10 | tooling | — | 6 | — | L1 | OK | — |

## Проверка бюджета

| D | produces_count (без тестов) | surfaces | ≤6 | ≤2 | Итог |
|---|-----------------------------|----------|-----|-----|------|
| D01 | 6 | 2 | да | да | OK |
| D02 | 5 | 1 | да | да | OK |
| D03 | 4 | 1 | да | да | OK |
| D04 | 6 | 1 | да | да | OK |
| D05 | 5 | 1 | да | да | OK |
| D06 | 6 | 1 | да | да | OK |
| D07 | 5 | 1 | да | да | OK |
| D08 | 6 | 1 | да | да | OK |
| D09 | 5 | 1 | да | да | OK |
| D10 | 5 | 1 | да | да | OK |
| D11 | 5 | 1 | да | да | OK |
| D12 | 5 | 1 | да | да | OK |
| D13 | 5 | 1 | да | да | OK |
| D14 | 6 | 1 | да | да | OK |

## Что резалось и почему

| Кандидат | Причина сплита | Решение |
|----------|----------------|---------|
| «Объекты: API + экран» | 2 поверхности и >6 файлов | разделено на D05 (api) и D06 (ui); связка — `split_group: objects` |
| «Задачи: API + экран + мои задачи» | >6 файлов, 3 независимых результата | D07 (api), D08 (экран карточки), D09 (очередь исполнителя) |
| «Отчёты целиком» | db + api + ui = 3 поверхности | D10 (db), D11 (api), D12 (ui); связка — `split_group: reports` |
| «Эксплуатация + релиз» | два разных результата (наблюдаемость vs выпуск) | D13 и D14 |

## Wave-markers (contour smoke)

| split_group | D | Проверка после закрытия группы |
|-------------|---|--------------------------------|
| `platform` | D01 | `scripts/smoke/wave-api-smoke.sh platform` |
| `schema` | D02, D03 | `scripts/smoke/wave-api-smoke.sh schema` |
| `auth` | D04 | `scripts/smoke/wave-api-smoke.sh auth` |
| `objects` | D05, D06 | `scripts/smoke/wave-api-smoke.sh objects` |
| `tasks` | D07, D08, D09 | `scripts/smoke/wave-api-smoke.sh tasks` |
| `reports` | D10, D11, D12 | `scripts/smoke/wave-api-smoke.sh reports` |
| `release` | D13, D14 | `scripts/smoke/wave-api-smoke.sh release` |

## Итог C1

- Кандидатов: **14**, все `budget: OK`.
- `OVER_BUDGET`: **0**.
- `surfaces > 2`: **0**.
- Следующая подволна: **C2**, батчи по 5 заданий (D01–D05, D06–D10, D11–D14).
