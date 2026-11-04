# Context RAG — точечная загрузка контекста

> Канон Witness Done (правило действует с v1.9). Hybrid: **структурированный Context Pack** (канон) + опциональный embedding-retrieve (ранжировщик кандидатов).  
> Не путать с [`LIBRARY/search`](../LIBRARY/search/SPEC.md) (продуктовый поиск приложения).

## Принцип

Агент **не** читает весь `OUTPUT/`. Контекст = утверждённый pack (`OUTPUT/context/packs/Pxx.md`) + lean CONSUMES в D.

Embeddings **не** заменяют CONSUMES: без must_hit-якорей chunk не попадает в approved pack.

## Chunk / index

- Индекс: `OUTPUT/context/index.md` (шаблон `TEMPLATES/context-index.md`)
- Источники чанков: `OUTPUT/{docs,specs,security,roadmaps,prompts}`, опционально `LIBRARY/*/SPEC.md`
- Pack: `OUTPUT/context/packs/Pxx.md` + `Pxx.validation.json`
- Лимит: **≤ 12** chunks на pack (`max_chunks`)

## Candidate gate (`sp-retrieve --validate`)

| Проверка | При fail |
|----------|----------|
| Каждый якорь CONSUMES есть ≥1 chunk | reject / дозапрос |
| Path в deny (OUT OF SCOPE, `.env`, secrets) | drop chunk |
| `chunk_count > max_chunks` | truncate только сохранив must_hit, иначе fail |
| Meta пака: `max_chunks` указан и ≤12 | fail pack (заявленный лимит не может превышать канон) |
| Флаг `--max-chunks` > 12 | отказ вызова (`exit 1`): лимит канона не поднимается флагом |
| Path не существует | fail pack |
| Высокий embed-score без must_hit | **не** в approved |

`validation.ok=true` обязателен до привязки pack к D (шаг 09). Иначе шаг 10 → MAJOR.

## Embedding-слой (опционально)

- CLI Node/TS: `sp-retrieve` (см. `SEED/sp-tools/`)
- Не Python (stack-policy)
- Индекс эмбеддингов: `OUTPUT/context/embeddings/` (можно gitignore)
- Ключи API — вне git
- Результат retrieve → **draft** pack → validate → approve

## Связь с D

В D блок `## CONTEXT_PACK`: `pack_id`, опциональный `retrieve_query`, `max_chunks`.  
Тела specs в D **не** копировать (SIZE_BUDGET / completeness-policy).

## Запреты

- «Прочитай весь OUTPUT / весь openapi»
- Approved pack без validation
- Путать agent RAG с модулем `LIBRARY/search`
