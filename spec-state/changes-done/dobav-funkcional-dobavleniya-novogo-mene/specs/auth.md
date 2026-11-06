# Delta: auth — провижининг менеджера

## ADDED Requirements

### Requirement: Постановщик создаёт менеджера с одноразовым паролем

Система MUST позволять пользователю с `profiles.role = manager` создать нового
пользователя с ролью `manager` через `POST /api/auth/managers`: email, full_name,
сгенерированный пароль в ответе один раз. Вызов от executor MUST возвращать 403.
`service_role` MUST использоваться только на этом маршруте BFF (DEC-060).

#### Scenario: happy path
- GIVEN вошёл manager
- WHEN отправляет email и ФИО
- THEN созданы auth.users и profiles.role=manager; в ответе есть password

#### Scenario: negative — исполнитель
- GIVEN вошёл executor
- WHEN вызывает POST /api/auth/managers
- THEN 403, пользователь не создан
