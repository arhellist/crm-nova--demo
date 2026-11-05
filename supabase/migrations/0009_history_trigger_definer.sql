-- 0009_history_trigger_definer.sql
-- История переходов пишется триггерами от имени владельца таблицы.
--
-- Почему так:
--  - у `authenticated` нет INSERT на task_status_history (INV-004), но создать задачу и
--    сменить статус клиент обязан; значит пишет триггер, а не клиент. Функция триггера
--    должна быть `security definer`, иначе INSERT выполняется от вызывающей роли и падает
--    с 42501 — именно этот дефект закрывает миграция;
--  - `search_path` фиксирован (INV-008), `execute` у `public` и `anon` отозван: клиент не
--    вызывает триггерные функции напрямую.

create or replace function public.log_task_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.task_status_history (task_id, from_status, to_status, changed_by, comment)
  values (
    new.id,
    old.status,
    new.status,
    coalesce(auth.uid(), new.author_id),
    nullif(btrim(coalesce(current_setting('app.transition_comment', true), '')), '')
  );
  return new;
end;
$$;

create or replace function public.log_task_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.task_status_history (task_id, from_status, to_status, changed_by)
  values (new.id, null, 'new', coalesce(auth.uid(), new.author_id));
  return new;
end;
$$;

revoke all on function public.log_task_status() from public;
revoke all on function public.log_task_status() from anon;
revoke all on function public.log_task_created() from public;
revoke all on function public.log_task_created() from anon;
