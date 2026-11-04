# DEC-010 — D03: функции записи создаём в схеме public (public.change_task_status, public…

| Поле | Значение |
|------|----------|
| Дата | 2026-11-04 |
| Intake | 20261104-2057-davay-ebash-kod-po-proektu |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** `data-model.md` §4.1/§4.3 называет функции `rpc.change_task_status` и т.д., а `FIT_CHECKS` D03 требует путь `POST /rest/v1/rpc/change_task_status`. В PostgREST сегмент `/rpc/` — маршрут вызова функции, имя схемы в URL не передаётся; при `api.schemas = ["public"]` (`supabase/config.toml`) функция в отдельной схеме `rpc` по этому пути недоступна. Либо менять URL-контракт и настройку API, либо разместить функции в `public`.

**Решение.** D03: функции записи создаём в схеме public (public.change_task_status, public.archive_task, public.archive_object), потому что PostgREST при api.schemas=["public"] отдаёт их по контрактному пути /rest/v1/rpc/<имя>; сегмент rpc — маршрут PostgREST, а не имя схемы. Префикс rpc. в data-model §4.1/§4.3 читаем как обозначение write-контура, а не как отдельную схему БД.

**Альтернативы.** (1) Создать схему `rpc` и добавить её в `api.schemas` — тогда клиенту нужен заголовок выбора схемы, а контрактный путь `/rest/v1/rpc/<имя>` всё равно неоднозначен; отказ. (2) Оставить функции в `public`, переименовав spec-префикс в комментариях — принято: путь и гранты остаются ровно как в FIT_CHECKS, лишняя схема не появляется.

**Чем подтверждено.** Миграции `0004_status_machine.sql`, `0006_archive_rpc.sql`, `0007_grants.sql`: функции созданы в `public`, `execute` выдан только `authenticated`. `sp-verify --d D03` сверяет `POST /rest/v1/rpc/change_task_status`, `POST /rest/v1/rpc/archive_task`, `POST /rest/v1/rpc/archive_object` с `specs/openapi.yaml`.
