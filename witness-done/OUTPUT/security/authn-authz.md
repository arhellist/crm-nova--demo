# Аутентификация и авторизация — NOVA CRM

> Сгенерировано Witness Done v1.31.0. Источники: ТЗ §8, ADR-0005, ADR-0007, `specs/data-model.md`.
> Принцип: права решает база данных; интерфейс лишь отражает решение.

## 1. Модель аутентификации

- Провайдер — **Supabase Auth (GoTrue)**, LIBRARY-модуль `auth-jwt` в режиме **adapt**: контракт
  (JWT + роль из БД) сохраняется, реализация платформенная.
- Способы: email + пароль; **TOTP MFA обязательна** для всех учётных записей. Открытая регистрация
  (`disable_signup`) и самостоятельный сброс пароля отключены — доступы выдаёт администратор.
- Пароль: минимум 12 символов, передаётся по защищённому каналу, меняется при первом входе.
- Все страницы, кроме `/login`, закрыты guard'ом; `/login` недоступен авторизованному.
- После входа профиль (`full_name`, `role`) читается из `profiles`; роль из JWT-claim `role`
  (значение `authenticated`) не используется для решений о доступе.

## 2. Матрица прав

| Разрешение | `manager` | `executor` | Где проверяется |
|------------|-----------|------------|-----------------|
| `object:read` | все неархивированные | только объекты со своей неархивированной задачей | RLS `objects_select` |
| `object:create` | да | нет | RLS `objects_insert` |
| `object:update` | да (`title`, `address`) | нет | RLS `objects_update` + триггер `updated_at` |
| `object:archive` | да | нет | `rpc.archive_object` |
| `task:read` | все неархивированные | только `assignee_id = auth.uid()` | RLS `tasks_select` |
| `task:create` | да (`author_id = auth.uid()`, `status = 'new'`) | нет | RLS `tasks_insert` + `validate_task_actors` |
| `task:update` полей | `title`, `description`, `object_id`, `assignee_id` | нет | колоночные гранты |
| `task:archive` | да | нет | `rpc.archive_task` |
| `task:transition:start` (`new → in_progress`) | нет | только своя задача | `rpc.change_task_status` |
| `task:transition:submit` (`in_progress → on_review`) | нет | только своя задача | `rpc.change_task_status` |
| `task:transition:accept` (`on_review → accepted`) | да | нет | `rpc.change_task_status` |
| `task:transition:rework` (`on_review → rework`) | да, с комментарием | нет | `rpc.change_task_status` + CHECK |
| `history:read` | по всем видимым задачам | только своя задача | RLS `history_select` |
| `report:read` | да | нет | `API_TOKEN` + allowlist `Origin` |

Правила: отсутствие политики = отказ; нет грантов на `profiles.role`; нет политики self-update
профиля; `anon` не имеет ни одной политики и ни одного `execute` на RPC.

## 3. Токены и сессии

### 3.1. Требования к JWT

| Требование | Значение | Проверка |
|------------|----------|----------|
| Формат | JWS, три сегмента | логин → заголовок |
| Алгоритм | только ES256 (JWKS) или HS256, список жёстко задан; `alg:none` и подмена алгоритма отклоняются | `curl` с поддельным `alg` → `401` |
| Claims | `iss` = `https://<ref>.supabase.co/auth/v1`, `aud` = `authenticated`, `exp`, `iat`, `sub`, `role=a authenticated`, `session_id`, `aal` | тест с чужим `aud`/`iss` → `401` |
| Срок access | 1 час (`jwt_expiry = 3600`) | настройки проекта |
| Refresh | один активный на сессию, ротация включена, reuse detection → отзыв семьи | повтор старого refresh → `400/401` + разлогин |
| Inactivity / time-box | 7 / 30 дней | настройки Auth |
| MFA | `manager` — обязательно; `executor` — обязательно при первом входе и после сброса | вход без второго фактора невозможен |
| Отзыв | `signOut`, смена пароля, смена роли, принудительный revoke | после revoke → `401` |
| PII | токен не логируется, не идёт в URL и аналитику | grep по логам и коду |
| Хранение | `localStorage` (осознанный риск, см. threat-model T05) | CSP-проверка |

### 3.2. Правила кода

- Никакого `jwt.decode`/`atob` для решений о правах: только `supabase-js`.
- Токен передаётся только в `Authorization`; `credentials: 'include'` к Supabase не используется.
- Повторный вход после смены пароля: все прочие сессии инвалидируются.

### 3.3. Владение ресурсами (IDOR/BOLA)

- Чтение задачи: RLS + условие `assignee_id = auth.uid()` для исполнителя.
- Чтение объекта: RLS + `exists` подзапрос по своим задачам.
- Переход статуса: `security definer` проверяет роль и `assignee_id` **внутри транзакции**
  (`for update`), а не по данным клиента.
- Ответ на чужой ресурс — 404 или пустой массив: факт существования не раскрывается.

### 3.4. `security definer`

Все функции: `set search_path = public, pg_temp`, владелец — `postgres`, `execute` отозван у `anon`,
выдан `authenticated`. Внутри — явные проверки роли и владельца; никаких динамических SQL-строк.

### 3.5. Брутфорс и лимиты

- Supabase Auth: встроенные лимиты на попытки входа и отправку писем.
- Периметр: WAF-правила и лимиты по IP на `/login`.
- MFA: 5 неудачных TOTP-попыток → блокировка входа, сообщение без деталей.
- После 10 неудачных входов за 10 минут — временная блокировка, событие в лог и алерт.

### 3.6. «Выйти на всех устройствах»

`signOut({ scope: 'global' })` инвалидирует все refresh-сессии пользователя. Смена пароля и смена
роли администратором делают то же самое. Действие фиксируется в журнале провижининга.

## 4. CSRF-модель

| Сценарий | Аутентификация | CSRF возможен | Мера |
|----------|----------------|---------------|------|
| SPA → PostgREST/RPC | `Authorization: Bearer` | нет | браузер не прикладывает заголовок сам; сторонний сайт токена не знает |
| SPA → Fastify | `Authorization: API_TOKEN` | нет | токен только в памяти/SW-кэше приложения, не cookie |
| Будущий BFF с cookie | cookie | **да** | до включения обязателен чек-лист: `HttpOnly; Secure; SameSite=Lax/Strict; __Host-`, CSRF-токен double-submit, проверка токена на каждой мутации, отказ при несовпадении `Origin`, CORS по allowlist |

Обязательные меры, действующие сейчас:

1. Никакой cookie-аутентификации для API; `sb-*` cookies не используются.
2. Все мутации — `POST`/`PATCH`/`DELETE`/RPC; ни один `GET` не меняет состояние.
3. CORS собственного API — allowlist; никогда `*` вместе с credentials.
4. Изменяющие запросы несут `Authorization`, что выводит их из категории simple request.
5. Fastify-хук проверяет `Origin`, если он присутствует; чужой origin → `403`.
6. CSP: `default-src 'self'`, `script-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`,
   `form-action 'self'`.
7. Тесты: кросс-доменный `POST` к Supabase без токена → `401`; API без токена → `401`,
   с чужим `Origin` → `403`.

## 5. Проверяемые инварианты (входят в test-plan)

| ID | Инвариант | Как проверяется |
|----|-----------|-----------------|
| SEC-01 | Исполнитель не читает чужие задачи | pgTAP/HTTP: `GET tasks?id=<чужой>` → `[]` |
| SEC-02 | Исполнитель не меняет поля чужой задачи | `PATCH` → 0 строк / ошибка |
| SEC-03 | Прямой `UPDATE status` отклоняется | SQL → `P0403` |
| SEC-04 | Запрещённый переход отклоняется | RPC → `P0422`, история не растёт |
| SEC-05 | `rework` без комментария невозможен | RPC и прямой `INSERT` → ошибка |
| SEC-06 | `anon` не читает таблицы и не вызывает RPC | `401`/пустой результат |
| SEC-07 | Эскалация роли невозможна | `PATCH profiles role` → 0 строк |
| SEC-08 | `service_role` отсутствует в бандле и образе | grep-тест в CI |
| SEC-09 | Write-метод на Fastify → `405` | integration-тест |
| SEC-10 | `nova_ro` не может писать | `INSERT` → `25006` |
| SEC-11 | JWT `alg:none` / чужой `aud` → `401` | тест аутентификации |
| SEC-12 | Токен и PII не пишутся в логи | выборка логов + redact-конфиг |
