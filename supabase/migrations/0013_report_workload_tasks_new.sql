-- 0013_report_workload_tasks_new.sql
-- DEC-068: карточки /team — загрузка исполнителей; нужен tasks_new и без задач архивных объектов.
-- CREATE OR REPLACE не может вставить колонку в середину — сначала DROP.

drop view if exists public.report_workload;

create view public.report_workload as
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

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'nova_ro') then
    grant select on table public.report_workload to nova_ro;
  end if;
end
$$;
