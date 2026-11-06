-- 020_views.sql
-- Отчётные вьюхи на вторичной БД и роль `nova_ro` для чтения (ADR-0003, §9 data-model).
--
-- Инварианты:
--  - вьюхи содержат только агрегаты и идентификаторы: ни email, ни `description`,
--    ни комментариев истории (защита ПДн, INV-011);
--  - `nova_ro` получает `select` на базовые таблицы и вьюхи и не получает DML;
--    `default_transaction_read_only = on` даёт `25006` на любую попытку записи (A10.4);
--  - вьюхи пересоздаются `create or replace`, поэтому повторный init не ломает контур (A10.1);
--  - роль создаётся здесь, потому что роли не реплицируются: на подписчике её нет,
--    пока её не создаст этот же контур (ADR-0003, «DDL и роли ведутся миграциями»).

-- Роль чтения: на подписчике её создаёт этот скрипт, на primary — миграция 0008.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'nova_ro') then
    create role nova_ro login noinherit;
  end if;
end
$$;

alter role nova_ro set default_transaction_read_only = on;

-- Сводка по объектам: счётчики задач по статусам и дата последней активности.
create or replace view public.report_objects as
select
  o.id,
  o.title,
  o.address,
  count(t.id) as tasks_total,
  count(*) filter (where t.status = 'new') as tasks_new,
  count(*) filter (where t.status = 'in_progress') as tasks_in_progress,
  count(*) filter (where t.status = 'on_review') as tasks_on_review,
  count(*) filter (where t.status = 'rework') as tasks_rework,
  count(*) filter (where t.status = 'accepted') as tasks_accepted,
  coalesce(
    round(100.0 * count(*) filter (where t.status = 'accepted') / nullif(count(t.id), 0), 1),
    0
  ) as accepted_share,
  max(t.updated_at) as last_activity_at
from public.objects o
left join public.tasks t on t.object_id = o.id and t.archived_at is null
where o.archived_at is null
group by o.id, o.title, o.address;

comment on view public.report_objects is
  'Сводка по активным объектам: число задач в каждом статусе, доля принятых, последняя активность.';

-- Загрузка исполнителей: без email; tasks_new + без задач архивных объектов (DEC-068).
create or replace view public.report_workload as
select
  p.id as assignee_id,
  p.full_name,
  count(t.id) as tasks_total,
  count(*) filter (where t.status = 'new') as tasks_new,
  count(*) filter (where t.status = 'in_progress') as tasks_in_progress,
  count(*) filter (where t.status = 'on_review') as tasks_on_review,
  count(*) filter (where t.status = 'rework') as tasks_rework,
  count(*) filter (where t.status = 'accepted') as tasks_accepted,
  min(t.created_at) filter (
    where t.status in ('new', 'in_progress', 'on_review', 'rework')
  ) as oldest_open_at
from public.profiles p
left join public.tasks t
  on t.assignee_id = p.id
 and t.archived_at is null
 and exists (
   select 1
   from public.objects o
   where o.id = t.object_id
     and o.archived_at is null
 )
where p.role = 'executor'
group by p.id, p.full_name;

comment on view public.report_workload is
  'Загрузка исполнителей: активные задачи на неархивных объектах по статусам (DEC-068); без email.';

-- KPI постановщиков: задачи, где менеджер — автор (DEC-061). Left join — нулевые карточки.
create or replace view public.report_managers as
select
  p.id as manager_id,
  p.full_name,
  count(t.id) as tasks_total,
  count(*) filter (where t.status = 'new') as tasks_new,
  count(*) filter (where t.status = 'in_progress') as tasks_in_progress,
  count(*) filter (where t.status = 'on_review') as tasks_on_review,
  count(*) filter (where t.status = 'rework') as tasks_rework,
  count(*) filter (where t.status = 'accepted') as tasks_accepted,
  coalesce(
    round(100.0 * count(*) filter (where t.status = 'accepted') / nullif(count(t.id), 0), 1),
    0
  ) as accepted_share,
  max(t.updated_at) as last_activity_at
from public.profiles p
left join public.tasks t
  on t.author_id = p.id
 and t.archived_at is null
 and exists (
   select 1
   from public.objects o
   where o.id = t.object_id
     and o.archived_at is null
 )
where p.role = 'manager'
group by p.id, p.full_name;

comment on view public.report_managers is
  'KPI постановщиков: авторские активные задачи на неархивных объектах; без email (DEC-062).';

-- Время приёмки: сколько задача провела в статусе «на проверке» перед переходом.
create or replace view public.report_status_ages as
select
  date_trunc('day', h.created_at) as day,
  avg(extract(epoch from (h.created_at - prev.created_at))) as avg_seconds_in_status,
  max(extract(epoch from (h.created_at - prev.created_at))) as max_seconds_in_status
from public.task_status_history h
join lateral (
  select created_at
  from public.task_status_history p
  where p.task_id = h.task_id and p.id < h.id
  order by p.id desc
  limit 1
) prev on true
where h.from_status = 'on_review'
group by 1
order by 1 desc;

comment on view public.report_status_ages is
  'Среднее и максимальное время в статусе «на проверке» по дням: история без комментариев и авторов.';

-- Права: только чтение, порядок «снять всё → выдать select» важен (INV-011).
revoke all on all tables in schema public from nova_ro;
grant usage on schema public to nova_ro;
grant select on table public.profiles, public.objects, public.tasks, public.task_status_history
  to nova_ro;
grant select on table public.report_objects, public.report_workload, public.report_managers,
  public.report_status_ages
  to nova_ro;
