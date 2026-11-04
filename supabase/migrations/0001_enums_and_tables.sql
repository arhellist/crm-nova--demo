-- 0001_enums_and_tables.sql
-- Схема домена NOVA CRM: перечисления, четыре таблицы, ограничения и индексы.
--
-- Инварианты:
--  - архивирование вместо удаления: признак `archived_at`, физический DELETE не выдаётся никому;
--  - `tasks.status` меняется только через RPC (триггер и гранты появляются в 0003/0005);
--  - `task_status_history` — append-only аудит, без `updated_at` и без каскадного удаления.
-- Миграция forward-only и идемпотентна при повторном прогоне (NFR19): объекты создаются
-- с `if not exists`, типы — через проверку в pg_type.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('manager', 'executor');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('new', 'in_progress', 'on_review', 'rework', 'accepted');
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  role public.user_role not null default 'executor',
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Профиль пользователя: имя и прикладная роль. Email живёт в auth.users и не дублируется.';
comment on column public.profiles.id is 'Равен auth.users.id; другого идентификатора у профиля нет.';
comment on column public.profiles.role is 'Единственный источник прав: manager — постановщик, executor — исполнитель.';
comment on column public.profiles.full_name is 'Отображаемое имя, 1–120 символов после обрезки пробелов.';

create table if not exists public.objects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  address text not null check (length(btrim(address)) between 1 and 300),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.objects is 'Строительный объект. Удаление запрещено: архивирование через archived_at.';
comment on column public.objects.archived_at is 'Момент архивирования; null — объект активен. Задачи архивного объекта скрываются, но не удаляются.';
comment on column public.objects.created_by is 'Автор объекта (manager), заполняется auth.uid() при вставке.';

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.objects (id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 5000),
  assignee_id uuid not null references public.profiles (id) on delete restrict,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  status public.task_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.tasks is 'Задача объекта. Статус меняется только через rpc.change_task_status (INV-003).';
comment on column public.tasks.assignee_id is 'Исполнитель с ролью executor; смена разрешена только в статусах new и rework.';
comment on column public.tasks.author_id is 'Постановщик с ролью manager; после вставки не меняется.';
comment on column public.tasks.status is 'Текущий статус; прямой UPDATE отклоняется триггером guard_task_status.';
comment on column public.tasks.archived_at is 'Момент архивирования задачи; null — задача активна.';

create table if not exists public.task_status_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete restrict,
  from_status public.task_status,
  to_status public.task_status not null,
  changed_by uuid not null references public.profiles (id) on delete restrict,
  comment text check (comment is null or length(comment) <= 2000),
  created_at timestamptz not null default now(),
  constraint history_status_changed check (from_status is distinct from to_status),
  constraint history_rework_comment check (
    to_status <> 'rework' or length(btrim(coalesce(comment, ''))) > 0
  )
);

comment on table public.task_status_history is 'Неизменяемая история переходов (append-only). Строки создают только триггеры security definer.';
comment on column public.task_status_history.from_status is 'Предыдущий статус; null означает создание задачи.';
comment on column public.task_status_history.comment is 'Комментарий перехода; обязателен при возврате на доработку.';

-- Индексы под списки и поиск (NFR1): фильтры по исполнителю, статусу и объекту.
create index if not exists objects_archived_at_idx on public.objects (archived_at);
create index if not exists objects_title_lower_idx on public.objects (lower(title));
create index if not exists objects_address_lower_idx on public.objects (lower(address));
create index if not exists tasks_assignee_status_idx
  on public.tasks (assignee_id, status) where archived_at is null;
create index if not exists tasks_object_status_idx
  on public.tasks (object_id, status) where archived_at is null;
create index if not exists tasks_created_at_idx on public.tasks (created_at desc);
create index if not exists history_task_created_idx
  on public.task_status_history (task_id, created_at desc, id desc);
