# DEC-032 — D10: заглушка auth.uid() на реплике возвращает uuid

| Поле | Значение |
|------|----------|
| Дата | 2026-11-04 |
| Intake | — |
| Статус | принято |
| ADR | ADR-0003 |
| Заменяет | — |

**Контекст.** `infra/replica/init/000_auth_stub.sql` объявлял `auth.uid()` как `returns
uuid`, а тело возвращало результат `->> 'sub'`, то есть `text`. На PostgreSQL 16 init
реплики падал на первом же шаге: `return type mismatch in function declared to return
uuid` (exit 3). Из-за этого не накатывались миграции 0001–0007, не создавалась подписка
`nova_sub` и вьюхи, то есть контур отчётности нельзя было поднять ни на staging, ни по
README.

**Решение.** Тело функции приводит значение к `uuid`, а пустая настройка (нет JWT)
превращается в `null` до приведения — иначе `null::uuid` работает, но `''::jsonb`
падает. Заглушка остаётся идемпотентной и по-прежнему не даёт реплике прав записи.

**Альтернативы.** Объявить `returns text` — сломает миграции: `created_by = auth.uid()`
сравнивает uuid-колонку с text. Использовать `coalesce(..., gen_random_uuid())` —
подменило бы «нет пользователя» случайным автором и обошло NOT NULL-семантику. Принято
приведение к `uuid`.

**Чем подтверждено.** `docker compose -f infra/replica/docker-compose.yml up replica
replica-init` → init exit 0, `CREATE SUBSCRIPTION`, на реплике 3 объекта, 8 задач,
21 запись истории; отчётный API отвечает `source: replica` на staging-контуре (DEC-031).
