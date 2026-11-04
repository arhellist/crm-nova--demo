# Context Pack — шаблон

> Путь: `OUTPUT/context/packs/P{{NN}}.md`  
> Канон: `catalogs/context-rag.md`

## Meta

| Поле | Значение |
|------|----------|
| pack_id | P{{NN}} |
| d_ref | D{{NN}} |
| retrieve_query | … \| none |
| max_chunks | ≤12 |
| validation | см. `P{{NN}}.validation.json` |

## Must-hit anchors

Список якорей из CONSUMES D (ops, entities, ADR ids):

- …

## Chunks

| # | path | якорь / секция | must_hit |
|---|------|----------------|----------|
| 1 | `OUTPUT/specs/…` | … | yes \| no |

## Deny applied

- (пути/паттерны, отброшенные gate)

## Notes

- Не вставлять полные тела файлов — только path + якорь.
