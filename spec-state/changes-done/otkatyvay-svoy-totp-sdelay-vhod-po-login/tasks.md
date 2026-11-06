# Tasks: otkatyvay-svoy-totp-sdelay-vhod-po-login

- [x] BFF `/api/auth/*` cookies + CSRF + GoTrue — R: Сессия access и refresh только в httpOnly cookies
- [x] BFF `/api/data/*` gateway без service_role — R: Data Gateway пропускает запросы только при валидной сессии
- [x] SPA: убрать TOTP/MFA, login email/password — R: Вход по email и паролю (MODIFIED)
- [x] SPA: postgrest same-origin + 401 interceptor — R: Перехватчик 401 выполняет один refresh и повтор
- [x] TECH_SPEC/ADR/seed/nginx/demo — R: platform BFF same-origin; DEC-053
