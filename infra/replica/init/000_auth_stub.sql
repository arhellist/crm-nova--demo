-- 000_auth_stub.sql
-- Совместимость схемы Supabase для вторичного PostgreSQL 16.
--
-- Зачем: подписчик поднимается на чистом `postgres:16`, а миграции 0001–0007 написаны для
-- Supabase и ссылаются на `auth.users`, `auth.uid()` и роли `anon`/`authenticated`.
-- Реплика не обслуживает вход и не проверяет RLS — она только читает агрегаты через вьюхи,
-- поэтому здесь достаточно заготовок, а не настоящего Auth.
--
-- Инварианты:
--  - заглушка идемпотентна и не перезаписывает объекты, если они уже есть (повторный init, A10.1);
--  - `auth.uid()` возвращает null: на реплике нет JWT, а отчётные вьюхи читаются от владельца,
--    поэтому RLS базовых таблиц не влияет на агрегаты и не расширяет права `nova_ro`;
--  - заглушка не содержит данных пользователей и не является путём записи (INV-001).

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

-- Возвращаемый тип обязан быть uuid: миграции 0001 сравнивают его с uuid-колонками,
-- а `->> 'sub'` даёт text. Пустая настройка (нет JWT) превращается в null, а не в ошибку.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select (
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

-- Роли Supabase, на которые ссылаются гранты миграций. NOLOGIN: подключиться ими нельзя.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    -- Роль существует только ради совместимости грантов; на реплике у неё нет прав чтения
    -- отчётных вьюх и нет пути записи.
    create role service_role nologin noinherit;
  end if;
end
$$;

grant usage on schema auth to anon, authenticated;
