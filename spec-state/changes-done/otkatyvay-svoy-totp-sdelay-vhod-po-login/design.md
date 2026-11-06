# Design: otkatyvay-svoy-totp-sdelay-vhod-po-login

## 1. Модель данных

Без изменений схемы Postgres. Seed: TOTP-факторы не обязательны для входа.

## 2. API / контракты

| Метод | Путь | Назначение |
|-------|------|------------|
| POST | `/api/auth/login` | email/password → GoTrue; Set-Cookie access+refresh+csrf |
| POST | `/api/auth/refresh` | refresh-cookie → новая пара cookies |
| POST | `/api/auth/logout` | revoke + clear cookies |
| GET | `/api/auth/me` | профиль через PostgREST с user JWT |
| ALL | `/api/data/*` | прокси на `{SUPABASE_URL}/rest/v1/*` |

Cookies: `nova_access`, `nova_refresh` (HttpOnly), `nova_csrf` (readable, double-submit).

## 3. Клиент

- Удалить MFA UI и supabase-js session из data-path.
- `postgrestJson` → same-origin `/api/data/...` + credentials + CSRF + 401 interceptor.
- `VITE_API_BASE_URL` (origin+base path), без необходимости `VITE_SUPABASE_*` для доменных запросов.

## 4. Обратная совместимость

`breaking` для старых клиентов. RLS/RPC без изменений.

## 5. Тесты

Unit: cookie flags, CSRF reject, gateway 401 без cookie, interceptor один refresh.
E2E: login без TOTP, список объектов.
