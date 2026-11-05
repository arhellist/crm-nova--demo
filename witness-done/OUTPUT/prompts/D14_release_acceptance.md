# === DEV PROMPT: D14_release_acceptance ===

РОЛЬ: qa

GATE: none

ЗАВИСИТ ОТ: D09, D12, D13

## SIZE_BUDGET

| Поле | Значение |
|------|----------|
| surfaces | tooling |
| produces_count | 19 |
| entity | — |
| delivery_slice | S10 |
| split_group | release |
| split_from | none |
| size_ok | yes |

## ЦЕЛЬ

Закрыть продукт приёмкой: e2e по всем 17 сценариям на staging, security-гейты в CI,
воспроизводимый деплой с откатом и документация, по которой новый человек поднимает систему.

## CONSUMES

- `OUTPUT/tooling/cicd-and-environments.md` — джобы, окружения, правила выката
- `OUTPUT/tooling/deploy.md` — порядок staging → production и откат
- `OUTPUT/tooling/verify-commands.md` — полный набор проверок
- `OUTPUT/security/checklist.md` — ASVS L2 и security-гейты
- `OUTPUT/security/secrets-and-config.md` — что запрещено в бандле и образах
- `OUTPUT/docs/runbooks/product-smoke.md` — сценарии и критерии приёмки
- `OUTPUT/docs/nfr.md` — NFR9 (откат ≤15 мин), NFR18 (развёртывание ≤15 мин), NFR21 (8 e2e), NFR6
- `OUTPUT/specs/openapi.yaml` — контракты, проверяемые в smoke

## CONTEXT_PACK

| Поле | Значение |
|------|----------|
| pack_id | P14 |
| pack_path | `OUTPUT/context/packs/P14.md` |
| retrieve_query | e2e staging security gates deploy rollback readme decisions acceptance |
| max_chunks | 9 |
| validation_ok | yes |

## HOW

1. `e2e/playwright.config.ts` — `baseURL` из env staging, `retries: 1` в CI, `trace: on-first-retry`,
   проекты desktop 1440 и mobile 360; глобальный setup логинит три учётные записи (1 менеджер,
   2 исполнителя) и сохраняет `storageState`.
2. `e2e/smoke.spec.ts` — 17 сценариев §4 в порядке срезов: вход с MFA, объект, задача, взятие,
   отправка, приёмка, возврат, повторный старт, изоляция, запрещённый переход, архивирование,
   «Мои задачи», отчёты, лаг, запрет записи backend, инцидент-деградация, восстановление сессии.
   Каждый сценарий помечает `A14.1`.
3. `scripts/release/check-no-secrets.sh` — `gitleaks detect --redact`, `npm audit --audit-level=high`
   во фронтенде и backend, grep по `dist/` и образу на `service_role`, `SUPABASE_DB_PASSWORD`,
   `DATABASE_URL_PRIMARY`; проверка CSP-заголовка production-сборки (`curl -I`), `frame-ancestors 'none'`,
   отсутствие `unsafe-eval`. Возвращает 1 на любую находку.
4. `scripts/release/deploy.sh` — тег версии, прогон миграций forward-only, выкат staging, smoke,
   переключение production, запись в журнал релизов; откат — предыдущий тег за одну команду,
   хронометраж печатается в конце.
5. `docs/decisions.md` — сведённые решения и остаточные риски из ADR, включая риск одного региона,
   токен в памяти вкладки и слот репликации.
6. `README.md` — требования, установка, переменные, миграции, seed, подъём реплики и backend,
   тесты, деплой, учётные записи, схема потоков данных и объяснение для руководителя без терминов.

## INVARIANTS

1. E2E выполняется на staging и на production-сборке, а не на dev-сервере.
2. Ни один сценарий приёмки не помечен skip; `retries: 1` не скрывает падение.
3. `service_role` и строки подключения к primary отсутствуют в `dist/`, образах и git (INV-006).
4. CSP отдаётся production-сборкой; `unsafe-eval` и `frame-ancestors *` запрещены (INV-010).
5. Мутирующие методы backend возвращают 405; отчёты не имеют пути записи (INV-011).
6. Откат — предыдущий неизменяемый тег, не «пересборка из ветки».
7. Журнал релизов заполняется до объявления релиза; время деплоя и отката фиксируется.
8. README позволяет поднять контур с нуля за ≤15 минут по NFR18.
9. Учётные записи (1 менеджер + 2 исполнителя) существуют в production после релиза.

## ACCEPTANCE

| ID | Given | When | Then |
|----|-------|------|------|
| A14.1 | Staging с seed | `npm run e2e` | Все 17 сценариев зелёные, ни один не пропущен |
| A14.2 | Production-сборка и репозиторий | `scripts/release/check-no-secrets.sh` | 0 находок: нет секретов, audit без high, CSP без `unsafe-eval` |
| A14.3 | Новый человек, чистый клон | Пройти README и `docs/decisions.md` | Контур поднят ≤15 мин, все шаги выполнимы без вопросов автору |
| A14.4 | Релиз на staging | `deploy.sh` и откат на предыдущий тег | Деплой и откат ≤15 мин каждый, записи в журнале релизов |

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | none |
| conflicts_ref | none |
| conflicts_applied | none |
| app_contracts | GET /api/reports/objects, POST /rest/v1/rpc/change_task_status, GET /health |
| runtime_trace_required | no |
| invariants_skip | пусто |
| depends_done | D09, D12, D13 |
| eco_invariants | no-secrets, design-tokens, logging |
| acceptance_ops | A14.1, A14.2, A14.4 |
| pre_ci | required |
| pre_release | required |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L1 |
| verify_cmd | `sp-verify --d D14 --gate pre_ci` |
| evidence | `OUTPUT/evidence/D14.json` |
| done_forbidden_unless | `tax_pass=true`, A14.1–A14.4 покрыты, `pre_release` пройден |
| review | `sp review D14 --verdict supports` (рекомендуется) |

## PRODUCES

- `e2e/playwright.config.ts` — создать
- `e2e/smoke.spec.ts` — создать
- `scripts/release/check-no-secrets.sh` — создать
- `scripts/release/deploy.sh` — создать
- `docs/decisions.md` — создать
- `README.md` — создать
- `e2e/global-setup.ts` — создать (вход трёх учётных записей и storageState)
- `package.json` — изменить (Playwright, скрипты e2e; DEC-030)
- `package-lock.json` — изменить (зависимость Playwright; DEC-030)
- `tsconfig.json` — изменить (e2e проверяется отдельным проектом; DEC-030)
- `e2e/tsconfig.json` — создать (strict-проект e2e; DEC-030)
- `.eslintrc.cjs` — изменить (project для e2e; DEC-030)
- `vite.config.ts` — создать (production-сборка SPA в `dist/web`; DEC-031)
- `vercel.json` — создать (CSP и OWASP-заголовки production-хоста; INV-010, DEC-031)
- `scripts/release/serve-preview.mjs` — создать (staging-хост production-сборки с заголовками `vercel.json`; DEC-031)
- `scripts/smoke/product-smoke.sh` — изменить (Bearer у `/metrics`, проверки Supabase по `SUPABASE_URL`; DEC-031)
- `.gitignore` — изменить (служебные артефакты `supabase/.branches/` не входят в поставку; DEC-038)

Тесты:

- `e2e/smoke.spec.ts` — A14.1 (17 сценариев)
- `scripts/release/check-no-secrets.test.sh` — A14.2
- `scripts/release/deploy.test.sh` — A14.4
- `docs/readme.test.md` — A14.3 (протокол прогона README)

## НЕ ТРОГАТЬ

- `supabase/migrations/**` — forward-only; изменения только новой миграцией.
- `src/**` — правки только при провале e2e, отдельным заданием.

## PRE-CHECK

- [ ] D09, D12, D13 `done`
- [ ] `P14.validation.json` → `ok: true`
- [ ] `size_ok: yes`
- [ ] Staging-проект и три учётные записи доступны
- [ ] `gh` или CI-токен для прогона джоб

## ОГРАНИЧЕНИЯ

- Стек: Playwright, POSIX sh, GitHub Actions.
- Типизация: e2e на TypeScript strict, без `any`.
- Автотесты: 17 сценариев §4 + протокол README; кейсы `A14.*`.
- Комментарии: шаги деплоя и отката — на русском, с ожидаемым результатом.
- VerificationTax: `done` после `pre_ci` и `pre_release`.
- Context: только CONTEXT_PACK.
- NFR: NFR6, NFR9, NFR18, NFR21.
- Доменные правила (≤12): приёмка по §12, а не по «выглядит рабочим»; сид в production;
  откат проверен; журнал релизов обязателен; демо-объяснение без терминов.
- Запрет: объявлять релиз без зелёных security-гейтов и без записи в журнале.

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Скрипты, e2e и документация в PRODUCES.
- Отчёт e2e и вывод security-скрипта в чате.
- Хронометраж деплоя и отката.
- Обновить test-plan, progress и журнал релизов.

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] 17 сценариев зелёные, skip отсутствуют
- [ ] Security-гейты без находок
- [ ] README пройден на чистом клоне
- [ ] Откат проверен и уложился в 15 минут
- [ ] Журнал релизов и `docs/decisions.md` заполнены
- [ ] `proof_debt` пуст

## STOP

Остановиться после PRODUCES, `pre_ci` и `pre_release`. Дальше — шаг 10 (сборка и критерии выхода).
