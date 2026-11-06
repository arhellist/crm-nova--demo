# DEC-048 — Демо NOVA CRM на https://arhellist.ru/crm-nova/

| Поле | Значение |
|------|----------|
| Дата | 2026-11-06 |
| Intake | 20261106-2031-davay-zadeploim-reshenie-na-arhellist-ru |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** Нужен публичный URL для сдачи/портфолио. Паттерн деплоя — как у Recoursia в Arhellist-Portfolio: статика Vite под path prefix + nginx `location ^~`. Cloud-проект Supabase из `.env.supabase` был без схемы; локальный Auth с публичного URL недоступен.

**Решение.** Деплой демо на `https://arhellist.ru/crm-nova/`: Vite `base=/crm-nova/`, `BrowserRouter` basename из `import.meta.env.BASE_URL`, статика в `/var/www/.../public/crm-nova`, nginx snippet по маркеру «SPA портфолио». Данные — Supabase Cloud (pooler `eu-west-1`): накатаны миграции 0001–0007/0009–0010 и `seed.sql`. Отчётный backend на демо не выкатываем (экран отчётов без API деградирует; запись CRM идёт через Supabase).

**Альтернативы.** Только локальный 54321 с туннелем — нестабильно для сдачи. Полный compose реплики+API на VPS — отдельный объём. Vercel-root без subpath — расходится с запросом `/crm-nova`.

**Чем подтверждено.** `curl -sI https://arhellist.ru/crm-nova/` → 200; ассеты `/crm-nova/assets/*` → 200; password grant cloud для seed-учёток → access_token; скрипт `scripts/release/deploy-arhellist-crm-nova.sh`.
