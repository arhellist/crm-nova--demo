# Test plan — D04 (вход с MFA и оболочка)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A04.1 | Менеджер без TOTP не входит | `src/features/auth/LoginPage.test.tsx` | covered |
| A04.2 | Аноним на `/objects` → `/login` | `src/features/auth/useSession.test.tsx` | covered |
| A04.3 | Исполнитель не видит «Отчёты», роль из `profiles` | `src/app/AppShell.test.tsx` | covered |
| A04.4 | Истёкший токен → refresh без разлогина | `src/features/auth/useSession.test.tsx` | covered |
| A04.5 | `signup` недоступен | `src/features/auth/LoginPage.test.tsx` | covered |
| A04.6 | F5 сохраняет сессию, токенов в URL нет | `src/app/AppShell.test.tsx` | covered |

## Ops

| ID | Проверка внешним контуром |
|----|---------------------------|
| A04.1 | `scripts/smoke/wave-api-smoke.sh auth` | `src/features/auth/LoginPage.test.tsx` |
| A04.2 | `scripts/smoke/wave-api-smoke.sh auth` | `src/features/auth/useSession.test.tsx` |
