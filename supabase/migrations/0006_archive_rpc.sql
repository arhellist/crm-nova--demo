-- 0006_archive_rpc.sql
-- Архивирование вместо удаления: public.archive_object и public.archive_task.
--
-- Почему так: физического DELETE в продукте нет (INV-009/domain-rules §4). Архивировать может
-- только manager; повторный вызов идемпотентен и не двигает archived_at, чтобы «двойной клик»
-- не искажал дату скрытия. Задачи архивного объекта отдельно не трогаем: их видимость
-- отсекается выборками, строки и история сохраняются.
-- SQLSTATE: P0400 — объекта/задачи нет; P0403 — вызывает не manager.

create or replace function public.archive_task(p_task_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_manager() then
    raise exception using errcode = 'P0403', message = 'insufficient_privilege';
  end if;

  update public.tasks
     set archived_at = now()
   where id = p_task_id
     and archived_at is null;

  if not found and not exists (select 1 from public.tasks where id = p_task_id) then
    raise exception using errcode = 'P0400', message = 'task_not_found';
  end if;
end;
$$;

comment on function public.archive_task(uuid) is
  'Архивирует задачу от имени manager (domain-rules §4). Идемпотентна: повторный вызов не меняет archived_at; P0403 для не-manager, P0400 если задачи нет.';

create or replace function public.archive_object(p_object_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_manager() then
    raise exception using errcode = 'P0403', message = 'insufficient_privilege';
  end if;

  update public.objects
     set archived_at = now()
   where id = p_object_id
     and archived_at is null;

  if not found and not exists (select 1 from public.objects where id = p_object_id) then
    raise exception using errcode = 'P0400', message = 'object_not_found';
  end if;
end;
$$;

comment on function public.archive_object(uuid) is
  'Архивирует объект от имени manager; задачи не удаляются и не меняются, история сохраняется. Идемпотентна; P0403 для не-manager, P0400 если объекта нет.';
