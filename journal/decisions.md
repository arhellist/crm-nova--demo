# Журнал решений проекта NOVA CRM

> Append-only: принятое не редактируется, `DEC-###` не переиспользуются.
> Одна запись — один файл в `decisions/`; этот файл собирается командой `sp journal --index`.
> Канон: `catalogs/intake-and-decisions.md`.

Журнал **коммитится**: `journal/` — источник правды о том, почему сделано именно так. Решения,
оставшиеся только на машине автора, для проекта не существуют.

## Оглавление

| ID | Решение | Дата | Статус | Intake |
|----|---------|------|--------|--------|
| DEC-001 | Раскладка: проект — корень TestCRM, канон — TestCRM/witness-done/. Код продук… | 2026-11-04 | принято | 20261104-1743-razvernut-kanon-kak-project-witness-done |
| DEC-002 | Гейт канона в проекте: `./validate.sh` внутри работающей установки падает … | 2026-11-04 | принято | 20261104-1743-razvernut-kanon-kak-project-witness-done |
| DEC-003 | Результаты 10b переснимаются каноном 1.31.1 из MyProjects/WitnessDone; копия … | 2026-11-04 | принято | 20261104-2050-horosho-patch-etot-rep-no-ne-fabriku-a-e |
| DEC-004 | Инструментовка шага 08 (.eslintrc.js, .github/workflows/ci.yml, .gitignore, e… | 2026-11-04 | принято | 20261104-2050-horosho-patch-etot-rep-no-ne-fabriku-a-e |
| DEC-005 | Код пишется по цепочке D01…D14 строго по OUTPUT/prompts; структура продукта — корневой src/ … | 2026-11-04 | принято | 20261104-2057-davay-ebash-kod-po-proektu |
| DEC-006 | Поле архивации называется archived_at | 2026-11-04 | принято | 20261104-2057-davay-ebash-kod-po-proektu |
| DEC-007 | Первым подключаемым контуром Supabase выбран облачный проект (staging), а не … | 2026-11-04 | принято | 20261104-2109-kak-podklyuchit-k-proektu-supabase-kakie |
| DEC-008 | В объём D02 добавляются supabase init (создание supabase/config.toml, который… | 2026-11-04 | принято | 20261104-2109-kak-podklyuchit-k-proektu-supabase-kakie |
| DEC-009 | D03: стабильные SQLSTATE берём из specs (P0400 — валидация/не найдено/пустой … | 2026-11-04 | принято | 20261104-2057-davay-ebash-kod-po-proektu |
| DEC-010 | D03: функции записи создаём в схеме public (public.change_task_status, public… | 2026-11-04 | принято | 20261104-2057-davay-ebash-kod-po-proektu |
| DEC-011 | D04 дополнительно создаёт минимальный фронтенд-каркас: index.html, src/main.t… | 2026-11-04 | принято | 20261104-2057-davay-ebash-kod-po-proektu |
| DEC-012 | Новые ключи Supabase раскладываются по контрактным именам OUTPUT/tooling/env-… | 2026-11-04 | принято | 20261104-2122-env-supabase-prover-perechen-peremennyh |
| DEC-013 | D05 переиспользует единственный клиент Supabase из src/features/auth/api.ts: … | 2026-11-04 | принято | — |
| DEC-014 | D06 показывает число задач в строке объекта прочерком: контракт задач появляе… | 2026-11-04 | принято | — |
| DEC-015 | D06 проверяет экран объектов через Testing Library с моками модуля контракта … | 2026-11-04 | принято | — |
| DEC-016 | D07 принимает description до 5000 символов, как в domain-rules §9 и data-mode… | 2026-11-04 | принято | — |
| DEC-017 | D07 считает архивную задачу недоступной для чтения: domain-rules §4 и RLS tas… | 2026-11-04 | принято | — |
| DEC-018 | Обёртка PostgREST пробрасывает машинный payload.message в PostgrestApiError.s… | 2026-11-04 | принято | — |
| DEC-019 | История задачи читает актора из task_status_history.changed_by, а не actor_id… | 2026-11-04 | принято | — |
| DEC-020 | D08 дополнительно изменяет src/features/objects/ObjectsPage.tsx: карточка объ… | 2026-11-04 | принято | — |
| DEC-021 | D08 оставляет в TaskPage защитное состояние архивной задачи (бейдж «Архив», б… | 2026-11-04 | принято | — |
| DEC-022 | D09: контракт D07 расширяется необязательным status в ListMyTasksParams (филь… | 2026-11-04 | принято | — |
| DEC-023 | D10 дополнительно создаёт infra/replica/api.Dockerfile и infra/replica/init/0… | 2026-11-04 | принято | — |
| DEC-024 | D11: список app_contracts в промпте обёрнут в обратные кавычки, из-за чего sp… | 2026-11-04 | принято | — |
