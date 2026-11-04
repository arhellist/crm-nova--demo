# Модель угроз — NOVA CRM

> Сгенерировано Witness Done v1.31.0. Метод: STRIDE-lite по P0-активам.
> Оценка: вероятность/влияние — низкая/средняя/высокая. Артефакты-меры указаны в последней колонке.

## 1. Активы

| Актив | Ценность | Где живёт |
|-------|----------|-----------|
| A1. Задачи и объекты (содержание работ) | коммерческая тайна компании | PostgreSQL 15 (primary), реплика |
| A2. История статусов (кто, когда, что принял) | доказательство качества и ответственности | `task_status_history`, реплика |
| A3. Учётные записи и сессии (пароли, TOTP, JWT) | доступ ко всей системе | Supabase Auth, `localStorage` клиента |
| A4. Персональные данные сотрудников (имя, email) | ПДн | `auth.users` (email), `profiles` (имя) |
| A5. Секреты инфраструктуры (JWT-secret, `service_role`, `replicator`, `API_TOKEN`) | полный контроль над данными | менеджер секретов, env контейнеров |
| A6. Отчётные агрегаты | сводная картина загрузки и приёмки | реплика, ответы Fastify |
| A7. Доступность сервиса | KPI 99.9%, работа компании | Vercel, Supabase, контур backend |

## 2. Границы доверия

```text
[Браузер пользователя] --TLS--> [Cloudflare] --> [Vercel SPA]
        |                                              |
        |  Bearer JWT (PostgREST/RPC)                  | Bearer API_TOKEN (отчёты)
        v                                              v
[Supabase Cloud: GoTrue, PostgREST, PostgreSQL 15]  [Fastify] --приватная сеть--> [PostgreSQL 16 реплика]
        |                                              ^
        +-------- logical replication (pgoutput) ------+
```

Границы: браузер ↔ edge; edge ↔ Supabase; edge ↔ Fastify; Fastify ↔ реплика; Supabase ↔ реплика;
оператор ↔ менеджер секретов/Supabase Studio. Внутри контура backend нет пользовательских JWT —
только сервисный токен.

## 3. Угрозы

| ID | Актив | Категория | Угроза | Вероятность | Влияние | Митигация | Где закрыто |
|----|-------|-----------|--------|-------------|---------|-----------|-------------|
| T01 | A1 | Spoofing | Поддельный JWT или чужой `aud`/`iss` даёт доступ к данным | средняя | высокий | проверка подписи платформой, allowlist алгоритма, `alg:none` отклоняется, контроль `iss`/`aud`/`exp`; собственный verifier отсутствует | `security/authn-authz.md` §3, ADR-0005 |
| T02 | A1 | Spoofing/Tampering | Исполнитель читает или меняет чужую задачу по ID (IDOR/BOLA) | высокая | высокий | RLS `assignee_id = auth.uid()`, колоночные гранты, 404 вместо 403 | `security/authn-authz.md` §2, data-model §5 |
| T03 | A2 | Tampering | Подделка истории: прямой `UPDATE status` или вставка записи в историю | высокая | высокий | `guard_task_status`, отсутствие грантов на историю, append-only триггер, `CHECK` на комментарий | data-model §4, tests pgTAP |
| T04 | A2 | Repudiation | Отказ от действий: «я не принимал задачу» | средняя | средний | `changed_by = auth.uid()` в триггере, неизменяемые строки, время в UTC | data-model §4.2 |
| T05 | A3 | Information disclosure | Кража access/refresh-токена из `localStorage` через XSS | средняя | высокий | CSP без `unsafe-inline` в `script-src`, запрет `dangerouslySetInnerHTML`, отсутствие сторонних скриптов, `localStorage` как осознанный риск | `security/checklist.md`, ADR-0005 |
| T06 | A3 | Elevation of privilege | Эскалация роли: `PATCH /profiles` с `role=manager` | средняя | высокий | нет грантов на `profiles.role`, нет политики self-update, роль меняется только администратором | `security/authn-authz.md` §2 |
| T07 | A3 | Spoofing | Перебор паролей и креденшел-стаффинг | высокая | средний | лимиты Supabase Auth, блокировка после серии неудач, обязательная MFA, WAF на `/login` | `security/authn-authz.md` §3.5 |
| T08 | A5 | Information disclosure | Утечка `service_role` в бандл, образ, лог или git | средняя | высокий | grep-гейт в CI, `gitleaks`, ключ только в локальном seed, отсутствие `VITE_`-префикса | `security/secrets-and-config.md` |
| T09 | A5 | Information disclosure | Утечка пароля `replicator` или дампа реплики | низкая | высокий | отдельная роль с `LOGIN REPLICATION`, пароль в менеджере секретов, порт 5432 не публикуется, приватная сеть | `security/secrets-and-config.md` |
| T10 | A1 | Tampering | Запись в данные через backend или реплику | низкая | высокий | backend read-only, роль `nova_ro` без DML, `default_transaction_read_only`, отсутствие write-маршрутов, тест `405` и `25006` | ADR-0002/0003, `security/checklist.md` |
| T11 | A1 | Tampering | SQL-инъекция через поля формы или параметры RPC | средняя | высокий | PostgREST + параметризованные RPC, отсутствие динамического SQL, Zod, экранирование React | `security/checklist.md` §OWASP |
| T12 | A3/A1 | Tampering | CSRF на мутирующие операции | низкая | средний | cookie-аутентификации нет, токен в заголовке, только небезопасные методы, allowlist `Origin` на API | `security/authn-authz.md` §4 |
| T13 | A6 | Information disclosure | Отчёт раскрывает лишние данные (email, тексты задач) | средняя | средний | отчётные вьюхи без email/`description`/комментариев, тест на ключи ответа | data-model §9, `security/data-protection.md` |
| T14 | A7 | Denial of service | Всплеск запросов, исчерпание лимитов Supabase/Free-подписки | средняя | средний | WAF и rate limit на периметре, `@fastify/rate-limit`, таймауты, лимиты `pg`-пула | `security/checklist.md` §7 |
| T15 | A7 | Denial of service | Долгий простой подписчика раздувает WAL на primary | низкая | средний | алерт по лагу и размеру WAL, runbook пересоздания слота | `security/checklist.md`, runbook |
| T16 | A4 | Information disclosure | ПДн в логах, Sentry, аналитике | средняя | средний | pino redact, без тел запросов, `console.error` только коды, Sentry `beforeSend` без PII | `security/data-protection.md` |
| T17 | A3 | Elevation of privilege | `security definer`-функция с подменённым `search_path` | низкая | высокий | `set search_path = public, pg_temp` во всех функциях, revoke `execute` у `anon` | `security/authn-authz.md` §3.4 |
| T18 | A5 | Spoofing | Подмена `Origin`/обход CORS для отчётного API | низкая | средний | allowlist `Origin`, `API_TOKEN`, CORS без `*` с credentials | `security/authn-authz.md` §4 |
| T19 | A1 | Repudiation | Удаление задачи или истории «чтобы скрыть» | средняя | высокий | физическое удаление запрещено грантами и `restrict`, архивирование сохраняет историю | data-model §3.5 |
| T20 | A3 | Information disclosure | Токен или пароль в URL, в Referer, в аналитике | низкая | средний | токен только в заголовке, никаких query-параметров с секретами, реферер-политика | `security/checklist.md` §6 |
| T21 | A7 | Tampering | Вредоносная зависимость или скомпрометированный пакет | средняя | высокий | `npm ci` по lockfile, `npm audit --audit-level=high`, Dependabot, ревью новых зависимостей, запрет `postinstall` от неизвестных пакетов | `security/checklist.md` §9 |
| T22 | A7 | Repudiation | Невозможно восстановить данные после сбоя | низкая | высокий | PITR + ежедневные бэкапы, учения восстановления, runbook, RTO/RPO | `security/checklist.md` §10 |

## 4. Остаточные риски (приняты осознанно)

1. **Токен в `localStorage`** — компенсирован строгим CSP и отказом от сторонних скриптов; полное
   устранение требует BFF с httpOnly-cookie и CSRF-инфраструктуры (ADR-0005).
2. **Один регион** — 99.9% опирается на SLA Supabase и edge-провайдера; реплика не является
   HA-решением и не выполняет автоматический failover (ADR-0006).
3. **Размещение данных в ЕС** — до правовой оценки 152-ФЗ продукт используется на данных без ПДн
   третьих лиц (ТЗ §13.2).
4. **Провижининг вне интерфейса** — ошибка администратора возможна; компенсируется регламентом
   и журналом операций (ADR-0007).
5. **Криптография делегирована Supabase** — собственный аудит хеширования и подписи не проводится
   (ASVS L2, V6 delegated).
6. **Реплика содержит те же данные, что primary** — защищается как primary: приватная сеть,
   отдельные роли, отсутствие публикации порта (ADR-0003).
