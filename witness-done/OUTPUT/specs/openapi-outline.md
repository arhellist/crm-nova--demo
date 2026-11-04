# Контракты API — обзор

> Сгенерировано Witness Done v1.31.0. Полный каркас — `specs/openapi.yaml`.
> Два независимых контура: **Supabase (запись и чтение домена)** и **Fastify (только отчёты)**.

## 1. Контур Supabase: PostgREST и RPC

Аутентификация: `Authorization: Bearer <access_token>` (JWT GoTrue) + `apikey: <anon key>`.
Ключ `anon` публичен по дизайну; доступ ограничен RLS. `service_role` в клиенте отсутствует.

### 1.1. Табличные операции (RLS ограничивает результат)

| Метод и путь | Назначение | Кто | Ответ | Ошибки |
|--------------|------------|-----|-------|--------|
| `GET /rest/v1/profiles?select=id,full_name,role` | список пользователей для выбора исполнителя | `authenticated` | `200 [ {id, full_name, role} ]` | `401` |
| `GET /rest/v1/objects?deleted_at=is.null&select=*&order=created_at.desc&limit=50&offset=…` | список объектов | обе роли (RLS фильтрует) | `200 [object]` | `401` |
| `GET /rest/v1/objects?id=eq.<id>&select=*` | карточка объекта | обе роли (RLS) | `200 [object]` или `[]` | `401` |
| `POST /rest/v1/objects` | создание объекта | `manager` | `201` + `Prefer: return=representation` | `401`, `403`, `P0400` |
| `PATCH /rest/v1/objects?id=eq.<id>` | правка `title`, `address` | `manager` | `200` (0 или 1 строка) | `401`, `P0400` |
| `GET /rest/v1/tasks?deleted_at=is.null&select=*&order=created_at.desc` | список задач (RLS: исполнитель только свои) | обе роли | `200 [task]` | `401` |
| `GET /rest/v1/tasks?id=eq.<id>&select=*` | карточка задачи | обе роли (RLS) | `200 [task]` или `[]` | `401` |
| `POST /rest/v1/tasks` | создание задачи (только `new`) | `manager` | `201` | `401`, `P0400`, `P0422` |
| `PATCH /rest/v1/tasks?id=eq.<id>` | правка `title`, `description`, `object_id`, `assignee_id` | `manager` | `200` | `401`, `P0400`, `P0422` |
| `GET /rest/v1/task_status_history?task_id=eq.<id>&select=*&order=created_at.desc,id.desc` | история задачи | по видимости задачи | `200 [history]` | `401` |
| `DELETE /rest/v1/objects|tasks|task_status_history` | запрещено | — | `403`/ошибка | всегда |

Сортировка и пагинация: `order=created_at.desc`, `limit` ≤ 100 (по умолчанию 50).
Параметр `offset` допускается PostgREST, но приложение использует курсор по `(created_at, id)`.

### 1.2. RPC

| Функция | Параметры | Кто | Успех | Ошибки |
|---------|-----------|-----|-------|--------|
| `POST /rest/v1/rpc/change_task_status` | `p_task_id uuid`, `p_target task_status`, `p_comment text null` | назначенный исполнитель или `manager` | `200 <task_status>` | `P0403`, `P0422`, `P0400` |
| `POST /rest/v1/rpc/archive_object` | `p_object_id uuid` | `manager` | `200 void` | `P0403`, `P0400` |
| `POST /rest/v1/rpc/archive_task` | `p_task_id uuid` | `manager` | `200 void` | `P0403`, `P0400` |

`anon` не имеет `execute` ни на одну функцию. Идемпотентность: `archive_*` идемпотентны;
`change_task_status` идемпотентен по результату (повторный вызов того же перехода даёт `P0422`,
статус не меняется) и не создаёт дубль истории.

## 2. Контур Fastify (только чтение)

Аутентификация: `Authorization: Bearer <API_TOKEN>` (значение из менеджера секретов).
Дополнительно: allowlist `Origin`, rate limit 60/мин на токен, TLS обязателен.
Любой `POST/PUT/PATCH/DELETE` на любой путь → `405`.

| Метод и путь | Назначение | Параметры | Ответ |
|--------------|------------|-----------|-------|
| `GET /health` | живость процесса | — | `200 {status:"ok", uptime_s}` |
| `GET /health/replication` | состояние реплики | — | `200 {status:"streaming", lag_seconds, last_error:null}` или `503 {status:"lagging|broken", lag_seconds, last_error}` |
| `GET /metrics` | метрики Prometheus | — | `200 text/plain`; доступ только из внутренней сети |
| `GET /api/reports/objects` | сводка по объектам | `from?`, `to?` (ISO date), `limit?` ≤ 100 | `200 {source:"replica", lag_seconds, generated_at, data:[…]}` |
| `GET /api/reports/workload` | загрузка исполнителей | те же | `200 {source:"replica", lag_seconds, generated_at, data:[…]}` |
| `GET /api/reports/status-ages` | сроки приёмки | `from?`, `to?`, `limit?` | `200 {source:"replica", lag_seconds, generated_at, data:[…]}` |

### 2.1. Единый конверт ошибки

```json
{ "error": { "code": "E_REPLICA_LAG", "message": "Данные отчёта временно недоступны", "request_id": "…" } }
```

| HTTP | Код | Причина |
|------|-----|---------|
| 400 | `E_VALIDATION` | параметры не прошли Zod |
| 401 | `E_UNAUTHORIZED` | нет или неверный `API_TOKEN` |
| 403 | `E_FORBIDDEN_ORIGIN` | `Origin` не в allowlist |
| 404 | `E_NOT_FOUND` | неизвестный путь |
| 405 | `E_METHOD_NOT_ALLOWED` | любой write-метод |
| 429 | `E_RATE_LIMITED` | превышен лимит |
| 503 | `E_REPLICA_LAG` / `E_REPLICA_DOWN` | лаг выше порога / подписка не работает |
| 500 | `E_INTERNAL` | непредвиденная ошибка; детали только в логах |

### 2.2. Схемы ответов отчётов

`GET /api/reports/objects` → элементы:
`{ object_id, title, address, tasks_total, tasks_new, tasks_in_progress, tasks_on_review,
tasks_rework, tasks_accepted, accepted_share (0…100, 1 знак), last_activity_at }`.

`GET /api/reports/workload` → элементы:
`{ assignee_id, full_name, tasks_total, tasks_in_progress, tasks_on_review, tasks_rework,
tasks_accepted, oldest_open_at }`.

`GET /api/reports/status-ages` → элементы:
`{ day (YYYY-MM-DD, Europe/Moscow), avg_seconds_in_status, max_seconds_in_status }`.

Полей `email`, `description`, `comment` в ответах нет никогда.

## 3. Коды и поведение клиента

| Ситуация | Поведение UI |
|----------|--------------|
| `401` от Supabase | попытка refresh; при неудаче — выход на `/login` с сообщением «Сессия истекла» |
| `P0403` | тост «Нет доступа», список/карточка инвалидируются |
| `P0422` | тост «Недопустимое действие для текущего статуса», карточка перезагружается |
| `P0400` | подсветка полей формы, ошибки под полем |
| `503 E_REPLICA_LAG` | баннер в разделе отчётов, остальные экраны работают |
| `429` | тост «Слишком много запросов, повторите позже» |
| Сеть недоступна | состояние ошибки с кнопкой «Повторить», без потери введённых данных формы |

## 4. Rate limiting и идемпотентность

- Supabase Auth: встроенные лимиты + блокировка после серии неудачных входов.
- Fastify: 60 запросов в минуту на токен, `429` при превышении.
- Периметр (Cloudflare): WAF и лимиты по IP для `/login`.
- Мутации домена не используют `Idempotency-Key`: защита от дублей — уникальность проверок в БД
  и явные ограничения (повторный `archive_*` ничего не меняет, повторный переход отклоняется).

## 5. Версионирование

Версия контура — тег образа и коммит; отдельного `/v2` нет. Изменение контракта отчётов — только
добавлением полей; удаление или переименование требует пакета изменения и обновления `specs/`.
