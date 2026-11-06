-- supabase/tests/views_test.sql
-- pgTAP для отчётных вьюх КОНТУРА РЕПЛИКИ (PostgreSQL 16).
-- @acceptance A10.2
-- @acceptance A10.3
--
-- Запуск: на подписчике, после init-контура реплики (infra/replica):
--   psql "$REPLICA_DATABASE_URL" -f supabase/tests/views_test.sql
-- На primary вьюх нет — этот файл к нему не применяется.
--
-- Проверяется:
--  - подписка nova_sub находится в streaming (A10.2);
--  - три вьюхи существуют, не содержат email/description/комментариев (INV-011);
--  - агрегаты вьюх совпадают с прямым подсчётом по базовым таблицам на тех же данных (A10.3).

begin;

select plan(13);

-- A10.2: подписка существует и получает изменения (pid у активного worker).
select ok(
  exists (select 1 from pg_stat_subscription where subname = 'nova_sub' and pid is not null),
  'A10.2 подписка nova_sub в состоянии streaming'
);

-- Структура вьюх: имена и состав колонок зафиксированы §9 data-model.
select has_view('public', 'report_objects', 'A10.3 report_objects существует');
select has_view('public', 'report_workload', 'A10.3 report_workload существует');
select has_view('public', 'report_managers', 'DEC-061 report_managers существует');
select has_view('public', 'report_status_ages', 'A10.3 report_status_ages существует');

select columns_are(
  'public',
  'report_objects',
  array[
    'id', 'title', 'address', 'tasks_total', 'tasks_new', 'tasks_in_progress',
    'tasks_on_review', 'tasks_rework', 'tasks_accepted', 'accepted_share', 'last_activity_at'
  ],
  'A10.3 report_objects: только агрегаты и поля объекта'
);

select columns_are(
  'public',
  'report_workload',
  array[
    'assignee_id', 'full_name', 'tasks_total', 'tasks_new', 'tasks_in_progress',
    'tasks_on_review', 'tasks_rework', 'tasks_accepted', 'oldest_open_at'
  ],
  'A10.3 report_workload без email и контактов'
);

select columns_are(
  'public',
  'report_status_ages',
  array['day', 'avg_seconds_in_status', 'max_seconds_in_status'],
  'A10.3 report_status_ages без комментариев и авторов'
);

-- Фикстура: один объект, два исполнителя, задачи в разных статусах.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'manager@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'executor1@example.invalid'),
  ('22222222-2222-4222-8222-999999999999', 'executor2@example.invalid');

insert into public.profiles (id, full_name, role) values
  ('11111111-1111-4111-8111-111111111111', 'Ирина Волкова', 'manager'),
  ('22222222-2222-4222-8222-222222222222', 'Пётр Смирнов', 'executor'),
  ('22222222-2222-4222-8222-999999999999', 'Анна Ким', 'executor');

insert into public.objects (id, title, address, created_by) values
  ('33333333-3333-4333-8333-333333333333', 'ЖК Северный', 'ул. Лесная, 12', '11111111-1111-4111-8111-111111111111');

insert into public.tasks (id, object_id, title, assignee_id, author_id, status) values
  ('44444444-4444-4444-8444-000000000001', '33333333-3333-4333-8333-333333333333', 'Монтаж окон', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'in_progress'),
  ('44444444-4444-4444-8444-000000000002', '33333333-3333-4333-8333-333333333333', 'Стяжка', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'on_review'),
  ('44444444-4444-4444-8444-000000000003', '33333333-3333-4333-8333-333333333333', 'Кровля', '22222222-2222-4222-8222-999999999999', '11111111-1111-4111-8111-111111111111', 'accepted');

-- A10.3: агрегаты объекта совпадают с прямым подсчётом по tasks.
select results_eq(
  $$ select tasks_total, tasks_in_progress, tasks_on_review, tasks_accepted
       from public.report_objects
      where id = '33333333-3333-4333-8333-333333333333' $$,
  $$ select count(*), count(*) filter (where status = 'in_progress'),
            count(*) filter (where status = 'on_review'), count(*) filter (where status = 'accepted')
       from public.tasks
      where object_id = '33333333-3333-4333-8333-333333333333' and archived_at is null $$,
  'A10.3 report_objects считает статусы так же, как base-таблица'
);

-- A10.3: загрузка исполнителя совпадает с подсчётом его задач.
select results_eq(
  $$ select tasks_total, tasks_in_progress, tasks_on_review
       from public.report_workload
      where assignee_id = '22222222-2222-4222-8222-222222222222' $$,
  $$ select count(*), count(*) filter (where status = 'in_progress'),
            count(*) filter (where status = 'on_review')
       from public.tasks
      where assignee_id = '22222222-2222-4222-8222-222222222222' and archived_at is null $$,
  'A10.3 report_workload считает активные задачи без email'
);

-- До архива: report_managers считает 3 авторские задачи менеджера.
select results_eq(
  $$ select tasks_total, tasks_in_progress, tasks_on_review, tasks_accepted
       from public.report_managers
      where manager_id = '11111111-1111-4111-8111-111111111111' $$,
  $$ select 3::bigint, 1::bigint, 1::bigint, 1::bigint $$,
  'DEC-062 report_managers считает авторские задачи на активном объекте'
);

-- A10.3: архивные задачи не попадают в сводку.
update public.objects set archived_at = now()
 where id = '33333333-3333-4333-8333-333333333333';

select is_empty(
  $$ select 1 from public.report_objects where id = '33333333-3333-4333-8333-333333333333' $$,
  'A10.3 архивный объект не показывается в report_objects'
);

-- DEC-062: после архива объекта KPI постановщика обнуляется (каскадное скрытие).
select results_eq(
  $$ select tasks_total, tasks_new, tasks_accepted
       from public.report_managers
      where manager_id = '11111111-1111-4111-8111-111111111111' $$,
  $$ select 0::bigint, 0::bigint, 0::bigint $$,
  'DEC-062 report_managers исключает задачи архивного объекта'
);

-- A10.2: история «на проверке» не содержит комментариев и авторов во вьюхе.
select ok(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'report_status_ages'
       and column_name in ('comment', 'changed_by', 'email', 'description')
  ),
  'A10.2 вьюха истории не выгружает комментарии и авторов'
);

select * from finish();

rollback;
