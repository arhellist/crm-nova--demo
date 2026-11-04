-- supabase/tests/history_test.sql
-- pgTAP: прямой UPDATE статуса и запись в историю запрещены; guard-триггер и гранты.
-- @acceptance A03.6
-- @acceptance A03.7
--
-- Проверяется два рубежа: колоночные гранты не дают клиенту тронуть status и историю,
-- а guard-триггер отклоняет UPDATE status даже у роли-владельца таблицы (INV-003, INV-004).

begin;

select plan(5);

insert into public.objects (id, title, address, created_by)
values ('aaaaaaaa-0000-4000-8000-0000000000d4', 'Тестовый объект истории', 'ул. Тестовая, 2',
        '11111111-1111-4111-8111-111111111111');

insert into public.tasks (id, object_id, title, assignee_id, author_id, status)
values ('bbbbbbbb-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-0000000000d4',
        'A03.6 прямой UPDATE', '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111', 'new');

-- A03.6, рубеж 1: у authenticated нет гранта на колонку status.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","aud":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    update public.tasks set status = 'accepted'
     where id = 'bbbbbbbb-0000-4000-8000-000000000006';
    perform set_config('test.a036_client', 'allowed', true);
  exception when others then
    perform set_config('test.a036_client', sqlstate, true);
  end;
end
$$;
reset role;

select ok(
  current_setting('test.a036_client') = '42501'
  and (select status::text from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000006') = 'new',
  'A03.6 клиент: прямой UPDATE status отклонён (нет колоночного гранта), статус не изменён'
);

-- A03.6, рубеж 2: даже владелец таблицы не проходит guard без флага RPC.
do $$
begin
  begin
    update public.tasks set status = 'accepted'
     where id = 'bbbbbbbb-0000-4000-8000-000000000006';
    perform set_config('test.a036_guard', 'allowed', true);
  exception when others then
    perform set_config('test.a036_guard', sqlstate, true);
  end;
end
$$;

select ok(
  current_setting('test.a036_guard') = 'P0403'
  and (select status::text from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000006') = 'new',
  'A03.6 guard_task_status: прямой UPDATE status без флага RPC → P0403'
);

-- A03.7: вставка строки истории клиентом запрещена.
set local role authenticated;
do $$
begin
  begin
    insert into public.task_status_history (task_id, from_status, to_status, changed_by)
    values ('bbbbbbbb-0000-4000-8000-000000000006', 'new', 'in_progress',
            '22222222-2222-4222-8222-222222222222');
    perform set_config('test.a037_insert', 'allowed', true);
  exception when others then
    perform set_config('test.a037_insert', sqlstate, true);
  end;
end
$$;
reset role;

select ok(
  current_setting('test.a037_insert') = '42501'
  and (select count(*) from public.task_status_history
        where task_id = 'bbbbbbbb-0000-4000-8000-000000000006') = 1,
  'A03.7 INSERT в task_status_history запрещён, строк не добавилось'
);

-- A03.7, продолжение: история неизменяема и для владельца таблицы.
do $$
declare
  v_history_id bigint;
begin
  select min(id) into v_history_id
    from public.task_status_history
   where task_id = 'bbbbbbbb-0000-4000-8000-000000000006';

  begin
    update public.task_status_history set comment = 'подмена'
     where id = v_history_id;
    perform set_config('test.a037_update', 'allowed', true);
  exception when others then
    perform set_config('test.a037_update', sqlstate, true);
  end;

  begin
    delete from public.task_status_history where id = v_history_id;
    perform set_config('test.a037_delete', 'allowed', true);
  exception when others then
    perform set_config('test.a037_delete', sqlstate, true);
  end;
end
$$;

select ok(
  current_setting('test.a037_update') = 'P0403',
  'A03.7 UPDATE истории отклонён guard_history_immutable (P0403)'
);
select ok(
  current_setting('test.a037_delete') = 'P0403'
  and (select count(*) from public.task_status_history
        where task_id = 'bbbbbbbb-0000-4000-8000-000000000006') = 1,
  'A03.7 DELETE истории отклонён, строка на месте'
);

select * from finish();
rollback;
