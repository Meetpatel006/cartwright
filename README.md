# cartwright

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines Next.js, Self, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **Next.js** - Full-stack React framework
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **tRPC** - End-to-end type-safe APIs
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/web/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the fullstack application.

## Agent payment policy

The shopper uses a wallet-style spending policy around the merchant's own checkout. It is a limit and audit boundary, not a bank account or Razorpay balance.

```env
WALLET_BALANCE_PAISE=1000000
WALLET_CURRENCY=INR
PAYMENT_AUTO_APPROVAL_LIMIT_PAISE=150000
RAZORPAY_MODE=test
RAZORPAY_TEST_UPI_ID=success@razorpay
AGENT_RAZORPAY_ORDER_FALLBACK=false
```

In Test Mode, payments at or below the automatic limit may open the merchant's visible payment control automatically. Payments above the limit require user approval. Live Mode always requires user approval. Cartwright does not create a second payment order for a black-box merchant; the merchant must create its own Razorpay order, verify the signature, capture the payment, and process webhooks. Razorpay Test Mode is simulated and never moves real money.

### Merchant payment contract

The shopper only treats a payment as merchant-connected when the rendered merchant checkout exposes a visible payment control. The agent then retains that checkout session, applies the wallet policy, and either opens the control automatically for an eligible Test Mode payment or waits for user approval. The merchant remains responsible for its Razorpay `order_id`, signature verification, capture status, and webhooks. A page that merely loads `checkout.js` is not a payment integration and will be stopped without creating an order.

`AGENT_RAZORPAY_ORDER_FALLBACK=true` explicitly enables the service-mediated adapter for a merchant with no visible payment UI. It creates a Razorpay Test order with the configured test account and labels the audit trail accordingly; it is not evidence that the merchant website itself created the order.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@cartwright/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Deployment

### Docker Compose

- Target: web + server
- Config: `docker-compose.yml` (app Dockerfiles live in `apps/*/Dockerfile`)
- Build images: bun run docker:build
- Start: bun run docker:up
- Logs: bun run docker:logs
- Stop: bun run docker:down

Environment variables are read from each app's `.env` file (baked into web builds for public variables) and overridden in `docker-compose.yml` for container networking.

For more details, see the guide on [Deploying with Docker Compose](https://www.better-t-stack.dev/docs/guides/docker).

## Project Structure

```
cartwright/
├── apps/
│   └── web/         # Fullstack application (Next.js)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run docker:build`: Build the Docker Compose images
- `bun run docker:up`: Build and start the Docker Compose stack
- `bun run docker:logs`: Tail logs from the Docker Compose stack
- `bun run docker:down`: Stop the Docker Compose stack

## PostHog Data Reference

Single place documenting **every PostHog read/write** in this repo. Verified
against source — no other `posthog-js`, HogQL, or `/batch/` call sites exist
outside the files listed below.

### 1. Direction of flow

| Direction | Path | Mechanism |
| --- | --- | --- |
| Browser → PostHog (write) | `packages/tracker/src/posthog/posthog-client.ts` via `mapCanonicalToPostHog` in `packages/tracker/src/posthog/posthog-mapper.ts` | `posthog-js` `init` + `capture` + `identify` + `register`, served to merchants as `apps/web/public/tracker/v1.js` |
| Scripts → PostHog (write) | `scripts/seed-posthog.ts`, `scripts/seed-15days-simulation.ts` | `POST {POSTHOG_HOST}/batch/` with `{ api_key, batch }` |
| Server → PostHog (read) | `packages/api/src/posthog/client.ts` (`queryHogQL`) | `POST {POSTHOG_HOST}/api/projects/{PROJECT_ID}/query/` with `{ query: { kind: "HogQLQuery", query } }`, `Authorization: Bearer {POSTHOG_PERSONAL_API_KEY}`, 15s timeout, returns `results ?? null`, never throws |
| Server → PostHog (admin) | `scripts/clear-posthog.ts`, `scripts/create-posthog-dashboard.ts`, `scripts/create-15days-dashboard.ts` | `POST /api/projects/{id}/reset_data/`, `POST .../dashboards/`, `POST .../insights/` |
| Server → browser (config only) | `apps/web/src/app/api/tracker/config/route.ts` | Returns **only** public write key + ingestion host; `POSTHOG_PERSONAL_API_KEY` (`phx_`) is never sent |

### 2. Environment variables (`packages/env/src/server.ts`)

| Var | Prefix / shape | Used by | Exposed to browser? |
| --- | --- | --- | --- |
| `POSTHOG_HOST` | URL, e.g. `https://us.i.posthog.com` | `queryHogQL`, all dashboard/clear scripts | No |
| `POSTHOG_PERSONAL_API_KEY` | `phx_...`, server-only | `queryHogQL`, clear/dashboard scripts | **Never** (see `tracker/config` route comment) |
| `POSTHOG_PROJECT_ID` | e.g. `362639` (hardcoded fallback in `fetch-posthog-agent-data.ts`, `create-15days-dashboard.ts`) | `queryHogQL`, admin scripts | No |
| `POSTHOG_PROJECT_WRITE_KEY` | `phc_...` (default `phc_fIKSiffTRgwauMers7ntbnaJR3TsOw3xmnxvE26ZTYH` in `packages/tracker/src/config/config.ts:23`) | `GET /api/tracker/config` → tracker SDK `posthog.init(apiKey)` | **Yes** (write-only) |
| `POSTHOG_INGESTION_HOST` | URL, default `https://us.i.posthog.com` (`config.ts:22`) | Same as above → `api_host` | **Yes** |
| Legacy script fallbacks | `POSTHOG_API_KEY` / `POSTHOG_AUTH_HEADER` | `scripts/seed-*.ts`, `fetch-posthog-agent-data.ts`, root `.env:32` | `POSTHOG_API_KEY` is the same `phc_` write key |

Tracker script-tag overrides: `data-posthog-key` → `posthogApiKey`, `data-posthog-host` → `posthogHost` (`packages/tracker/src/config/config.ts:52-53`); remote JSON may also supply `posthogApiKey/posthogHost` (`config.ts:128-129`).

### 3. Ingestion — 13 canonical events

Canonical names live in `packages/tracker/src/events/canonical-types.ts:7-20`
(`EventType`). The mapper prefixes them (`posthog-mapper.ts:17`):
`cartwright_${event_name}`. All 13 are seeded by both seeders and listed in
`scripts/inspect-posthog.ts:21-34` and `scripts/preview-15days-data.ts:49-63`:

| # | PostHog `event` | Canonical `event_name` | Seeded properties (representative) |
| --- | --- | --- | --- |
| 1 | `cartwright_page_viewed` | `page_viewed` | `page_type` (`home/collection/product/cart/checkout/order_confirmed/search`), `$current_url/$pathname/$referrer/$title` |
| 2 | `cartwright_search_performed` | `search_performed` | `search_query`, `search_results_count` (+ nested `search: {query, results_count}`) |
| 3 | `cartwright_product_list_viewed` | `product_list_viewed` | `category`, `brand`, `item_count` |
| 4 | `cartwright_product_selected` | `product_selected` | `product_id/title/price/currency`, `position`, `recommendation_rank` |
| 5 | `cartwright_product_viewed` | `product_viewed` | full `product.*` block (see §4) |
| 6 | `cartwright_agent_action` | `agent_action` | `agent_provider/session_id/run_id/task_id/intent`, `price_in_inr`, nested `agent.metadata: {model, reasoning_tokens, constraints_matched}` |
| 7 | `cartwright_add_to_cart` | `add_to_cart` | `cart_id/item_count/total_amount/currency/items[]` (+ `cart.*` alias) |
| 8 | `cartwright_remove_from_cart` | `remove_from_cart` | `cart_id`, `product_id/title`, updated `cart_item_count/total_amount` |
| 9 | `cartwright_cart_viewed` | `cart_viewed` | `page_type: cart`, cart snapshot |
| 10 | `cartwright_checkout_started` | `checkout_started` | `page_type: checkout`, `cart_total_amount/currency` |
| 11 | `cartwright_payment_started` | `payment_started` | `payment_gateway: Razorpay`, `payment_method` (`UPI/Credit Card/NetBanking`) |
| 12 | `cartwright_purchase_completed` | `purchase_completed` | full `order.*` block + `order_total/subtotal/tax/shipping/discount_amount`, `order_currency: INR`, `order_item_count`, `payment_method`, `page_type: order_confirmed` |
| 13 | `cartwright_purchase_failed` | `purchase_failed` | `failure_reason` (`Bank UPI Timeout / Card Declined / ...`), cart amount |

### 4. Ingestion — every `properties.*` field written

From `posthog-mapper.ts:19-86` (live SDK) plus seeder extras:

Base (every event): `site_id`, `merchant_id` (alt key `merchant` also accepted
on read), `visitor_id`, `session_id`, `event_id`, `event_name`, `timestamp`,
`actor_type` (`shopper|agent`), `platform`
(`shopify|woocommerce|magento|bigcommerce|wix|custom_spa`), `source`
(`auto_adapter|dom_heuristic|explicit_api|agent_telemetry|history_change`),
`page_type`, `cartwright_sdk_version: "1.0.0"`, `$current_url/$pathname/$referrer/$title`,
`currency: "INR"`, `distinct_id`, `$set` (identify traits: `email/name/city/state/loyalty_tier/preferred_currency`).

Product: `product_id/variant_id/product_title/price/original_price/currency/brand/category/sku/image_url/in_stock`.
Cart: `cart_id/item_count/total_amount/currency/items[]` (both flat `cart_*`
and nested `cart.*` shapes are written).
Order: `order_id/total_amount/subtotal_amount/tax_amount (18% GST in seeders)/shipping_amount (0 or 99)/discount_amount/currency/item_count/items[]` (both flat `order_*` and nested `order.*`).
Search: `search_query`, `search_results_count`.
Agent: `agent_provider/session_id/run_id/task_id/intent/metadata`, `price_in_inr`.
Geo/identity (seeders): `city/state/shopper_name/shopper_email/user_id/loyalty_tier`.
Payment: `payment_gateway/payment_method/failure_reason`.

Seed datasets: `seed-posthog.ts` = 5 merchants, 10 sites, 20 products, 50 users
(40 shoppers + 10 agents), ~446 events; `seed-15days-simulation.ts` = 10
merchants × 2 sites (opaque `mch_<hex>/site_<hex>` ids), 544 products from
`data/products-catalog.json`, ~1,000 users (85% shoppers / 15% agents),
15-day Poisson schedule with day multipliers + IST evening curve, 20 cities,
11 converting + 4 zero-result queries (`linen formal shirts…`, `leather bomber
jacket…`, `smart glasses…`, `bamboo fiber socks…`).

### 5. Shared query layer (`packages/api/src/posthog/client.ts`)

- `safeId(raw)` (`:21`): strips everything except `[a-zA-Z0-9_-]` before HogQL interpolation.
- `buildFilterClause(merchantId, { siteId, range })` (`:80`): always emits
  `timestamp >= now() - interval {24 hour|7 day|15 day|30 day}` (default `30d`)
  plus `(properties.merchant_id = '…' OR properties.merchant = '…')`, and when
  `siteId` is not `all`/`site_all`, `(properties.site_id = '…' OR properties.site = '…')`.
- `isPostHogConfigured()` (`:103`): true only when host + personal key + project id are all set; both server readers return `null`/graceful empty when false.

### 6. Reader A — `GET /api/tracker/stats` (`apps/web/src/app/api/tracker/stats/route.ts`)

Auth: Better-Auth session required; merchant bound via
`getOrCreateMerchantAccount(userId)`. Query params: `site|siteId`, `range`
(`24h|7d|15d|30d`, default `15d`). Runs **8 parallel HogQL queries** (all
scoped by `buildFilterClause`):

1. KPI on `cartwright_purchase_completed`: `count()`, `sum(toFloat(properties.order_total_amount))`, `avg(...)`, `countIf(actor_type='agent')`, `avgIf(... agent)`, `avgIf(... != agent)`, `sumIf(... agent)`.
2. `cartwright_purchase_failed`: `count()` → `failedOrders`.
3. `cartwright_page_viewed`: `count()` → `totalViews`.
4. Funnel over all events: `countIf` per `page_viewed/product_viewed/add_to_cart/checkout_started/purchase_completed` → `visits/prodViews/cartAdds/checkouts/purchases` with per-stage `rate` + `drop`.
5. `cartwright_search_performed` where `search_query IS NOT NULL`: `query`, `count()` grouped/ordered `DESC LIMIT 4` → `{ query, searches, missedRevenue: searches*avgOrderValue, suggestion }`.
6. Daily series on `purchase_completed`: `formatDateTime(timestamp,'%b %d')`, `countIf(agent)`, `countIf(!agent)` grouped by day, ordered by `min(timestamp)` → `[{ day, series: Human|AI Agent, orders }]`.
7. Last 100 `purchase_completed`: `timestamp, distinct_id, order_id, toFloat(order_total_amount), merchant_id, site_id, city, payment_method, actor_type, coalesce(JSONExtractString(properties.order,'items',1,'title'), product_title, title, 'Unknown product'), order_status` → `OrderItem { id,date,customer,city,items,amount,method,status,actor,merchantId,siteId }`.
8. Per-actor funnel (`if(actor_type='agent','agent','human')`, same 5 `countIf`s, `GROUP BY actor`) + AOV split → 0–100 radar `agentComparison[]` (`discovery/cart/checkout/conversion/aov/volume`).

Derived server-side: `totalOrders/grossRevenue/avgOrderValue/agentOrders/humanOrders (=total-agent)/agentSharePct/failedOrders/fulfillmentRate (=orders/(orders+failed))/conversionRate (=orders/views)`; `customerStats` (unique buyers from `distinct_id/order_id`; `new/churn/growth = 0`; `CLV = round(AOV*19)`); `customerGrowthTimeSeries` (zero-filled per day); `geoDistribution` (top 8 cities from orders); `cohortAnalysis` (all-first-time, repeat = 0, `repeatAov = round(AOV*2.84)`). Consumed by `apps/web/src/utils/tracker-api.ts` (`fetchTrackerStats`, `TrackerStatsResponse`).

### 7. Reader B — merchant chat (`packages/api/src/merchant-chat/posthog-context.ts` + `merchant-chat.service.ts:180-188`)

`fetchPostHogContext(merchantId, siteId?)` runs **4 parallel HogQL queries**
(30d filter): (a) purchase KPIs (`count/sum/avg/countIf agent`); (b) 5-step
funnel `countIf`s; (c) top 10 searches (`query`, `count()` grouped/ordered);
(d) last 20 purchases (`timestamp, toFloat(order_total_amount), city,
actor_type, coalesce(JSONExtractString(order,'items',1,'title'), product_title,
title, 'Unknown product'), order_status`). Returns `PostHogContext { kpis:
totalOrders/grossRevenue/avgOrderValue/agentOrders/humanOrders/totalViews/conversionRate/fulfillmentRate, funnel: visits/productViews/cartAdds/checkouts/purchases, topSearchQueries[10], recentOrders[20] }`; `formatPostHogContext` renders it as the `## Live Store Analytics (PostHog)` block injected into the chat system prompt. Null-safe when unconfigured.

### 8. Reader C — ad-hoc agent telemetry (`scripts/fetch-posthog-agent-data.ts`)

Two HogQL queries against project `362639`: (a) `agent_provider`,
`JSONExtractString(properties.agent,'metadata','model')`, `count()` grouped by
provider/model where `event='cartwright_agent_action' OR actor_type='agent'`;
(b) `timestamp/merchant_id/agent_provider/agent_intent/product_id/price_in_inr/JSONExtractString(agent,'metadata','model')/JSONExtractInt(agent,'metadata','reasoning_tokens')` ordered `DESC LIMIT 10`. (Contains a hardcoded demo key — rotate before reuse.)

### 9. Dashboards provisioned in PostHog

`scripts/create-posthog-dashboard.ts` (`DASHBOARD_INSIGHTS`): (1) 5-step
funnel `page_viewed→product_viewed→add_to_cart→checkout_started→purchase_completed`;
(2) trends `page_viewed` broken down by `actor_type`; (3) trends
`purchase_completed` `sum(order_total_amount)` + order count; (4) HogQL
`search_query, count() WHERE event='cartwright_search_performed' AND
toInt(search_results_count)=0 GROUP BY … LIMIT 10`; (5) trends
`product_viewed` vs `add_to_cart` broken down by `product_title`.
`scripts/create-15days-dashboard.ts` adds the same plus: revenue by
`merchant_id`, payment success vs failure, and orders by `city` (8 widgets).
`preview-15days-data.ts` / `inspect-posthog.ts` only print local expectations —
they fetch nothing.

### 10. Scripts (`package.json`)

`seed:posthog`, `seed:15days`, `preview:15days` (dry-run audit, no network),
`inspect:posthog` (static summary), `clear:posthog` (`reset_data`, needs
`phx_` key), `create:dashboard`, `create:15days-dashboard`.
