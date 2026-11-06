# DEC-042 — Локальный контур уже поднят (staging preview)

| Поле | Значение |
|------|----------|
| Дата | 2026-11-05 |
| Intake | 20261105-2357-mozhem-zapustit-proekt-lokalno |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** Запрос «Можем запустить проект локально?». На машине уже крутится runtime-стенд после приёмки D14: production-сборка SPA, отчётный API, локальный Supabase и реплика.

**Решение.** Локальный контур уже поднят: SPA `http://127.0.0.1:4173`, API `http://127.0.0.1:8090/health`, Supabase `54321`, реплика healthy. Вход `manager@nova.local` / `nova-local-password` + TOTP-секрет seed `UNTMQM3SJ2OEHJJEMBXUH23VK44KBFWD`. Hot-reload `npm run dev` требует `.env.local` на локальный Supabase; сейчас в файле cloud-URL — для Vite-режима его нужно сменить, иначе seed-учётки не сработают.

**Альтернативы.** Гасить staging и поднимать только Vite на 5173 — не нужно для «открыть и посмотреть»; оставить как есть. Писать cloud в `.env.local` для локального входа — отвергнуто: seed и MFA живут в локальном Auth.

**Чем подтверждено.** `curl` 4173/8090 → 200; `npx supabase status` → API_URL 54321; `docker ps` replica healthy; seed TOTP; `/tmp/nova-runtime-web.log`.
