-- supabase/tests/archive_test.sql
-- pgTAP: архивирование только менеджером, идемпотентность, история не растёт.
-- @acceptance A03.8

begin;

select plan(6);

insert into public.objects (id, title, address, created_by)
values ('aaaaaaaa-0000-4000-8000-0000000000d5', 'Тестовый объект архива', 'ул. Тестовая, 3',
        '11111111-1111-4111-8111-111111111111');

insert into public.tasks (id, object_id, title, assignee_id, author_id, status)
values
  ('bbbbbbbb-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-0000000000d5',
   'A03.8 архивируемая задача', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'new'),
  ('bbbbbbbb-0000-4000-8000-000000000008', 'aaaaaaaa-0000-4000-8000-0000000000d5',
   'A03.8 чужая архивация', '33333333-3333-4333-8333-333333333333',
   '11111111-1111-4111-8111-111111111111', 'new');

-- A03.8: первое архивирование менеджером выставляет archived_at.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","aud":"authenticated"}', true);
set local role authenticated;
select public.archive_task('bbbbbbbb-0000-4000-8000-000000000007');
reset role;

select set_config('test.archived_at',
  (select archived_at::text from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000007'),
  true);

select ok(
  current_setting('test.archived_at') is not null
  and current_setting('test.archived_at') <> '',
  'A03.8 первое архивирование задачи выставляет archived_at'
);

-- A03.8: повторный вызов не меняет дату и не пишет историю.
select set_config('test.history_before',
  (select count(*)::text from public.task_status_history
    where task_id = 'bbbbbbbb-0000-4000-8000-000000000007'), true);
set local role authenticated;
select public.archive_task('bbbbbbbb-0000-4000-8000-000000000007');
reset role;

select ok(
  (select archived_at from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000007')
    = current_setting('test.archived_at')::timestamptz
  and (select count(*)::text from public.task_status_history
        where task_id = 'bbbbbbbb-0000-4000-8000-000000000007')
      = current_setting('test.history_before'),
  'A03.8 повторное архивирование идемпотентно: archived_at и история не изменились'
);

-- A03.8: исполнитель не может архивировать задачу.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","aud":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.archive_task('bbbbbbbb-0000-4000-8000-000000000008');
    perform set_config('test.a038_executor', 'allowed', true);
  exception when others then
    perform set_config('test.a038_executor', sqlstate, true);
  end;
end
$$;
reset role;

select ok(
  current_setting('test.a038_executor') = 'P0403'
  and (select archived_at from public.tasks where id = 'bbbbbbbb-0000-4000-8000-000000000008') is null,
  'A03.8 исполнитель: архивирование задачи → P0403, archived_at не выставлен'
);

-- A03.8: архивирование объекта менеджером идемпотентно, задачи не трогаются.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","aud":"authenticated"}', true);
set local role authenticated;
select public.archive_object('aaaaaaaa-0000-4000-8000-0000000000d5');
reset role;

select set_config('test.object_archived',
  (select archived_at::text from public.objects where id = 'aaaaaaaa-0000-4000-8000-0000000000d5'),
  true);

set local role authenticated;
select public.archive_object('aaaaaaaa-0000-4000-8000-0000000000d5');
reset role;

select ok(
  current_setting('test.object_archived') is not null
  and current_setting('test.object_archived') <> ''
  and (select archived_at from public.objects where id = 'aaaaaaaa-0000-4000-8000-0000000000d5')
      = current_setting('test.object_archived')::timestamptz,
  'A03.8 архивирование объекта идемпотентно'
);

select ok(
  (select count(*) from public.tasks
    where object_id = 'aaaaaaaa-0000-4000-8000-0000000000d5'
      and archived_at is null) = 1,
  'A03.8 задачи архивного объекта не удаляются и не архивируются каскадно строками'
);

select ok(
  (select count(*) from public.task_status_history
    where task_id in ('bbbbbbbb-0000-4000-8000-000000000007',
                      'bbbbbbbb-0000-4000-8000-000000000008')) = 2,
  'A03.8 архивирование не пишет в историю статусов'
);

select * from finish();
rollback;
