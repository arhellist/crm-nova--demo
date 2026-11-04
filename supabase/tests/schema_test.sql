-- supabase/tests/schema_test.sql
-- pgTAP: помощники роли и наполнение seed.
-- @acceptance A02.1
-- @acceptance A02.4
--
-- Запуск: `supabase test db` (pgTAP включён в образ supabase/postgres).
-- Под ролью `authenticated` выполняются только сами запросы, результат запоминается в настройке
-- сессии; утверждения — после `reset role`, чтобы права на функции pgTAP не влияли на проверку.
begin;

select plan(5);

-- A02.1: роль берётся из profiles.role, а не из claim `role` в JWT.
-- В claims намеренно подставлена manager, в profiles у пользователя — executor (INV-005).
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"manager","aud":"authenticated"}',
  true
);
set local role authenticated;
select set_config('test.role', (select public.current_role())::text, true);
select set_config('test.is_manager', (select public.is_manager())::text, true);
reset role;

select ok(
  current_setting('test.role') = 'executor',
  'A02.1 current_role() читает profiles.role, claim role игнорируется'
);
select ok(
  current_setting('test.is_manager') = 'false',
  'A02.1 is_manager() = false для пользователя с ролью executor'
);

-- A02.4: seed наполняет все пять статусов, минимум 8 задач и 3 объекта.
select ok(
  (select count(*) from public.objects where archived_at is null) = 3,
  'A02.4 seed: три неархивированных объекта'
);
select ok(
  (select count(*) from public.tasks) >= 8,
  'A02.4 seed: не меньше восьми задач'
);
select ok(
  (
    select array_agg(distinct status::text order by status::text)
    from public.tasks
  ) = array['accepted', 'in_progress', 'new', 'on_review', 'rework'],
  'A02.4 seed: присутствуют все пять статусов'
);

select * from finish();
rollback;
