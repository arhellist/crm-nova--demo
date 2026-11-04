# Exit Criteria — критерии завершения продукта

> Каждый критерий — наблюдаемое поведение. `pass` ставится только при наличии доказательства;
> до выполнения D01–D14 статусы `pending`, а в колонке «Доказательство» указан ожидаемый артефакт.

## Мета

| Поле | Значение |
|------|----------|
| Проект | NOVA CRM |
| Версия | 1.31.0 |
| Дата аудита | 2026-11-04 |
| Всего критериев | 28 |
| Закрыто | 0 |
| Открыто | 28 |

## Критерии

| ID | Область | Критерий (наблюдаемо) | Способ проверки | Доказательство | Статус |
|----|---------|------------------------|-----------------|----------------|--------|
| E1 | Ядро | `GET /health` отвечает 200 с версией сборки и без секретов | `scripts/smoke/wave-api-smoke.sh platform` | `OUTPUT/evidence/D01.json` + лог прогона | pending |
| E2 | Ядро | Отсутствие обязательной переменной окружения останавливает процесс, значение не печатается | unit `env.test.ts` | `OUTPUT/evidence/D01.json` | pending |
| E3 | Данные | Схема из 4 таблиц и 2 enum разворачивается с нуля одной командой | `supabase db reset` | `OUTPUT/evidence/D02.json` | pending |
| E4 | Данные | Seed даёт 1 менеджера, 2 исполнителей, 3 объекта и ≥8 задач во всех статусах | pgTAP `schema_test.sql` | `OUTPUT/evidence/D02.json` | pending |
| E5 | Безопасность | Исполнитель читает 0 чужих задач и объектов через PostgREST | pgTAP `rls_test.sql` | `OUTPUT/evidence/D02.json` | pending |
| E6 | Безопасность | `anon` не читает таблицы и не вызывает RPC | pgTAP `rls_test.sql` | `OUTPUT/evidence/D02.json` | pending |
| E7 | Безопасность | Прямой `UPDATE status` отклоняется триггером | pgTAP `history_test.sql` | `OUTPUT/evidence/D03.json` | pending |
| E8 | Ядро | 5 разрешённых переходов проходят для правильной роли, 15 запрещённых отклоняются | pgTAP `transitions_test.sql` | `OUTPUT/evidence/D03.json` | pending |
| E9 | Ядро | Возврат на доработку без комментария отклоняется в БД и UI | pgTAP + component test | `OUTPUT/evidence/D03.json`, `D08.json` | pending |
| E10 | Данные | История append-only: INSERT/UPDATE/DELETE через API запрещены | pgTAP `history_test.sql` | `OUTPUT/evidence/D03.json` | pending |
| E11 | Безопасность | Менеджер без TOTP не входит; сессия восстанавливается после F5 | e2e + component test | `OUTPUT/evidence/D04.json` | pending |
| E12 | Безопасность | Открытая регистрация отключена (`POST /auth/v1/signup` не создаёт пользователя) | smoke `auth` | `OUTPUT/evidence/D04.json` | pending |
| E13 | UX | Роль для навигации берётся из `profiles`, не из claim JWT | component test + pgTAP | `OUTPUT/evidence/D04.json` | pending |
| E14 | Ядро | Менеджер создаёт, правит и архивирует объект; исполнитель не имеет этих действий | smoke `objects` + component test | `OUTPUT/evidence/D05.json`, `D06.json` | pending |
| E15 | Ядро | Список объектов листается keyset без дублей и пропусков | unit `api.test.ts` | `OUTPUT/evidence/D05.json` | pending |
| E16 | Ядро | Задача создаётся в объекте с назначением и статусом `new` | smoke `tasks` | `OUTPUT/evidence/D07.json` | pending |
| E17 | Ядро | Исполнитель видит только свои задачи, прямая ссылка на чужую недоступна | e2e | `OUTPUT/evidence/D09.json` | pending |
| E18 | UX | «Мои задачи» показывает все свои задачи по статусам, счётчики совпадают | e2e + component test | `OUTPUT/evidence/D09.json` | pending |
| E19 | Ядро | Переход из строки «Моих задач» переносит задачу и обновляет счётчики | e2e | `OUTPUT/evidence/D09.json` | pending |
| E20 | Совместимость | Логическая репликация в состоянии streaming, лаг p95 ≤5 с | `node infra/replica/check.mjs` | `OUTPUT/evidence/D10.json` | pending |
| E21 | Безопасность | `nova_ro` получает `25006` на любую запись | `check.mjs` | `OUTPUT/evidence/D10.json` | pending |
| E22 | API | Три отчёта возвращают агрегаты, совпадающие с SQL на primary, без ПДн | unit + smoke `reports` | `OUTPUT/evidence/D11.json` | pending |
| E23 | Отказоустойчивость | Остановка реплики не ломает вход и переходы; отчёты отдают 503 с кодом | smoke + runbook учения | `OUTPUT/evidence/D11.json` | pending |
| E24 | UX | Экран отчётов показывает лаг и состояние деградации, не блокируя остальные экраны | e2e | `OUTPUT/evidence/D12.json` | pending |
| E25 | Наблюдаемость | Дашборд и алерты покрывают доступность, p95, 5xx, лаг; пробный инцидент закрыт | `promtool` + протокол учения | `OUTPUT/evidence/D13.json` | pending |
| E26 | Отказоустойчивость | Восстановление из PITR выполнено, RPO ≤5 мин и RTO ≤60 мин подтверждены | протокол учения | `OUTPUT/evidence/D13.json` | pending |
| E27 | Деплой | E2E 17 сценариев зелёные на staging, security-гейты без находок | `npm run e2e`, `check-no-secrets.sh` | `OUTPUT/evidence/D14.json` | pending |
| E28 | Деплой | Релиз и откат укладываются в 15 минут, журнал релизов заполнен | `deploy.sh` + хронометраж | `OUTPUT/evidence/D14.json` | pending |

## Правила

- Критерий без доказательства не закрывается; `pass` ставится после `sp-verify --gate pre_ci` (для своего D).
- После правки критериев — повторный `sp-verify --gate self-audit`.
- Критерии E1–E28 покрывают все 17 сценариев §4 и все группы §12.
