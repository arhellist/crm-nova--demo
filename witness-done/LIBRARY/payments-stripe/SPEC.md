# LIBRARY MODULE: payments-stripe

## Назначение

Платежи и подписки через Stripe: PaymentIntents/Subscriptions, webhook с проверкой подписи, планы, биллинг UI на Elements (карта не проходит через наш сервер).

## Когда использовать

- SaaS-подписки, разовые оплаты, платные фичи.

## Когда не использовать

- Другой PSP (ЮKassa, CloudPayments) — отдельный LIBRARY-модуль/adapter, не копировать Stripe API as-is.
- Только «заглушка оплаты» в MVP без денег — OUT OF SCOPE.
- Хранение PAN/CVC у себя — **запрещено** (PCI); только Elements/Checkout.

## Зависимости

- `auth-jwt`, `logging-pino`.
- Часто: `email-nodemailer` (чеки/failed payment), `admin-panel` (plans), `rate-limiting`.

## Улучшения

- Webhook endpoint: **сырое body** (raw buffer) для `constructEvent`; не JSON parser до verify.
- Идемпотентность: хранить `stripeEventId` processed; retry Stripe безопасны.
- `customerId` на User/BillingCustomer — уникальный индекс.
- Cancel: различать `cancel_at_period_end` vs immediate.
- Никогда не логировать полный PaymentMethod / client_secret в info-логах (только ids).
- Currency/amount — integer minor units; Zod refine.

---

## 1. Модели

**Plan:** `id`, `name`, `description`, `priceCents`, `currency`, `interval` (`month`|`year`), `stripePriceId`, `stripeProductId`, `isActive`.

**Subscription:** `id`, `userId`, `stripeCustomerId`, `stripeSubscriptionId`, `status`, `planId`, `currentPeriodStart/End`, `cancelAtPeriodEnd`, timestamps. Unique `stripeSubscriptionId`.

**Payment:** `id`, `userId`, `subscriptionId?`, `stripePaymentIntentId?`, `stripeInvoiceId?`, `amount`, `currency`, `status`, `metadata`, `createdAt`.

**StripeEvent (dedup):** `id` (= event.id), `type`, `processedAt`.

## 2. API

### User
- `POST /api/payments/create-intent`
- `POST /api/subscriptions/create` `{ planId, paymentMethodId? }`
- `POST /api/subscriptions/change-plan`
- `POST /api/subscriptions/cancel` `{ when: 'period_end' | 'immediate' }`
- `GET /api/subscriptions/current`
- `GET /api/payments/history`

### Admin plans
- CRUD `/api/admin/plans` (permission) — синхронизация с Stripe Products/Prices

### Webhook
- `POST /api/webhooks/stripe` — no CSRF, signature required, raw body

## 3. Webhook handlers (идемпотентно)

| Event | Action |
|-------|--------|
| `payment_intent.succeeded` | Payment → succeeded |
| `invoice.paid` | extend subscription |
| `invoice.payment_failed` | status past_due + notify |
| `customer.subscription.updated/deleted` | sync local status |

## 4. Frontend

- Stripe Elements `PaymentForm`
- `SubscriptionPlans`, `BillingHistory`
- `useSubscription` hook
- Publishable key only on client; secret only server

## 5. Env

`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_API_VERSION`.

## 6. Security invariants

- Signature verification mandatory.
- Idempotency-Key on create session/intent where applicable.
- AuthZ: user видит только свои payments/subscription.
- Admin plans mutations audited if admin-panel present.

## 7. Тесты

- [ ] Webhook invalid signature → 400
- [ ] Duplicate event id → no double apply
- [ ] Cancel at period end flags correctly
- [ ] User cannot read another's payment

## 8. Антипаттерны

- JSON middleware before webhook verify
- Storing card data
- Trusting client `amount` without server-side plan price
- Sync Stripe только с клиента без webhook

## 9. Критерии готовности

Models + intent/subscription APIs + webhook dedup + Elements UI + plan admin (если в scope) + tests.

## CONFLICTS with other modules

| С другим модулем | Проблема | Решение |
|------------------|----------|---------|
| Express JSON middleware | `constructEvent` требует raw body | Mount webhook **до** `express.json()` или `express.raw` только на этот path |
| `auth-jwt` | Webhook без user JWT | Отдельный route без user auth; только Stripe signature |
| `admin-panel` | Plans | Admin CRUD + audit; цены только с сервера |
| `email-nodemailer` | invoice.payment_failed | Внутренний EmailService из webhook worker |
| `rate-limiting` | Webhook retries | Не резать Stripe IP жёстко; лимит на create-intent для users |
| `logging-pino` | PII/платежи | Redact client_secret, payment method details |
