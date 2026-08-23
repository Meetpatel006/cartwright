# Cartwright DB (`packages/db`)

Postgres data layer for Cartwright. Built on **Drizzle ORM** over a **Neon
serverless** connection. Owns the schema, the migrations, and the thin
repository layer the rest of the app reads/writes through. This is the
system-of-record for users, payment policies, transactions, and the
append-only audit trail.

## Capabilities

1. **Typed schema** — Drizzle `pgTable` definitions for auth, transactions,
   payment policies, spending reservations, and audit events. All column
   types are inferred into `Row` / `NewRow` types (`$inferSelect` /
   `$inferInsert`) so the API package never hand-writes DB types.
2. **Connection singleton** — `createDb()` opens one `neon()` → `drizzle()`
   instance bound to the schema and re-exports a shared `db`. Honors
   `DATABASE_URL` from `@cartwright/env/server`.
3. **Repositories** — one file per aggregate under `src/repositories`
   (`transaction`, `payment-policy`, `spending`, `audit`). They are plain
   async functions over `db` — no classes, no ORM entities. Every other
   package imports these, never `db` directly.
4. **Spending budget with row locks** — reservations + consumed totals are
   mutated by an atomic, row-locked `UPDATE` (`sql\`consumed + amount\`` with a
   `WHERE ... <= maxTotalSpending` guard) so concurrent purchases can never
   overspend the user's budget.
5. **Idempotency + uniqueness constraints** — unique indexes on
   `(user_id, idempotency_key)`, `razorpay_order_id`, and `razorpay_payment_id`
   back the API's dedup logic at the DB level.
6. **Migrations via drizzle-kit** — SQL migrations live in `src/migrations`,
   generated/checked in, and applied with `drizzle-kit`.

## Schema (`src/schema`)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `user`, `session`, `account`, `verification` | Auth identity (Better Auth shape). | `user.email` unique; `session.token` unique; `account` oauth links. |
| `transactions` | Canonical purchase record. Status is a `pgEnum` driven *only* by the API state machine. | `amountInMinor` (int minor units, server-authoritative), `currency`, `approvedAmountInMinor`, `razorpayOrderId`/`razorpayPaymentId` (unique), `idempotencyKey`, `expiresAt`. |
| `payment_policies` | Per-user spending policy. A row is synthesized from env defaults when missing. | `maxTransactionAmount`, `maxTotalSpending`, `currency`, `requireUserApproval`, `allowedMerchants`/`blockedMerchants` (text[]), `frequencyLimit`, `consumedInMinor` (running reserved+settled total). |
| `spending_reservations` | Durable, DB-backed spending hold per transaction (replaces the old in-memory ledger). One reservation per `transactionId`. | `amountInMinor`, `currency`, `status` (`RESERVED`/`SETTLED`/`RELEASED`). |
| `audit_events` | Append-only event log for the purchase flow. | `eventType` (`pgEnum`), `transactionId` (nullable), `userId` (nullable), `reason`, `metadata` (`jsonb`, no secrets). |

Relations are declared with Drizzle `relations()` (e.g. `transactions → user`,
`spendingReservations → transactions`).

## Budgets / reservations (the important invariant)

`consumedInMinor` on `payment_policies` is a running total of reserved + settled
spending. It is **never** incremented/decremented with a plain assignment — only
through:

- `incrementConsumed(userId, amount)` — row-locked `UPDATE ... SET consumed = consumed + amount WHERE consumed + amount <= maxTotalSpending`. Returns `undefined` when the budget would be exceeded, so the caller can `POLICY_BLOCK` instead of charging.
- `decrementConsumed(userId, amount)` — `GREATEST(0, consumed - amount)`, used when a reservation is released.

A `spendingReservations` row is inserted when a transaction is reserved
(`RESERVED`) and later moved to `SETTLED` (payment captured) or `RELEASED`
(cancelled / policy-blocked / price-changed), which triggers `decrementConsumed`.
`releaseReservation` is idempotent (safe to call when none exists).

## Repositories (`src/repositories`)

- `transaction.repository.ts` — insert/get by id, by `razorpayOrderId`, by
  `razorpayPaymentId`, by `(userId, idempotencyKey)` (idempotency), `update`,
  `list` (newest first).
- `payment-policy.repository.ts` — `getPolicyRow`, `ensurePolicy` (synthesizes a
  row from env defaults, idempotent), `getEffectivePolicy` (safe public shape),
  `upsertPolicy` (rejects lowering `maxTotalSpending` below `consumedInMinor`),
  and the atomic `incrementConsumed` / `decrementConsumed` budget helpers.
- `spending.repository.ts` — `insertReservation`, `getReservationByTransactionId`,
  `setReservationStatus`, `releaseReservation`, `settleReservation`.
- `audit.repository.ts` — `insertAuditEvent`, `countAuditEventsSince` (frequency
  limits), `listAuditEvents` (filter by user/transaction, newest first).

## Environment variables

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string. Loaded by `drizzle.config.ts` from `apps/web/.env`; consumed by `@cartwright/env/server` at runtime. |

## Running it

```bash
# From packages/db
bun db:generate            # drizzle-kit generate  (new migration SQL)
bun db:push                # drizzle-kit push       (schema -> DB, no migration files)
bun db:migrate             # drizzle-kit migrate    (apply checked-in migrations)
bun db:migrate:deploy      # alias of db:migrate
bun db:studio              # drizzle-kit studio      (local DB browser)
```

## Architecture notes

- `drizzle.config.ts` reads `DATABASE_URL` from `../../apps/web/.env` (the
  web app owns the env file), `dialect: "postgresql"`, schema dir
  `src/schema`, migrations out `src/migrations`.
- Exports: `@cartwright/db` (→ `src/index.ts`, `db` singleton + `createDb`),
  `@cartwright/db/schema`, `@cartwright/db/repositories/*`.
- Amounts are always **integer minor units** (`amountInMinor`); currency is an
  ISO-4217 code. Never store floats for money.
- `consumedInMinor` mutation is the only place the budget moves — change it
  there, not ad hoc in the API.
- `metadata` in `audit_events` must stay free of card data and secrets.
