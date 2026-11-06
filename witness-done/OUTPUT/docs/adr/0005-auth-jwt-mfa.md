# ADR-0005: Аутентификация через same-origin BFF (cookies), склад данных в Supabase

Дата: 2026-11-06 (supersede редакции 2026-11-04)

Статус: принят (DEC-053)

## Контекст

Нужны: закрытая выдача доступов (без самостоятельной регистрации), access и refresh только в
httpOnly-cookies на одном домене с SPA, ротация refresh, обязательный перехватчик 401 и CSRF.
Склад доменных данных остаётся в Supabase (PostgREST/RPC + RLS). Прямой Bearer из браузера на
`*.supabase.co` несовместим с «только cookies» из‑за границ origin.

Редакция 2026-11-04 (localStorage + Authorization + обязательный TOTP) **заменена**.

## Решение

- Аутентификация — Supabase Auth (GoTrue) **server-side** через BFF: email + пароль, **без MFA/TOTP**.
  Открытая регистрация отключена; учётные записи выдаёт администратор.
- Access и refresh хранятся только в cookies (`HttpOnly; Secure; SameSite=Lax`); JS токены не читает.
- CSRF: double-submit (`X-CSRF-Token` + cookie) и проверка `Origin` на небезопасных методах (§8.7 п.6).
- Data Gateway: при валидной access-cookie BFF проксирует `/rest/v1/*` на Supabase с
  `Authorization: Bearer <user_jwt>` и anon-ключом. Без сессии запрос до склада не доходит (401).
- `service_role` в data-path **запрещён** (RLS не обходится).
- Прикладная роль — только `profiles.role` (INV-005).
- Ротация refresh и reuse detection — на стороне GoTrue; BFF выставляет новую пару cookies на
  `POST /api/auth/refresh`. Клиентский interceptor: 401 → один refresh → retry → иначе logout.

## Рассмотренные альтернативы

- **Bearer + localStorage** — прежняя модель; не удовлетворяет «только cookies».
- **Собственный auth/JWT** — лишняя криптография (ASVS V6 delegated).
- **Gateway на service_role** — обход RLS; запрещено.

## Последствия

Плюсы: токены недоступны XSS через JS; единый origin для сессии; склад и RLS в Supabase.
Минусы: CSRF обязателен; backend перестаёт быть «только отчёты» — добавляются auth и data
gateway; все доменные fetch идут same-origin.

## Глоссарий

| Термин | Пояснение |
|--------|-----------|
| BFF | Backend-for-frontend на том же origin, что SPA |
| GoTrue | сервис аутентификации Supabase |
| Data Gateway | прокси PostgREST/RPC с пользовательским JWT из cookie |
| reuse detection | отзыв семьи токенов при повторном refresh |
