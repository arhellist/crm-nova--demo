# Proposal: vse-loginy-i-paroli-vedut-na-postanovsch — /me отдаёт свой профиль

| Поле | Значение |
|------|----------|
| Статус | accepted |
| Автор | cursor-agent |
| Дата | 2026-11-06 |
| Intake | 20261106-2223-vse-loginy-i-paroli-vedut-na-postanovsch |
| Затрагиваемые домены | auth / platform |

## 1. Контекст и проблема

Все демо-логины показывали постановщика «Ирина Волкова».

## 2. Предлагаемое решение

`/api/auth/me` фильтрует профиль по `id` текущего пользователя из GoTrue user.

## 3. Обоснование

INV-005: роль из своего `profiles.row`, не из чужой строки списка.

## 4. Затрагиваемые домены

Auth BFF (`gotrue.ts`, `routes.ts`).

## 5. Backwards Compatibility

`compatible` — контракт ответа тот же; меняется выбор строки.

## 6. Non-goals

Не меняем RLS `profiles_select`.

## 7. Альтернативы

См. DEC-059.

## 8. Трассировка

DEC-059; баг демо-стенда.
