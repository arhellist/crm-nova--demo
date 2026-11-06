# Delta: platform — same-origin auth и data routes

## ADDED Requirements

### Requirement: BFF обслуживает auth и data на том же origin, что SPA

Система MUST предоставлять маршруты `POST /api/auth/login`, `POST /api/auth/refresh`,
`POST /api/auth/logout`, `GET /api/auth/me` и прокси ` /api/data/*` на том же origin, что
SPA, и SHALL применять проверку Origin/CSRF на небезопасных методах этих маршрутов.

#### Scenario: happy path
- GIVEN SPA загружена с того же origin
- WHEN клиент вызывает login с credentials и CSRF
- THEN BFF отвечает 200/204 и выставляет cookies

#### Scenario: negative — чужой Origin
- GIVEN запрос login с Origin вне allowlist
- WHEN BFF обрабатывает POST
- THEN ответ `403`, сессия не создаётся

## MODIFIED Requirements

—

## REMOVED Requirements

—
