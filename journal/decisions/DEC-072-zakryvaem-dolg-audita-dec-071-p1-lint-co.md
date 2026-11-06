# DEC-072 — Закрытие долга аудита DEC-071 (P1–P3)

| Поле | Значение |
|------|----------|
| Дата | 2026-11-07 |
| Intake | 20261107-0002-chinim-bagi-i-oshibki-dorabatyvaem-p1-p3 |
| Статус | принято |
| ADR | — |
| Заменяет | закрывает находки DEC-071 |

**Контекст.** Аудит DEC-071 зафиксировал красный lint, падение compose.test на слове
«email» в SQL-комментарии, 404 на публичном `/crm-nova/api/health`, устаревший E11
(TOTP), дубль миграции `0009_report_managers.sql` и то, что DEMO_STAND не доходил до
`/health/replication`.

**Решение.** Закрыть P1–P3 аудита: lint и unit до зелёного; alias `/api/health` и
`/api/health/replication`; E11 без TOTP; удалить дубль 0009; прокинуть
`getReplicationState` в health при DEMO_STAND; сузить скан секретов в dist.

**Альтернативы.** Чинить только через nginx rewrite без alias в приложении —
отвергнуто: привязка к одному VPS. Полный e2e в этом же изменении — отложено, нужен
отдельный прогон на staging.

**Чем подтверждено.** `npm run lint`, `npm run typecheck`, `npm test` (125/125);
`GET /api/health` в app.test; curl демо после деплоя API.
