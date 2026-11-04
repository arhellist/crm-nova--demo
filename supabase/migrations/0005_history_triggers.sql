-- 0005_history_triggers.sql
-- Триггеры записи: охрана статуса, неизменяемая история, проверка акторов, updated_at.
--
-- Почему так:
--  - status меняет только public.change_task_status: guard_task_status читает флаг сессии
--    app.status_change, который клиент выставить не может (нет колоночного гранта на status),
--    иначе прямой UPDATE обошёл бы матрицу (INV-003);
--  - history пополняет только AFTER-триггер: у клиента нет INSERT/UPDATE/DELETE на таблицу,
--    а guard_history_immutable запрещает правку и удаление даже владельцу (INV-004, T05);
--  - актор берётся из auth.uid(), а не из параметра RPC; fallback на автора нужен только
--    локальному seed, который выполняется без JWT;
--  - validate_task_actors держит правила §2 domain-rules: исполнитель — только executor,
--    автор — только manager, объект активен, исполнителя нельзя менять в работе и на проверке.

create or replace function public.guard_task_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.status_change', true), '') <> 'on' then
    raise exception using errcode = 'P0403', message = 'direct_status_change_forbidden';
  end if;
  return new;
end;
$$;

comment on function public.guard_task_status() is
  'Не пропускает UPDATE tasks.status вне public.change_task_status; ошибка P0403 (INV-003).';

create or replace function public.log_task_status()
returns trigger
language plpgsql
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

comment on function public.log_task_status() is
  'Пишет ровно одну строку истории на смену статуса; changed_by = auth.uid() (INV-004, T05).';

create or replace function public.log_task_created()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Создание всегда стартует в new: клиент не может передать другой статус (нет гранта).
  insert into public.task_status_history (task_id, from_status, to_status, changed_by)
  values (new.id, null, 'new', coalesce(auth.uid(), new.author_id));
  return new;
end;
$$;

comment on function public.log_task_created() is
  'Фиксирует создание задачи строкой истории null → new; автор — auth.uid() или author_id для seed.';

create or replace function public.validate_task_actors()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_assignee_role public.user_role;
  v_author_role public.user_role;
  v_object_archived timestamptz;
begin
  select p.role into v_assignee_role
    from public.profiles p
   where p.id = new.assignee_id;
  if v_assignee_role is null then
    raise exception using errcode = 'P0400', message = 'assignee_not_found';
  end if;
  if v_assignee_role <> 'executor' then
    raise exception using errcode = 'P0400', message = 'assignee_must_be_executor';
  end if;

  select p.role into v_author_role
    from public.profiles p
   where p.id = new.author_id;
  if v_author_role is distinct from 'manager' then
    raise exception using errcode = 'P0403', message = 'author_must_be_manager';
  end if;

  select o.archived_at into v_object_archived
    from public.objects o
   where o.id = new.object_id;
  if not found then
    raise exception using errcode = 'P0400', message = 'object_not_found';
  end if;
  if v_object_archived is not null then
    raise exception using errcode = 'P0400', message = 'object_archived';
  end if;

  if tg_op = 'UPDATE' then
    if new.author_id is distinct from old.author_id then
      raise exception using errcode = 'P0403', message = 'author_immutable';
    end if;
    -- Исполнителя меняют только пока задача не взята в работу (domain-rules §2).
    if new.assignee_id is distinct from old.assignee_id
       and old.status not in ('new', 'rework') then
      raise exception using errcode = 'P0422', message = 'assignee_change_not_allowed';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.validate_task_actors() is
  'Проверяет роли акторов, активность объекта и допустимость смены исполнителя (§2 domain-rules).';

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.touch_updated_at() is
  'Обновляет updated_at на каждом UPDATE; клиент не управляет этим полем.';

create or replace function public.guard_history_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception using errcode = 'P0403', message = 'history_is_append_only';
end;
$$;

comment on function public.guard_history_immutable() is
  'Запрещает UPDATE и DELETE в task_status_history: история append-only (INV-004).';

-- Порядок BEFORE-триггеров алфавитный: guard_task_status срабатывает раньше validate_task_actors,
-- поэтому прямой update status падает на охране, не доходя до проверок акторов.
drop trigger if exists tasks_guard_status on public.tasks;
create trigger tasks_guard_status
  before update of status on public.tasks
  for each row execute function public.guard_task_status();

drop trigger if exists tasks_log_status on public.tasks;
create trigger tasks_log_status
  after update of status on public.tasks
  for each row execute function public.log_task_status();

drop trigger if exists tasks_log_created on public.tasks;
create trigger tasks_log_created
  after insert on public.tasks
  for each row execute function public.log_task_created();

drop trigger if exists tasks_validate_actors on public.tasks;
create trigger tasks_validate_actors
  before insert or update on public.tasks
  for each row execute function public.validate_task_actors();

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

drop trigger if exists objects_touch_updated_at on public.objects;
create trigger objects_touch_updated_at
  before update on public.objects
  for each row execute function public.touch_updated_at();

drop trigger if exists history_immutable on public.task_status_history;
create trigger history_immutable
  before update or delete on public.task_status_history
  for each row execute function public.guard_history_immutable();
