-- 0007_grants.sql
-- Гранты на write-функции и историю. Права выдаются ровно тем ролям, которым положено.
--
-- Запись возможна только через эти функции (ADR-0002): у `authenticated` нет колоночного
-- гранта на tasks.status и нет INSERT/UPDATE/DELETE на task_status_history.
-- `anon` не должен даже узнать о существовании функций (INV-008), поэтому `execute`
-- отозван у `public` и у `anon`; схема public уже доступна ролям приложения (0003).

revoke all on function public.change_task_status(uuid, public.task_status, text) from public;
revoke all on function public.change_task_status(uuid, public.task_status, text) from anon;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;

revoke all on function public.archive_task(uuid) from public;
revoke all on function public.archive_task(uuid) from anon;
grant execute on function public.archive_task(uuid) to authenticated;

revoke all on function public.archive_object(uuid) from public;
revoke all on function public.archive_object(uuid) from anon;
grant execute on function public.archive_object(uuid) to authenticated;

-- История: только чтение по RLS, запись — исключительно триггерами.
revoke insert, update, delete on table public.task_status_history from authenticated;
revoke all on table public.task_status_history from anon;
grant select on table public.task_status_history to authenticated;
