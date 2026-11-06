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
| DEC-025 | D12: фронтенд отчётов читает VITE_REPORT_API_URL и публичный read-only токен … | 2026-11-04 | принято | — |
| DEC-026 | D12: eco-проверка sp-verify ложно срабатывает на промпт, где одновременно ест… | 2026-11-04 | принято | — |
| DEC-027 | D13 A13.1 требует на /metrics метрики http_request_duration_seconds, replica_… | 2026-11-04 | принято | — |
| DEC-028 | D13: дашборд Grafana по HOW должен содержать панели длительности переходов и … | 2026-11-04 | принято | — |
| DEC-029 | D13: app_contracts в промпте были обёрнуты в обратные кавычки, из-за чего sp-… | 2026-11-04 | принято | — |
| DEC-030 | D14: Playwright, e2e/global-setup.ts, e2e/tsconfig.json и правки package/tsco… | 2026-11-04 | принято | — |
| DEC-031 | D14: production-сборка SPA получила конфиг сборки и хост с заголовками | 2026-11-04 | принято | — |
| DEC-032 | D10: заглушка auth.uid() на реплике возвращает uuid | 2026-11-04 | принято | — |
| DEC-033 | D01/D11: отчётный контур монтируется в единый backend-процесс | 2026-11-04 | принято | — |
| DEC-034 | D11: SQL отчётов и состояния подписки приведены к PostgreSQL 16 | 2026-11-04 | принято | — |
| DEC-035 | D02/D05/D06: objects_select разрешает manager читать архивные объекты, исполн… | 2026-11-04 | принято | — |
| DEC-036 | Локальный seed обязан полностью воспроизводить staging-вход: пустые токены по… | 2026-11-04 | принято | — |
| DEC-037 | E2E-вход по TOTP повторяется на следующем 30-секундном окне, если первый код … | 2026-11-04 | принято | — |
| DEC-038 | Протокол входа D14: исправления, найденные на runtime-стенде, закреплены в ко… | 2026-11-05 | принято | — |
| DEC-039 | Plan-to-Proof считается от HEAD, PRODUCES группируются glob-записями | 2026-11-05 | принято | — |
| DEC-040 | После 14/14 done закрыть exit-criteria, R02 не стартовать без запроса | 2026-11-05 | принято | 20261105-2352-ok-prodolzhay-dalee |
| DEC-041 | Runtime-код поставки по §2.1 написан; новый код только через R02 | 2026-11-05 | принято | 20261105-2355-proekt-napisan-polnostyu-bolshe-nechego |
| DEC-042 | Локальный контур уже поднят (staging preview) | 2026-11-05 | принято | 20261105-2357-mozhem-zapustit-proekt-lokalno |
| DEC-043 | Секрет UNTM… не из ТЗ; MFA в ТЗ есть, хардкод — только локальный seed | 2026-11-06 | принято | 20261106-0003-totp-sekret-untmqm3sj2oehjjembxuh23vk44k |
| DEC-044 | Ручной вход на стенд: executor без MFA; manager — код из seed | 2026-11-06 | принято | 20261106-0005-blyad-mne-chto-seychas-sdelat-kak-voyti |
| DEC-045 | Change id `ui-spacing-density`: починить Tailwind-пайплайн и плотность UI | 2026-11-06 | принято | 20261106-0006-horosho-voshel-teper-porabotay-s-dizayno |
| DEC-046 | Вход «неверный пароль»: бандл смотрел в cloud, seed — локальный | 2026-11-06 | принято | 20261106-0015-nevernyy-login-ili-parol |
| DEC-047 | Соответствие ТЗ с hh: ядро закрыто, сдача §4 неполная | 2026-11-06 | принято | 20261106-0027-vse-li-trebovaniya-vypolneny-spisok-resh |
| DEC-048 | Демо NOVA CRM на https://arhellist.ru/crm-nova/ | 2026-11-06 | принято | 20261106-2031-davay-zadeploim-reshenie-na-arhellist-ru |
| DEC-049 | Демо /crm-nova: поднять read-only reporting API на VPS (pm2), nginx /crm-nova… | 2026-11-06 | принято | 20261106-2042-ne-udalos-zagruzit-otchet-nekorrektnaya |
| DEC-050 | По контуру WitnessDone (D01–D14, E1–E28, tax_pass) продукт IN SCOPE ТЗ §2.1 з… | 2026-11-06 | принято | 20261106-2051-u-nas-vse-sdelano-soglasno-tz |
| DEC-051 | Исходное ТЗ hh (§2–§4) по функциональности и безопасности закрыто рабочей дем… | 2026-11-06 | принято | 20261106-2052-vot-ishodnoe-tz-hh-mini-crm-obekty-i-zad |
| DEC-052 | В исходном ТЗ hh TOTP/MFA нет (только email и пароль). В INPUT/TECH_SPEC.md W… | 2026-11-06 | принято | 20261106-2056-totp-est-v-tz |
| DEC-053 | Auth BFF + Data Gateway: без TOTP; access/refresh только httpOnly cookies | 2026-11-06 | принято | 20261106-2059-otkatyvay-svoy-totp-sdelay-vhod-po-login |
| DEC-054 | Сборка SPA запекла VITE_API_BASE_URL=http://127.0.0.1:8080 | 2026-11-06 | принято | 20261106-2127-connecting-to-http-127-0-0-1-8080-api-au |
| DEC-055 | Gateway: не пробрасывать Content-Encoding/Length после decode fetch (ERR_CONT… | 2026-11-06 | принято | 20261106-2130-err-content-decoding-failed-na-api-data |
| DEC-056 | README: полное описание, демо-доступы, расклад по ТЗ hh | 2026-11-06 | принято | 20261106-2207-otkorrektiruy-dokumentaciyu-readme-md-po |
| DEC-057 | UI задач: полные поля ТЗ в списке и карточке | 2026-11-06 | принято | 20261106-2217-v-kartochkah-v-menyu-moi-zadachi-ne-vse |
| DEC-058 | Заморозка смены статуса после принятия | 2026-11-06 | принято | 20261106-2221-posle-prinyatiya-zadachi-izmenenie-statu |
| DEC-059 | `/api/auth/me` возвращает профиль текущего пользователя, не первый из списка | 2026-11-06 | принято | 20261106-2223-vse-loginy-i-paroli-vedut-na-postanovsch |
| DEC-060 | Постановщик создаёт менеджера из UI (узкое исключение INV-006/009) | 2026-11-06 | принято | 20261106-2231-dobav-funkcional-dobavleniya-novogo-mene |
| DEC-061 | Карточки менеджеров на /team со статистикой задач и KPI | 2026-11-06 | принято | 20261106-2245-ok-vkladka-komanda-est-forma-dobavleniya |
| DEC-062 | Счётчики в карточках менеджеров: только задачи с неархивных объектов | 2026-11-06 | принято | 20261106-2311-v-kartochkah-menedzherov-ne-verno-pokazy |
| DEC-063 | В UI только термин «менеджер», не «постановщик» | 2026-11-06 | принято | 20261106-2318-kakrtochka-postanovschika-nenuzhna-tolko |
| DEC-064 | Запрос «смонтируй флешку» — системная операция на хосте, не изменение NOVA CR… | 2026-11-06 | принято | 20261106-2331-smotniruy-i-podklyuchi-fleshku |
| DEC-065 | Бесконечная рекурсия RLS tasks ↔ objects | 2026-11-06 | принято | 20261106-2330-net-nikakih-izmeneniya-irina-volkova-kar |
| DEC-066 | Черновик фильтра карточек постановщика (заменён DEC-068) | 2026-11-06 | отменено / заменено DEC-068 | — |
| DEC-067 | На /team не показывать карточку текущего постановщика | 2026-11-06 | принято | 20261106-2334-irina-volkova-postanovschik-ee-kartochka |
| DEC-068 | Карточки /team = Анна/Пётр (workload), не role=manager | 2026-11-06 | принято | 20261106-2336-test-menedzherov-chto-za-imya-anna-koval |
| DEC-069 | В README описать экран «Команда» | 2026-11-06 | принято | 20261106-2349-dobav-opisaniya-po-komanda-v-readme-md |
| DEC-070 | Системная ops-задача: RW-монт USB /dev/sda4 после ntfsfix+force. Не change NO… | 2026-11-06 | принято | 20261106-2349-mne-nuzhno-zapisat-tolko-dlya-chteniya-n |
| DEC-071 | Аудит готовности: отчёт по фактам, без правок кода | 2026-11-06 | принято | 20261106-2351-esche-raz-podrobnyy-audit-gotovnosti-teh |
| DEC-072 | Закрытие долга аудита DEC-071 (P1–P3) | 2026-11-07 | принято | 20261107-0002-chinim-bagi-i-oshibki-dorabatyvaem-p1-p3 |
| DEC-073 | Полный прогон гейтов + повторный аудит | 2026-11-07 | принято | 20261107-0008-progonyay-i-proveryay-esche-raz-delay-au |
| DEC-074 | Ops: деплой демо arhellist.ru/crm-nova + push ветки nova-crm в пустой remote … | 2026-11-06 | принято | — |
