# DEC-005 — Код пишется по цепочке D01…D14 строго по OUTPUT/prompts; структура продукта — корневой src/ …

| Поле | Значение |
|------|----------|
| Дата | 2026-11-04 |
| Intake | 20261104-2057-davay-ebash-kod-po-proektu |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** 10b закрыт, R01 инициализирован (`spec-state/`, 5 доменов, `--gate baseline` = pass).
PRODUCES всех 14 заданий адресуют продукт в корневом `src/` (`src/shared/**`, `src/server/**`,
`src/features/**`, `src/reporting/**`), а инструментовка шага 08 (`eslintrc.js`) ссылалась на
`./web/tsconfig.json` и `./backend/tsconfig.json` и на оверрайд `web/src/**` — каталогов `web/` и
`backend/` в поставке нет. Без правки линт на пустом каркасе падает с «parserOptions.project не
найден», то есть PRE-CHECK D01 невыполним, а создание `web/` и `backend/` ради линта противоречит
PRODUCES.

**Решение.** Код пишется по цепочке D01…D14 строго по `OUTPUT/prompts`, файлы — только из
PRODUCES (тесты включены в PRODUCES заданий). Структура продукта — корневой `src/`. `eslintrc.js`
шага 08 приводится к этой структуре **отдельным tooling-коммитом до D01**:
`parserOptions.project: ['./tsconfig.json']`, оверрайд «только TypeScript» → `src/**/*.{js,jsx}`,
`ignorePatterns` без ссылок на несуществующие каталоги. PRODUCES заданий при этом не расширяются:
правка линтера — инструментовка, а не код задания.

**Альтернативы.** (1) Создать `web/` и `backend/` с tsconfig-заглушками — отвергнуто: два пустых
каталога в поставке и второй источник правды о структуре; PRODUCES их не заявляют. (2) Отключить
`parserOptions.project` — отвергнуто: теряются type-aware правила (`no-floating-promises`,
`no-misused-promises`), на которых держится запрет «повисших» промисов в Fastify. (3) Расширить
PRODUCES D01 до eslintrc — отвергнуто: нарушает SIZE_BUDGET и делает задание «платформа + линт».

**Чем подтверждено.** `npm run lint` на каркасе D01 после правки — exit 0 (записано в акт
`OUTPUT/evidence/D01.json`); `--gate pre_ci --d D01` без `proof_debt`; `eslintrc.js` в истории —
отдельный коммит до `src/**`.
