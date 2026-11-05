# === DEV PROMPT: D04_auth_ui_shell ===

РОЛЬ: frontend

GATE: none

ЗАВИСИТ ОТ: D01, D02

## SIZE_BUDGET

| Поле | Значение |
|------|----------|
| surfaces | ui |
| produces_count | 6 |
| entity | profile |
| delivery_slice | S3 |
| split_group | auth |
| split_from | none |
| size_ok | yes |

## ЦЕЛЬ

Дать пользователю вход с паролем и TOTP, восстановление сессии после F5 и оболочку, где
навигация и действия определяются ролью из `profiles`.

## CONSUMES

- `OUTPUT/docs/design-notes.md` — токены цвета/типографики, компоненты `Button`, `Field`, `Badge`, состояния фокуса
- `OUTPUT/security/authn-authz.md` — SEC-01, SEC-02, SEC-03: вход, MFA для `manager`, сессия
- `OUTPUT/docs/adr/0005-auth-jwt-mfa.md` — TTL 1 час, refresh, отключение регистрации
- `OUTPUT/specs/data-model.md` — §3.1 `profiles` (роль и имя для оболочки)
- `OUTPUT/docs/07_module_plan.md` — `auth-jwt` (adapt): отличия от SPEC
- `OUTPUT/security/checklist.md` — ASVS V2 (аутентификация) и V3 (сессия)
- `OUTPUT/docs/nfr.md` — NFR3 (вход p95 ≤1 000 мс, MFA-шаг ≤800 мс), NFR22 (TTI ≤30 с)

## CONTEXT_PACK

| Поле | Значение |
|------|----------|
| pack_id | P04 |
| pack_path | `OUTPUT/context/packs/P04.md` |
| retrieve_query | login mfa totp session refresh role guard design tokens |
| max_chunks | 8 |
| validation_ok | yes |

## HOW

1. `src/features/auth/api.ts` — тонкая обёртка над `@supabase/supabase-js`: `signIn(email, password)`,
   `verifyTotp(code)`, `signOut()`, `getProfile()` (`select id, full_name, role from profiles where id = auth.uid()`).
   Клиент создаётся один раз из `env.ts` с `persistSession: true`, `autoRefreshToken: true`,
   `detectSessionInUrl: false`. `credentials: 'include'` не используется.
2. `src/features/auth/useSession.ts` — состояние `loading | anonymous | mfa_required | authenticated`;
   подписка `onAuthStateChange`; профиль тянется после `SIGNED_IN` и кэшируется TanStack Query
   с ключом `['profile', uid]`; при `401` — один `refreshSession()` и повтор запроса.
3. `src/features/auth/LoginPage.tsx` — форма email/пароль, ошибка показывается текстом
   «Неверный email или пароль» без деталей; после успешного пароля, если у пользователя есть
   фактор `totp`, переключение на `MfaChallenge` без перезагрузки.
4. `src/features/auth/MfaChallenge.tsx` — ввод 6-значного кода, `challengeAndVerify`; неверный код —
   сообщение и сохранение введённого email; кнопка «Выйти» очищает сессию.
5. `src/app/router.tsx` — публичный `/login`, защищённые `/`, `/objects`, `/objects/:id`,
   `/tasks/:id`, `/my`, `/reports`, `*` → страница 404; guard: `anonymous` → `/login`,
   `authenticated` на `/login` → `/`.
6. `src/app/AppShell.tsx` — шапка с именем и ролью, навигация: `manager` видит «Объекты»,
   «Мои задачи», «Отчёты»; `executor` — «Объекты», «Мои задачи»; пункт «Отчёты» отсутствует
   в DOM у исполнителя, а не скрыт стилями. Токены — только из `design-notes.md`, свои цвета не вводить.

## INVARIANTS

1. Роль для навигации берётся из `profiles.role`, не из claim JWT (INV-005).
2. Без сессии любой защищённый маршрут ведёт на `/login`; авторизованный не видит форму входа.
3. `manager` без подтверждённого TOTP не попадает в приложение.
4. Токены не логируются, не попадают в URL и в тексты ошибок (INV-007).
5. `service_role` отсутствует в клиентском бандле; используется только anon-ключ (INV-006).
6. Истёкший access-токен приводит к одному refresh, а не к разлогину и потере формы.
7. `signOut()` очищает кэш профиля и защищённые данные из памяти.
8. Открытая регистрация не вызывается из UI; `signUp` в коде отсутствует.
9. Все интерактивные элементы доступны с клавиатуры, фокус видим (NFR-07).
10. Сессия восстанавливается после F5 без повторного ввода пароля.

## ACCEPTANCE

| ID | Given | When | Then |
|----|-------|------|------|
| A04.1 | Учётная запись `manager` с TOTP | Вход с верным паролем | Появляется запрос кода, без кода в приложение не пускает |
| A04.2 | Анонимный пользователь | Открыть `/objects` | Редирект на `/login`, содержимое объектов не запрашивается |
| A04.3 | Вошедший `executor` | Открыть оболочку | В навигации нет «Отчёты», роль показана из `profiles` |
| A04.4 | Access-токен истёк | Запрос профиля | Один refresh, запрос повторён, пользователь остаётся в приложении |
| A04.5 | Аноним | `POST /auth/v1/signup` с новым email | Ошибка регистрации, пользователь не создан |
| A04.6 | Вошедший пользователь | F5 на `/my` | Сессия и экран восстановлены, токенов в URL нет |

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | auth-jwt |
| conflicts_ref | `OUTPUT/docs/07_conflicts.md#1-конфликты-включённых-модулей` |
| conflicts_applied | `auth-jwt × rate-limiting`, `auth-jwt × logging-pino`, `crud-table × auth-jwt` |
| app_contracts | POST /auth/v1/token, GET /rest/v1/profiles, POST /auth/v1/factors |
| runtime_trace_required | no |
| invariants_skip | пусто |
| depends_done | D01, D02 |
| eco_invariants | no-credentials, design-tokens |
| acceptance_ops | A04.1, A04.2 |
| pre_ci | required |
| pre_release | required |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L2 |
| verify_cmd | `sp-verify --d D04 --gate pre_ci` |
| evidence | `OUTPUT/evidence/D04.json` |
| done_forbidden_unless | `tax_pass=true`, `ops_checked` содержит `POST /auth/v1/token`, A04.1–A04.6 покрыты |
| review | `sp review D04 --verdict supports` от ревьюера ≠ автор |

## PRODUCES

- `src/features/auth/*` — создать (api.ts, useSession.ts, LoginPage.tsx, MfaChallenge.tsx)
- `src/app/*` — создать (router.tsx, AppShell.tsx)
- `index.html` — создать (точка входа Vite; см. DEC-011)
- `src/main.tsx` — создать (BrowserRouter + QueryClientProvider)
- `src/styles/tokens.css` — создать (токены `design-notes.md` + директивы Tailwind; DEC-011)
- `tailwind.config.cjs` — создать (content и токены; DEC-011)
Тесты:

- `src/features/auth/useSession.test.tsx` — A04.2, A04.4
- `src/features/auth/LoginPage.test.tsx` — A04.1, A04.5
- `src/app/AppShell.test.tsx` — A04.3, A04.6

## НЕ ТРОГАТЬ

- `supabase/**` — схема и функции уже созданы.
- `src/features/objects/**`, `src/features/tasks/**` — только заглушки маршрутов.

## PRE-CHECK

- [ ] D01, D02 `done`
- [ ] `design-notes.md` содержит токены и компоненты формы
- [ ] `P04.validation.json` → `ok: true`
- [ ] `size_ok: yes`
- [ ] В Supabase Auth отключена открытая регистрация, TOTP включён

## ОГРАНИЧЕНИЯ

- Стек: React 18, TypeScript strict, Vite, TanStack Query, React Router 6.
- Типизация: `catalogs/typing-and-tests.md` — без `any`, ответы Supabase валидируются zod на границе.
- Автотесты: Vitest + Testing Library, по одному кейсу на `A04.*`.
- Комментарии: `catalogs/code-comments.md`, на русском, у `useSession` и guard-логики.
- VerificationTax: `done` после `pre_ci` и `acceptance_ids`.
- Context: только CONTEXT_PACK.
- Дизайн: `design-notes.md` — не подменять токены, не вводить сторонние шрифты и цвета.
- NFR: NFR3 (вход ≤1 000 мс, MFA ≤800 мс), NFR22 (TTI ≤30 с), NFR16 (токенов нет в логах).
- Доменные правила (≤12): роль только `manager`/`executor`; `manager` без MFA не входит;
  выход инвалидирует сессию; `/login` недоступен авторизованному; 404 для неизвестных путей.
- Запрет: хранить токены в `localStorage` вручную, дублировать их в state и логировать.

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Компоненты и хуки в PRODUCES, рабочий код.
- Тесты с `A04.*`.
- Список файлов и скриншот/описание состояний входа в чате.
- Обновить test-plan и progress.

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] Guard работает для всех защищённых путей
- [ ] MFA обязателен для `manager`, исполнитель входит без второго фактора
- [ ] Refresh не теряет состояние формы
- [ ] Токенов нет в URL, логах и текстах ошибок
- [ ] Токены дизайна соблюдены, адаптив проверен
- [ ] `proof_debt` пуст

## STOP

Остановиться после PRODUCES и `pre_ci`; D05 не начинать.
