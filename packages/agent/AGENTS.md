# Cartwright Agent (`packages/agent`)

Autonomous shopping + merchant-checkout agent. It browses a store, picks the
cheapest in-budget product, adds it to the cart via an **LLM-driven** flow that
works for *every* provider (no regex / hard-coded selectors), and (opt-in,
**Test Mode only**) proceeds through checkout and completes a Razorpay card
payment end-to-end.

## Capabilities

1. **Product discovery & selection** — signs in, lists in-budget products, picks
   the cheapest, adds to cart.
2. **LLM-driven add-to-cart (all providers)** — `llmAddToCart`
   (`src/add-to-cart.ts`) drives the add-to-cart journey entirely through the
   model: dismiss overlays → confirm it's a product page → pick options + click
   **Add to Cart** → verify the item landed in the cart. It uses **no regex text
   matching and no per-site hardcoded navigation**, so the same code adds to cart
   on Nike, Amazon, a raw URL, *and* local/demo merchants (Raven Scents, …).
   The agent stops **after the item is in the cart** by default — it never gets
   stuck and never just displays the product. A deeper checkout (proceed → fill
   shipping → reach payment gate) is opt-in via `preserveCheckoutSession`.
   - **Query-relevance gate** — before any pick/auto-add, `filterProductsByQueryRelevance`
     (`src/filtering/query-relevance.ts`) asks the model to drop listings that do
     NOT match the shopper's query (sponsored / "you-may-also-like" / upsell
     items). Only query-matching candidates survive, so the human never sees or
     gets charged for an off-topic product.
   - **Selection-gated add (human-in-the-loop)** — the `shop` flow discovers
     options and retains the browser session at the search-results page WITHOUT
     adding anything (`runShoppingAgent` with `checkout: false, retainSession: true`).
     The actual add-to-cart is deferred to the human's explicit product selection
     and driven by `fulfillSelection(sessionId, productUrl, …)`, which navigates
     the retained session to the chosen product and adds ONLY that item. This
     guarantees "only the matching/selected items are added".
3. **Payment-gate detection** — identifies the merchant's payment control from
   rendered UI only (no merchant secrets). Supports Razorpay (and a generic
   fallback for unknown providers).
3. **Payment-gate detection** — identifies the merchant's payment control from
   rendered UI only (no merchant secrets). Supports Razorpay (and a generic
   fallback for unknown providers).
4. **Razorpay Test Mode card automation** (`--pay-now`) — fills the test card,
   submits, dismisses the RBI save-card dialog, clicks through the mock bank
   step, captures the merchant order confirmation, and closes stray Razorpay
   windows. **Test Mode only** — never runs against live Razorpay keys.
5. **Order confirmation capture** — after success, reads the merchant's
   confirmation page (URL, title, order id, amount, status, full text) and
   reports it instead of ending on a bare "submitted" line.
6. **Clean teardown** — closes leftover Razorpay / blank popup windows, and (in
   the `--pay-now` smoke test) disposes the retained merchant session via
   `closeMerchantPaymentSession`, which closes its browser + Stagehand so the
   process exits instead of leaving Chrome open.

7. **Session recording** — always-on video capture of the whole automation
    (disable per-call with `recordSession: false`). Records the tab with
    Playwright's native `page.screencast()`, transcodes the WebM to a real MP4,
    and writes `recordings/session-<timestamp>.mp4`.

## Razorpay Test Mode wallet flow (what the agent actually does)

Driven by `completeRazorpayTestWalletPayment` (selected via `--pay-method wallet`,
or `method: "wallet"` through `approveMerchantPayment`). Mirrors the card flow but
drives the **Wallets** payment method instead of a card form. Supported wallets
(per `payments/payment-methods/wallets.md`) that are enabled by default in Test
Mode are **MobiKwik**, **Ola Money** and **Airtel Money**; the rest require
dashboard approval. The default wallet is `olamoney` (override with `RAZORPAY_TEST_WALLET` or
`--wallet <code>`). **MobiKwik** additionally shows an OTP screen right after
selecting the wallet in Test Mode; the agent auto-fills `RAZORPAY_TEST_OTP`
(default `123456`) and clicks the **visible** verify/submit control (the OTP
form's `button[type=submit]`, e.g. the "Continue" button), with Enter-key and
`stagehand.act()` fallbacks. Ola Money and Airtel Money complete directly via the
provider mock (no OTP).

1. **Select Wallets tab** — locator-first via `clickRazorpayElement` using
   `iframe[src*="razorpay"] >> [data-testid="wallet"]` (the tab `<label>` carries
   `data-testid="wallet"` / `data-value="wallet"`; visible text "Wallet"), with a
   `stagehand.act("click the Wallets payment method tab")` fallback.
2. **Pick a wallet** — locator-first via `clickRazorpayElement` using
   `[data-value="<code>"]` (e.g. `data-value="olamoney"`), with an
   `act("click <Label> in the Wallets list")` fallback.
3. **Trigger** — selecting the wallet option is what fires the flow: Razorpay
   opens the wallet provider's **mock page** in a NEW browser window/tab at
   `…/gateway/mocksharp/payment?key_id=…` (the same shape as the card mock-bank
   window) showing Success / Failure. There is **no separate "Pay" button** for
   Ola Money / Airtel Money; an in-checkout "Pay" control is attempted
   best‑effort but is non‑fatal (the new window is the real trigger).
4. **Success** — the shared `clickRazorpayMockSuccess` helper polls for that new
   window and clicks **Success** (`button[data-val="S"]` / `button.success` /
   `button:has-text("Success")`), with a single `stagehand.act()` fallback. This
   posts the callback that fires the merchant `handler`.
5. **Confirmation + cleanup** — same as the card flow: captures the merchant
   order confirmation (`captureOrderConfirmation`) and closes stray Razorpay /
   wallet mock popups (`closeRazorpayWindows`).

The card and wallet flows share the mock-success helper and the window-detection
regexes (`razorpayActivePage`, `findMerchantPage`, `closeRazorpayWindows` all
match `wallet|mock` URLs), so a wallet provider's mock page is treated exactly
like the card mock-bank page.

## Razorpay Test Mode flow (what the agent actually does)

Driven by `completeRazorpayTestPayment` in `src/shopping-agent.ts`:

1. **Fill card** — test card from env (`RAZORPAY_TEST_CARD_NUMBER` default
   `4100 2800 0000 1007`, `RAZORPAY_TEST_CARD_CVV` default `567`,
   `RAZORPAY_TEST_CARD_EXPIRY` default `02/28`). Fields are reached via
   `page.locator()` **iframe-piercing** (`iframe[src*="razorpay"] >> input[name=…]`)
   because Stagehand's `Page` has no `.frames()` and the old frame helpers were
   dead code.
2. **Continue** — the card-form submit button reads **"Continue"**
   (`button[data-test-id="add-card-cta"]`), *not* "Pay". Clicked via locator,
   with a `stagehand.act()` fallback.
3. **Save-card dialog** — Razorpay's "Save your card as per RBI guidelines?"
   tokenization prompt appears *after* Continue. Click **"Maybe later"**
   (`button[name="pay_without_saving_card"]`) to complete payment **without an
   OTP / bank step**.
4. **Mock bank / result window** — Razorpay opens its bank/result step
   (`.../gateway/mocksharp/payment`) in a **new browser window/tab** showing
   `Success` / `Failure` buttons. The agent detects that window
   (`razorpayActivePage`), focuses it (`context.setActivePage`), and clicks
   **Success** (`button[data-val="S"]` / `button.success` / `button:has-text("Success")`),
   with a single `stagehand.act()` fallback. This posts the callback that fires
   the merchant `handler`.
5. **Confirmation + cleanup** — waits for the merchant main page to redirect to
   its order-confirmation route, captures the order details
   (`captureOrderConfirmation`), and closes stray Razorpay/blank popups
   (`closeRazorpayWindows`).

### Safety guardrails

- Only runs when `RAZORPAY_MODE === "test"` **and** the key starts with
  `rzp_test_`. Refuses otherwise.
- No live mode, no real bank/OTP interaction, no credential handling.
- The merchant `verifyPayment` server check is the real source of truth; the
  agent only drives the Test Mode UI.

## Session recording

Always-on video capture of the automation, useful for debugging a run or sharing
it. Every run records by default; disable per-call with `request.recordSession:
false`. A visible cursor + click-ripple overlay is injected into the
page so you can see exactly where the agent clicked — CDP-driven automation has
no OS cursor, so without it the screencast would look blank.

### How it works
1. **CDP attach** — Stagehand 4 does not embed Playwright and its `Page` wrapper
   has no `screencast()` method, so the agent attaches a *separate* Playwright
   client to the **same** Chrome instance Stagehand launched, over CDP
   (`chromium.connectOverCDP` using `stagehand.rpcClient.cdp.webSocketDebuggerUrl`).
2. **Capture** — `pwPage.screencast.start({ path, size })` records the underlying
   tab to a WebM (1280×800).
3. **Finalize-before-close** — the screencast is always stopped (and the Playwright
   client closed) **before** `stagehand.close()`, so the file is never corrupted
   by a mid-recording CDP teardown. For retained checkout sessions,
   `stopSessionRecording()` finalizes on `closeMerchantPaymentSession()` or on
   expiry inside `approveMerchantPayment()`.
4. **MP4 transcode** — Playwright can only record WebM, so the capture is
   transcoded to a real H.264 MP4 with the bundled `ffmpeg-static` binary (no
   system install, no cloud) and the intermediate WebM is deleted. If ffmpeg is
   unavailable, the original WebM is kept.

### Output
- `packages/agent/recordings/session-<YYYY-MM-DD_HH-mm-ss>.mp4`
- `recordings/` is gitignored.

### Demo harness
`scripts/record-web-demo.ts` exercises the exact same recording mechanism on a
normal site (Google → YouTube → "minecraft song" → play) without needing the
shopping agent or an LLM endpoint — handy for verifying capture/transcode in
isolation:

```bash
bun scripts/record-web-demo.ts
```

## Running it

```bash
# From packages/agent
bun scripts/test-local.ts --pay-now "Dark Ocean"                 # card (default)
bun scripts/test-local.ts --pay-now --pay-method wallet "Dark Ocean"          # wallet (default olamoney)
bun scripts/test-local.ts --pay-now --pay-method wallet --wallet olamoney "Dark Ocean"

# Every run records to recordings/session-<timestamp>.mp4 (MP4 via ffmpeg-static)
bun scripts/test-local.ts "gardenia under 5000"
bun scripts/test-local.ts --pay-now "Dark Ocean"
```

Expected tail output:

```
Merchant Razorpay TEST payment: submitted
  Razorpay Test Mode card payment was submitted through the merchant checkout; awaiting merchant server confirmation.

Order confirmation:
  url:      http://localhost:5173/order-confirmation
  title:    Order Confirmed | Raven Scents
  order id: RVN52FLH8XO1
  status:   Order Confirmed
  details:  Thank you for your order … Dark Ocean …

Closed 1 leftover Razorpay window(s).

# Browser closes automatically at the end of the run.
```

> Note: the confirmation page shows the Order ID (e.g. `RVN52FLH8XO1`) and
> status, but the merchant's `/order-confirmation` route does not re-display the
> paid amount — the order total is still printed earlier in the checkout
> summary (`order total: ₹1,298`). `amount` is therefore omitted from the
> confirmation block when the confirmation page doesn't expose it.
```

## Environment variables

| Var | Purpose |
| --- | --- |
| `RAZORPAY_MODE` | Must be `test`. |
| `RAZORPAY_KEY_ID` | Must start with `rzp_test_`. |
| `RAZORPAY_KEY_SECRET` | Server-side order/verify (merchant side). |
| `RAZORPAY_TEST_CARD_NUMBER` | Default `4100 2800 0000 1007`. |
| `RAZORPAY_TEST_CARD_CVV` | Default `567`. |
| `RAZORPAY_TEST_CARD_EXPIRY` | Default `02/28`. |
| `RAZORPAY_TEST_WALLET` | Wallet code for the wallet Test Mode flow. Default `olamoney`. Other default-enabled codes: `mobikwik`, `airtelmoney`. |
| `RAZORPAY_TEST_OTP` | Test OTP auto-filled for OTP-gated wallets (MobiKwik). Default `123456`. |
| `MERCHANT_ACCOUNT_EMAIL` | Local-merchant test account used to sign in before checkout (so orders aren't guest checkouts). Read by the merchant profile (e.g. Raven Scents); injected from `apps/web/.env`. |
| `MERCHANT_ACCOUNT_PASSWORD` | Password for the account above. |
| `MERCHANT_ACCOUNT_NAME` | Optional full name used when the agent provisions the test account via the Supabase admin API. |

## Debug logging

Every Razorpay step emits `[agent:…]` lines (e.g. `[agent:rzPay]`,
`[agent:fillCard]`, `[agent:clickRazorpayButton]`, `[agent:rzPay:windows]`).
`[agent:rzPay:windows]` prints every browser page the agent can see — useful
when a new Razorpay window is not being detected.

## Architecture notes

- Built on **Stagehand** (`@browserbasehq/stagehand`), local Chrome by default,
  with `openai/gpt-oss-20b` via the NVIDIA OpenAI-compatible endpoint
  (`custom-llm.ts`). (NVIDIA deprecated `meta/llama-3.1-70b-instruct` on
  2026-08-25 and its free endpoint became unusably slow; `gpt-oss-20b` is fast
  (~1-5s) on the same endpoint. It is a reasoning model, so keep `maxTokens`
  generous — reasoning tokens count against the limit.)
- `stagehand.act()` is frame-aware (works via CDP) — used as a fallback and for
  the one-shot mock-bank click. Deterministic UI steps use `page.locator()`
  (fast, no LLM).
- `AgentPage` / `AgentBrowserContext` are derived from Stagehand's `Page` /
  `BrowserContext` types (`src/browser-types.ts`; shared with the local-merchant
  engine to avoid an import cycle).
- Local/demo merchants are pluggable: the core agent is merchant-agnostic and
  all merchant specifics (URLs, cart storage shape, shipping rule, checkout
  form layout, credentials env-var names) live in pure-data profiles registered
  via `registerLocalMerchant`. The generic engine is `src/local-merchant.ts`;
  the Raven Scents sample profile is `src/merchants/raven-scents.ts`, imported
  for side-effect registration by `src/index.ts` (and directly by the smoke-test
  scripts). Add a new merchant by creating another profile module — no core
  changes needed.
- **Add-to-cart is shared and LLM-driven** — both external storefronts and local
  merchants go through `llmAddToCart` (`src/add-to-cart.ts`) rather than
  per-site regex/text matching, so a new provider works without hard-coded
  navigation. `actWithFallback` (LLM primary + LLM rephrase on failure) also
  lives there, and `src/local-merchant.ts` imports it from that module to avoid a
  `shopping-agent ↔ local-merchant` import cycle.
- Well-known storefront search shortcuts (Nike/Amazon/… presets) likewise live
  outside the core in `src/store-presets.ts` as pure data + a registry. They
  are accelerators only; unknown stores/URLs use the natural-language search
  flow or Google Shopping. Add more via `registerStorePreset()`.
