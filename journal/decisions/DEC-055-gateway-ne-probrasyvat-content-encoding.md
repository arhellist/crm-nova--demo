# DEC-055 — Gateway: не пробрасывать Content-Encoding/Length после decode fetch (ERR_CONT…

| Поле | Значение |
|------|----------|
| Дата | 2026-11-06 |
| Intake | 20261106-2130-err-content-decoding-failed-na-api-data |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** После login UI получал 200 на /api/data/tasks с ERR_CONTENT_DECODING_FAILED: fetch уже распаковал gzip, а Content-Encoding пробрасывался. Плюс CSP без font-src ругался на локальные шрифты.

**Решение.** Gateway: не пробрасывать Content-Encoding/Length после decode fetch (ERR_CONTENT_DECODING_FAILED). Nginx CSP: font-src 'self' для локальных woff2.

**Альтернативы.** Отключить gzip на nginx для /api — отвергнуто: корень в BFF. CDN-шрифты — запрещены design-notes.

**Чем подтверждено.** curl /api/data/tasks без Content-Encoding; JSON парсится; CSP с font-src; unit data.test.ts.
