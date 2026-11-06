# Domain Spec: auth

> Домен отвечает за вход в систему, сессию (httpOnly cookies) и прикладную роль пользователя.
> Источник: ТЗ §2.1, DEC-053 / ADR-0005 (cookie BFF + Data Gateway). Провижининг — вне UI.

## Назначение и границы

Приложение закрытое: самостоятельная регистрация невозможна. Аутентификация делегирована
Supabase Auth (GoTrue) **через same-origin BFF**: email + пароль **без MFA/TOTP**. Access и
refresh живут только в httpOnly cookies. Доменные данные читаются/пишутся через Data Gateway
с пользовательским JWT; `service_role` в этом пути запрещён. Роль — `public.profiles.role`.

## Требования

### Requirement: Вход по email и паролю с обязательной второй ступенью TOTP

Система MUST требовать аутентификацию через Supabase Auth по email и паролю **без** второй
ступени TOTP/MFA. После успешного входа BFF SHALL выставить cookie-сессию, и пользователь
MUST получить доступ к маршрутам своей роли. Сессия SHALL восстанавливаться после F5 через cookies.

#### Scenario: happy path
- GIVEN пользователь заведён администратором, пароль задан
- WHEN пользователь вводит верный email и пароль
- THEN открывается рабочий экран роли без запроса TOTP, после F5 сессия активна

#### Scenario: negative — неверный пароль
- GIVEN email существует или нет
- WHEN пользователь вводит неверный пароль
- THEN вход не завершается, единое сообщение не раскрывает существование аккаунта,
      cookies сессии не выставляются

### Requirement: Сессия access и refresh только в httpOnly cookies

Система MUST хранить access и refresh только в HttpOnly cookies и MUST NOT помещать их в
`localStorage`, URL или JSON ответов клиенту.

#### Scenario: happy path
- GIVEN успешный login
- WHEN клиент читает тело ответа
- THEN токенов в JSON нет; браузер получил Set-Cookie

#### Scenario: negative — чтение из JS
- GIVEN пользователь авторизован
- WHEN скрипт читает `document.cookie`
- THEN access и refresh отсутствуют (HttpOnly)

### Requirement: Data Gateway пропускает запросы только при валидной сессии

Система MUST проксировать PostgREST/RPC только при валидной access-cookie с user JWT и
MUST NOT использовать `service_role` в этом пути.

#### Scenario: happy path
- GIVEN валидная access-cookie
- WHEN клиент запрашивает объекты через gateway
- THEN PostgREST вызывается с Bearer user JWT, RLS применяется

#### Scenario: negative — нет cookie
- GIVEN аноним
- WHEN вызов `/api/data/...`
- THEN 401, к Supabase запрос не уходит

### Requirement: Перехватчик 401 выполняет один refresh и повтор

Клиент MUST при 401 один раз вызвать refresh и повторить запрос; при повторном 401 — разлогин.

#### Scenario: happy path
- GIVEN access истёк, refresh валиден
- WHEN доменный запрос получает 401
- THEN один refresh и успешный retry

#### Scenario: negative — refresh недействителен
- GIVEN refresh отозван
- WHEN interceptor вызывает refresh
- THEN пользователь анонимен

### Requirement: Прикладная роль читается только из profiles

Система MUST определять роль по `public.profiles.role` и MUST NOT доверять claim `role` в JWT.

#### Scenario: happy path
- GIVEN `profiles.role = 'manager'`
- WHEN менеджер открывает объекты
- THEN доступны действия постановщика

#### Scenario: negative — role claim подменён
- GIVEN JWT claim `role=manager`, а `profiles.role=executor`
- WHEN исполнитель меняет объект
- THEN БД отклоняет операцию, права по profiles

### Requirement: Открытая регистрация отключена

Система MUST NOT предоставлять самостоятельную регистрацию в CRM.

#### Scenario: happy path
- GIVEN аноним на /
- WHEN открывает приложение
- THEN форма входа без «зарегистрироваться»

#### Scenario: negative — signUp / INSERT profiles
- GIVEN попытка signUp или INSERT profiles с клиента
- WHEN выполняется
- THEN отказ Auth/RLS

### Requirement: Профиль содержит только необходимые поля

Система MUST хранить в profiles id, full_name, role; email MUST NOT дублироваться в доменных таблицах.

#### Scenario: happy path
- GIVEN профиль «Пётр Смирнов»
- WHEN пользователь входит
- THEN в UI имя, без email в доменных запросах

#### Scenario: negative — пустое имя
- GIVEN full_name из пробелов
- WHEN сохранение
- THEN check constraint отклоняет
