# LIBRARY MODULE: email-nodemailer

## Назначение

Исходящая почта: Nodemailer SMTP, Handlebars-шаблоны, BullMQ очередь, статусы доставки в БД, вложения.

## Когда использовать

- Welcome, reset password, invoices, notifications.

## Когда не использовать

- Транзакционная почта только через провайдер SDK (Postmark/SES) без SMTP — сделать Adapter, не ломать интерфейс `EmailSender`.
- Маркетинг-рассылки тысяч получателей — отдельный ESP/batch job, не этот API «send to 50».

## Зависимости

- Redis + BullMQ.
- Часто вызывается из `auth-jwt` (reset), `payments-stripe`, `admin-panel`.
- `rate-limiting`, `logging-pino`.

## Улучшения

- **Не** делать публичный `POST /api/email/send` для обычных пользователей без жёсткой authz (иначе spam relay). Предпочтительны **внутренние** вызовы `EmailService.sendTemplate` из use-cases; HTTP — только admin/test.
- Preview в non-prod; в prod test endpoint — только admin.
- Open tracking — optional, privacy note (GDPR); default off.
- HTML + text multipart.
- Secrets SMTP только env; не в шаблонах.

---

## 1. Env

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `EMAIL_FROM`, `EMAIL_QUEUE_NAME`, `EMAIL_MAX_RECIPIENTS` (default 50), `EMAIL_RATE_PER_USER_HOUR`.

## 2. Templates (`templates/email/*.hbs`)

Минимум: `welcome`, `reset-password`, `invoice`, `notification`.  
Layout partial: header/footer, `{{year}}`, `{{companyName}}`.

## 3. Model EmailMessage

`id`, `to`, `cc?`, `subject`, `template`, `data` JSONB, `status` (`pending`|`queued`|`sent`|`failed`), `error?`, `providerMessageId?`, `sentAt?`, `createdAt`.  
(Поле `opened` — только если tracking включён.)

## 4. Flow

1. Use-case → `emailService.enqueue({ to, template, data, attachments? })`
2. Row `pending` → queue job
3. Worker render HBS → nodemailer send → `sent`/`failed`
4. Retry max 3, exponential backoff

## 5. HTTP (ограничить)

- `POST /api/admin/email/test` — admin only
- `GET /api/admin/email/:id` — status
- Опционально user: `GET /api/me/email-messages` — свои системные письма без произвольной отправки

## 6. Frontend

Admin: `EmailPreview`, `EmailHistory`.  
User-facing: обычно только триггеры форм (forgot password), не общий composer.

## 7. Security

- Validate email format; blocklist domains optional.
- Rate limits; max recipients.
- Sanitize template data (escape Handlebars default).
- Не принимать произвольный HTML от клиента как тело письма.

## 8. Тесты

- [ ] Template renders required vars
- [ ] Worker retry on SMTP fail
- [ ] Non-admin cannot hit test send
- [ ] Rate limit enforced

## 9. Антипаттерны

- Синхронная SMTP в HTTP handler без queue
- Открытый send API
- Логирование полного письма с токенами reset в plaintext info logs
- `{{{rawHtml}}}` из user input

## 10. Критерии готовности

Templates + queue worker + model statuses + internal EmailService + admin test + rate limit + tests.

## CONFLICTS with other modules

| С другим модулем | Проблема | Решение |
|------------------|----------|---------|
| Публичный API | Spam-relay | Нет открытого user send; только use-cases / admin test |
| `auth-jwt` | Reset tokens в письме | Не логировать link/token в info |
| `payments-stripe` | Чеки | Шаблон invoice + enqueue из webhook/service |
| `rate-limiting` | Flood SMTP | Tier email + per-user hour cap |
| `caching-redis` / BullMQ | Очередь | Префикс queue `email:` |
