# LIBRARY MODULE: auth-jwt

## Назначение

Аутентификация на JWT: access + refresh в **HTTP-Only cookies**, ротация refresh в PostgreSQL, защита от reuse, React (Axios) interceptor с очередью при 401.

## Когда использовать

- SPA/web с собственным email+password (или password + внешний IdP позже).
- Нужен logout / logout-all / revoke refresh.

## Когда не использовать

- Только OAuth/OIDC без своих credentials → отдельный модуль/`adapt`.
- Mobile-first с secure storage иной модели → ADAPTATION обязателен.
- Server-rendered session cookie BFF без JWT → не этот модуль.

## Зависимости

- Platform: `logging-pino`, `rate-limiting` (tier `auth`).
- Опционально: `email-nodemailer` (reset password), `admin-panel` (отдельные admin cookies).

## Стек по умолчанию

React 18+, Node 20+, Express, PostgreSQL, Sequelize (или Prisma — указать в ADAPTATION), bcrypt, Zod.

---

## 1. Модели

**User:** `id` UUID PK, `email` unique, `passwordHash`, `role` (default `user`), `isActive` (default true), timestamps.

**RefreshToken:** `id` UUID, `token` unique (хранить **hash** токена, не plaintext — предпочтительно), `userId` FK CASCADE, `expiresAt`, `revoked` default false, `userAgent?`, `ipAddress?`, timestamps.

Связь: User 1—N RefreshToken.

## 2. Env

`PORT`, `NODE_ENV`, `DB_*`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES` (15m), `JWT_REFRESH_EXPIRES` (7d), `COOKIE_DOMAIN`, `COOKIE_SECURE`.

## 3. Cookies

Базово: `httpOnly`, `secure` в prod, `sameSite: strict`, `domain` из env.

| Cookie | Path | maxAge |
|--------|------|--------|
| access | `/` | access TTL |
| refresh | `/api/auth/refresh` | refresh TTL |

Хелперы: set both, clear both.

## 4. JWT utils

- Access payload: `userId`, `email`, `role` (+ опционально `aud`).
- Refresh payload: `userId`, `jti`.
- Verify → payload | null (не throw наружу без обёртки).

## 5. Middleware

- `authenticate`: access из cookie → verify → `req.user` или 401.
- `requireRole(...roles)` опционально.

## 6. API

| Method | Path | Поведение |
|--------|------|-----------|
| POST | `/api/auth/register` | email+password, bcrypt cost 10, 201 без password |
| POST | `/api/auth/login` | verify → issue tokens → save refresh meta → set cookies |
| POST | `/api/auth/refresh` | cookie refresh → verify DB not revoked/expired → rotate → set cookies |
| POST | `/api/auth/logout` | revoke refresh → clear cookies |
| GET | `/api/auth/me` | authenticate → user |

### Ротация и кража

- При refresh: старый revoke, новый save (транзакция).
- Повторное использование уже revoked refresh → revoke **все** токены user (reuse detection).
- Опционально (ADAPTATION): mismatch `userAgent`/`ip` → revoke all / alert.

## 7. Frontend

- Axios `withCredentials: true`.
- Response interceptor: 401 → один refresh (флаг `isRefreshing` + очередь `pendingRequests`) → retry; fail → login redirect, clear state.
- Store: user | null (Zustand/Context/Redux — по проекту).
- `ProtectedRoute` + bootstrap `GET /me`.

## 8. Структура кода

```text
backend/src/modules/auth/
  models/, routes/, middleware/, utils/{jwt,cookies}, schemas/
frontend/src/services/api/{client,auth}, auth/{store,ProtectedRoute}
```

## 9. Security invariants

- HTTPS в prod; пароли только hash; secrets только env.
- Нет access/refresh в `localStorage`.
- Rate limit на register/login/refresh.
- Не логировать токены/пароли.

## 10. Тест-сценарии

- [ ] Register duplicate email → 409/400
- [ ] Login bad password → 401
- [ ] Refresh rotate; old refresh → fail + reuse policy
- [ ] Logout clears cookies
- [ ] Parallel 401 → один refresh (queue)
- [ ] Inactive user → 401/403

## 11. Антипаттерны

- Token в query/localStorage
- Sync `sequelize.sync({ force })` в prod
- Refresh без транзакции revoke+insert
- Бесконечный refresh loop без guard path

## CONFLICTS with other modules

| С другим модулем | Проблема | Решение |
|------------------|----------|---------|
| `admin-panel` | Общие cookies | `ADMIN_*` cookies + `ADMIN_JWT_*` secrets |
| `websocket-socketio` | Handshake JWT | Тот же verify; cookie или `auth.token`; не query в prod |
| `rate-limiting` | Brute-force auth | Tier `auth` жёстче `user.api` |
| `caching-redis` | Общий Redis | Префиксы `auth:` vs `cache:` / `rl:` |
| `email-nodemailer` | Reset password | Только EmailService, не публичный send |

## 12. Критерии готовности

Модели + cookie JWT + register/login/refresh/logout/me + reuse detection + FE interceptor queue + rate limit auth + тесты выше.
