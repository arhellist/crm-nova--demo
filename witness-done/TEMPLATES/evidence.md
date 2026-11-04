# Evidence — шаблон VerificationTax

> JSON (канон для `sp-verify`): `OUTPUT/evidence/D{{NN}}.json`  
> Опциональный human-readable: `OUTPUT/evidence/D{{NN}}.md`  
> Канон: `catalogs/verification-tax.md` (v1.10+)

## JSON schema (логический)

```json
{
  "d": "D03",
  "level": "L2",
  "gate": "pre_ci",
  "scopes": {
    "unit": true,
    "module": true,
    "app": true,
    "eco": true
  },
  "fit": {
    "ops_checked": ["POST /example"],
    "acceptance_ids": ["A03.1", "A03.2", "A03.3"],
    "acceptance_source": "prompt",
    "acceptance_binding": {
      "ok": true,
      "bound_ids": ["A03.1", "A03.2"],
      "unbound": [],
      "phantom": [],
      "hollow": [],
      "skipped": [],
      "exempt": ["A03.3"],
      "phrase_missing": [],
      "files": ["src/events/log.py", "tests/events/test_log.py"],
      "binding_hash": "sha256…"
    },
    "depends_done": ["D01", "D02"],
    "conflicts_applied": [],
    "out_of_produces": ["src/extra/helper.ts"],
    "plan": {
      "ok": true,
      "base": "origin/main",
      "declared": ["src/events/log.py"],
      "touched": ["src/events/log.py"],
      "missing": [],
      "extra": [],
      "proof_debt": []
    }
  },
  "trace": { "required": false, "ok": true, "file": "evidence/D03.trace.json", "hash": "sha256…", "entries": 3 },
  "commands": [{ "cmd": "npm test", "exit": 0 }],
  "review": {
    "required": true,
    "ok": true,
    "verdict": "supports",
    "reviewer": "anna@example.com",
    "file": "evidence/D03.review.json",
    "issues": []
  },
  "tax_pass": true,
  "producer": "dev@example.com",
  "code_hash": {
    "git_head": "fed002a…",
    "git_dirty": false,
    "produces": ["src/events/log.py"],
    "produces_digest": "sha256…"
  },
  "evidence_hash": "sha256…",
  "timestamp": "ISO-8601"
}
```

`producer`, `code_hash`, `evidence_hash` и `review` дописывает CLI при записи; руками их не правят.
`evidence_hash` считается по тому же JSON без самого поля — правка байтов ломает проверку.

## Human summary (если пишете .md)

| Поле | Значение |
|------|----------|
| D | D{{NN}} |
| gate | pre_ci \| pre_release |
| tax_pass | true \| false |
| scopes | unit/module/app/eco |
| acceptance_ids | Axx.1… из секции ACCEPTANCE промпта |
| evidence_ref | путь к JSON |

## Правила

- `progress.md` → `done` только при `tax_pass: true` и `gate: pre_ci`
- Для L1+: `fit.acceptance_ids` **непустой** и совпадает с ID из `## ACCEPTANCE` промпта (`acceptance_source: "prompt"`)
- `fit.acceptance_binding` — машинная связь «фраза ↔ тест» (v1.27): `bound_ids` закрыты тестами,
  `exempt` — фразы из `acceptance_ops`, `phantom`/`hollow`/`skipped` — провалы, `binding_hash` —
  отпечаток фраз и тестов, по которому `pre_release` видит правку формулировки после приёмки
- Для L2/L3: `fit.ops_checked` содержит ≥1 `METHOD /path` из `app_contracts` (пустой список = fail)
- timestamp evidence ≥ момент перевода D в `in_progress` — **проверяется человеком**: в `progress.md`
  нет времени перехода, автомату сравнивать нечего (см. «Предел»)
- Для L2/L3 обязателен `evidence/<Dxx>.review.json` с `verdict: supports` от `reviewer` ≠ `producer`
  (`sp review`). Отсутствие, чужой вердикт или review от автора акта → `tax_pass: false`
- `code_hash.produces_digest` — SHA-256 содержимого `PRODUCES` (glob раскрыт в файлы); правка кода обесценивает review
- `code_hash.git_head` — на каком коммите писался акт; не сравнивается с текущим `HEAD` и ничего не блокирует
  автоматически, `sp-verify --verify-evidence <акт>` печатает расхождения без транскрипта
- pre_release пишет `OUTPUT/evidence/RELEASE.json` (агрегат) и проверяет `evidence_hash` у всех `done`
- **Предел:** `evidence_hash` ловит тихую правку байтов, но не того, кто пересчитает хеш.
  Настоящий якорь — коммит акта в git: `--verify-evidence` имеет смысл на закоммиченном состоянии
- **Предел:** `sp-verify` перечисляет Axx и гоняет test runner; семантическое соответствие Given/When/Then — обязанность автора теста и ревью (см. verification-tax). Тем же пределом покрыты правила, где нужен факт, которого нет в файлах: время перехода `D` в `in_progress` и «тест правда проверяет эту фразу»
