# Профили проектов — акценты и быстрый выбор модулей

Профиль — это **набор акцентов под тип продукта**, а не «все модули сразу». Он выбирается на шаге
**00** и записывается в `OUTPUT/MANIFEST.md` (поля `Профиль` и `Отклонения от профиля`).

| Профиль | Акцент | Разделы ниже |
|---------|--------|--------------|
| `agent-harness` | журнал событий, контракты инструментов, подтверждения человеком, воспроизводимость | §0 |
| `web-app` | auth, роли, интерфейс, админка | §1–§4 |
| `data-platform` | пайплайны, хранилище, аналитика, отчёты | §5 |
| `custom` | ни один не подходит — акценты перечисляются в ТЗ, отклонения обязательны | — |

Укажи профиль в `INPUT/TECH_SPEC.md` §13 или §11. На шагах 01/09 фабрика применяет акценты профиля,
затем сверяет с ТЗ (можно сузить, нельзя молча расширять OUT OF SCOPE).

> Имена модулей (`logging-pino`, `email-nodemailer`, `websocket-socketio`, …) — **id контрактов**, а не
> обязательные библиотеки: id отражает референсную реализацию. На другом стеке контракт переносится,
> реализация своя — вердикт `adapt` (`catalogs/stack-policy.md`, `PIPELINE/07`). Профиль не выбирает
> язык: он выбирает акценты.

---

## 0. Agent Harness (`agent-harness`)

**Для:** агенты, инструменты, оркестрация, мультиагентные сценарии.

| include | skip |
|---------|------|
| logging-pino, rate-limiting, auth-jwt, websocket-socketio, caching-redis | payments-stripe, search, admin-panel |

Акценты, которые профиль **обязательно** поднимает на шаг 01/04/05:

- **журнал событий** — append-only, persist-before-dispatch (`EventLog`);
- **контракты инструментов** — явные схемы входа/выхода, версионирование, таймауты;
- **подтверждения человеком** — L3-гейт для необратимых действий;
- **воспроизводимость** — детерминированный replay, идентификаторы трасс;
- **изоляция** — права инструмента, лимиты навигаций и объёма.

Профиль наследует верификацию полностью: `pre_ci`, wave-smoke, `pre_release` + product-smoke.

---

## 1. CRUD API (`web-app`)

**Для:** REST API с базовой авторизацией, без real-time и админки.

| include | skip |
|---------|------|
| logging-pino, rate-limiting, auth-jwt, crud-table | websocket-socketio, admin-panel, payments-stripe, search, file-upload, caching-redis* |

\*caching-redis — `later`, если нет Redis по другой причине.

---

## 2. Real-time чат

**Для:** мессенджер, live-уведомления, presence.

| include | skip |
|---------|------|
| logging-pino, rate-limiting, auth-jwt, websocket-socketio, caching-redis, file-upload | admin-panel, payments-stripe, search |

email-nodemailer — `later` (уведомления на почту).

---

## 3. SaaS с платежами

**Для:** подписки, биллинг, админка.

| include | skip |
|---------|------|
| logging-pino, rate-limiting, auth-jwt, admin-panel, payments-stripe, email-nodemailer, caching-redis, crud-table | websocket-socketio, search |

file-upload — по ТЗ (аватар/инвойсы).

---

## 4. Корпоративный портал

**Для:** внутренние системы, документы, поиск, админка.

| include | skip |
|---------|------|
| logging-pino, rate-limiting, auth-jwt, admin-panel, crud-table, file-upload, search | websocket-socketio, payments-stripe |

caching-redis — `include` если NFR/search/queue требуют Redis.

---

## 5. Data Platform (`data-platform`)

**Для:** пайплайны, хранилище, аналитика, отчёты, ETL.

| include | skip |
|---------|------|
| logging-pino, caching-redis, crud-table, admin-panel (read-only просмотр) | payments-stripe, websocket-socketio, file-upload |

Акценты профиля:

- схема хранения и владелец каждой таблицы фиксируются на шаге 04;
- идемпотентность загрузок и повторных прогонов — инвариант, а не «пожелание»;
- у каждого отчёта — источник правды чисел (файл/ключ), без «на усмотрение»;
- NFR: объём данных, окно свежести, стоимость запроса (шаг 06).

---

## Как ссылаться в ТЗ

```text
Профиль: agent-harness
Отклонения от профиля: caching-redis = later (Redis нет в v1)

Профиль: web-app (SaaS с платежами)
Отклонения от профиля: без email в v1 → email-nodemailer = later
```

Отклонения попадают в `OUTPUT/MANIFEST.md` (поле «Отклонения от профиля») и в `01_analysis.md`.
