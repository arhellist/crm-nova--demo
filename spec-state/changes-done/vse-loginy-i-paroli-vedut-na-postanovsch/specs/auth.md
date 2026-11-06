# Delta: auth — /me свой профиль

## ADDED Requirements

### Requirement: /api/auth/me возвращает профиль владельца сессии

Система MUST возвращать в `/api/auth/me` строку `profiles`, где `id` равен
идентификатору пользователя access-токена. Выбор «первой строки» списка профилей
запрещён.

#### Scenario: happy path
- GIVEN вошёл `executor1@nova.local`
- WHEN клиент запрашивает `/api/auth/me`
- THEN `profile.full_name` = «Пётр Смирнов», `role` = `executor`

#### Scenario: negative — чужой профиль не подставляется
- GIVEN в таблице есть manager с меньшим UUID
- WHEN вошёл исполнитель
- THEN ответ не содержит профиль manager как текущий
