-- 0002_helpers.sql
-- Помощники авторизации: роль берётся из profiles, а не из claim JWT (INV-005).
--
-- Обе функции — `security definer` с жёстким `search_path = public, pg_temp` (INV-008),
-- `stable` (читают только состояние БД в рамках запроса) и с отозванным `execute` у `public`
-- и `anon`: анонимный клиент не должен даже узнавать, существует ли профиль.
-- Нет профиля — `current_role()` возвращает null, `is_manager()` — false: отказ по умолчанию.

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
$$;

comment on function public.current_role() is
  'Прикладная роль текущего пользователя из profiles.role; null, если профиля нет.';

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_role() = 'manager', false)
$$;

comment on function public.is_manager() is
  'true только для пользователя с профилем и ролью manager; иначе false.';

-- Права: помощники доступны только аутентифицированным ролям приложения.
revoke all on function public.current_role() from public;
revoke all on function public.current_role() from anon;
revoke all on function public.is_manager() from public;
revoke all on function public.is_manager() from anon;
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_manager() to authenticated;
