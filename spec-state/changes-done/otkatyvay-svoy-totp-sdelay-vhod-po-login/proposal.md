# Proposal: otkatyvay-svoy-totp-sdelay-vhod-po-login — Auth BFF + Data Gateway

| Поле | Значение |
|------|----------|
| Статус | accepted |
| Автор | cursor-agent |
| Дата | 2026-11-06 |
| Intake | 20261106-2059-otkatyvay-svoy-totp-sdelay-vhod-po-login |
| Затрагиваемые домены | auth, platform |

## 1. Контекст и проблема

Вход требует TOTP (нет в hh-ТЗ). Сессия в `localStorage` + Bearer на `*.supabase.co`: токены
доступны JS, нет cookie-only модели и единого 401-interceptor на все доменные запросы.

## 2. Предлагаемое решение

Same-origin BFF: login/refresh/logout выставляют httpOnly access+refresh; CSRF double-submit;
без TOTP. Data Gateway проксирует PostgREST/RPC только при валидной cookie-сессии с user JWT.
SPA не ходит в Supabase напрямую. ADR-0005 supersede (DEC-053).

## 3. Обоснование и цели (Business Goals)

Соответствие hh (email/пароль) и требованию заказчика к cookies/ротации/401; сохранение RLS на складе.

## 4. Затрагиваемые домены и контракты

- Домен `auth`: вход, сессия, cookies, CSRF, gateway gate, роль из profiles.
- Домен `platform`: маршруты BFF auth/data рядом с health/reports; env для GoTrue URL/anon.

## 5. Риски и обратная совместимость (Backwards Compatibility)

`breaking` — клиенты с localStorage/Bearer/MFA перестают работать; нужен redeploy SPA+API.
RLS и схема данных совместимы; `service_role` по-прежнему не в data-path.

## 6. Что не делаем (Non-goals)

- Собственный JWT-issuer и хранение паролей вне GoTrue.
- UI-регистрация и сброс пароля в CRM.
- Перенос склада с Supabase.
- Перевод отчётов на cookie-сессию (остаются API_TOKEN) в этом change.

## 7. Альтернативы

Cookie-хранилище + Bearer из JS — отвергнуто. Только снять TOTP — отвергнуто. service_role gateway — запрещено.

## 8. Трассировка на требования

- MODIFIED: «Вход по email и паролю с обязательной второй ступенью TOTP» → без TOTP + cookies.
- ADDED: cookie session, data gateway gate, 401 interceptor.
- platform: ADDED same-origin auth/data routes.
