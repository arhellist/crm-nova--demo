# Review — шаблон артефакта проверки акта

> Путь: `OUTPUT/evidence/D{{NN}}.review.json`  
> Канон: `catalogs/verification-tax.md` («Review-артефакт»)

Review существует затем, чтобы «человек прочитал акт» перестало быть непроверяемым утверждением.
Файл пишет `sp review`; руками он не создаётся.

## Схема

```json
{
  "d": "D03",
  "verdict": "supports",
  "reviewer": "anna@example.com",
  "notes": "Проверил A03.1–A03.6: A03.2 действительно убивает процесс после записи",
  "acceptance_ids": ["A03.1", "A03.2", "A03.3", "A03.4", "A03.5", "A03.6"],
  "code_hash": {
    "git_head": "fed002a…",
    "git_dirty": false,
    "produces": ["src/events/log.py"],
    "produces_digest": "sha256…"
  },
  "evidence_ref": "evidence/D03.json",
  "evidence_hash": "sha256…",
  "timestamp": "2026-10-28T18:00:00.000Z"
}
```

## Правила

- `verdict`: `supports` | `does_not_support` | `unclear`. Только `supports` пропускает акт.
- `reviewer` обязателен и **не может совпадать** с `producer` акта: иначе это не независимая проверка.
- Review привязан к `code_hash.produces_digest` и набору `acceptance_ids`, а **не** к байтам акта:
  повторный прогон `pre_ci` обновляет `timestamp` и не должен обесценивать review.
- Изменение кода меняет `produces_digest` → review автоматически становится недействительным.
  Это и есть смысл: подтверждение относится к конкретному коду, а не к слову «проверено».
- Для `L2+` review обязателен: без него `pre_ci` возвращает `tax_pass: false`.
- Живёт в `OUTPUT/evidence/`, коммитится вместе с актом.
