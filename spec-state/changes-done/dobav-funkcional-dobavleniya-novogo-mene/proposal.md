# Proposal: dobav-funkcional-dobavleniya-novogo-mene

| Поле | Значение |
|------|----------|
| Статус | accepted |
| Автор | cursor-agent |
| Дата | 2026-11-06 |
| Intake | 20261106-2231-dobav-funkcional-dobavleniya-novogo-mene |
| Затрагиваемые домены | auth, platform |

## 1. Контекст

Постановщику нужен UI для создания нового менеджера с одноразовым паролем.

## 2. Решение

BFF `POST /api/auth/managers` + страница `/team` (DEC-060).

## 3. Business Goals

Самообслуживание провижининга менеджеров без Dashboard.

## 4. Домены

auth (BFF Admin), UI shell/team.

## 5. Compatibility

`compatible` для CRM-данных; расширение §2.2 ТЗ.

## 6. Non-goals

Executor из UI; сброс пароля; рассылка email; service_role в data-path.

## 7. Альтернативы

См. DEC-060.

## 8. Трассировка

DEC-060; hh демо-сценарий доступа.
