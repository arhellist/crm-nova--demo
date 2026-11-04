# Domain Spec: reporting

> Домен отвечает за read-only backend (Fastify), health-эндпоинты и отчёты, которые читаются
> с вторичной PostgreSQL-реплики. Источник: ТЗ §2.1 п. 13–14, §13.1 п. 24, `OUTPUT/specs/openapi.yaml`,
> `OUTPUT/security/authn-authz.md`.
> Границы домена: данные отчётов не пишутся и не кэшируются на диск; UI отчётов живёт в домене
> `reporting` фронтенда и получает только агрегаты.

## Назначение и границы

Backend — единственный контур, который читает вторичную базу. Он MUST NOT иметь прав записи ни в
primary, ни в реплику (INV-001) и MUST NOT получать `PRIMARY_URL` или `service_role`
в production. Отчёты содержат только агрегаты: без email, `description` и комментариев (INV-011).
Ответы помечаются `source: replica` и `lag_seconds`, чтобы потребитель видел свежесть данных.

## Требования

### Requirement: Read-only backend и запрет записи

Система MUST предоставлять только `GET`-эндпоинты, перечисленные в `openapi.yaml`, и MUST
отвечать `405` на `POST`, `PUT`, `PATCH`, `DELETE` любого маршрута. Роль БД `nova_ro` SHALL иметь
только `SELECT` на отчётные вьюхи; backend MUST NOT содержать путь записи даже для проверки.

#### Scenario: happy path
- GIVEN backend запущен и подключён к реплике от роли `nova_ro`
- WHEN клиент выполняет `GET /reports/objects`
- THEN возвращается 200 с агрегатами, соединение использует только чтение

#### Scenario: negative — попытка записи
- GIVEN любой клиент с валидным токеном
- WHEN он отправляет `POST /reports/objects` или `DELETE /health`
- THEN ответ `405` с `{ error: { code, message } }`, в базу не уходит ни одного изменяющего запроса

### Requirement: GET /health без авторизации и без БД

Система MUST отвечать на `GET /health` кодом 200 с телом по схеме `getHealth` (`status: ok`,
`version`, `commit`, `uptime_s`), MUST NOT требовать авторизацию и MUST NOT обращаться к базе.
`version` SHALL совпадать с `version` из `package.json`.

#### Scenario: happy path
- GIVEN backend запущен, база недоступна
- WHEN клиент без токена запрашивает `GET /health`
- THEN 200, `status: ok`, `version` из `package.json`, ответ не содержит секретов и SQL

#### Scenario: negative — неизвестный маршрут и неверный метод
- GIVEN backend запущен
- WHEN клиент запрашивает `GET /health/unknown` или `POST /health`
- THEN ответ `404` или `405` в формате `{ error: { code, message } }`, без стека и имён таблиц

### Requirement: GET /health/replication и порог лага

Система MUST отдавать `GET /health/replication` с `lag_seconds`, вычисленным по разнице
`pg_current_wal_lsn()` и `confirmed_flush_lsn`, и SHALL возвращать `503` при
`lag_seconds > REPLICA_LAG_ALERT_SECONDS` (по умолчанию 30). `lag_seconds` SHALL округляться вниз
до целого и MUST NOT быть отрицательным.

#### Scenario: happy path
- GIVEN подписка активна, лаг равен 2 секундам
- WHEN клиент запрашивает `GET /health/replication`
- THEN 200, `lag_seconds: 2`, `status: ok`, ответ помечен `source: replica`

#### Scenario: negative — лаг выше порога
- GIVEN подписка отстала на 45 секунд при пороге 30
- WHEN клиент запрашивает `GET /health/replication` и любой отчёт
- THEN оба ответа `503` с кодом `E_REPLICA_LAG`, отчёт не отдаёт устаревшие агрегаты как свежие

### Requirement: Отчёты содержат только агрегаты

Система MUST возвращать в отчётах только агрегаты и `full_name` исполнителя: `tasks_total`,
`tasks_new`, `tasks_in_progress`, `tasks_on_review`, `tasks_rework`, `tasks_accepted`,
`accepted_share`, `last_activity_at`, `avg_seconds_in_status`, `max_seconds_in_status`.
Ответ MUST NOT содержать email, `description` задач и комментарии переходов (INV-011). Каждый
ответ SHALL быть помечен `source: replica` и `lag_seconds`.

#### Scenario: happy path
- GIVEN в реплике есть объекты, задачи и переходы
- WHEN менеджер запрашивает отчёт по объектам за период
- THEN в ответе только агрегаты и названия объектов, `source: replica`, `lag_seconds` — целое число

#### Scenario: negative — попытка получить персональные данные
- GIVEN клиент подставляет параметры отчёта, пытаясь расширить выборку
- WHEN ответ формируется
- THEN в нём нет полей `email`, `description` и `comment` ни на одном уровне, лишние параметры
      отклоняются валидацией Zod (`P0400`), SQL наружу не попадает

### Requirement: Кэш отчётов не дольше 30 секунд и валидация параметров

Система MUST кэшировать ответы отчётов в процессе не дольше `REPORT_CACHE_TTL_MS`
(по умолчанию 30 000 мс) и SHALL включать в ключ кэша все параметры отчёта. Параметры `from`,
`to`, `limit` SHALL валидироваться Zod: `limit` ≤ 100, `from` ≤ `to`. Некорректные параметры MUST
давать `400` с кодом `P0400` и человекочитаемым сообщением без SQL.

#### Scenario: happy path
- GIVEN два одинаковых запроса отчёта подряд в пределах TTL
- WHEN второй запрос приходит через 5 секунд
- THEN он обслужен из кэша, агрегаты идентичны, `lag_seconds` обновлён не позднее TTL

#### Scenario: boundary — некорректные параметры и истёкший TTL
- GIVEN клиент передаёт `limit = 1000` и `from` позже `to`
- WHEN запрос уходит в backend
- THEN ответ `400` с `P0400` и понятным сообщением; после истечения TTL тот же запрос с валидными
      параметрами заново читает реплику
