-- 0012_tasks_select_object_active_helper.sql
-- DEC-065: tasks_select с EXISTS(objects) + objects_select с EXISTS(tasks) = infinite recursion.
-- Читаем активность объекта через security definer — без повторного входа в RLS tasks.

create or replace function public.object_is_active(p_object_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.objects o
    where o.id = p_object_id
      and o.archived_at is null
  );
$$;

comment on function public.object_is_active(uuid) is
  'true, если объект существует и не архивирован; security definer против рекурсии RLS (DEC-065).';

revoke all on function public.object_is_active(uuid) from public;
revoke all on function public.object_is_active(uuid) from anon;
grant execute on function public.object_is_active(uuid) to authenticated;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    archived_at is null
    and (public.is_manager() or assignee_id = auth.uid())
    and public.object_is_active(object_id)
  );
