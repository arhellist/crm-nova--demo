# Переменные окружения

> Сгенерировано Witness Done v1.31.0. Значения не коммитятся. Секреты — в менеджере секретов
> и GitHub Environments (`staging`, `production`). Колонка «local» — дефолт для разработки.

| Переменная | local | ci | staging | prod | Секрет | Где используется |
|------------|-------|----|---------|------|--------|------------------|
| `VITE_SUPABASE_URL` | `http://127.0.0.1:54321` | `http://127.0.0.1:54321` | staging URL | prod URL | нет | frontend |
| `VITE_SUPABASE_ANON_KEY` | локальный anon | локальный anon | staging anon | prod anon | нет (публичный) | frontend |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8080` | `http://backend:8080` | staging API | prod API | нет | frontend |
| `API_TOKEN` | `local-dev-token` | `test-token-not-a-secret` | staging token | prod token | **да** | backend (проверка), frontend (запрос) |
| `DATABASE_URL` | `postgresql://nova_ro:...@127.0.0.1:5433/nova_replica` | service container | staging реплика | prod реплика | **да** | backend |
| `PRIMARY_URL` | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | service container | — | — | **да** | только тесты репликации |
| `REPLICATOR_PASSWORD` | `replicator_dev` | `replicator_test` | staging | prod | **да** | контейнер реплики |
| `SUPABASE_SERVICE_ROLE_KEY` | локальный из `supabase status` | секрет CI (локальный) | staging | **не используется** | **да** | только seed и e2e |
| `REPORT_CACHE_TTL_MS` | `30000` | `30000` | `30000` | `30000` | нет | backend |
| `REPLICA_LAG_ALERT_SECONDS` | `30` | `30` | `30` | `30` | нет | backend, мониторинг |
| `DB_POOL_MAX` | `10` | `10` | `10` | `10` | нет | backend |
| `LOG_LEVEL` | `debug` | `info` | `info` | `info` | нет | backend |
| `ALLOWED_ORIGINS` | `http://127.0.0.1:5173` | `http://localhost:5173` | staging домен | prod домен | нет | backend |
| `SENTRY_DSN` | пусто | пусто | staging DSN | prod DSN | нет | frontend, backend |
| `GRAFANA_TOKEN` | пусто | пусто | staging | prod | **да** | экспорт метрик |
| `CLOUDFLARE_API_TOKEN` | пусто | пусто | — | деплой | **да** | GitHub Actions |

## Правила

1. `VITE_*` попадает в бандл: там не может быть секретов. `service_role` никогда не имеет префикса
   `VITE_` и никогда не попадает в frontend.
2. Контейнер `api` не получает `PRIMARY_URL`, `SUPABASE_SERVICE_ROLE_KEY` и пароль primary.
3. Контейнер `replica` не получает `API_TOKEN` и ключи frontend.
4. Конфигурация валидируется Zod при старте: отсутствие обязательной переменной роняет процесс
   с сообщением без значения.
5. `.env.example` содержит пустые значения и комментарии; реальные `.env*` игнорируются git.
