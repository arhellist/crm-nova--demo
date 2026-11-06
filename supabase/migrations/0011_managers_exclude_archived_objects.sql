-- 0011_managers_exclude_archived_objects.sql
-- DEC-062: задачи архивного объекта скрываются каскадно (комментарий к objects.archived_at).
--  - report_managers не считает задачи, у которых object.archived_at IS NOT NULL;
--  - tasks_select RLS — то же для UI («Мои задачи» / карточки не расходятся).

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

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'nova_ro') then
    grant select on table public.report_managers to nova_ro;
  end if;
end
$$;

-- Политика tasks_select с EXISTS(objects) вызывала рекурсию с objects_select —
-- окончательная форма в 0012_tasks_select_object_active_helper.sql (DEC-065).
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    archived_at is null
    and (public.is_manager() or assignee_id = auth.uid())
    and exists (
      select 1
      from public.objects o
      where o.id = tasks.object_id
        and o.archived_at is null
    )
  );
