-- 0010_objects_select_archived_manager.sql
-- Постановщик читает архивные объекты, исполнитель — нет.
--
-- Почему так:
--  - D05 (п. 8) требует, чтобы архивный объект оставался читаемым (`getObject`), а D06
--    показывает его бейджем «Архив» и даёт фильтр «Показать архивные»; политика 0003
--    отсекала архивные для всех ролей, поэтому бейдж и фильтр были недостижимы;
--  - исполнителю архивные объекты по-прежнему не видны (domain-rules §4–5): доступ к
--    архивному объекту остаётся только у manager, а условие «своя активная задача»
--    относится к неархивированным объектам.

drop policy if exists objects_select on public.objects;
create policy objects_select on public.objects
  for select to authenticated
  using (
    public.is_manager()
    or (
      archived_at is null
      and exists (
        select 1
        from public.tasks t
        where t.object_id = objects.id
          and t.assignee_id = auth.uid()
          and t.archived_at is null
      )
    )
  );
