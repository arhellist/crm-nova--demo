# Модель данных — NOVA CRM

> Сгенерировано Witness Done v1.31.0. Источник: ТЗ §5, `docs/03_architecture.md`, ADR-0002/0003.
> Все объекты создаются миграциями в `supabase/migrations/`; ручных изменений схемы нет.

## 1. Обзор

Четыре таблицы в схеме `public`: `profiles`, `objects`, `tasks`, `task_status_history`.
Два перечисления: `user_role`, `task_status`. Плюс три отчётные вьюхи на вторичной БД
(`report_objects`, `report_workload`, `report_status_ages`), которые в primary не создаются.

Нормализация — 3NF: `profiles` хранит только идентичность и роль, объект не дублирует данные задач,
история не дублирует поля задачи (только `from_status`/`to_status`/актора/комментарий). Денормализации
нет намеренно: объёмы (≤ 100 000 задач) не требуют кэширующих колонок, а отчёты читаются с реплики.

## 2. Перечисления

```sql
create type public.user_role as enum ('manager', 'executor');
create type public.task_status as enum ('new', 'in_progress', 'on_review', 'rework', 'accepted');
```

Словарь подписей (UI): `new` — «Новая», `in_progress` — «В работе», `on_review` — «На проверке»,
`rework` — «На доработке», `accepted` — «Принята». Цвета — `docs/design-notes.md`.

## 3. Таблицы

### 3.1. `profiles`

| Поле | Тип | Ограничения | Комментарий |
|------|-----|-------------|-------------|
| `id` | `uuid` | PK, `references auth.users(id) on delete cascade` | равен идентификатору пользователя Auth |
| `full_name` | `text` | `not null`, `check (length(btrim(full_name)) between 1 and 120)` | отображаемое имя |
| `role` | `public.user_role` | `not null default 'executor'` | прикладная роль, источник прав |
| `created_at` | `timestamptz` | `not null default now()` | |

Email не дублируется: он в `auth.users` и не нужен другим пользователям. `auth.users` не публикуется
в репликацию.

### 3.2. `objects`

| Поле | Тип | Ограничения | Комментарий |
|------|-----|-------------|-------------|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `title` | `text` | `not null`, `check (length(btrim(title)) between 1 and 200)` | название объекта |
| `address` | `text` | `not null`, `check (length(btrim(address)) between 1 and 300)` | адрес |
| `created_by` | `uuid` | `not null default auth.uid() references profiles(id)` | автор |
| `created_at` | `timestamptz` | `not null default now()` | |
| `updated_at` | `timestamptz` | `not null default now()` | обновляется триггером |
| `deleted_at` | `timestamptz` | `null` | архивирование, не удаление |

Индексы: `objects(deleted_at)`, `objects(lower(title))`, `objects(lower(address))` — для поиска.

### 3.3. `tasks`

| Поле | Тип | Ограничения | Комментарий |
|------|-----|-------------|-------------|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `object_id` | `uuid` | `not null references objects(id) on delete restrict` | объект задачи |
| `title` | `text` | `not null`, `check (length(btrim(title)) between 1 and 200)` | |
| `description` | `text` | `not null default ''`, `check (length(description) <= 5000)` | |
| `assignee_id` | `uuid` | `not null references profiles(id)` | исполнитель, роль `executor` |
| `author_id` | `uuid` | `not null references profiles(id)` | автор, роль `manager` |
| `status` | `public.task_status` | `not null default 'new'` | меняется только через RPC |
| `created_at` | `timestamptz` | `not null default now()` | |
| `updated_at` | `timestamptz` | `not null default now()` | обновляется триггером |
| `deleted_at` | `timestamptz` | `null` | архивирование |

Индексы: `tasks(assignee_id, status) where deleted_at is null`, `tasks(object_id) where deleted_at is null`,
`tasks(created_at desc)`.

Инварианты (триггер `validate_task_actors`): `assignee_id` — пользователь с ролью `executor`;
`author_id` — с ролью `manager`; объект не архивирован; при `insert` статус только `new`;
смена исполнителя разрешена только в статусах `new` и `rework`; `author_id` не меняется.

### 3.4. `task_status_history`

| Поле | Тип | Ограничения | Комментарий |
|------|-----|-------------|-------------|
| `id` | `bigint` | PK, `generated always as identity` | порядок записей |
| `task_id` | `uuid` | `not null references tasks(id) on delete restrict` | |
| `from_status` | `public.task_status` | `null` = задача создана | |
| `to_status` | `public.task_status` | `not null` | |
| `changed_by` | `uuid` | `not null references profiles(id)` | актор |
| `comment` | `text` | `null`, `check (comment is null or length(comment) <= 2000)` | обязателен при `rework` |
| `created_at` | `timestamptz` | `not null default now()` | |

Ограничения: `check (from_status is distinct from to_status)`;
`check (to_status <> 'rework' or length(btrim(coalesce(comment,''))) > 0)`.
Индекс: `(task_id, created_at desc, id desc)`. `updated_at`/`deleted_at` отсутствуют: строка
неизменяема.

### 3.5. Связи и каскады

| Связь | Кардинальность | Поведение при удалении |
|-------|----------------|------------------------|
| `profiles.id → auth.users.id` | 1:1 | `cascade` (удаление пользователя в Auth удаляет профиль) |
| `objects.created_by → profiles.id` | N:1 | `restrict` — профиль с объектами не удаляется |
| `tasks.object_id → objects.id` | N:1 | `restrict` — физическое удаление объектов запрещено |
| `tasks.assignee_id/author_id → profiles.id` | N:1 | `restrict` |
| `task_status_history.task_id → tasks.id` | N:1 | `restrict` — история не удаляется |

Физический `DELETE` не выдан ни одной роли. Удаление объекта означает архивирование: его задачи
перестают быть видимыми (фильтр `deleted_at is null` в политиках и запросах), но не удаляются.

## 4. Функции и триггеры (контракт записи)

### 4.1. `rpc.change_task_status(p_task_id uuid, p_target public.task_status, p_comment text default null) returns public.task_status`

`security definer`, `set search_path = public, pg_temp`. Порядок работы:

1. `select ... from tasks where id = p_task_id and deleted_at is null for update`; нет строки → `P0400`.
2. Проверка актора: для исполнителя `assignee_id = auth.uid()`, для менеджера `is_manager()`;
   иначе `P0403`.
3. Проверка пары `(current_status, p_target)` по матрице §5.3 ТЗ; иначе `P0422`.
4. Для `on_review → rework` требуется непустой `p_comment`; иначе `P0422`.
5. `set local app.status_change = 'on'`; `set local app.transition_comment = p_comment`;
   `update tasks set status = p_target, updated_at = now()`.
6. Возврат нового статуса.

### 4.2. Триггеры

| Триггер | Событие | Что делает |
|---------|---------|------------|
| `guard_task_status` | BEFORE UPDATE OF `status` на `tasks` | пропускает только при `app.status_change = 'on'`, иначе `P0403` |
| `log_task_status` | AFTER UPDATE OF `status` | вставляет ровно одну строку истории с `changed_by = auth.uid()` |
| `log_task_created` | AFTER INSERT на `tasks` | вставляет `null → new` |
| `validate_task_actors` | BEFORE INSERT/UPDATE на `tasks` | проверяет роли, объект, смену исполнителя, `author_id` |
| `touch_updated_at` | BEFORE UPDATE на `objects`/`tasks` | обновляет `updated_at` |
| `guard_history_immutable` | BEFORE UPDATE/DELETE на `task_status_history` | запрещает изменение и удаление (`P0403`) |

### 4.3. `rpc.archive_object(p_object_id uuid)` и `rpc.archive_task(p_task_id uuid)`

`security definer`, только `manager`; выставляют `deleted_at = now()` при `deleted_at is null`
(идемпотентно). Архивирование объекта не удаляет задачи, но скрывает их из выборок.
История сохраняется.

### 4.4. Помощники

`public.is_manager() returns boolean` и `public.current_role() returns public.user_role` —
`security definer`, `stable`, `set search_path = public, pg_temp`; читают `profiles` по `auth.uid()`.

## 5. Права и RLS (сводка; полная матрица — `OUTPUT/security/authn-authz.md`)

- RLS включён на всех четырёх таблицах; политик «разрешить всё» нет.
- `objects`: постановщик читает все неархивированные; исполнитель — где есть его неархивированная
  задача. Создание и правка — постановщик.
- `tasks`: постановщик читает все неархивированные; исполнитель — только `assignee_id = auth.uid()`.
  Колоночные гранты: постановщику разрешены `title`, `description`, `object_id`, `assignee_id`;
  `status` не входит в грант.
- `task_status_history`: чтение — по видимости задачи; запись — только триггеры `security definer`.
- `profiles`: чтение всех полей, кроме email (его нет), запись — только администратор вне приложения.

## 6. Стратегия миграций

- Имя: `supabase/migrations/<UTC-timestamp>_<slug>.sql`, forward-only, без down-скриптов.
- Изменения схемы только добавляющие (expand): новая колонка nullable или с дефолтом, новая таблица,
  новый индекс `concurrently` где возможно. Удаление/переименование — отдельным релизом после того,
  как код перестал использовать старое (contract), с записью в ADR.
- Обе стороны (primary и вторичная БД) накатывают один и тот же набор миграций; отчётные вьюхи живут
  в отдельной миграции с условием «создавать только на secondary» (проверка по роли/`current_database()`).
- Триггеры и функции создаются `create or replace`, чтобы миграция была идемпотентной при повторе.

## 7. Пагинация, сортировка, поиск

- Списки: `objects` и `tasks` — курсорная пагинация по `(created_at, id)` с `limit` ≤ 100
  (по умолчанию 50). `offset` не используется: при одновременных вставках он «съедает» строки.
- Сортировка: `objects` — `created_at desc`; `tasks` — `created_at desc`, фильтр по статусу.
- Поиск: по `objects` — `lower(title) like '%q%'` или `lower(address) like '%q%'` с индексами;
  по `tasks` — клиентский фильтр в пределах загруженной страницы (поиск по всем задачам не входит
  в продукт, см. ТЗ §2.2).
- Отчёты: параметр `from`/`to` (дата, необязательный), `limit` ≤ 100, сортировка фиксирована.

## 8. Аудит и архивирование

История статусов — аудит домена: кто, когда, из какого статуса в какой, комментарий. Отдельного
журнала чтения нет (не входит в продукт). Архивирование (`deleted_at`) заменяет удаление для объектов
и задач; физическое удаление запрещено грантами и `restrict`-каскадами.

## 9. Отчётные вьюхи (только на вторичной БД)

```sql
-- report_objects: сводка по объектам
select o.id, o.title, o.address,
       count(t.id) as tasks_total,
       count(*) filter (where t.status = 'new')         as tasks_new,
       count(*) filter (where t.status = 'in_progress') as tasks_in_progress,
       count(*) filter (where t.status = 'on_review')   as tasks_on_review,
       count(*) filter (where t.status = 'rework')      as tasks_rework,
       count(*) filter (where t.status = 'accepted')    as tasks_accepted,
       coalesce(round(100.0 * count(*) filter (where t.status = 'accepted')
                / nullif(count(t.id), 0), 1), 0) as accepted_share,
       max(t.updated_at) as last_activity_at
from objects o
left join tasks t on t.object_id = o.id and t.deleted_at is null
where o.deleted_at is null
group by o.id, o.title, o.address;

-- report_workload: загрузка исполнителей (без email)
select p.id as assignee_id, p.full_name,
       count(t.id) as tasks_total,
       count(*) filter (where t.status = 'in_progress') as tasks_in_progress,
       count(*) filter (where t.status = 'on_review')   as tasks_on_review,
       count(*) filter (where t.status = 'rework')      as tasks_rework,
       count(*) filter (where t.status = 'accepted')    as tasks_accepted,
       min(t.created_at) as oldest_open_at
from profiles p
join tasks t on t.assignee_id = p.id and t.deleted_at is null
where p.role = 'executor'
group by p.id, p.full_name;

-- report_status_ages: время приёмки
select date_trunc('day', h.created_at) as day,
       avg(extract(epoch from (h.created_at - prev.created_at))) as avg_seconds_in_status,
       max(extract(epoch from (h.created_at - prev.created_at))) as max_seconds_in_status
from task_status_history h
join lateral (
  select created_at from task_status_history p
  where p.task_id = h.task_id and p.id < h.id
  order by p.id desc limit 1
) prev on true
where h.from_status = 'on_review'
group by 1 order by 1 desc;
```

Все три вьюхи не содержат email, `description` и комментариев (ТЗ §13.1 п. 24).
