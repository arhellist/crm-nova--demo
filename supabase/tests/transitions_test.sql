-- supabase/tests/transitions_test.sql
-- pgTAP: машина статусов — разрешённые переходы, отказ по матрице и роли, комментарий возврата.
-- @acceptance A03.1
-- @acceptance A03.2
-- @acceptance A03.3
-- @acceptance A03.4
-- @acceptance A03.5
--
-- Фикстуры создаются внутри транзакции и откатываются; профили берутся из seed.
-- Под ролью выполняется только вызов RPC, результат складывается в настройку сессии;
-- утверждения — после `reset role`, чтобы права pgTAP не влияли на проверку.

begin;

select plan(6);

-- Объект и задачи для сценариев A03.1–A03.5.
insert into public.objects (id, title, address, created_by)
values ('aaaaaaaa-0000-4000-8000-0000000000d3', 'Тестовый объект D03', 'ул. Тестовая, 1',
        '11111111-1111-4111-8111-111111111111');

insert into public.tasks (id, object_id, title, assignee_id, author_id, status)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000d3',
   'A03.1 new→in_progress', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'new'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-0000000000d3',
   'A03.2 manager new→accepted', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'new'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-0000000000d3',
   'A03.3 on_review→accepted', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'on_review'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-0000000000d3',
   'A03.4 чужая задача', '33333333-3333-4333-8333-333333333333',
   '11111111-1111-4111-8111-111111111111', 'new'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-0000000000d3',
   'A03.5 возврат без комментария', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'on_review');

-- A03.1: исполнитель-владелец переводит new → in_progress.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","aud":"authenticated"}', true);
set local role authenticated;
select set_config('test.a031',
  public.change_task_status('bbbbbbbb-0000-4000-8000-000000000001', 'in_progress')::text, true);
reset role;

select ok(
  current_setting('test.a031') = 'in_progress'
  and (select status::text from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000001') = 'in_progress'
  and (select count(*) from public.task_status_history
        where task_id = 'bbbbbbbb-0000-4000-8000-000000000001'
          and from_status = 'new' and to_status = 'in_progress'
          and changed_by = '22222222-2222-4222-8222-222222222222') = 1,
  'A03.1 new→in_progress исполнителем: статус и ровно одна строка истории с актором'
);

-- A03.2: менеджер не может прыгнуть new → accepted.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","aud":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.change_task_status('bbbbbbbb-0000-4000-8000-000000000002', 'accepted');
    perform set_config('test.a032', 'allowed', true);
  exception when others then
    perform set_config('test.a032', sqlstate, true);
  end;
end
$$;
reset role;

select ok(
  current_setting('test.a032') = 'P0422'
  and (select status::text from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000002') = 'new'
  and (select count(*) from public.task_status_history
        where task_id = 'bbbbbbbb-0000-4000-8000-000000000002'
          and to_status = 'accepted') = 0,
  'A03.2 new→accepted менеджером: P0422, статус и история не изменены'
);

-- A03.3: on_review → accepted менеджером.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","aud":"authenticated"}', true);
set local role authenticated;
select set_config('test.a033',
  public.change_task_status('bbbbbbbb-0000-4000-8000-000000000003', 'accepted')::text, true);
reset role;

select ok(
  current_setting('test.a033') = 'accepted'
  and (select status::text from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000003') = 'accepted'
  and (select count(*) from public.task_status_history
        where task_id = 'bbbbbbbb-0000-4000-8000-000000000003'
          and from_status = 'on_review' and to_status = 'accepted'
          and changed_by = '11111111-1111-4111-8111-111111111111') = 1,
  'A03.3 on_review→accepted менеджером: статус и строка истории'
);

-- A03.4: исполнитель не может двигать чужую задачу.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","aud":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.change_task_status('bbbbbbbb-0000-4000-8000-000000000004', 'in_progress');
    perform set_config('test.a034', 'allowed', true);
  exception when others then
    perform set_config('test.a034', sqlstate, true);
  end;
end
$$;
reset role;

select ok(
  current_setting('test.a034') = 'P0403'
  and (select status::text from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000004') = 'new'
  and (select count(*) from public.task_status_history
        where task_id = 'bbbbbbbb-0000-4000-8000-000000000004'
          and from_status is not null) = 0,
  'A03.4 чужая задача: P0403, истории переходов нет'
);

-- A03.5: возврат на доработку без содержательного комментария запрещён.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","aud":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.change_task_status('bbbbbbbb-0000-4000-8000-000000000005', 'rework', '   ');
    perform set_config('test.a035', 'allowed', true);
  exception when others then
    perform set_config('test.a035', sqlstate, true);
  end;
end
$$;
reset role;

select ok(
  current_setting('test.a035') = 'P0422'
  and (select status::text from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000005') = 'on_review'
  and (select count(*) from public.task_status_history
        where task_id = 'bbbbbbbb-0000-4000-8000-000000000005'
          and to_status = 'rework') = 0,
  'A03.5 on_review→rework без комментария: P0422, статус прежний'
);

-- Полная матрица 5×5: 5 пар проходят для своей роли, 20 отклоняются.
create temporary table pair_results (
  from_status text,
  to_status text,
  outcome text,
  detail text
) on commit drop;

do $$
declare
  v_from public.task_status;
  v_to public.task_status;
  v_actor text;
  v_allowed boolean;
  v_task_id uuid;
  v_comment text;
begin
  for v_from, v_to in
    select f, t
      from unnest(enum_range(null::public.task_status)) f
      cross join unnest(enum_range(null::public.task_status)) t
  loop
    v_allowed := (v_from, v_to) in (
      ('new', 'in_progress'),
      ('in_progress', 'on_review'),
      ('on_review', 'accepted'),
      ('on_review', 'rework'),
      ('rework', 'in_progress')
    );
    v_actor := case
      when v_allowed and v_from = 'on_review' then '11111111-1111-4111-8111-111111111111'
      when v_allowed then '22222222-2222-4222-8222-222222222222'
      else '11111111-1111-4111-8111-111111111111'
    end;
    v_comment := case when v_from = 'on_review' and v_to = 'rework' then 'доработка' else null end;

    v_task_id := gen_random_uuid();
    insert into public.tasks (id, object_id, title, assignee_id, author_id, status)
    values (v_task_id, 'aaaaaaaa-0000-4000-8000-0000000000d3', 'pair ' || v_from || '→' || v_to,
            '22222222-2222-4222-8222-222222222222',
            '11111111-1111-4111-8111-111111111111', v_from);

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_actor, 'aud', 'authenticated')::text, true);

    begin
      perform public.change_task_status(v_task_id, v_to, v_comment);
      insert into pair_results
      select v_from::text, v_to::text, 'allowed',
             (select status::text from public.tasks where id = v_task_id);
    exception when others then
      insert into pair_results values (v_from::text, v_to::text, 'rejected', sqlstate);
    end;
  end loop;
end
$$;

select ok(
  (select count(*) from pair_results) = 25
  and (select count(*) from pair_results where outcome = 'allowed') = 5
  and (select count(*) from pair_results where outcome = 'allowed' and detail = to_status) = 5
  and (select count(*) from pair_results where outcome = 'rejected') = 20,
  'матрица 5×5: 5 разрешённых пар проходят, 20 запрещённых отклоняются'
);

select * from finish();
rollback;
