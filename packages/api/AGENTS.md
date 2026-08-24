# Cartwright API (`packages/api`)

Server-side tRPC API and the **authoritative backend** for the Cartwright
purchase flow. It wraps the shopping agent, owns the transaction state machine,
enforces the user's payment policy, reserves spending against the budget, drives
Razorpay (server-side orders, signature verification, webhook), and writes the
append-only audit trail. Clients never compute status/amounts — they display
what the server returns.

## Capabilities

1. **Shopping entrypoint** (`agentRouter.shop`) — runs the shopping agent for a
   natural-language query + store, derives the *server-authoritative* charged
   amount (real checkout total when available, else the picked product price),
   and creates a purchase transaction via `createPurchaseTransaction`.
2. **Transaction lifecycle** — `CREATED → POLICY_CHECKING → {POLICY_BLOCKED |
   AWAITING_APPROVAL | APPROVED} → PAYMENT_PROCESSING → {PAYMENT_SUCCEEDED |
   PAYMENT_FAILED}` (+ `CANCELLED`, `PRICE_CHANGED`). Every transition is
   validated by the state machine in `transactions/transaction.state.ts`;
   string literals never move a row between states directly.
3. **Policy engine** (`payments/payment-policy.service.ts`) — the *only*
   authority that decides `auto_approve` / `user_approval` / `blocked` for a
   proposed amount/merchant/currency. Returns `blocked` (not throw) on any
   failing rule so the transaction can persist a `POLICY_BLOCKED` + audit row.
4. **Spending reservation** — on a non-blocked create, atomically reserves the
   amount against the user's budget (`incrementConsumed`, row-locked); releases
   on cancel/block/price-change, settles on capture.
5. **Idempotency** — per `(user, idempotencyKey)` for create, and per
   `razorpayPaymentId` / already-`PAYMENT_SUCCEEDED` for verify/webhook. DB
   unique constraints back this up.
6. **Razorpay integration (Test Mode only)** — server-side `createOrder`,
   `verifyPaymentSignature` re-check against the *persisted* transaction
   (amount/currency/order never trusted from the client), and a
   signature-verified webhook handler. Live mode is gated to require user
   approval and never auto-charges.
7. **Merchant-UI payment path** — for transactions created with a retained
   Browserbase/Stagehand `browserSessionId`, `approveTransaction` re-confirms
   the live merchant price (blocks only on a *higher* price), then drives the
   retained checkout session via `approveMerchantPayment` from `@cartwright/agent`.
8. **Audit trail** — every lifecycle step records an append-only `audit_events`
   row through the single `recordAuditEvent` entry point.
9. **Tests** — `bun test` covers the policy, wallet ledger, payment flow,
   transaction state machine, and idempotency.

## Routers (`src/routers`)

- `agent.ts` — `shop` (protected): run agent + create purchase transaction.
- `policies.ts` — `get` (effective policy), `update` (upsert the user's
  spending boundaries). The only way a user sets their own limits.
- `transactions.ts` — `get`, `list`, `approve`, `initiatePayment`,
  `verifyPayment`, `cancel`, `audit`. All protected; all ownership-checked.
- `index.ts` — composes the three routers plus `healthCheck` (public) and
  `privateData` (protected sample).

## Transaction flow (what the code actually does)

Driven by `transactions/transaction.service.ts`:

1. **Create** (`createPurchaseTransaction`) — idempotency lookup → insert row
   (`CREATED`) → `POLICY_CHECKING` → `evaluateUserPaymentPolicy`.
   - `blocked` → `POLICY_BLOCKED`.
   - else `incrementConsumed`; if budget exhausted → `POLICY_BLOCKED` + release.
   - else insert `RESERVED` spending reservation, then `AWAITING_APPROVAL` (if
     the policy needs user approval) or `APPROVED`.
2. **Approve** (`payments/payment-approval.service.ts`) — from `AWAITING_APPROVAL`
   (or `APPROVED`+merchant session), re-validates policy and live merchant price,
   checks expiry, transitions to `APPROVED`, then (merchant-UI path) drives the
   retained checkout session and settles the reservation.
3. **Initiate** (`initiatePayment`) — from `APPROVED`, re-checks policy/budget,
   creates a server-side Razorpay order from the *persisted* amount, →
   `PAYMENT_PROCESSING`.
4. **Verify** (`verifyPayment`) — signature check, fetch payment+order from
   Razorpay, assert amount/currency/order match the row, → `PAYMENT_SUCCEEDED`,
   settle reservation. Idempotent on duplicate.
5. **Webhook** (`payments/razorpay-webhook.service.ts`) — verifies the webhook
   signature, matches by `razorpayOrderId`, settles (`finalizeSettlement`) or
   fails. Ignores already-processed deliveries.
6. **Cancel** (`cancelTransaction`) — from any non-terminal, non-processed state →
   `CANCELLED` + release reservation.

### Safety guardrails

- Razorpay is only used when `RAZORPAY_MODE === "test"` **and** `keyId` starts
  with `rzp_test_` (see `isTestModeSafe`). Refuses otherwise.
- The charged amount is **server-derived** (`deriveAmount`) and re-validated at
  initiate/verify — the AI/client never sets the final amount.
- Ownership enforced on every read/write: a user can only touch their own
  transaction (`requireOwned` / `loadOwnedTransaction`).
- `verifyPayment`/`handleRazorpayWebhook` compare the Razorpay-reported
  amount/currency/order against the persisted row, never the client's claim.
- Live mode forces `user_approval` and never auto-charges.
- Audit `metadata` carries no card data or secrets.

## Domain errors (`transactions/transaction.errors.ts`)

Each error carries a `code` (e.g. `TRANSACTION_NOT_FOUND`, `OWNERSHIP`,
`INVALID_STATE`, `POLICY_VIOLATION`, `ALREADY_PROCESSED`, `DUPLICATE_PAYMENT`,
`VERIFICATION_FAILED`, `PRICE_CHANGED`). `src/index.ts` maps these to tRPC /
HTTP codes (`NOT_FOUND`, `FORBIDDEN`, `PRECONDITION_FAILED`, `CONFLICT`,
`BAD_REQUEST`, …) in the `errorFormatter`. Internal errors stay generic.

## Module map

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | tRPC init, `errorFormatter`, `router`, `publicProcedure`, `protectedProcedure` (session gate). |
| `src/context.ts` | Builds `Context` from the request session (`@cartwright/auth`). |
| `src/transactions/transaction.service.ts` | Create/load/list/initiate/verify/cancel + `mapToResult`/`toTransactionListView`. |
| `src/transactions/transaction.state.ts` | `VALID_TRANSITIONS` table + `assertTransition`/`canTransition`/`isTerminal`. |
| `src/transactions/transaction.types.ts` | `PurchaseProposal`, `TransactionResult`, `TransactionListView`, `PaymentSource`. |
| `src/transactions/transaction.errors.ts` | Domain error classes + `DOMAIN_ERROR_CODES`. |
| `src/payments/payment-policy.service.ts` | `evaluateUserPaymentPolicy` (the policy authority). |
| `src/payments/payment-approval.service.ts` | `approveTransaction` (approve + merchant-UI drive). |
| `src/payments/payment-idempotency.service.ts` | Idempotency lookups. |
| `src/payments/razorpay-webhook.service.ts` | Webhook signature verify + settle. |
| `src/payments/merchant-payment-outcome.ts` | Pure decision: may a merchant-UI drive settle/fail/stay pending? |
| `src/payments/amount-authority.ts` | Pure decision: verified checkout total vs provisional discovery price at selection. |
| `src/audit/audit.service.ts` | `recordAuditEvent` + `toAuditEventView` (single audit write path). |

## Environment variables

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres (via `@cartwright/env/server` / `@cartwright/db`). |
| `RAZORPAY_MODE` | Must be `test` to create/verify server-side orders. |
| `RAZORPAY_KEY_ID` | Must start with `rzp_test_`. |
| `RAZORPAY_KEY_SECRET` | Server-side order/verify. |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies inbound webhook signatures. |
| `PAMENT_AUTO_APPROVAL_LIMIT_PAISE` | Test Mode auto-approve cap (minor units). Above this → `user_approval`. |
| `WALLET_BALANCE_PAISE` / `WALLET_CURRENCY` | Default policy / budget when a user has no row. |
| `SHOPPING_AGENT_BROWSER` | `local` | `browserbase` override for the agent. |
| `AGENT_LLM_*` | Model/base URL/keys passed to the local shopping agent. |
| `AGENT_RAZORPAY_ORDER_FALLBACK` | Enables the `agent_razorpay` payment source. |

## Running it

```bash
# From packages/api
bun test --timeout 60000      # run the test suite
```

Tests cover: `payments/payment-flow.test.ts` (incl. merchant-UI terminal states),
`transactions/transaction.state.test.ts`, `shopping/*.test.ts`,
`payments/amount-authority.test.ts`, `payments/merchant-payment-outcome.test.ts`,
`payments/webhook-http.test.ts`.
