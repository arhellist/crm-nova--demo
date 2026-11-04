# Harness: цикл работы агента-разработчика

> Сгенерировано Witness Done v1.31.0. Канон: `catalogs/agent-harness.md`, `catalogs/verification-tax.md`,
> `catalogs/context-rag.md`, `catalogs/contour-smoke.md`.

## 1. Цикл

```text
pack → HOW/Axx → код → sp-verify → progress → (split_group? wave smoke) → close
```

1. **pack.** Прочитать `OUTPUT/prompts/Dxx_*.md` и `OUTPUT/context/packs/Dxx.md`. Не читать весь
   `OUTPUT/` (CONTEXT_PACK only).
2. **HOW/Axx.** Зафиксировать порядок действий и фразы приёмки `Axx.k` до первой строки кода.
3. **Код.** Только `PRODUCES`; файл вне списка — `proof_debt` и провал.
4. **sp-verify.** `--d Dxx --gate pre_ci`; провал — исправить причину, не ослаблять гейт.
5. **progress.** Записать `OUTPUT/roadmaps/progress.d/Dxx.md`, затем `sp progress --merge`.
6. **Контур.** После `split_group` — `scripts/smoke/wave-api-smoke.sh <group>`.
7. **close.** `sp close <intake> --ref Dxx`.

## 2. Что считается доказательством

- `OUTPUT/evidence/Dxx.json` с `acceptance_ids`, командами, кодами возврата и `tax_pass: true`.
- Строка `done` в `progress.md` со ссылкой на акт.
- Тест, объявляющий фразу: `@acceptance Axx.k` или ID в имени; не `skip`.

Зелёный вывод в терминале без акта доказательством не является: он исчезает при закрытии окна
и не связан с фразой задания.

## 3. Правила

| Правило | Последствие нарушения |
|---------|----------------------|
| Только `PRODUCES` | `proof_debt`, провал приёмки, откат файла |
| Один вертикальный результат | задание режется, а не «дожимается» |
| Тесты вместе с кодом | задание не принимается |
| Решение — до кода | `sp decide`, иначе решение не существует |
| Не ослаблять гейт | ручная правка акта или конфига гейта — нарушение |
| Комментарии на русском | ревью не пропускает «код без объяснения» |

## 4. Resume-фразы

| Ситуация | Фраза |
|----------|-------|
| Продолжить с текущего шага | «продолжай» / `sp next` |
| Следующая волна | «продолжай волну B» |
| Пачка D | «продолжай C2 batch N» |
| Самоаудит | «продолжай шаг 10b» |

Resume идёт из `OUTPUT/MANIFEST.md`, а не из истории чата.

## 5. Вход в задачу и запрет «быстрых правок»

```text
sp status → sp intake "<запрос>" → sp next → sp decide (если выбор) →
код по Dxx → sp-verify --d Dxx --gate pre_ci → progress → sp close
```

Правка вне маршрута видна `doctor --staged` (pre-commit) и `doctor --strict` (CI).
Исключений «только поправить одну строку» нет: одна строка тоже меняет `PRODUCES`.
