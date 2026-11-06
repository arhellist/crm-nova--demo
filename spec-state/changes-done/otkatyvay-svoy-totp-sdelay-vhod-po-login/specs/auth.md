# Delta: auth — Auth BFF + Data Gateway

## ADDED Requirements

### Requirement: Сессия access и refresh только в httpOnly cookies

Система MUST хранить access-токен и refresh-токен только в cookies с флагами
`HttpOnly`, `Secure` (на HTTPS) и `SameSite=Lax` и MUST NOT помещать эти токены в
`localStorage`, URL или тело ответов клиенту. Выпуск и ротация токенов SHALL выполняться
Supabase Auth (GoTrue) через BFF.

#### Scenario: happy path
- GIVEN пользователь ввёл верный email и пароль
- WHEN BFF завершает вход
- THEN в ответе нет access/refresh в JSON, браузер получает Set-Cookie для обоих токенов

#### Scenario: negative — чтение токена из JS
- GIVEN пользователь авторизован
- WHEN клиентский скрипт читает `document.cookie`
- THEN значения access и refresh в нём отсутствуют (HttpOnly)

### Requirement: Data Gateway пропускает запросы только при валидной сессии

Система MUST проксировать доменные запросы к PostgREST/RPC только если access-cookie
содержит пригодный пользовательский JWT и MUST NOT использовать `service_role` в этом
пути. При отсутствии или просрочке access без успешного refresh система SHALL отвечать
`401` и MUST NOT обращаться к складу Supabase.

#### Scenario: happy path
- GIVEN валидная access-cookie
- WHEN клиент запрашивает список объектов через same-origin gateway
- THEN BFF вызывает PostgREST с Bearer user JWT, RLS применяется как обычно

#### Scenario: negative — нет cookie
- GIVEN анонимный браузер
- WHEN клиент вызывает gateway `/api/data/...`
- THEN ответ `401`, к Supabase запрос не отправляется

### Requirement: Перехватчик 401 выполняет один refresh и повтор

Клиент MUST при ответе `401` на доменный запрос один раз вызвать `POST /api/auth/refresh`
и повторить исходный запрос. Если refresh или повтор завершились `401`, система SHALL
очистить сессию и показать экран входа.

#### Scenario: happy path
- GIVEN access истёк, refresh валиден
- WHEN доменный запрос получает `401`
- THEN выполняется один refresh, запрос повторяется успешно, форма не теряется

#### Scenario: negative — refresh недействителен
- GIVEN refresh отозван или просрочен
- WHEN interceptor вызывает refresh после `401`
- THEN пользователь становится анонимным, защищённые экраны недоступны

## MODIFIED Requirements

### Requirement: Вход по email и паролю с обязательной второй ступенью TOTP

Система MUST требовать аутентификацию через Supabase Auth по email и паролю **без**
второй ступени TOTP/MFA. После успешного входа BFF SHALL выставить cookie-сессию, и
пользователь MUST получить доступ к маршрутам своей роли. Сессия SHALL восстанавливаться
после перезагрузки страницы (F5) через cookies.

#### Scenario: happy path
- GIVEN пользователь заведён администратором, пароль задан
- WHEN пользователь вводит верный email и пароль
- THEN открывается рабочий экран роли без запроса TOTP, после F5 сессия активна

#### Scenario: negative — неверный пароль
- GIVEN email существует или нет
- WHEN пользователь вводит неверный пароль
- THEN вход не завершается, единое сообщение не раскрывает существование аккаунта,
      cookies сессии не выставляются

## REMOVED Requirements

—
