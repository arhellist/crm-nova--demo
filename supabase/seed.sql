-- supabase/seed.sql
-- Демо-данные локального стека: 1 manager, 2 executor, 3 объекта, 8 задач по всем пяти статусам.
--
-- Seed идемпотентен: детерминированные UUID + `on conflict do nothing`; история вставляется
-- только если такой пары (task_id, from_status, to_status) ещё нет. Секретов нет: пароль
-- демонстрационный и совпадает с локальным окружением, `service_role` не используется (INV-006).

-- 1. Пользователи Auth (локальный стек). Email подтверждён, чтобы вход не требовал письма.
--
-- Токены подтверждения задаются пустой строкой, а не NULL: GoTrue сканирует их в `string`
-- и на NULL падает 500 «converting NULL to string is unsupported» — вход в локальный стенд
-- был невозможен (DEC-036). Строка `auth.identities` обязательна: без неё GoTrue не связывает
-- email-провайдера с пользователем, и `/auth/v1/token` не находит учётную запись.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'manager@nova.local',
   crypt('nova-local-password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Ирина Волкова"}'::jsonb,
   now(), now(), '', '', '', '', '', '', '', ''),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'executor1@nova.local',
   crypt('nova-local-password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Пётр Смирнов"}'::jsonb,
   now(), now(), '', '', '', '', '', '', '', ''),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'executor2@nova.local',
   crypt('nova-local-password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Анна Ковалёва"}'::jsonb,
   now(), now(), '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

-- 1б. Идентичности email-провайдера: без них вход по паролю не находит пользователя.
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  ('a1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111',
   '{"sub":"11111111-1111-4111-8111-111111111111","email":"manager@nova.local","email_verified":true}'::jsonb,
   'email', now(), now(), now()),
  ('a2222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
   '22222222-2222-4222-8222-222222222222',
   '{"sub":"22222222-2222-4222-8222-222222222222","email":"executor1@nova.local","email_verified":true}'::jsonb,
   'email', now(), now(), now()),
  ('a3333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333',
   '33333333-3333-4333-8333-333333333333',
   '{"sub":"33333333-3333-4333-8333-333333333333","email":"executor2@nova.local","email_verified":true}'::jsonb,
   'email', now(), now(), now())
on conflict (id) do nothing;

-- 1в. TOTP-фактор менеджера: staging обязан проверять вход с MFA (A14.1, A04.1).
-- Секрет детерминированный и локальный: e2e передаёт его через E2E_MANAGER_TOTP_SECRET.
-- Без этой строки `supabase db reset` оставлял manager без второго фактора, и сценарии
-- входа падали уже после сброса стенда (DEC-036).
insert into auth.mfa_factors (
  id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at
)
values
  ('a75d3a20-eabe-48a8-b9be-ea624aea2ce4', '11111111-1111-4111-8111-111111111111',
   'e2e', 'totp', 'verified', 'UNTMQM3SJ2OEHJJEMBXUH23VK44KBFWD', now(), now())
on conflict (id) do nothing;

-- 2. Профили: роль задаётся здесь, а не в JWT.
insert into public.profiles (id, full_name, role)
values
  ('11111111-1111-4111-8111-111111111111', 'Ирина Волкова', 'manager'),
  ('22222222-2222-4222-8222-222222222222', 'Пётр Смирнов', 'executor'),
  ('33333333-3333-4333-8333-333333333333', 'Анна Ковалёва', 'executor')
on conflict (id) do nothing;

-- 3. Объекты.
insert into public.objects (id, title, address, created_by, created_at)
values
  ('44444444-4444-4444-8444-444444444444', 'ЖК Северный, корпус 2', 'ул. Лесная, 12',
   '11111111-1111-4111-8111-111111111111', now() - interval '30 days'),
  ('55555555-5555-4555-8555-555555555555', 'Бизнес-центр «Гранит»', 'пр. Мира, 40',
   '11111111-1111-4111-8111-111111111111', now() - interval '20 days'),
  ('66666666-6666-4666-8666-666666666666', 'Складской комплекс «Восток»', 'ш. Заводское, 7',
   '11111111-1111-4111-8111-111111111111', now() - interval '10 days')
on conflict (id) do nothing;

-- 4. Задачи: все пять статусов непусты, задач восемь.
insert into public.tasks (id, object_id, title, description, assignee_id, author_id, status, created_at)
values
  ('77777777-7777-4777-8777-777777777771', '44444444-4444-4444-8444-444444444444',
   'Монтаж опалубки', 'Первый этаж, секция А', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'new', now() - interval '9 days'),
  ('77777777-7777-4777-8777-777777777772', '44444444-4444-4444-8444-444444444444',
   'Заливка фундамента', 'Подготовка основания завершена', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'in_progress', now() - interval '8 days'),
  ('77777777-7777-4777-8777-777777777773', '44444444-4444-4444-8444-444444444444',
   'Проверка стыков', 'Акт скрытых работ', '33333333-3333-4333-8333-333333333333',
   '11111111-1111-4111-8111-111111111111', 'on_review', now() - interval '7 days'),
  ('77777777-7777-4777-8777-777777777774', '55555555-5555-4555-8555-555555555555',
   'Отделка холла', 'Возврат на доработку: неравномерная штукатурка', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'rework', now() - interval '6 days'),
  ('77777777-7777-4777-8777-777777777775', '55555555-5555-4555-8555-555555555555',
   'Установка лифтов', 'Пусконаладка выполнена', '33333333-3333-4333-8333-333333333333',
   '11111111-1111-4111-8111-111111111111', 'accepted', now() - interval '5 days'),
  ('77777777-7777-4777-8777-777777777776', '66666666-6666-4666-8666-666666666666',
   'Кровельные работы', 'Секции 1–3', '33333333-3333-4333-8333-333333333333',
   '11111111-1111-4111-8111-111111111111', 'new', now() - interval '4 days'),
  ('77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666',
   'Монтаж стеллажей', 'Вторая очередь', '33333333-3333-4333-8333-333333333333',
   '11111111-1111-4111-8111-111111111111', 'in_progress', now() - interval '3 days'),
  ('77777777-7777-4777-8777-777777777778', '44444444-4444-4444-8444-444444444444',
   'Установка входных групп', 'Приёмка без замечаний', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'accepted', now() - interval '2 days')
on conflict (id) do nothing;

-- 5. История: создание задачи и каждый переход, соответствующий текущему статусу.
insert into public.task_status_history (task_id, from_status, to_status, changed_by, comment, created_at)
select v.task_id, v.from_status::public.task_status, v.to_status::public.task_status,
       v.changed_by, v.comment, v.created_at
from (values
  ('77777777-7777-4777-8777-777777777771'::uuid, null, 'new',
   '11111111-1111-4111-8111-111111111111'::uuid, null::text, now() - interval '9 days'),
  ('77777777-7777-4777-8777-777777777772'::uuid, null, 'new',
   '11111111-1111-4111-8111-111111111111'::uuid, null, now() - interval '8 days'),
  ('77777777-7777-4777-8777-777777777772'::uuid, 'new', 'in_progress',
   '22222222-2222-4222-8222-222222222222'::uuid, null, now() - interval '7 days 12 hours'),
  ('77777777-7777-4777-8777-777777777773'::uuid, null, 'new',
   '11111111-1111-4111-8111-111111111111'::uuid, null, now() - interval '7 days'),
  ('77777777-7777-4777-8777-777777777773'::uuid, 'new', 'in_progress',
   '33333333-3333-4333-8333-333333333333'::uuid, null, now() - interval '6 days 20 hours'),
  ('77777777-7777-4777-8777-777777777773'::uuid, 'in_progress', 'on_review',
   '33333333-3333-4333-8333-333333333333'::uuid, null, now() - interval '6 days'),
  ('77777777-7777-4777-8777-777777777774'::uuid, null, 'new',
   '11111111-1111-4111-8111-111111111111'::uuid, null, now() - interval '6 days'),
  ('77777777-7777-4777-8777-777777777774'::uuid, 'new', 'in_progress',
   '22222222-2222-4222-8222-222222222222'::uuid, null, now() - interval '5 days 20 hours'),
  ('77777777-7777-4777-8777-777777777774'::uuid, 'in_progress', 'on_review',
   '22222222-2222-4222-8222-222222222222'::uuid, null, now() - interval '5 days'),
  ('77777777-7777-4777-8777-777777777774'::uuid, 'on_review', 'rework',
   '11111111-1111-4111-8111-111111111111'::uuid, 'Выровнять штукатурку у входа', now() - interval '4 days'),
  ('77777777-7777-4777-8777-777777777775'::uuid, null, 'new',
   '11111111-1111-4111-8111-111111111111'::uuid, null, now() - interval '5 days'),
  ('77777777-7777-4777-8777-777777777775'::uuid, 'new', 'in_progress',
   '33333333-3333-4333-8333-333333333333'::uuid, null, now() - interval '4 days'),
  ('77777777-7777-4777-8777-777777777775'::uuid, 'in_progress', 'on_review',
   '33333333-3333-4333-8333-333333333333'::uuid, null, now() - interval '3 days'),
  ('77777777-7777-4777-8777-777777777775'::uuid, 'on_review', 'accepted',
   '11111111-1111-4111-8111-111111111111'::uuid, 'Принято без замечаний', now() - interval '2 days'),
  ('77777777-7777-4777-8777-777777777776'::uuid, null, 'new',
   '11111111-1111-4111-8111-111111111111'::uuid, null, now() - interval '4 days'),
  ('77777777-7777-4777-8777-777777777777'::uuid, null, 'new',
   '11111111-1111-4111-8111-111111111111'::uuid, null, now() - interval '3 days'),
  ('77777777-7777-4777-8777-777777777777'::uuid, 'new', 'in_progress',
   '33333333-3333-4333-8333-333333333333'::uuid, null, now() - interval '2 days'),
  ('77777777-7777-4777-8777-777777777778'::uuid, null, 'new',
   '11111111-1111-4111-8111-111111111111'::uuid, null, now() - interval '2 days'),
  ('77777777-7777-4777-8777-777777777778'::uuid, 'new', 'in_progress',
   '22222222-2222-4222-8222-222222222222'::uuid, null, now() - interval '1 day 20 hours'),
  ('77777777-7777-4777-8777-777777777778'::uuid, 'in_progress', 'on_review',
   '22222222-2222-4222-8222-222222222222'::uuid, null, now() - interval '1 day'),
  ('77777777-7777-4777-8777-777777777778'::uuid, 'on_review', 'accepted',
   '11111111-1111-4111-8111-111111111111'::uuid, 'Принято', now() - interval '12 hours')
) as v(task_id, from_status, to_status, changed_by, comment, created_at)
where not exists (
  select 1 from public.task_status_history h
  where h.task_id = v.task_id
    and h.from_status is not distinct from v.from_status::public.task_status
    and h.to_status = v.to_status::public.task_status
);
