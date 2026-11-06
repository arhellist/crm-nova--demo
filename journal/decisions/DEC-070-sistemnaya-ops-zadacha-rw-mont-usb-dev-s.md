# DEC-070 — Системная ops-задача: RW-монт USB /dev/sda4 после ntfsfix+force. Не change NO…

| Поле | Значение |
|------|----------|
| Дата | 2026-11-06 |
| Intake | 20261106-2349-mne-nuzhno-zapisat-tolko-dlya-chteniya-n |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** Пользователю нужен RW на USB; `udisks` монтировал только `ro`, т.к. NTFS dirty
и опция `force` через udisks запрещена polkit. Без root RW недоступен.

**Решение.** Системная ops-задача: RW-монт USB /dev/sda4 после ntfsfix+force. Не change NOVA CRM.

**Альтернативы.** Отвергнуто: оставить `ro` — не удовлетворяет запросу. Отвергнуто: R02/change
в CRM — запрос не про продукт.

**Чем подтверждено.** `findmnt`: `/media/alex/USB FLASH WIN7` options включают `rw`;
проверка `touch`/`rm` `.write_test_nova` успешна.
