-- 0004_status_machine.sql
-- Машина статусов: единственный путь смены статуса — public.change_task_status (INV-003).
--
-- Почему так: права и переходы должны работать при прямом вызове API в обход интерфейса
-- (ADR-0002). Поэтому матрица 5×5 и проверка роли живут в БД, а не в UI. Матрица —
-- литеральный список внутри функции: её изменение обязано быть миграцией, а не правкой строки.
-- SQLSTATE — часть контракта с клиентом (domain-rules §6):
--   P0400 — задача не найдена/архивирована или комментарий длиннее 2000;
--   P0403 — нет прав на задачу или на переход;
--   P0422 — пары нет в матрице либо отсутствует обязательный комментарий возврата.
--
-- `security definer` обязателен: функция меняет status, хотя у клиента нет колоночного
-- гранта на эту колонку. `search_path` зафиксирован (INV-008), `execute` выдан только
-- `authenticated` в 0007.

create or replace function public.change_task_status(
  p_task_id uuid,
  p_target public.task_status,
  p_comment text default null
)
returns public.task_status
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_from public.task_status;
  v_assignee_id uuid;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  -- Блокируем задачу до конца транзакции: две параллельные смены статуса не должны
  -- прочитать одинаковый «из» и записать две строки истории.
  select t.status, t.assignee_id
    into v_from, v_assignee_id
    from public.tasks t
   where t.id = p_task_id
     and t.archived_at is null
     for update;

  if not found then
    raise exception using errcode = 'P0400', message = 'task_not_found';
  end if;

  -- 1. Кто вообще имеет право двигать эту задачу: менеджер или её исполнитель.
  if not (public.is_manager() or v_assignee_id = auth.uid()) then
    raise exception using errcode = 'P0403', message = 'insufficient_privilege';
  end if;

  -- 2. Матрица переходов (domain-rules §1). Переход в тот же статус тоже отсутствует
  --    в списке и потому отклоняется.
  if not exists (
    select 1
      from (values
        ('new'::public.task_status,         'in_progress'::public.task_status, 'executor'),
        ('in_progress'::public.task_status, 'on_review'::public.task_status,   'executor'),
        ('on_review'::public.task_status,   'accepted'::public.task_status,    'manager'),
        ('on_review'::public.task_status,   'rework'::public.task_status,      'manager'),
        ('rework'::public.task_status,      'in_progress'::public.task_status, 'executor')
      ) as m(from_status, to_status, actor)
     where m.from_status = v_from
       and m.to_status = p_target
  ) then
    raise exception using errcode = 'P0422', message = 'transition_not_allowed';
  end if;

  -- 3. Роль на конкретный переход: исполнитель двигает только свои задачи,
  --    принятие и возврат — только менеджер.
  if v_from = 'on_review' and p_target in ('accepted', 'rework') then
    if not public.is_manager() then
      raise exception using errcode = 'P0403', message = 'insufficient_privilege';
    end if;
  elsif v_assignee_id is distinct from auth.uid() then
    raise exception using errcode = 'P0403', message = 'insufficient_privilege';
  end if;

  -- 4. Возврат на доработку без содержательного комментария недопустим (SEC-07).
  if v_from = 'on_review' and p_target = 'rework' then
    if v_comment is null then
      raise exception using errcode = 'P0422', message = 'comment_required';
    end if;
    if length(v_comment) > 2000 then
      raise exception using errcode = 'P0400', message = 'comment_too_long';
    end if;
  end if;

  -- 5. Флаг для guard_task_status: только этот участок кода имеет право менять status.
  --    Комментарий передаётся триггеру истории через отдельную настройку сессии.
  perform set_config('app.status_change', 'on', true);
  perform set_config('app.transition_comment', coalesce(v_comment, ''), true);

  update public.tasks
     set status = p_target,
         updated_at = now()
   where id = p_task_id;

  perform set_config('app.status_change', '', true);
  perform set_config('app.transition_comment', '', true);

  return p_target;
end;
$$;

comment on function public.change_task_status(uuid, public.task_status, text) is
  'Единственный путь смены статуса задачи (INV-003). Матрица: new→in_progress, in_progress→on_review, on_review→accepted, on_review→rework (комментарий обязателен), rework→in_progress. Исполнитель двигает только свои задачи, принятие и возврат — manager. Ошибки: P0400 задача не найдена, P0403 нет прав, P0422 недопустимый переход или нет комментария возврата.';
