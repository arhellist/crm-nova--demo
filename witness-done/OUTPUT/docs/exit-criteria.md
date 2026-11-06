# Exit Criteria — критерии завершения продукта

> Каждый критерий — наблюдаемое поведение. `pass` ставится только при наличии доказательства;
> до выполнения D01–D14 статусы `pending`, а в колонке «Доказательство» указан ожидаемый артефакт.

## Мета

| Поле | Значение |
|------|----------|
| Проект | NOVA CRM |
| Версия | 1.31.0 |
| Дата аудита | 2026-11-05 |
| Всего критериев | 28 |
| Закрыто | 28 |
| Открыто | 0 |

## Критерии

| ID | Область | Критерий (наблюдаемо) | Способ проверки | Доказательство | Статус |
|----|---------|------------------------|-----------------|----------------|--------|
| E1 | Ядро | `GET /health` отвечает 200 с версией сборки и без секретов | `scripts/smoke/wave-api-smoke.sh platform` | `OUTPUT/evidence/D01.json` | pass |
| E2 | Ядро | Отсутствие обязательной переменной окружения останавливает процесс, значение не печатается | unit `src/shared/config/env.test.ts` | `OUTPUT/evidence/D01.json` | pass |
| E3 | Данные | Схема из 4 таблиц и 2 enum разворачивается с нуля одной командой | `supabase db reset` | `OUTPUT/evidence/D02.json` | pass |
| E4 | Данные | Seed даёт 1 менеджера, 2 исполнителей, 3 объекта и ≥8 задач во всех статусах | pgTAP `supabase/tests/schema_test.sql` | `OUTPUT/evidence/D02.json` | pass |
| E5 | Безопасность | Исполнитель читает 0 чужих задач и объектов через PostgREST | pgTAP `supabase/tests/rls_test.sql` | `OUTPUT/evidence/D02.json` | pass |
| E6 | Безопасность | `anon` не читает таблицы и не вызывает RPC | pgTAP `supabase/tests/rls_test.sql` | `OUTPUT/evidence/D02.json` | pass |
| E7 | Безопасность | Прямой `UPDATE status` отклоняется триггером | pgTAP `supabase/tests/history_test.sql` | `OUTPUT/evidence/D03.json` | pass |
| E8 | Ядро | 5 разрешённых переходов проходят для правильной роли, 15 запрещённых отклоняются | pgTAP `supabase/tests/transitions_test.sql` | `OUTPUT/evidence/D03.json` | pass |
| E9 | Ядро | Возврат на доработку без комментария отклоняется в БД и UI | pgTAP + `src/features/tasks/StatusPanel.test.tsx` | `OUTPUT/evidence/D03.json`, `OUTPUT/evidence/D08.json` | pass |
| E10 | Данные | История append-only: INSERT/UPDATE/DELETE через API запрещены | pgTAP `supabase/tests/history_test.sql` | `OUTPUT/evidence/D03.json` | pass |
| E11 | Безопасность | Вход email+пароль без TOTP; сессия восстанавливается после F5 (DEC-053) | e2e + `src/features/auth/useSession.test.tsx` | `OUTPUT/evidence/D04.json`, `OUTPUT/evidence/D14.json` | pass |
| E12 | Безопасность | Открытая регистрация отключена (`POST /auth/v1/signup` не создаёт пользователя) | smoke `scripts/smoke/product-smoke.sh` | `OUTPUT/evidence/D04.json`, `OUTPUT/evidence/RELEASE-product-smoke.json` | pass |
| E13 | UX | Роль для навигации берётся из `profiles`, не из claim JWT | `src/app/AppShell.test.tsx` | `OUTPUT/evidence/D04.json` | pass |
| E14 | Ядро | Менеджер создаёт, правит и архивирует объект; исполнитель не имеет этих действий | component + e2e | `OUTPUT/evidence/D05.json`, `OUTPUT/evidence/D06.json` | pass |
| E15 | Ядро | Список объектов листается keyset без дублей и пропусков | unit `src/features/objects/api.test.ts` | `OUTPUT/evidence/D05.json` | pass |
| E16 | Ядро | Задача создаётся в объекте с назначением и статусом `new` | unit + e2e | `OUTPUT/evidence/D07.json`, `OUTPUT/evidence/D14.json` | pass |
| E17 | Ядро | Исполнитель видит только свои задачи, прямая ссылка на чужую недоступна | e2e `e2e/smoke.spec.ts` | `OUTPUT/evidence/D09.json`, `OUTPUT/evidence/D14.json` | pass |
| E18 | UX | «Мои задачи» показывает все свои задачи по статусам, счётчики совпадают | e2e + component | `OUTPUT/evidence/D09.json` | pass |
| E19 | Ядро | Переход из строки «Моих задач» переносит задачу и обновляет счётчики | e2e `e2e/smoke.spec.ts` | `OUTPUT/evidence/D09.json`, `OUTPUT/evidence/D14.json` | pass |
| E20 | Совместимость | Логическая репликация в состоянии streaming, лаг p95 ≤5 с | `node infra/replica/check.mjs` | `OUTPUT/evidence/D10.json` | pass |
| E21 | Безопасность | `nova_ro` получает `25006` на любую запись | `infra/replica/check.mjs` | `OUTPUT/evidence/D10.json` | pass |
| E22 | API | Три отчёта возвращают агрегаты, совпадающие с SQL на primary, без ПДн | unit + smoke | `OUTPUT/evidence/D11.json` | pass |
| E23 | Отказоустойчивость | Остановка реплики не ломает вход и переходы; отчёты отдают 503 с кодом | smoke + runbook | `OUTPUT/evidence/D11.json`, `OUTPUT/evidence/D13.json` | pass |
| E24 | UX | Экран отчётов показывает лаг и состояние деградации, не блокируя остальные экраны | e2e + component | `OUTPUT/evidence/D12.json`, `OUTPUT/evidence/D14.json` | pass |
| E25 | Наблюдаемость | Дашборд и алерты покрывают доступность, p95, 5xx, лаг; пробный инцидент закрыт | `promtool` + протокол учения | `OUTPUT/evidence/D13.json` | pass |
| E26 | Отказоустойчивость | Восстановление из PITR выполнено, RPO ≤5 мин и RTO ≤60 мин подтверждены | протокол учения | `OUTPUT/evidence/D13.json` | pass |
| E27 | Деплой | E2E 17 сценариев зелёные на staging, security-гейты без находок | `npm run e2e`, `scripts/release/check-no-secrets.sh` | `OUTPUT/evidence/D14.json`, `OUTPUT/evidence/RELEASE-runtime-verify.json` | pass |
| E28 | Деплой | Релиз и откат укладываются в 15 минут, журнал релизов заполнен | `scripts/release/deploy.sh` + хронометраж | `OUTPUT/evidence/D14.json` | pass |

## Правила

- Критерий без доказательства не закрывается; `pass` ставится после `sp-verify --gate pre_ci` (для своего D).
- После правки критериев — повторный `sp-verify --gate self-audit`.
- Критерии E1–E28 покрывают все 17 сценариев §4 и все группы §12.
