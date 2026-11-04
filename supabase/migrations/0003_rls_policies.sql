-- 0003_rls_policies.sql
-- Построчная защита (RLS) и гранты. Права решает БД, отсутствие политики = отказ (INV-002).
--
-- Матрица (OUTPUT/security/authn-authz.md §2):
--  - profiles: чтение всем аутентифицированным с профилем; записи из приложения нет;
--  - objects: manager читает все активные, executor — где у него есть активная задача;
--  - tasks: manager — все активные, executor — только assignee_id = auth.uid();
--  - task_status_history: append-only, чтение по видимости задачи, запись только триггерами.
-- Колоночные гранты не включают `status`, `archived_at`, `author_id`-смену: изменить их
-- прямым UPDATE нельзя даже при наличии политики (INV-003, INV-004).

-- 1. Схема доступна ролям приложения (в Supabase это дефолт; дублируем для переносимости),
--    но таблицы закрыты: любой доступ к данным решает RLS.
grant usage on schema public to anon, authenticated;

-- 2. Закрываем таблицы от анонимов и снимаем наследованные права public.
revoke all on table public.profiles from anon;
revoke all on table public.objects from anon;
revoke all on table public.tasks from anon;
revoke all on table public.task_status_history from anon;
revoke all on table public.profiles from public;
revoke all on table public.objects from public;
revoke all on table public.tasks from public;
revoke all on table public.task_status_history from public;

-- 3. Гранты приложению. DELETE не выдаётся никому: удаление = архивирование.
revoke insert, update, delete on table public.profiles from authenticated;
revoke insert, update, delete on table public.objects from authenticated;
revoke insert, update, delete on table public.tasks from authenticated;
revoke insert, update, delete on table public.task_status_history from authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.objects to authenticated;
grant select on table public.tasks to authenticated;
grant select on table public.task_status_history to authenticated;

grant insert (title, address, created_by) on table public.objects to authenticated;
grant update (title, address) on table public.objects to authenticated;
grant insert (object_id, title, description, assignee_id, author_id) on table public.tasks to authenticated;
grant update (title, description, object_id, assignee_id) on table public.tasks to authenticated;

-- 4. RLS на всех четырёх таблицах. `force row level security` не включаем: миграции и
--    триггеры работают владельцем таблицы, а клиентские роли и так ограничены политиками.
alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_status_history enable row level security;

-- 5. profiles: читать может любой аутентифицированный с профилем (нужны имена исполнителей).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.current_role() is not null);

-- 6. objects: manager — все активные; executor — только объекты со своей активной задачей.
drop policy if exists objects_select on public.objects;
create policy objects_select on public.objects
  for select to authenticated
  using (
    archived_at is null
    and (
      public.is_manager()
      or exists (
        select 1
        from public.tasks t
        where t.object_id = objects.id
          and t.assignee_id = auth.uid()
          and t.archived_at is null
      )
    )
  );

drop policy if exists objects_insert on public.objects;
create policy objects_insert on public.objects
  for insert to authenticated
  with check (public.is_manager() and created_by = auth.uid());

drop policy if exists objects_update on public.objects;
create policy objects_update on public.objects
  for update to authenticated
  using (public.is_manager() and archived_at is null)
  with check (public.is_manager());

-- 7. tasks: manager — все активные; executor — только свои. Архивные не видит никто.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    archived_at is null
    and (public.is_manager() or assignee_id = auth.uid())
  );

-- Создавать задачу может только manager, только от своего имени, только в статусе new и
-- только на активном объекте. Проверка ролей акторов — триггер validate_task_actors (D03).
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    public.is_manager()
    and author_id = auth.uid()
    and status = 'new'
    and exists (
      select 1 from public.objects o
      where o.id = tasks.object_id and o.archived_at is null
    )
  );

-- Правка полей (title/description/object_id/assignee_id) — только manager; статус не входит
-- в колоночный грант и меняется исключительно через RPC.
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_manager() and archived_at is null)
  with check (public.is_manager());

-- 8. История: чтение по видимости задачи (RLS tasks применяется к подзапросу),
--    политик на insert/update/delete нет — запись только у триггеров security definer.
drop policy if exists history_select on public.task_status_history;
create policy history_select on public.task_status_history
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_status_history.task_id
    )
  );
