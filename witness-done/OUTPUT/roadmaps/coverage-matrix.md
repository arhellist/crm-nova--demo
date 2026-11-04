# Матрица покрытия ТЗ → D-промпты

> Сгенерировано Witness Done v1.31.0. Канон: `catalogs/completeness-policy.md`.
> Каждая строка — пункт IN SCOPE или критерий приёмки §12; `D` — где он реализуется и проверяется.

## Легенда

- `covered` — есть D + test-plan, требование в PRODUCES/ОГРАНИЧЕНИЯХ, `size_ok`.
- `partial` — D есть, но есть дыры; дописать до кода.
- `blocked_adr` — ждёт ADR; будущие D перечислены.
- `missing` — дыра фабрики; исправить до READY.

## IN SCOPE → D

| # | Требование (ТЗ §2) | Приоритет | D (D01…D14) | SPLIT_GROUP | size_ok | Test-plan | Статус |
|---|--------------------|-----------|---|-------------|---------|-----------|--------|
| 1 | Вход с MFA и сессией, сохранение после F5 | P0 | D04 | auth | yes | test-plan-D04 | covered |
| 2 | Две роли из БД, а не из JWT-claim | P0 | D02, D04 | schema, auth | yes | test-plan-D02, -D04 | covered |
| 3 | Открытая регистрация отключена | P0 | D04 | auth | yes | test-plan-D04 | covered |
| 4 | Объекты: список, создание, правка, архивирование | P0 | D05, D06 | objects | yes | test-plan-D05, -D06 | covered |
| 5 | Карточка объекта с его задачами | P0 | D06, D08 | objects, tasks | yes | test-plan-D06, -D08 | covered |
| 6 | Задачи: создание, правка, назначение, архивирование | P0 | D07, D08 | tasks | yes | test-plan-D07, -D08 | covered |
| 7 | Карточка задачи и панель статусов | P0 | D08 | tasks | yes | test-plan-D08 | covered |
| 8 | Цикл из 5 статусов и 5 переходов с проверкой в БД | P0 | D03, D08 | schema, tasks | yes | test-plan-D03, -D08 | covered |
| 9 | Неизменяемая история переходов | P0 | D03 | schema | yes | test-plan-D03 | covered |
| 10 | «Мои задачи» со счётчиками | P0 | D09 | tasks | yes | test-plan-D09 | covered |
| 11 | RLS на всех таблицах + RPC | P0 | D02, D03 | schema | yes | test-plan-D02, -D03 | covered |
| 12 | Seed-данные (1 менеджер, 2 исполнителя, 3 объекта, ≥8 задач) | P0 | D02 | schema | yes | test-plan-D02 | covered |
| 13 | Read-only backend и health-эндпоинты | P0 | D11 | reports | yes | test-plan-D11 | covered |
| 14 | Логическая репликация с контролем лага | P0 | D10, D11 | reports | yes | test-plan-D10, -D11 | covered |
| 15 | Три отчёта на реплике | P0 | D10, D11, D12 | reports | yes | test-plan-D10…-D12 | covered |
| 16 | ASVS L2: JWT, RBAC, CSRF, заголовки, CSP | P0 | D04, D05, D11, D14 | auth, objects, reports, release | yes | test-plan-D04, -D05, -D11, -D14 | covered |
| 17 | Эксплуатация: staging, мониторинг, бэкапы, runbooks | P0 | D13 | release | yes | test-plan-D13 | covered |
| 18 | Документация и журнал решений | P0 | D14 | release | yes | test-plan-D14 | covered |
| 19 | 404 и состояние деградации отчётов | P0 | D06, D12 | objects, reports | yes | test-plan-D12 | covered |
| 20 | Адаптив 360/768/1440, токены дизайна | P0 | D04, D06, D08, D09, D12 | auth…reports | yes | test-plan-D04, -D06, -D08, -D09, -D12 | covered |

## Сценарии §4 → D

| # | Сценарий | D (D01…D14) | SPLIT_GROUP | size_ok | Статус |
|---|----------|---|-------------|---------|--------|
| 1 | Провижининг пользователей вне UI | D02 | schema | yes | covered |
| 2 | Вход с MFA | D04 | auth | yes | covered |
| 3 | Создание объекта | D05, D06 | objects | yes | covered |
| 4 | Создание задачи с назначением | D07, D08 | tasks | yes | covered |
| 5 | Взятие в работу | D03, D08 | schema, tasks | yes | covered |
| 6 | Отправка на проверку | D03, D08 | schema, tasks | yes | covered |
| 7 | Приёмка менеджером | D03, D08 | schema, tasks | yes | covered |
| 8 | Возврат на доработку с комментарием | D03, D08 | schema, tasks | yes | covered |
| 9 | Повторный старт после доработки | D03, D09 | schema, tasks | yes | covered |
| 10 | Изоляция исполнителя (RLS) | D02, D09 | schema, tasks | yes | covered |
| 11 | Запрещённый переход отклоняется БД | D03 | schema | yes | covered |
| 12 | Архивирование объекта/задачи | D03, D05, D07 | schema, objects, tasks | yes | covered |
| 13 | «Мои задачи» | D09 | tasks | yes | covered |
| 14 | Отчёты | D11, D12 | reports | yes | covered |
| 15 | Отставание реплики | D10, D11, D12 | reports | yes | covered |
| 16 | Запрет записи в backend | D11 | reports | yes | covered |
| 17 | Инцидент и восстановление | D13, D14 | release | yes | covered |

## Acceptance §12 → проверка

| Группа §12 | Критерий | Где закрывается (D01…D14) | Статус |
|------------|----------|-----------------|--------|
| Функциональность | Вход тремя учётными записями, MFA, выход, сессия после F5 | D04 / A04.1–A04.6 | covered |
| Функциональность | `/login` недоступен авторизованному, неавторизованный → `/login` | D04 / A04.2, A04.6 | covered |
| Функциональность | Открытая регистрация отключена | D04 / A04.5 | covered |
| Функциональность | Объекты: создание/правка/архив, изоляция исполнителя | D05, D06 / A05.*, A06.* | covered |
| Функциональность | Задачи: создание, назначение, изоляция, прямая ссылка | D07, D08 / A07.*, A08.* | covered |
| Функциональность | 5 разрешённых и 15 запрещённых переходов | D03 / A03.1–A03.4 | covered |
| Функциональность | `on_review → rework` без комментария отклоняется в UI и БД | D03, D08 / A03.5, A08.5 | covered |
| Функциональность | История: создание + переходы, порядок, актор, запрет записи | D03 / A03.6, A03.7 | covered |
| Функциональность | «Мои задачи» и совпадение счётчиков | D09 / A09.1–A09.6 | covered |
| Функциональность | Отчёты только менеджеру, три отчёта, актуальность, деградация | D12 / A12.1–A12.6 | covered |
| Функциональность | Стартовые данные | D02 / A02.4 | covered |
| Доступ (RBAC) | Исполнитель читает 0 чужих строк | D02 / A02.2 | covered |
| Доступ (RBAC) | Исполнитель не меняет чужое и не меняет статус напрямую | D02, D03 / A02.3, A03.4 | covered |
| Доступ (RBAC) | `anon` не читает таблицы и не вызывает RPC | D02, D03 / A02.3, A03.7 | covered |
| Доступ (RBAC) | Жёсткое удаление невозможно | D02 / A02.3 | covered |
| Доступ (RBAC) | Нет `service_role` в `dist/` и git | D14 / A14.2 | covered |
| Доступ (RBAC) | `security definer` с фиксированным `search_path` | D03 / A03.7 | covered |
| Доступ (RBAC) | Матрица §8.6 построчно тестами | D02, D03 / A02.*, A03.* | covered |
| Доступ (RBAC) | Эскалация роли невозможна | D02 / A02.3 | covered |
| JWT и MFA | `alg: none`, чужой `iss`/`aud` отклоняются | D04, D14 / A04.4, A14.2 | covered |
| JWT и MFA | Истёкший токен → refresh без потери формы | D04 / A04.6 | covered |
| JWT и MFA | TTL 1 час, reuse detection | D04 / A04.4 | covered |
| JWT и MFA | MFA обязателен для `manager`, revoke инвалидирует | D04 / A04.1, A04.4 | covered |
| JWT и MFA | Нет токенов в логах и URL | D01, D04 / A01.4, A04.6 | covered |
| JWT и MFA | Роль из `profiles`, не из claim | D02, D04 / A02.1, A04.3 | covered |
| CSRF | Кросс-доменный POST без `Authorization` → 401 | D14 / A14.2 | covered |
| CSRF | Нет `credentials: 'include'`, cookie не авторизует | D04 / A04.6 | covered |
| CSRF | Изменяющие операции только POST/PATCH/DELETE/RPC | D05, D07 / A05.6, A07.6 | covered |
| CSRF | API: нет `API_TOKEN` → 401, чужой `Origin` → 403 | D11 / A11.2 | covered |
| CSRF | CSP в production, без `unsafe-eval`, `frame-ancestors 'none'` | D14 / A14.2 | covered |
| OWASP | `npm audit` и `gitleaks` без находок | D14 / A14.2 | covered |
| OWASP | Инъекции сохраняются как текст | D05, D07 / A05.5, A07.5 | covered |
| OWASP | Security Advisors без critical, RLS на 4 таблицах | D02 / A02.3 | covered |
| OWASP | threat-model и ASVS-чеклист заполнены | D14 / A14.3 | covered |
| OWASP | Ошибки не раскрывают SQL и чужие записи | D05, D11 / A05.6, A11.6 | covered |
| Backend | `docker compose up` идемпотентен | D10 / A10.1 | covered |
| Backend | `pg_stat_subscription` streaming, лаг ≤5 с, health | D10, D11 / A10.2, A11.3 | covered |
| Backend | Счётчики и `max(updated_at)` совпадают с primary | D10 / A10.3 | covered |
| Backend | Отчёты совпадают с SQL, без PII | D11 / A11.4, A11.5 | covered |
| Backend | 405 на запись, `nova_ro` → 25006 | D10, D11 / A10.4, A11.2 | covered |
| Backend | Нет секретов primary в backend/образе | D11, D14 / A11.7, A14.2 | covered |
| Backend | Остановка реплики не ломает запись, отчёты → 503 | D11, D12 / A11.6, A12.4 | covered |
| Backend | Бандл без адресов backend | D12 / A12.6 | covered |
| Качество | lint/typecheck/test/build зелёные | D01, D14 / A01.1, A14.1 | covered |
| Качество | pgTAP и `infra/replica/check.mjs` | D02, D03, D10 / A02.*, A03.*, A10.* | covered |
| Качество | E2E Playwright по §4 | D14 / A14.1 | covered |
| Качество | Дизайн-токены, адаптив, клавиатура | D04, D06, D08, D09, D12 / A06.6, A08.6, A09.6, A12.5 | covered |
| Качество | Дашборд и проверенные алерты | D13 / A13.1, A13.2 | covered |
| Качество | Бэкапы и учебное восстановление | D13 / A13.3 | covered |
| Качество | Релиз staging → production, откат, журнал | D14 / A14.4 | covered |
| Качество | README и учётные записи | D14 / A14.3 | covered |
| Качество | Публичный адрес и seed в базе | D14 / A14.1, A02.4 | covered |
| Качество | Объяснение для руководителя | D14 / A14.3 | covered |
| Качество | `docs/decisions.md` актуален | D14 / A14.3 | covered |

## Итог

- P0 `missing`: **0**
- P0 `blocked_adr`: **1** (мобильный клиент — вне IN SCOPE; будущие D: `DM01` — нативный клиент поверх read-only API)
- P0 `partial`: **0**
- SIZE_BUDGET `size_ok=no`: **0**
