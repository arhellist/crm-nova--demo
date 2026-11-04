# === DEV PROMPT: D12_reports_ui ===

РОЛЬ: frontend

GATE: none

ЗАВИСИТ ОТ: D04, D11

## SIZE_BUDGET

| Поле | Значение |
|------|----------|
| surfaces | ui |
| produces_count | 5 |
| entity | report |
| delivery_slice | S8 |
| split_group | reports |
| split_from | none |
| size_ok | yes |

## ЦЕЛЬ

Показать руководителю три отчёта с честным индикатором актуальности и состоянием деградации,
не блокируя остальные экраны при недоступной реплике.

## CONSUMES

- `OUTPUT/prompts/D11_reports_api.md` — контракт `/api/reports/*`, поля `source`, `lag_seconds`, коды 503
- `OUTPUT/specs/openapi.yaml` — схемы ответов отчётов
- `OUTPUT/docs/design-notes.md` — токены, таблица, бейдж актуальности
- `OUTPUT/docs/nfr.md` — NFR4 (p95 ≤300 мс), NFR22 (TTI ≤30 с), NFR15 (размер ответа)
- `OUTPUT/security/authn-authz.md` — отчёты только `manager`
- `OUTPUT/security/data-protection.md` — в UI не показывать ПДн, которых нет в контракте

## CONTEXT_PACK

| Поле | Значение |
|------|----------|
| pack_id | P12 |
| pack_path | `OUTPUT/context/packs/P12.md` |
| retrieve_query | reports screen freshness lag degraded 503 manager tokens |
| max_chunks | 8 |
| validation_ok | yes |

## HOW

1. `src/features/reports/api.ts` — клиент к `/api/reports/*` с базовым адресом из `VITE_REPORT_API_URL`,
   заголовком `Authorization` из настроек сборки (публичный токен отчётов) и таймаутом 5 с;
   ответы валидируются zod по схеме openapi; 503 → типизированная ошибка `ReplicaUnavailable`.
2. `src/features/reports/useReports.ts` — три `useQuery` с `staleTime: 30_000`, `retry: 1`;
   при `ReplicaUnavailable` возвращается состояние `degraded`, а не исключение в дерево.
3. `src/features/reports/FreshnessBadge.tsx` — «Данные на реплике · лаг N с»; при `lag_seconds > 30` —
   предупреждающий бейдж, при `degraded` — «Отчёты временно недоступны».
4. `src/features/reports/ReportsPage.tsx` — три вкладки: «Объекты», «Загрузка», «Возраст статусов»;
   таблицы без ПДн; скелетоны при загрузке; при `degraded` — панель с причиной и кнопкой «Повторить»,
   остальные экраны продукта работают.
5. `src/app/router.tsx` — маршрут `/reports` только для `manager`; исполнителю отдаётся 404-состояние,
   и пункт навигации отсутствует (D04).

## INVARIANTS

1. Экран отчётов доступен только `manager`; исполнитель получает 404-состояние, не пустой экран.
2. Ответы принимаются только по контракту openapi; неизвестные поля не отображаются.
3. `source` и `lag_seconds` всегда видимы рядом с данными.
4. При 503 показывается деградация, а не пустая таблица и не глобальная ошибка приложения.
5. Отчёты не кэшируются дольше 30 с; кнопка «Повторить» делает новый запрос.
6. В UI нет email, описаний задач и комментариев — их нет и в контракте (защита ПДн).
7. Никакие данные отчётов не пишутся в хранилище браузера.
8. Ошибка сети не ломает навигацию: пользователь может уйти на «Мои задачи».
9. Токены дизайна соблюдены, таблицы адаптивны на 360/768/1440 (NFR8 дизайна).

## ACCEPTANCE

| ID | Given | When | Then |
|----|-------|------|------|
| A12.1 | `manager`, реплика доступна | Открыть `/reports` | Видны три вкладки с данными, бейдж актуальности с лагом |
| A12.2 | `executor` | Открыть `/reports` напрямую | 404-состояние, навигация без пункта «Отчёты» |
| A12.3 | Лаг 40 с | Открыть отчёт | Бейдж предупреждения, данные всё равно показаны |
| A12.4 | Реплика недоступна (503) | Открыть `/reports`, затем `/my` | Панель деградации, переход на «Мои задачи» работает |
| A12.5 | Ответ с лишним полем `email` | Открыть отчёт | Поле не отображается, ошибок в консоли нет |
| A12.6 | Production-сборка | Проверить `dist/` | Нет адресов primary и `service_role`, только публичный адрес отчётов |

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | none |
| conflicts_ref | `OUTPUT/docs/07_conflicts.md#2-конфликты-с-архитектурными-решениями` |
| conflicts_applied | `caching-redis × NFR4` |
| app_contracts | GET /api/reports/objects, GET /api/reports/workload, GET /api/reports/status-ages |
| runtime_trace_required | no |
| invariants_skip | пусто |
| depends_done | D04, D11 |
| eco_invariants | design-tokens, no-secrets |
| acceptance_ops | A12.1, A12.4 |
| pre_ci | required |
| pre_release | required |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L2 |
| verify_cmd | `sp-verify --d D12 --gate pre_ci` |
| evidence | `OUTPUT/evidence/D12.json` |
| done_forbidden_unless | `tax_pass=true`, A12.1–A12.6 покрыты, `ops_checked` непуст |
| review | `sp review D12 --verdict supports` от ревьюера ≠ автор |

## PRODUCES

- `src/features/reports/api.ts` — создать
- `src/features/reports/useReports.ts` — создать
- `src/features/reports/FreshnessBadge.tsx` — создать
- `src/features/reports/ReportsPage.tsx` — создать
- `src/app/router.tsx` — изменить (маршрут `/reports`)

Тесты:

- `src/features/reports/ReportsPage.test.tsx` — A12.1, A12.2, A12.3
- `src/features/reports/degraded.test.tsx` — A12.4, A12.5
- `src/features/reports/bundle.test.ts` — A12.6

## НЕ ТРОГАТЬ

- `src/reporting/**` — backend отчётов D11.
- `src/features/tasks/**` — D07–D09.

## PRE-CHECK

- [ ] D04, D11 `done`
- [ ] `P12.validation.json` → `ok: true`
- [ ] `size_ok: yes`
- [ ] `VITE_REPORT_API_URL` задан для staging и production
- [ ] CSP разрешает только этот домен в `connect-src`

## ОГРАНИЧЕНИЯ

- Стек: React 18, TanStack Query, zod.
- Типизация: `catalogs/typing-and-tests.md`, без `any`.
- Автотесты: Testing Library + MSW (200, 503, лишнее поле), кейсы `A12.*`.
- Комментарии: `catalogs/code-comments.md`, на русском, у состояния деградации.
- VerificationTax: `done` после `pre_ci` и `acceptance_ids`.
- Context: только CONTEXT_PACK.
- Дизайн: `design-notes.md` — токены, бейджи, таблицы.
- NFR: NFR4, NFR15, NFR22.
- Доменные правила (≤12): отчёты только менеджеру; данные вторичны; лаг виден; деградация локальна;
  в отчётах нет ПДн; кэш ≤30 с; повторный запрос по кнопке.
- Запрет: считать метрики на клиенте, показывать поля вне контракта, писать отчёты в хранилище браузера.

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Компоненты в PRODUCES, рабочий код.
- Тесты `A12.*`.
- Список файлов и описание состояний экрана.
- Обновить test-plan и progress; после `reports` — wave smoke.

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] Три отчёта отображаются, лаг и источник видны
- [ ] Исполнитель не имеет доступа к экрану
- [ ] 503 даёт локальную деградацию
- [ ] Лишние поля не отображаются
- [ ] `proof_debt` пуст

## STOP

Остановиться после PRODUCES и `pre_ci`; D13 не начинать.
