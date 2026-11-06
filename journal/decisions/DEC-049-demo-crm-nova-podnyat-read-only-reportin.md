# DEC-049 — Демо /crm-nova: поднять read-only reporting API на VPS (pm2), nginx /crm-nova…

| Поле | Значение |
|------|----------|
| Дата | 2026-11-06 |
| Intake | 20261106-2042-ne-udalos-zagruzit-otchet-nekorrektnaya |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** SPA на https://arhellist.ru/crm-nova/ собрана без `VITE_REPORT_API_URL` /
`VITE_REPORT_API_TOKEN` — экран отчётов падает на клиентской валидации. Отдельной
logical-реплики на демо нет: полный контур replica+pgoutput на VPS дороже, чем нужно
для публичного стенда.

**Решение.** Демо /crm-nova: read-only reporting API на VPS (pm2 `crm-nova-api`, порт 5020),
nginx `location ^~ /crm-nova/api/` → backend; SPA с `VITE_REPORT_API_URL=https://arhellist.ru/crm-nova`
и публичным Bearer (≥32). `DATABASE_URL` / `DATABASE_URL_REPLICA` — cloud pooler от роли
`nova_ro` (SELECT-only + вьюхи `report_*`). `DEMO_STAND=1` подменяет статус подписки на
`streaming` с `lag_seconds=0`, иначе без subscription все отчёты отдавали бы 503.

**Альтернативы.** (1) Поднять PostgreSQL 16 + logical subscription на VPS — отвергнуто для
демо: долгий ops, дублирование данных. (2) Отключить экран отчётов на демо — отвергнуто:
отчёты в IN SCOPE поставки. (3) Читать primary service_role с backend — запрещено INV-001/006.

**Чем подтверждено.** `GET https://arhellist.ru/crm-nova/api/reports/{objects,workload,status-ages}`
→ 200, `source=replica`, строки агрегатов; без токена → 401; SPA пересобрана с report env;
вьюхи `020_views.sql` на cloud; pm2 `crm-nova-api` online.
