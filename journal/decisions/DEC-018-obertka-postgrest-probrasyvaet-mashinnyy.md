# DEC-018 — Обёртка PostgREST пробрасывает машинный payload.message в PostgrestApiError.s…

| Поле | Значение |
|------|----------|
| Дата | 2026-11-04 |
| Intake | — |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** PostgREST отдаёт SQLSTATE в `code` и машинный текст в `message`. D07 обязана различать
`transition_not_allowed`, `comment_required` и `assignee_change_not_allowed` — все три приходят
как `P0422`, а `PostgrestApiError` D05 сохранял только код, поэтому сообщения сливались в одно.

**Решение.** Обёртка PostgREST пробрасывает машинный payload.message в PostgrestApiError.serverMessage: один SQLSTATE P0422 покрывает три причины (transition_not_allowed, comment_required, assignee_change_not_allowed), и без машинного текста их нельзя различить. Наружу по-прежнему выводится только доменный текст, SQL и имена таблиц не раскрываются (INV-007); файл src/shared/api/postgrest.ts добавлен в PRODUCES D07, D05 переснимается на новый digest.

**Альтернативы.** (1) Ветвить по HTTP-статусу — все три приходят с 400, различить нельзя. (2) Показывать одно
общее «Недопустимое действие» — теряется требование HOW о тексте «Опишите, что доработать» и
подсказке про статусы. (3) Разбирать тело ошибки в каждом вызывающем модуле — дублирование и
риск утечки SQL. Принято: обёртка сохраняет `payload.message` в `serverMessage`, а доменный
маппинг живёт в `tasks/api.ts` и показывает только безопасные тексты.

**Чем подтверждено.** `src/shared/api/postgrest.ts` (`PostgrestApiError.serverMessage`), `src/features/tasks/api.ts`
(`toTaskError`), тесты A07.4/A07.5 в `src/features/tasks/mutations.test.ts`; `sp verify --d D07
--gate pre_ci` = `tax_pass: true`.
