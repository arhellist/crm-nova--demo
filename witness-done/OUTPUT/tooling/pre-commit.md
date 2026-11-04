# Pre-commit и вход агента

> Сгенерировано Witness Done v1.31.0. Дисциплину держит правило, последствия ловит гейт.

## 1. Установка хука

```bash
cp witness-done/SEED/git-hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Хук запускает `node witness-done/SEED/sp-tools/sp.mjs doctor --staged` и блокирует коммит, если:

- изменён файл вне `PRODUCES` активного задания;
- `done` стоит без акта `evidence/Dxx.json`;
- адаптеры IDE разошлись с `AGENTS.md`;
- запись входа открыта, но не связана с артефактом.

## 2. Что коммитится

| Артефакт | Коммитится | Примечание |
|----------|-----------|------------|
| `journal/intake/*.md`, `journal/decisions/*.md`, `journal/decisions.md` | да | журнал — часть проекта |
| `witness-done/OUTPUT/**` | да | артефакты прогона и акты приёмки |
| `witness-done/INPUT/TECH_SPEC.md`, `ANSWERS.md`, `design/*` | да | вход прогона |
| `spec-state/**` | да | действующие требования |
| `.env*` (кроме `.env.example`) | нет | игнорируется |
| `node_modules/`, `dist/`, `coverage/` | нет | игнорируется |

## 3. Перед push

```bash
npm run lint && npm run typecheck && npm run test
node witness-done/SEED/sp-tools/sp.mjs doctor --strict
node witness-done/SEED/sp-tools/sp.mjs rules --check
```

## 4. Вход в задачу

```text
sp status → sp intake "<запрос>" → sp next → sp decide "<решение>" (если есть выбор) →
работа по Dxx → sp-verify --d Dxx --gate pre_ci → progress.d/Dxx.md → sp progress --merge →
sp close <intake> --ref Dxx
```

Правка кода без записи входа и без задания отклоняется: `doctor` это видит, ревью — тоже.
