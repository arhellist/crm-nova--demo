# LIBRARY MODULE: websocket-socketio

## Назначение

Real-time слой на Socket.IO: JWT-auth на handshake, комнаты, ack, reconnect с восстановлением подписок, Redis adapter для горизонтального масштабирования.

## Когда использовать

- Чаты, presence, live-уведомления, совместное редактирование, realtime dashboard.

## Когда не использовать

- Только редкие односторонние push → SSE/Web Push проще.
- Нет необходимости в комнатах/ack и один инстанс без планов роста → можно отложить Redis adapter (пометить LATER в ADAPTATION).
- Уже есть другой realtime-стек (ws native, Ably, Pusher) — не дублировать без ADR.

## Зависимости

- **Жёсткая:** `auth-jwt` (или эквивалент: верификация access JWT).
- **Рекомендуемая:** `rate-limiting`, `logging-pino`, `caching-redis` (тот же Redis для adapter).
- Стек: Node.js, Socket.IO 4.x, React, Zod.

## Улучшения относительно наивной схемы

- Токен при reconnect: обновлять `socket.auth` / `extraHeaders` **до** reconnect (колбэк `auth` в Socket.IO client).
- Cookie auth: парсить только из httpOnly cookie на том же origin; query `?token=` — **запрещён в prod** (утечка в логах/Referer).
- Ack + idempotencyKey: сервер дедуплицирует по ключу (Redis SET NX TTL).
- Offline queue на клиенте: не бесконечная — лимит размера + drop oldest с UI-сигналом.
- Presence: источник правды — Redis; Socket.IO rooms — доставка, не inventory пользователей навсегда.

---

## 1. Архитектура

- HTTP API и Socket.IO — один процесс или отдельный `SOCKET_PORT` (зафиксировать в ADR).
- Auth: `io.use` middleware → `socket.data.userId`, `socket.data.role`.
- Масштаб: `@socket.io/redis-adapter` (обязателен, если >1 инстанс; иначе optional).
- События только в room участников; запрет «emit всему io» для пользовательских данных.

## 2. Env

| Переменная | Default | Описание |
|------------|---------|----------|
| `SOCKET_PATH` | `/socket.io` | path |
| `SOCKET_PORT` | = HTTP или отдельный | |
| `CORS_ORIGIN` | | CSV/JSON доверенных origin |
| `SOCKET_REDIS_URL` | | для adapter (может = `REDIS_URL`) |
| `MAX_RECONNECT_ATTEMPTS` | `Infinity` / число | клиент |
| `RECONNECT_DELAY_MS` | `1000` | база экспоненты |
| `SOCKET_ACK_TIMEOUT_MS` | `5000` | |
| `SOCKET_MAX_PAYLOAD_BYTES` | `1048576` | 1MB |
| `SOCKET_RATE_MSG_PER_MIN` | `100` | на user+room |

## 3. Аутентификация

### Сервер (`middlewares/auth.ts`)

1. Извлечь токен: `handshake.auth.token` **или** cookie access (тот же механизм, что HTTP).
2. Verify JWT (reuse util из `auth-jwt`).
3. Успех → `socket.data`; ошибка → `next(new Error('UNAUTHORIZED'))` (не «read-only по умолчанию» — только если явно в ADAPTATION).
4. На `connection` залогировать `socket.id`, `userId`, `requestId` если есть.

### Клиент (`socket.ts`)

```ts
io(url, {
  path: SOCKET_PATH,
  withCredentials: true,
  auth: (cb) => cb({ token: getAccessTokenOrEmpty() }), // или cookie-only same-origin
  reconnection: true,
  reconnectionAttempts: MAX,
  reconnectionDelay: RECONNECT_DELAY_MS,
  reconnectionDelayMax: 30000,
});
```

После refresh токенов (из axios interceptor) — `socket.auth = { token }` + при необходимости `socket.disconnect().connect()`.

## 4. Комнаты

- Join/leave только после auth + **проверки членства** (ACL в БД/сервисе), не доверять client `roomId`.
- `socket.to(roomId).emit` — всем кроме отправителя; `io.to(roomId).emit` — всем.
- На disconnect Socket.IO снимает socket из rooms; **бизнес-подписки** (список roomId пользователя) хранить отдельно и восстанавливать на `connection` / client `rooms:resync`.

События управления:

- `room:join` `{ roomId, idempotencyKey }` → ack `{ status, membersCount? }`
- `room:leave` `{ roomId }`
- `room:resync` → сервер возвращает актуальный список разрешённых комнат и делает join

## 5. События и ack

- Именование: `domain:action` (`chat:message`, `user:typing`).
- Payload: Zod-схема; обязательно `idempotencyKey: string` (uuid) для мутирующих событий.
- Ack: `{ status: 'ok' | 'error', code?, message?, data? }`.
- Клиентский таймаут ack = `SOCKET_ACK_TIMEOUT_MS` → retry с тем же idempotencyKey или UI error.

## 6. Обработчики (минимум)

| Событие | Поведение |
|---------|-----------|
| `connection` / `disconnect` | log, cleanup timers |
| `chat:message` | validate → persist → broadcast → ack `{ messageId }` |
| `chat:typing` | broadcast, debounce/throttle 1s на сервере |
| `chat:read` | update receipts → broadcast |
| `user:presence` | online/away/offline → Redis + broadcast ограниченному кругу |
| `system:ping` | ack pong / latency |

## 7. Структура кода

```text
backend/src/socket/
  index.ts
  handlers/{chat,user,system,rooms}.ts
  middlewares/auth.ts
  adapters/redis.ts
  schemas/*.ts          # Zod
  types.ts
frontend/src/services/
  socket.ts
  socket-hooks.ts       # useSocket, useSocketEvent
  socket-queue.ts       # offline outbox
```

## 8. Security invariants

- Rate limit сообщений per user (+ per room).
- Zod на каждый inbound event; при fail — ack error, при повторных — disconnect.
- Max payload; XSS sanitize текста сообщений (сервер).
- Не emit PII в комнаты без ACL.
- CSRF не применим к WS так же, как к cookie forms — origin + auth обязательны.

## 9. Тест-сценарии

- [ ] Reject без JWT
- [ ] Join в чужую комнату → error
- [ ] Duplicate idempotencyKey → один persist
- [ ] Ack timeout / retry
- [ ] Reconnect восстанавливает rooms
- [ ] Два инстанса + Redis: сообщение видно на другом node

## 10. Антипаттерны

- Токен в query string в production
- Доверие `roomId` без ACL
- Broadcast на весь `io` для чата
- Infinite offline queue без лимита
- Presence только в памяти процесса при multi-instance

## 11. Критерии готовности

Auth middleware, rooms ACL, ack+idempotency, client reconnect+resync, Redis adapter (или явный single-node ADR), Zod, rate limit, тесты выше.

## CONFLICTS with other modules

| С другим модулем | Проблема | Решение |
|------------------|----------|---------|
| `auth-jwt` | Токен на reconnect | Обновлять `socket.auth` после refresh; не token в query |
| `caching-redis` / `rate-limiting` | Один Redis | Отдельные префиксы; adapter pub/sub не смешивать с cache DB index без настройки |
| `payments-stripe` | Не путать Socket с webhook HTTP | Stripe webhook остаётся HTTP raw-body route |
| `file-upload` | Большие бинарники через WS | Файлы только через upload API; в сокете — метаданные/URL |
| `logging-pino` | requestId на WS | Генерировать connectionId / брать из handshake headers |
