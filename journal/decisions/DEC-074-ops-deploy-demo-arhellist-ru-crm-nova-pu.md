# DEC-074 — Ops: деплой демо + push в crm-nova--demo

| Поле | Значение |
|------|----------|
| Дата | 2026-11-07 |
| Intake | 20261107-0013-deploy-i-zalivay-na-git-https-github-com |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** Демо на arhellist.ru/crm-nova уже живёт; накопились незакоммиченные правки (Team KPI, health aliases, smoke, journal). Нужен свежий деплой и публикация кода в пустой GitHub-репозиторий сдачи, без пуша в origin WitnessDone и без .env*.

**Решение.** 1) `deploy-arhellist-crm-nova-api.sh` затем `deploy-arhellist-crm-nova.sh`. 2) Коммит на `nova-crm`. 3) Remote `demo` → https://github.com/arhellist/crm-nova--demo.git, push `nova-crm:main`. Секреты не в git.

**Альтернативы.** Force-push в WitnessDone — отвергнуто (другой продукт). Только FE без API — отвергнуто (код BFF тоже менялся).

**Чем подтверждено.** Smoke после деплоя; `git ls-remote demo`; URL репозитория https://github.com/arhellist/crm-nova--demo
