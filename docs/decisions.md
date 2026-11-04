# Решения и остаточные риски NOVA CRM

Документ для приёмки: что решили, почему, чем это ограничивает продукт и что делать дальше.
Источник — ADR шага 03 (`witness-done/OUTPUT/docs/adr/`) и журнал решений `journal/decisions/`.

## 1. Принятые архитектурные решения

| ID | Решение | Следствие для эксплуатации |
|----|---------|----------------------------|
| ADR-0001 | Backend отчётности — Node.js 20 + Fastify 4, **только чтение** | запись идёт исключительно через Supabase; backend нельзя использовать как обход RLS |
| ADR-0002 | Supabase Cloud: PostgreSQL 15, Auth, PostgREST, RPC, RLS, триггеры | права решает БД; отсутствие политики = отказ |
| ADR-0003 | Вторичная PostgreSQL 16, логическая репликация `pgoutput`, роль `nova_ro` | отчёты читаются с реплики; лаг — штатное состояние, а не ошибка |
| ADR-0004 | React 18 + Vite 5 + TanStack Query 5 + Tailwind 3.4 | SPA на Vercel, тяжёлые UI-киты запрещены |
| ADR-0005 | Supabase Auth, email + пароль + TOTP, JWT в `Authorization` | cookie нет, CSRF-модель строится на отказе от cookie |
| ADR-0006 | Vercel + Supabase + Docker Compose + Cloudflare + Prometheus/Grafana | один регион, без мультирегионального failover |
| ADR-0007 | Спецификация как код: `spec-state/`, forward-only миграции | ручная правка схемы запрещена |

## 2. Решения по ходу разработки

Полный список — `journal/decisions/DEC-001…DEC-030`. Ключевые для эксплуатации:

- **DEC-023** — `pg` и `@types/pg` добавлены в D10 для проверки реплики.
- **DEC-024** — `app_contracts` в промптах пишутся без Markdown-разметки: машинные поля
  должны быть однозначными.
- **DEC-025** — отчётный API читает публичный read-only токен из `VITE_REPORT_API_TOKEN`;
  токен не даёт записи и не является `service_role`.
- **DEC-026** — eco-проверка не должна ложно срабатывать на слово «хранилище» в промпте.
- **DEC-027** — метрики `/metrics` дополнены под A13.1; источник серий — существующий D11.
- **DEC-028** — в дашборде нет панелей WAL primary и длительности переходов: таких серий
  в read-only контуре нет. Ограничение записано в runbook инцидента.
- **DEC-029** — формат `app_contracts` в D13 приведён к DEC-024.
- **DEC-030** — D14 добавляет Playwright, `e2e/global-setup.ts` и правки `tsconfig`:
  e2e на TypeScript strict иначе не проходит lint/typecheck.

## 3. Остаточные риски

### 3.1. Один регион

Primary и реплика живут в одном регионе Supabase. Потеря региона означает простой до
восстановления из PITR; RPO ≤ 5 минут, RTO ≤ 2 часов. Мультирегиональность не входит
в объём (ADR-0006), компенсируется ежедневным бэкапом и проверкой `backup-check.sh`.

### 3.2. Токен сессии в localStorage

Supabase-js хранит сессию в localStorage вкладки. XSS означал бы кражу токена, поэтому
CSP без `unsafe-eval`, запрет `dangerouslySetInnerHTML` и отсутствие сторонних скриптов
проверяются гейтом. Переход на httpOnly-cookie потребовал бы BFF и отдельного ADR.

### 3.3. Слот репликации

Пересоздание слота без второго инженера теряет историю и растит WAL на primary. Runbook
запрещает эту операцию в одиночку; лаг и остановка подписки покрыты отдельными алертами.

### 3.4. Принятые предупреждения npm audit

Стек зафиксирован ADR (Fastify 4, React Router 6, Zod 3). Исправления перечисленных
advisories выходят только в мажорных версиях (Fastify 5, React Router 7, Zod 4), поэтому
обновление — отдельное изменение с ADR, а не «попутно» в релизной задаче. Риски приняты
до планового обновления стека; компенсации: закрытый контур, WAF Cloudflare, rate limit
на API, отсутствие пользовательского HTML и внешних редиректов.

Пересмотр — до следующего мажорного обновления стека или при появлении эксплуатируемого
вектора в нашем контуре. Новый high/critical без строки ниже валит `check-no-secrets.sh`.

<!-- Строки ниже читает scripts/release/check-no-secrets.sh. Менять формат нельзя. -->
audit-accepted: GHSA-2w69-qvjg-hvjx — open redirect React Router, внешние URL в приложении не строятся
audit-accepted: GHSA-2j2x-hqr9-3h42 — protocol-relative redirect, переходы только по внутренним путям
audit-accepted: GHSA-9jcx-v3wj-wh4m — redirect по недоверенному пути, путей из пользователя нет
audit-accepted: GHSA-wrjc-x8rr-h8h6 — open redirect через backslash, нет внешних ссылок
audit-accepted: GHSA-337j-9hxr-rhxg — SSR hydration, SSR в продукте не используется
audit-accepted: GHSA-mrq3-vjjr-p77c — DoS Fastify sendWebStream, стриминг не используется
audit-accepted: GHSA-jx2c-rxcm-jvmq — обход Content-Type, тела валидируются Zod
audit-accepted: GHSA-444r-cwp2-x5xf — подмена X-Forwarded-*, приложение за Cloudflare
audit-accepted: GHSA-w2qp-rph6-63g4 — coercion схем, схемы заданы объектами
audit-accepted: GHSA-4mh8-r7rc-xpvc — HTTP/2 trailers, HTTP/2 не включён
audit-accepted: GHSA-667r-xxjv-c9mm — коллизия async-валидации, валидация синхронная Zod
audit-accepted: GHSA-p68q-wchp-6fh7 — обход auth через malformed URL, auth решает Supabase
audit-accepted: GHSA-hwr6-493r-vm6h — boolean false в схемах, boolean-схем нет
audit-accepted: GHSA-9q9j-q6p8-xq58 — регистр заголовков, заголовки не являются границей прав
audit-accepted: GHSA-c96f-x56v-gq3h — DDoS find-my-way, rate limit и WAF
audit-accepted: GHSA-mrhx-c7xc-m3w5 — память Zod на огромных коллекциях, лимиты размера запроса

## 4. Что делать при изменении объёма

Любой новый сервис, язык, запись в backend, мультитенантность или хранение файлов требуют
`sp decide` и ADR. «Быстро добавить» в обход этого порядка запрещено конституцией проекта.
