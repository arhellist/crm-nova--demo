# DEC-053 — Auth BFF + Data Gateway: без TOTP; access/refresh только httpOnly cookies

| Поле | Значение |
|------|----------|
| Дата | 2026-11-06 |
| Intake | 20261106-2059-otkatyvay-svoy-totp-sdelay-vhod-po-login |
| Статус | принято |
| ADR | ADR-0005 (supersede) |
| Заменяет | модель localStorage + Bearer + TOTP из прежнего ADR-0005 |

**Контекст.** Исходное ТЗ hh не требует TOTP. Требование заказчика: access/refresh только в
cookies, ротация, перехватчик 401. SPA на `arhellist.ru`, склад на `*.supabase.co` — cookie
нашего домена не уезжает на Supabase без same-origin BFF.

**Решение.** Auth BFF + Data Gateway на одном origin: httpOnly access/refresh, CSRF
double-submit, без TOTP. SPA не вызывает Supabase напрямую. BFF после валидной cookie-сессии
проксирует PostgREST/RPC с **пользовательским** JWT (не `service_role`). INV-001: запись
по-прежнему только через Supabase API; меняется транспорт (браузер → BFF → Supabase).

**Альтернативы.** (1) Cookies как хранилище + Bearer из JS — отвергнуто: токены снова в
JS. (2) Только снять TOTP без cookies — отвергнуто заказчиком. (3) Собственный JWT-issuer —
отвергнуто ASVS V6 delegated.

**Чем подтверждено.** План Auth BFF Cookie Gateway; ADR-0005 supersede; change-пакет
`otkatyvay-svoy-totp-sdelay-vhod-po-login`; smoke login без TOTP + CRUD через `/api/data`.
