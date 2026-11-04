# Политика CI/CD и окружений

> Канон Witness Done (правило действует с v1.7). Шаг **08** обязан выдать не только lint, но **порядок развёртывания и правила окружений**.

## Обязательные артефакты (OUTPUT/tooling/)

| Файл | Содержание |
|------|------------|
| `cicd-and-environments.md` | Канон: окружения, пайплайны, кто деплоит, secrets, порядок |
| `deploy.md` | Топология runtime, команды rollout/rollback |
| `env-vars.md` | Переменные **по окружениям** (local/ci/staging/prod) |
| `ci.yml.example` + корневой CI | Lint/test на PR; отдельно deploy job (manual/protected) |

## Окружения (минимум)

| Env | Назначение | Данные | Автодеплой |
|-----|------------|--------|------------|
| **local** | Разработка на машине | docker-compose / локальные PG+Redis | нет |
| **ci** | PR / main checks | ephemeral или service containers | n/a (только verify) |
| **staging** | Интеграция, QA, демо | отдельная БД; mock/sandbox PSP/delivery | из `main` или tag `staging-*` (зафиксировать) |
| **production** | Боевой | prod БД; реальные ключи | **только** tag/release + approvals |

Допустимо объединить staging+prod на очень раннем MVP — тогда явно в doc: риск и план разделения.

## Порядок развёртывания (типовой)

Документируй **конкретный** порядок под стек проекта, например:

1. Инфра: сеть, secrets store, PG, Redis  
2. Миграции БД (**expand** до traffic; contract — отдельно)  
3. Backend API + workers  
4. Web (Next/SSR) / static  
5. Проверка smoke: `/health`, `/metrics`, главная или Place SSR  
6. Contour/wave API-smoke при деплое волны (`catalogs/contour-smoke.md`); полный product-smoke перед prod  
7. Внешний OLAP/PSP: memory в CI ок; **живой** прогон на staging — checkbox release  
8. Mobile store submit — **вне** автодеплоя API (отдельный runbook)

Откат: предыдущий image/tag; миграции — только если есть backward-compatible plan.

## Правила CI

**На каждый PR (обязательно):**

- lint всех языков стека v1;
- unit/integration tests если уже есть в репо (после D01 — хотя бы smoke script placeholder);
- **не** деплоить prod из PR.

**На main / release:**

- те же checks;
- опционально deploy → staging;
- prod: `workflow_dispatch` или tag + environment protection.

## Secrets

- Не в git; список имён — в `env-vars.md` и `secrets-and-config.md`.
- Prod secrets ≠ staging.
- CI: GitHub Environments / аналог с ограничениями ветки.

## Запреты

- Один `.env` с prod ключами в репозитории.
- Автодеплой в production без ручного approval (default политика фабрики).
- Деплой web/API без прогона миграций, если схема менялась.

## Связь с D-промптами

- D01/D11 CONSUMES: `cicd-and-environments.md`, `deploy.md`.
- Hardening D: проверить staging smoke checklist + wave/product-smoke (`docs/runbooks/product-smoke.md`).
- Money/analytics волны: не пропускать wave API-smoke на staging.
