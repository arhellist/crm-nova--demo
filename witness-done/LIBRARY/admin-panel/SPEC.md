# LIBRARY MODULE: admin-panel

## Назначение

Админ-контур: отдельная аутентификация админов (или усиленная роль), CRUD пользователей, RBAC, immutable audit log, dashboard метрик.

## Когда использовать

- Нужен back-office: бан/разбан, роли, аудит действий персонала, метрики.

## Когда не использовать

- Нет персонала/модерации в v1 — не тащить полный модуль (достаточно `role=admin` флага без UI).
- Уже есть внешняя админка (Retool, AdminJS только DB) — сверять OUT OF SCOPE.
- Путать с пользовательским кабинетом — это **отдельный** security boundary.

## Зависимости

- `auth-jwt` паттерны (отдельные cookie names / secrets для admin).
- `logging-pino`, `rate-limiting`.
- Опционально: `crud-table` для Users/Audit UI, `email-nodemailer` для инвайтов админов.

## Улучшения

- **Отдельные cookie:** `admin_access` / `admin_refresh` (не смешивать с user cookies).
- Audit log — **append-only** (нет UPDATE/DELETE API; роль БД без DELETE если возможно).
- Soft-delete пользователей по умолчанию; hard-delete — только `superadmin` + подтверждение + audit.
- 2FA TOTP: в v1 как GATE; если не в scope — явный residual risk в security docs.
- Метрики errors: из структурированных логов/метрик, не «парсить файлы ad-hoc» без схемы.
- CSRF: double-submit или SameSite+отдельный origin `admin.*`; зафиксировать в ADAPTATION.

---

## 1. Модели

**Admin:** `id`, `email` unique, `passwordHash`, `role` (`superadmin`|`admin`|`viewer`), `isActive`, `totpSecret?`, `lastLoginAt`, timestamps.

**AdminAuditLog:** `id`, `adminId`, `action`, `targetType?`, `targetId?`, `details` JSONB, `ip`, `userAgent`, `createdAt`. Index `(adminId, createdAt)`, `(action, createdAt)`.

**UserBlock:** `id`, `userId`, `blockedBy`, `reason`, `expiresAt` null=permanent, `createdAt`, `liftedAt?`.

## 2. API (`/api/admin/*`)

Все маршруты: `adminAuth` + `checkPermission`.

### Auth
- `POST /auth/login` — rate limit 5/min/IP
- `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me`

### Users
- `GET /users` — cursor/keyset предпочтительнее offset на больших объёмах; filter: active, role, date; sort whitelist
- `GET /users/:id`
- `POST /users/:id/block` `{ reason, expiresAt? }`
- `POST /users/:id/unblock`
- `DELETE /users/:id?hard=false`
- `POST /users/:id/roles` — вместо расплывчатого promote (явный body `{ role }`)

### Admins
- CRUD-lite: list, create, patch role/active, delete (нельзя удалить последнего `superadmin`)

### Audit
- `GET /audit` filters; `GET /audit/export` CSV (stream, permission `audit:export`)

### Metrics
- `GET /metrics/users`, `/metrics/activity`, `/metrics/errors` — агрегаты с TTL-кешем

## 3. RBAC

| Permission | viewer | admin | superadmin |
|------------|--------|-------|------------|
| users:read | ✓ | ✓ | ✓ |
| users:block | | ✓ | ✓ |
| users:delete | | ✓ | ✓ |
| admins:* | | | ✓ |
| audit:read | ✓ | ✓ | ✓ |
| audit:export | | ✓ | ✓ |
| metrics:read | ✓ | ✓ | ✓ |

Сервер — единственный источник правды; UI `usePermission` только скрывает кнопки.

## 4. Frontend

```text
frontend/src/pages/admin/
  AdminLayout.tsx      # отдельный router basename /admin
  AdminLogin.tsx
  Dashboard.tsx
  Users/...
  Admins/...
  Audit/...
  Settings/...
```

Отдельный axios instance с `withCredentials` на admin cookies.

## 5. Security invariants

- Prefixe `/api/admin` всегда за adminAuth.
- Отдельный CORS/origin для admin host желателен.
- Каждое мутирующее действие → audit row в той же транзакции, что бизнес-эффект (где возможно).
- Не логировать password/totp в details.
- Ban пользователя инвалидирует user refresh tokens (связка с `auth-jwt`).

## 6. Env

`ADMIN_JWT_ACCESS_SECRET`, `ADMIN_JWT_REFRESH_SECRET`, `ADMIN_COOKIE_DOMAIN`, `ADMIN_CORS_ORIGIN`, `ADMIN_LOGIN_RATE_*`, `ADMIN_2FA_REQUIRED`.

## 7. Тесты

- [ ] viewer не может block (403)
- [ ] audit пишется на block
- [ ] нельзя удалить последнего superadmin
- [ ] user cookies не открывают `/api/admin`
- [ ] export CSV только с permission

## 8. Антипаттерны

- Одна cookie-сессия user+admin без разделения
- Проверка роли только на FE
- Редактируемый audit log
- Offset-пагинация без лимита на миллионах users

## 9. Критерии готовности

Отдельный auth boundary, RBAC matrix, audit append-only, users block/unblock, dashboard read APIs, FE layout+guards, rate limit login, тесты.

## CONFLICTS with other modules

| С другим модулем | Проблема | Решение |
|------------------|----------|---------|
| `auth-jwt` | Пересечение user/admin сессий | Отдельные cookies + secrets; user JWT не открывает `/api/admin` |
| `rate-limiting` | Админские list/export тяжелее | Tier `admin` выше; login admin — отдельный жёсткий лимит |
| `crud-table` | Дублирование list/filter логики | Общий listQueryParser; разные permission scopes |
| `logging-pino` | Audit vs application logs | Audit — таблица append-only; логи — не единственный источник compliance |
| `payments-stripe` | Admin plans CRUD | Admin permission + audit на plan mutations |
