# DEC-054 — Сборка SPA запекла VITE_API_BASE_URL=http://127.0.0.1:8080

| Поле | Значение |
|------|----------|
| Дата | 2026-11-06 |
| Intake | 20261106-2127-connecting-to-http-127-0-0-1-8080-api-au |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** На https://arhellist.ru/crm-nova/ браузер блокировал fetch на
`http://127.0.0.1:8080/api/auth/*` по CSP `connect-src 'self'`. В бандл попал
`VITE_API_BASE_URL` из `.env.local` (Vite грузит его при `build`).

**Решение.** `apiRoot()` в production игнорирует loopback absolute URL и берёт
`import.meta.env.BASE_URL` (`/crm-nova`). Деплой-скрипт сбрасывает `VITE_API_BASE_URL`.
API — same-origin `/crm-nova/api/*` через nginx.

**Альтернативы.** Расширить CSP на `http://127.0.0.1:8080` — отвергнуто (бессмысленно с
публичного хоста). Держать абсолютный URL демо API — отвергнуто (ломает cookies same-site).

**Чем подтверждено.** Бандл без `127.0.0.1:8080`; smoke `GET /crm-nova/api/auth/csrf` и login
с origin arhellist.ru; CSP не блокирует.
