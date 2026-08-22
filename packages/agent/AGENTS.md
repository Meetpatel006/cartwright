# Cartwright Agent (`packages/agent`)

Autonomous shopping + merchant-checkout agent. It browses a store, picks the
cheapest in-budget product, runs the on-site checkout UI up to the payment gate,
and (opt-in, **Test Mode only**) completes a Razorpay card payment end-to-end.

## Capabilities

1. **Product discovery & selection** — signs in, lists in-budget products, picks
   the cheapest, adds to cart.
2. **On-site checkout** — add-to-cart → proceed-to-checkout → fill shipping →
   reach the payment gate. Stops *before* any real charge and retains a
   merchant payment session.
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

## Running it

```bash
# From packages/agent
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
| Merchant store auth (e.g. `meetpatel@gmail.com`) | Injected from `apps/web/.env`. |

## Debug logging

Every Razorpay step emits `[agent:…]` lines (e.g. `[agent:rzPay]`,
`[agent:fillCard]`, `[agent:clickRazorpayButton]`, `[agent:rzPay:windows]`).
`[agent:rzPay:windows]` prints every browser page the agent can see — useful
when a new Razorpay window is not being detected.

## Architecture notes

- Built on **Stagehand** (`@browserbasehq/stagehand`), local Chrome by default,
  with `meta/llama-3.1-70b-instruct` via the NVIDIA OpenAI-compatible endpoint
  (`custom-llm.ts`).
- `stagehand.act()` is frame-aware (works via CDP) — used as a fallback and for
  the one-shot mock-bank click. Deterministic UI steps use `page.locator()`
  (fast, no LLM).
- `AgentPage` / `AgentBrowserContext` are derived from Stagehand's `Page` /
  `BrowserContext` types (`src/shopping-agent.ts` top of file).
