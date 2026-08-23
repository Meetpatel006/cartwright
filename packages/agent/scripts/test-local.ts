/**
 * Manual smoke test for the shopping agent on a LOCAL browser (no Browserbase cost).
 *
 * Usage:
 *   bun scripts/test-local.ts                                  # local Raven merchant (default)
 *   bun scripts/test-local.ts "gardenia under 5000"            # Raven, custom query
 *   bun scripts/test-local.ts --store nike "running shoes under 10000"
 *   bun scripts/test-local.ts --url https://www.adidas.com "ultraboost"
 *   bun scripts/test-local.ts --store amazon "wireless headphones under $100"
 *   bun scripts/test-local.ts --pay-now --pay-method wallet "Dark Ocean"
 *   bun scripts/test-local.ts --pay-now --pay-method wallet --wallet mobikwik "Dark Ocean"
 *
 * Default store is the local Raven merchant (http://localhost:5173) so the plain
 * command works with no external bot-walls and no cost. External stores (Google
 * Shopping, Nike, Amazon, ...) are prone to blocking automated browsers.
 *
 * Built-in stores: raven, nike, amazon, amazon-in, adidas, walmart, flipkart
 * Or pass any --url and the agent will navigate there and drive the search box via LLM.
 * Any store/URL not listed falls back to a natural-language "find the search box" flow.
 *
 * Requirements (set in apps/web/.env or your shell):
 * - Chrome/Chromium installed on this machine
 * - AGENT_LLM_BASE_URL, AGENT_LLM_MODEL and AGENT_LLM_API_KEY pointing at an
 *   OpenAI-compatible endpoint
 * - For the default Raven run: the merchant dev server running on localhost:5173
 */
import { approveMerchantPayment, closeMerchantPaymentSession, parseBudget, runShoppingAgent } from "../src/shopping-agent";
import { createOrder } from "../src/razorpay";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load apps/web/.env so the AGENT_* vars work without shell exports
dotenv.config({ path: fileURLToPath(new URL("../../../apps/web/.env", import.meta.url)) });

// ── Parse CLI args ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let store: string | undefined;
let storeUrl: string | undefined;
let query: string | undefined;
let exactBasket = false;
let standaloneRazorpayTest = false;
let payNow = false;
let payMethod = "card";
let payWallet = "";

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const next = args[i + 1];
  if (arg === "--store" && next) {
    store = next;
    i++;
  } else if (arg === "--raven-test-basket") {
    exactBasket = true;
  } else if (arg === "--standalone-razorpay-test") {
    standaloneRazorpayTest = true;
  } else if (arg === "--pay-now") {
    payNow = true;
  } else if (arg === "--pay-method" && next) {
    payMethod = next.toLowerCase();
    i++;
  } else if (arg === "--wallet" && next) {
    payWallet = next.toLowerCase();
    i++;
  } else if (arg === "--url" && next) {
    storeUrl = next;
    i++;
  } else if (arg && !arg.startsWith("--")) {
    query = arg;
  }
}

// When no store/URL is supplied, default to the local Raven merchant
// (http://localhost:5173) so the plain `bun scripts/test-local.ts` works without
// hitting external bot-walls (Google Shopping blocks automated browsers) or incurring
// Browserbase cost. The default query is a Raven product so results are non-empty.
if (!store && !storeUrl) {
  store = "raven";
}

query = exactBasket ? "2 Gardenia and 3 Bad Boy" : (query ?? "gardenia under 5000");

if (!process.env.AGENT_LLM_BASE_URL || !process.env.AGENT_LLM_MODEL) {
  console.error(
    "Missing AGENT_LLM_BASE_URL / AGENT_LLM_MODEL — set them in apps/web/.env or your shell.",
  );
  process.exit(1);
}

const targetStore = storeUrl ?? store;
const storeLabel = targetStore ?? "google-shopping";
const ravenGardenia = targetStore?.toLowerCase() === "raven" ? query.match(/(?:(\d+)\s+)?gardenia/i) : null;
const ravenDarkOcean = targetStore?.toLowerCase() === "raven" ? query.match(/(?:(\d+)\s+)?dark\s+ocean/i) : null;
const ravenBadBoy = targetStore?.toLowerCase() === "raven" ? query.match(/(?:(\d+)\s+)?bad\s+boy/i) : null;
const ravenBasket = exactBasket
  ? [{ name: "Gardenia", quantity: 2 }, { name: "Bad Boy", quantity: 3 }]
  : [
    ...(ravenGardenia ? [{ name: "Gardenia", quantity: Number(ravenGardenia[1] ?? 1) }] : []),
    ...(ravenDarkOcean ? [{ name: "Dark Ocean", quantity: Number(ravenDarkOcean[1] ?? 1) }] : []),
    ...(ravenBadBoy ? [{ name: "Bad Boy", quantity: Number(ravenBadBoy[1] ?? 1) }] : []),
    ];
const budget = parseBudget(
  query,
  targetStore?.toLowerCase() === "raven" ? "INR" : "USD",
) ?? { amountInMinor: 1_000_000, currency: "INR" };

console.log(`Running shopping agent: "${query}" on ${storeLabel} (budget ${budget.currency} ${(budget.amountInMinor / 100).toLocaleString()})`);

const result = await runShoppingAgent({
  query: exactBasket ? "2 Gardenia and 3 Bad Boy" : query,
  budgetInMinor: budget.amountInMinor,
  currency: budget.currency,
  mode: "local",
  store: targetStore,
  ...(ravenBasket.length > 0 && { basket: ravenBasket }),
  ...(payNow && { preserveCheckoutSession: true }),
  llm: {
    baseURL: process.env.AGENT_LLM_BASE_URL,
    model: process.env.AGENT_LLM_MODEL,
    apiKey: process.env.AGENT_LLM_API_KEY,
    ...(process.env.AGENT_LLM_API_KEY_FALLBACK && {
      apiKeys: [process.env.AGENT_LLM_API_KEY, process.env.AGENT_LLM_API_KEY_FALLBACK].filter(
        Boolean,
      ) as string[],
    }),
    // Bound each LLM call so a slow/stalling request fails over to the next
    // key (and retries) quickly instead of hanging for minutes and letting the
    // browser frame go stale (which surfaces as CDP "Frame not found" errors).
    timeoutMs: 120_000,
    maxTokens: 4096,
    debug: process.env.AGENT_DEBUG === "true" || process.env.AGENT_DEBUG === "1",
    ...(process.env.AGENT_LLM_EXTRA_BODY && {
      extraBody: JSON.parse(process.env.AGENT_LLM_EXTRA_BODY) as Record<string, unknown>,
    }),
  },
});

if (result.error) {
  console.error("Agent error:", result.error);
  process.exit(1);
}

console.log(`Found ${result.matches.length} product(s) under budget on ${result.store} (${result.currency}):`);
for (const match of result.matches) {
  console.log(`  - ${match.name} | ${match.price} | ${match.url ?? ""}`);
}

if (result.picked) {
  console.log(`\nCheapest pick: ${result.picked.name} at ${result.picked.price}`);
}

if (result.checkout) {
  console.log(`\nOn-site checkout: ${result.checkout.status}`);
  for (const step of result.checkout.steps) {
    console.log(`  - ${step.action}: ${step.status}${step.detail ? ` (${step.detail})` : ""}`);
  }
  if (result.checkout.orderSummary?.total) {
    console.log(`  order total: ${result.checkout.orderSummary.total}`);
  }
}

if (payNow) {
  if (process.env.RAZORPAY_MODE !== "test" || !process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_")) {
    console.error("Refusing Pay Now test: RAZORPAY_MODE must be 'test' and the key must start with 'rzp_test_'.");
    process.exitCode = 1;
  } else if (!result.sessionId) {
    console.error("Pay Now test stopped: the merchant payment gate was not retained.");
    process.exitCode = 1;
  } else {
    // Let --wallet override the default wallet code (otherwise the agent reads
    // RAZORPAY_TEST_WALLET from the environment, defaulting to MobiKwik).
    if (payWallet) process.env.RAZORPAY_TEST_WALLET = payWallet;
    const method = payMethod === "wallet" ? "wallet" : "card";
    const walletNote = method === "wallet" ? ` via wallet ${process.env.RAZORPAY_TEST_WALLET ?? "olamoney"}` : "";
    console.log(`\nPaying with Razorpay Test Mode (method=${method}${walletNote})…`);
    const payment = await approveMerchantPayment(result.sessionId, { completeTestPayment: true, method });
    console.log(`\nMerchant Razorpay TEST payment: ${payment.status}`);
    console.log(`  ${payment.message}`);
    if (payment.orderConfirmation) {
      const oc = payment.orderConfirmation;
      console.log(`\nOrder confirmation:`);
      if (oc.url) console.log(`  url:      ${oc.url}`);
      if (oc.title) console.log(`  title:    ${oc.title}`);
      if (oc.orderId) console.log(`  order id: ${oc.orderId}`);
      if (oc.amount) console.log(`  amount:   ₹${oc.amount}`);
      if (oc.statusText) console.log(`  status:   ${oc.statusText}`);
      if (oc.text) console.log(`  details:\n    ${oc.text.replace(/\n/g, "\n    ")}`);
    } else {
      console.log(`\nOrder confirmation: none captured`);
    }
    if (payment.closedWindows) console.log(`\nClosed ${payment.closedWindows} leftover Razorpay window(s).`);
    if (payment.status === "failed" || payment.status === "expired" || payment.status === "not_found") {
      process.exitCode = 1;
    }
    // Tear down the retained merchant session so Chrome + Stagehand close and
    // the process exits cleanly instead of leaving the browser open.
    await closeMerchantPaymentSession(result.sessionId).catch(() => {});
  }
}

if (standaloneRazorpayTest && exactBasket && result.checkout?.orderSummary?.total) {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error("Razorpay test keys are missing; basket test completed without creating a payment order.");
    process.exitCode = 1;
  } else if (process.env.RAZORPAY_MODE !== "test" || !process.env.RAZORPAY_KEY_ID.startsWith("rzp_test_")) {
    console.error("Refusing standalone payment test: RAZORPAY_MODE must be 'test' and the key must start with rzp_test_.");
    process.exitCode = 1;
  } else {
    const razorpayOrder = await createOrder(
      { keyId: process.env.RAZORPAY_KEY_ID, keySecret: process.env.RAZORPAY_KEY_SECRET },
      {
        amountInMinor: 369500,
        currency: "INR",
        receipt: `cartwright-raven-basket-${Date.now()}`,
        notes: {
          source: "cartwright-local-agent-test",
          basket: "Gardenia x2, Bad Boy x3",
        },
      },
    );
    console.log(`\nRazorpay TEST order created for the exact basket: ${razorpayOrder.id}`);
    console.log("Open the web /shopper flow to complete checkout.js payment and server verification.");
  }
}

if (exactBasket && !standaloneRazorpayTest) {
  console.log("\nMerchant payment order was not created by the local smoke test. The black-box merchant must expose its own payment gate.");
}
