-- supabase/tests/rls_test.sql
-- pgTAP: изоляция исполнителя, запрет записи и удаления, отказ для anon.
-- @acceptance A02.2
-- @acceptance A02.3
-- @acceptance A02.5
-- @acceptance A02.6
--
-- Под ролью выполняется только сам запрос, результат складывается в настройку сессии;
-- утверждения — после `reset role`, чтобы права pgTAP не влияли на проверку.
begin;

select plan(9);

-- A02.5: anon не читает таблицы и не вызывает помощников роли.
set local role anon;
do $$
begin
  begin
    perform count(*) from public.objects;
    perform set_config('test.anon_objects', 'allowed', true);
  exception when insufficient_privilege then
    perform set_config('test.anon_objects', 'denied', true);
  end;
  begin
    perform public.current_role();
    perform set_config('test.anon_role', 'allowed', true);
  exception when insufficient_privilege then
    perform set_config('test.anon_role', 'denied', true);
  end;
end
$$;
reset role;

select ok(current_setting('test.anon_objects') = 'denied', 'A02.5 anon: select objects запрещён');
select ok(current_setting('test.anon_role') = 'denied', 'A02.5 anon: current_role() запрещён');

-- A02.2: исполнитель видит только свои задачи и не видит чужую по прямому id.
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","aud":"authenticated"}',
  true
);
set local role authenticated;
select set_config('test.own_tasks', (select count(*)::text from public.tasks), true);
select set_config(
  'test.foreign_task',
  (select count(*)::text from public.tasks where id = '77777777-7777-4777-8777-777777777773'),
  true
);
select set_config('test.own_objects', (select count(*)::text from public.objects), true);
reset role;

select ok(current_setting('test.own_tasks') = '4', 'A02.2 исполнитель видит только свои четыре задачи');
select ok(current_setting('test.foreign_task') = '0', 'A02.2 чужая задача по прямому id — 0 строк');
select ok(current_setting('test.own_objects') = '2', 'A02.2 видны только объекты со своей задачей');

-- A02.3: попытка сменить статус чужой задачи отклоняется, статус не меняется.
set local role authenticated;
do $$
begin
  begin
    update public.tasks
       set status = 'accepted'
     where id = '77777777-7777-4777-8777-777777777773';
    perform set_config('test.status_update', 'allowed', true);
  exception when insufficient_privilege then
    perform set_config('test.status_update', 'denied', true);
  end;
end
$$;
reset role;

select ok(current_setting('test.status_update') = 'denied', 'A02.3 прямой UPDATE status запрещён');
select ok(
  (select status::text from public.tasks where id = '77777777-7777-4777-8777-777777777773') = 'on_review',
  'A02.3 статус чужой задачи не изменился'
);

-- A02.6: исполнитель не может удалить даже свою задачу; строка остаётся.
set local role authenticated;
do $$
begin
  begin
    delete from public.tasks where id = '77777777-7777-4777-8777-777777777771';
    perform set_config('test.delete_task', 'allowed', true);
  exception when insufficient_privilege then
    perform set_config('test.delete_task', 'denied', true);
  end;
end
$$;
reset role;

select ok(current_setting('test.delete_task') = 'denied', 'A02.6 DELETE задачи запрещён');
select ok(
  (select count(*) from public.tasks where id = '77777777-7777-4777-8777-777777777771') = 1,
  'A02.6 задача осталась на месте'
);

select * from finish();
rollback;
