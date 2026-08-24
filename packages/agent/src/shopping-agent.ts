import {
  browserbase,
  localBrowser,
  Stagehand,
} from "@browserbasehq/stagehand";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import { mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { z } from "zod";

import { createOpenAICompatibleLLM, type CustomModelEndpoint } from "./custom-llm";
import { liveBrowserSessionRegistry } from "./browser-session-registry";
import { parseCheckoutTotal } from "./checkout-total";

// ── Schemas ──────────────────────────────────────────────────────────────────

/**
 * Product listing extracted from a search-results page.
 * `price` is the human-readable string (kept for display); `priceValue` is the
 * numeric value in MAJOR units (e.g. 49.99 for $49.99, 7995 for ₹7,995) so the
 * agent can compare it against the budget without currency gymnastics.
 * `currency` (ISO 4217) and `url` are best-effort and kept optional so a single
 * store missing one field never fails extraction.
 */
const ProductListSchema = z.object({
  products: z.array(
    z.object({
      name: z.string().describe("the product title or name"),
      price: z.string().describe("the price as displayed, including currency symbol"),
      priceValue: z
        .number()
        .describe("the numeric price in MAJOR units of the store currency, without symbols or separators (e.g. 49.99 or 7995)"),
      currency: z
        .string()
        .describe("ISO 4217 currency code inferred from the page, e.g. USD, EUR, INR, GBP")
        .optional(),
      rating: z.number().describe("average star rating 0-5 if visible").optional(),
      availability: z
        .string()
        .describe("stock status if visible, e.g. 'In Stock', 'Only 3 left'")
        .optional(),
      url: z.string().describe("the absolute product page URL if visible").optional(),
    }),
  ),
});

export type Product = z.infer<typeof ProductListSchema>["products"][number];

/** Order summary extracted from a checkout page (best-effort). */
const OrderSummarySchema = z.object({
  items: z
    .array(z.object({ name: z.string(), price: z.string() }))
    .describe("line items in the cart/order")
    .optional(),
  subtotal: z.string().optional(),
  tax: z.string().optional(),
  shipping: z.string().optional(),
  total: z.string().optional(),
});

export type OrderSummary = z.infer<typeof OrderSummarySchema>;

// ── Store presets ─────────────────────────────────────────────────────────────
// Each preset defines how to reach the store's search results page.
// `searchMode: "url"` navigates directly to a constructed URL (fast, deterministic).
// `searchMode: "act"` navigates to the homepage and lets the LLM drive the search box
//   (works on ANY site — this is the generic fallback for unknown stores/URLs).

export interface StorePreset {
  /** Display name */
  name: string;
  /** Base URL of the store (e.g. "https://www.nike.com") */
  baseUrl: string;
  /** How to reach search results. "url" = construct search URL from pattern. */
  searchMode: "url" | "act";
  /** When searchMode is "url", a template with {query} placeholder. */
  searchUrlTemplate?: string;
  /** When searchMode is "act", the URL to navigate to before driving the search box */
  actBaseUrl?: string;
}

/**
 * Well-known stores used as *accelerators*. Any store not listed here — or any
 * full URL — falls through to the natural-language ("act") search path, so the
 * agent is not limited to this list. Add more presets as needed.
 */
export const STORES: Record<string, StorePreset> = {
  nike: {
    name: "Nike",
    baseUrl: "https://www.nike.com",
    searchMode: "url",
    // Real Nike search route (the old /in/catalogsearch URL was a Magento pattern and 404'd).
    searchUrlTemplate: "https://www.nike.com/w?q={query}",
  },
  amazon: {
    name: "Amazon",
    baseUrl: "https://www.amazon.com",
    searchMode: "url",
    searchUrlTemplate: "https://www.amazon.com/s?k={query}",
  },
  "amazon-in": {
    name: "Amazon India",
    baseUrl: "https://www.amazon.in",
    searchMode: "url",
    searchUrlTemplate: "https://www.amazon.in/s?k={query}",
  },
  adidas: {
    name: "Adidas",
    baseUrl: "https://www.adidas.com",
    searchMode: "url",
    searchUrlTemplate: "https://www.adidas.com/us/search?q={query}",
  },
  walmart: {
    name: "Walmart",
    baseUrl: "https://www.walmart.com",
    searchMode: "url",
    searchUrlTemplate: "https://www.walmart.com/search?q={query}",
  },
  flipkart: {
    name: "Flipkart",
    baseUrl: "https://www.flipkart.com",
    searchMode: "act",
    actBaseUrl: "https://www.flipkart.com",
  },
  // Sample merchant built for the buildathon (Raven-Scents). The search box lives
  // on /shop (client-side filtering), so actBaseUrl points there — the agent drives
  // the *visual* search box instead of constructing a URL query parameter.
  raven: {
    name: "Raven Scents",
    baseUrl: "http://localhost:5173",
    searchMode: "act",
    actBaseUrl: "http://localhost:5173/shop",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Tokenize a product name for fuzzy matching (collapse adjacent repeats). */
function nameTokens(name: string): string[] {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const collapsed: string[] = [];
  for (const token of tokens) {
    if (collapsed[collapsed.length - 1] !== token) collapsed.push(token);
  }
  return collapsed;
}

/**
 * Resolve a product's real URL by fuzzy-matching its name against the text of
 * every anchor on the page. Runs over ALL links (not a brittle per-site regex)
 * so it stays general across stores. Returns undefined when nothing scores high
 * enough — callers must tolerate a missing URL.
 */
function bestUrlFor(name: string, links: { text: string; href: string }[]): string | undefined {
  const nameSet = new Set(nameTokens(name));
  let best: { href: string; score: number } | undefined;
  for (const link of links) {
    const linkTokens = new Set(nameTokens(link.text));
    let overlap = 0;
    for (const token of nameSet) if (linkTokens.has(token)) overlap++;
    const score = overlap / Math.max(1, Math.min(nameSet.size, linkTokens.size));
    if (!best || score > best.score) best = { href: link.href, score };
  }
  return best && best.score >= 0.5 ? best.href : undefined;
}

/**
 * The model's extract may return a relative product path (e.g. "/product/x" or
 * "product/x"). page.goto rejects those with "Cannot navigate to invalid URL",
 * so resolve against the store origin. Absolute URLs (incl. other domains)
 * pass through unchanged.
 */
function resolveAbsoluteUrl(url: string, base: string): string {
  if (!url) return base;
  const trimmed = url.trim();
  // Only treat values that look like real URLs / path-relative refs as URLs.
  // The model sometimes emits a placeholder (e.g. the literal "None", "null",
  // "N/A") when it can't see a product link — passing that to `new URL` would
  // resolve it as a path segment (localhost:5173/None). Reject such junk and
  // fall back to `base` instead of producing a bogus URL.
  if (!/^(https?:\/\/|\/|\.\/|\.\.\/|#|mailto:)/i.test(trimmed)) return base;
  try {
    const origin = new URL(base).origin;
    return new URL(trimmed, `${origin}/`).href;
  } catch {
    return url;
  }
}

// ── Budget parsing (currency-aware) ──────────────────────────────────────────
// `ParsedBudget` and `parseBudget` now live in `request/budget.ts` so the Part B
// request parser can reuse them without pulling in the Stagehand runtime. They
// are re-exported here to keep the `@cartwright/agent` public surface stable.
export { parseBudget, type ParsedBudget } from "./request/budget";

// ── Types ────────────────────────────────────────────────────────────────────

/** Browser backend for the shopping agent */
export type AgentBrowserMode = "local" | "browserbase";

export interface ShoppingRequest {
  /** Natural-language product query, e.g. "running shoes", "airpods pro" */
  query: string;
  /** Hard budget cap in the currency's MINOR units (cents for $, paise for ₹, etc.);
   *  products above this are filtered out. */
  budgetInMinor: number;
  /** ISO 4217 currency of `budgetInMinor` (e.g. "USD", "INR"). */
  currency: string;
  /** Which browser backend to run on. "local" launches Chrome on this machine (free);
   *  "browserbase" runs a cloud session (requires browserbaseApiKey). */
  mode: AgentBrowserMode;
  /** Required when mode is "browserbase" */
  browserbaseApiKey?: string;
  /** Required when mode is "local" — any OpenAI-compatible LLM endpoint (BYOK) */
  llm?: CustomModelEndpoint;
  /** Target store. Either a key from STORES (e.g. "nike", "amazon") or a full URL
   *  like "https://www.nike.com". When omitted, the agent falls back to Google Shopping. */
  store?: string;
  /** Whether to attempt on-site add-to-cart / proceed-to-checkout UI actions after
   *  picking a product. Defaults to true. The agent NEVER enters payment details —
   *  checkout stops at the order-summary step pending human approval (see gatePurchase). */
  checkout?: boolean;
  /** Exact multi-item basket used by deterministic local-merchant tests. */
  basket?: Array<{ name: string; quantity: number }>;
  /** Keep a merchant checkout session alive for an explicit approval action. */
  preserveCheckoutSession?: boolean;
  /** Record the automation to recordings/session-YYYY-MM-DD_HH-mm-ss.mp4 using
   *  Playwright's native page.screencast() (WebM), transcoded to MP4 afterward.
   *  Also toggled via RECORD_SESSION=true. */
  recordSession?: boolean;
  /** AbortSignal for top-level timeout/cancellation. When the signal fires,
   *  the agent stops browser work and returns with an error. */
  signal?: AbortSignal;
}

export interface CheckoutStep {
  action: string;
  status: "done" | "failed" | "skipped";
  detail?: string;
}

export interface CheckoutResult {
  status: "skipped" | "added_to_cart" | "checkout_reached" | "failed";
  steps: CheckoutStep[];
  orderSummary?: OrderSummary;
  /** Whether the amount came from the merchant page or the requested test basket. */
  orderSummarySource?: "merchant" | "basket";
  /** Payment control detected from the rendered merchant UI. */
  paymentGate?: PaymentGate;
  error?: string;
}

export interface PaymentGate {
  provider: "razorpay" | "unknown";
  label: string;
}

export interface BasketItem {
  name: string;
  quantity: number;
  price: string;
  priceValue: number;
  currency: string;
  url?: string;
}

export interface ShoppingResult {
  sessionId?: string;
  /** Provider session handle (Browserbase session id when available, else the
   *  local registry key). Persisted by the API for recovery/reconnect. */
  providerSessionId?: string;
  query: string;
  store: string;
  currency: string;
  budgetInMinor: number;
  matches: Product[];
  picked?: Product;
  /** Exact basket requested for a deterministic local-merchant run. */
  basket?: BasketItem[];
  /** Result of the on-site add-to-cart / checkout UI actions (when enabled). */
  checkout?: CheckoutResult;
  error?: string;
}

// ── Store resolution ─────────────────────────────────────────────────────────

function resolveStore(store?: string): StorePreset {
  if (!store) {
    return {
      name: "Google Shopping",
      baseUrl: "https://www.google.com",
      searchMode: "url",
      searchUrlTemplate: "https://www.google.com/search?q={query}&tbm=shop",
    };
  }
  // Check if it's a preset key
  const preset = STORES[store.toLowerCase()];
  if (preset) return preset;
  // Check if it's a full URL — drive the search box via natural language (generic).
  try {
    const url = new URL(store);
    return {
      name: url.hostname,
      baseUrl: url.origin,
      searchMode: "act",
      actBaseUrl: url.origin,
    };
  } catch {
    // Not a valid URL — treat as a search term and fall back to Google Shopping
    return {
      name: "Google Shopping",
      baseUrl: "https://www.google.com",
      searchMode: "url",
      searchUrlTemplate: `https://www.google.com/search?q=${encodeURIComponent(store)}+${encodeURIComponent(store)}&tbm=shop`,
    };
  }
}

// ── Account login (so the order is tied to a user, not a guest) ────────────────
// The merchant's checkout attributes the order to the logged-in user (the request
// carries the Supabase session). We sign in through the real /login UI with the
// provided credentials so the browser holds a valid session; the cart then syncs
// to that user and the placed order is attributed to the account.
const TEST_ACCOUNT_EMAIL = "meetpatel@gmail.com";
const TEST_ACCOUNT_PASSWORD = "12345678";

async function ensureAccount(
  page: AgentPage,
  _stagehand: Stagehand,
  store: StorePreset,
): Promise<void> {
  // Only relevant for the local Raven merchant (it has its own auth/login).
  if (!store.baseUrl.includes("localhost")) {
    console.log("[agent] external store — skipping account login (guest checkout)");
    return;
  }
  const loginUrl = `${new URL(store.baseUrl).origin}/login`;

  // Fill + submit the login form exactly (native setter so React registers it),
  // then wait for navigation away from /login (success lands on /shop).
  const loginViaUI = async (): Promise<boolean> => {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", 10_000).catch(() => {});
    for (let i = 0; i < 20; i++) {
      if (await page.evaluate(`!!document.querySelector('input[type="email"]')`)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    await page.evaluate(`
      (function () {
        function set(el, val) {
          if (!el) return;
          var d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
          d.set.call(el, val);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        set(document.querySelector('input[type="email"]'), ${JSON.stringify(TEST_ACCOUNT_EMAIL)});
        set(document.querySelector('input[type="password"]'), ${JSON.stringify(TEST_ACCOUNT_PASSWORD)});
      })();
    `);
    await page.evaluate(`document.querySelector('button[type="submit"]')?.click();`);
    for (let i = 0; i < 30; i++) {
      if (!(await page.evaluate(`location.pathname.includes("/login")`))) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  };

  try {
    const ok = await loginViaUI();
    if (!ok) {
      // Account missing/unconfirmed — create a confirmed one via the Auth admin
      // API using the same credentials, then retry the login.
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && serviceKey) {
        await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: TEST_ACCOUNT_EMAIL,
            password: TEST_ACCOUNT_PASSWORD,
            email_confirm: true,
            user_metadata: { full_name: "Meet Patel" },
          }),
        }).catch(() => {});
        await loginViaUI();
      }
    }
    console.log(`[agent] signed in as ${TEST_ACCOUNT_EMAIL} (landed at ${await page.url()})`);
  } catch (e) {
    console.warn(`[agent] login failed — continuing as guest: ${(e as Error).message}`);
  }
}

// ── Checkout (on-site UI actions, no payment) ────────────────────────────────

/**
 * Try a primary natural-language action, falling back to an alternative phrasing
 * if the first fails. Returns true if either succeeded. This is the lightweight
 * recovery layer — for state-changing UI steps we never blindly retry, we just
 * try a different description of the same intent.
 */
type AgentBrowser = Awaited<ReturnType<typeof localBrowser.launch>>;
type AgentBrowserContext = AgentBrowser["context"];
type AgentPage = Exclude<Awaited<ReturnType<AgentBrowserContext["pages"]>>[number], undefined>;
type BrowserRoot = Pick<AgentPage, "locator">;

export interface MerchantPaymentSession {
  browser: AgentBrowser;
  stagehand: Stagehand;
  page: AgentPage;
  createdAt: number;
  /** Optional Playwright client + target page used for session recording. */
  recording?: {
    pwBrowser: import("playwright").Browser;
    pwPage: import("playwright").Page;
    path: string;
  };
}

/**
 * Finalize the recording attached to a retained session (if any) BEFORE
 * Stagehand/browser teardown, so the .webm is flushed to disk. Safe to call
 * when no recording is attached.
 */
async function stopSessionRecording(session: MerchantPaymentSession): Promise<void> {
  if (!session.recording) return;
  try {
    await session.recording.pwPage.screencast.stop();
  } catch {
    /* ignore teardown errors */
  }
  try {
    await session.recording.pwBrowser.close();
  } catch {
    /* ignore teardown errors */
  }
  // Playwright records WebM only; transcode to a real MP4 for the final file.
  const finalPath = await transcodeWebmToMp4(session.recording.path);
  if (finalPath) session.recording.path = finalPath;
  console.log(`[agent] session recording saved → ${session.recording.path}`);
}

/** Read the documented Browserbase session id (undefined for LOCAL runs). */
function getProviderSessionId(stagehand: Stagehand): string | undefined {
  return (stagehand as { browserbaseSessionID?: string }).browserbaseSessionID;
}

export interface RetainedSession {
  /** Internal registry key (handle to the live instance in this process). */
  sessionId: string;
  /** Provider session handle for durable recovery/reconnect. */
  providerSessionId: string;
}

function retainMerchantPaymentSession(
  browser: AgentBrowser,
  stagehand: Stagehand,
  page: AgentPage,
  recording?: MerchantPaymentSession["recording"],
  requestedId?: string,
): RetainedSession {
  const sessionId = requestedId ?? `merchant-${randomUUID()}`;
  const providerSessionId = getProviderSessionId(stagehand) ?? sessionId;
  liveBrowserSessionRegistry.register(sessionId, {
    browser,
    stagehand,
    page,
    createdAt: Date.now(),
    ...(recording ? { recording } : {}),
  });
  return { sessionId, providerSessionId };
}

async function actWithFallback(
  page: AgentPage,
  context: AgentBrowserContext,
  stagehand: Stagehand,
  primary: string,
  fallback: string,
): Promise<boolean> {
  const run = async (instruction: string): Promise<boolean> => {
    // Stagehand v4 resolves AI actions against the active page. Re-select the
    // page after navigation/SPA transitions so it does not keep an old frame
    // snapshot and fail with Accessibility.getFullAXTree frameId errors.
    await context.setActivePage(page);
    await page.waitForTimeout(250).catch(() => {});

    const result = await stagehand.act(instruction);
    return result.data.success && result.data.actions.length > 0;
  };

  try {
    if (await run(primary)) return true;
    console.warn(`[agent] primary action returned no actionable result ("${primary}")`);
  } catch (err) {
    console.warn(`[agent] primary action failed ("${primary}"): ${(err as Error).message}`);
    // A thrown CDP/navigation error means the page state is not trustworthy;
    // do not issue a second state-changing action against the same frame.
    return false;
  }

  try {
    if (await run(fallback)) return true;
    console.warn(`[agent] fallback action returned no actionable result ("${fallback}")`);
  } catch (err) {
    console.warn(`[agent] fallback action failed ("${fallback}"): ${(err as Error).message}`);
  }
  return false;
}

async function clickVisibleTextRoot(root: BrowserRoot, pattern: RegExp): Promise<boolean> {
  for (const selector of ["button", '[role="button"]', "a"]) {
    const elements = root.locator(selector);
    const count = await elements.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 100); i++) {
      const element = elements.nth(i);
      const text = await element.innerText().catch(() => "");
      if (pattern.test(text) && (await element.isVisible().catch(() => false))) {
        await element.click();
        return true;
      }
    }
  }
  return false;
}

async function clickVisibleText(page: AgentPage, pattern: RegExp): Promise<boolean> {
  return clickVisibleTextRoot(page, pattern);
}

/**
 * Real Razorpay DOM inspection via page.evaluate().
 *
 * ROOT-CAUSE NOTE: Stagehand's `Page` is an RPC wrapper with NO `.frames()`
 * method (see @browserbasehq/stagehand dist/index.d.mts — `Page` exposes only
 * locator / evaluate / waitForSelector / snapshot / etc.). The old code called
 * `page.frames()`, which is `undefined`, so every frame helper silently returned
 * an EMPTY list and the card form was never found. We inspect the DOM directly
 * instead. This reads the MAIN document and SAME-ORIGIN iframe contents; a
 * cross-origin iframe's inner DOM is unreadable from evaluate, but its element
 * (src / name / id) is still visible — enough to confirm Razorpay mounted.
 */
async function inspectRazorpayDom(page: AgentPage, label: string): Promise<void> {
  try {
    // Bound the evaluate with a timeout race: if the page/CDP is dead (e.g. a
    // resumed checkout session whose browser was reclaimed), page.evaluate would
    // otherwise hang forever with no rejection. Fail fast instead.
    const info = (await Promise.race([
      page.evaluate(`
      (() => {
        const iframes = Array.from(document.querySelectorAll("iframe")).map((f) => {
          let innerCard = false;
          let innerInputs = 0;
          try {
            const doc = f.contentDocument;
            if (doc) {
              innerInputs = doc.querySelectorAll("input").length;
              innerCard = !!doc.querySelector(
                'input[name="card.number"], input[autocomplete="cc-number"], input[placeholder*="card" i]'
              );
            }
          } catch (e) { /* cross-origin — inner DOM unreadable */ }
          return {
            src: f.src || "",
            name: f.name || "",
            id: f.id || "",
            sameOriginReadable: innerInputs > 0 || innerCard,
            innerCard: innerCard,
            innerInputs: innerInputs,
          };
        });
        const mainCard = !!document.querySelector(
          'input[name="card.number"], input[autocomplete="cc-number"], input[placeholder*="card" i]'
        );
        const mainInputs = document.querySelectorAll("input").length;
        return { iframes: iframes, mainCard: mainCard, mainInputs: mainInputs, count: iframes.length };
      })()
    `),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("inspectRazorpayDom evaluate timed out (page/CDP unresponsive)")),
          10_000,
        ),
      ),
    ])) as {
      iframes: { src: string; name: string; id: string; sameOriginReadable: boolean; innerCard: boolean; innerInputs: number }[];
      mainCard: boolean;
      mainInputs: number;
      count: number;
    };
    console.log(
      `[agent:${label}] DOM iframes=${info.count} mainCardInput=${info.mainCard} mainInputs=${info.mainInputs}`,
    );
    for (const f of info.iframes) {
      const tag = f.innerCard ? "⚡CARD" : f.sameOriginReadable ? "•same" : "·xorig";
      console.log(
        `  ${tag} src="${f.src}" name="${f.name}" id="${f.id}" innerInputs=${f.innerInputs}`,
      );
    }
  } catch (e) {
    console.warn(`[agent:${label}] inspectRazorpayDom failed: ${(e as Error).message}`);
  }
}

/**
 * Attempt a deterministic fill via Stagehand's `page.locator()` using
 * iframe-piercing CSS (`iframe >> input...`). Works for same-origin iframes and
 * may reach cross-origin ones if Stagehand forwards to Playwright's frameLocator.
 * Returns true only if ALL of card / expiry / CVV were filled.
 */
async function fillViaLocators(
  page: AgentPage,
  number: string,
  expiry: string,
  cvv: string,
): Promise<boolean> {
  const cardSel =
    'input[name="card.number"], input[autocomplete="cc-number"], input[placeholder*="Card Number" i], input[inputmode="numeric"][maxlength]';
  const expSel =
    'input[name="card.expiry"], input[autocomplete="cc-exp"], input[placeholder*="MM" i], input[placeholder*="Expiry" i]';
  const cvvSel =
    'input[name="card.cvv"], input[autocomplete="cc-cvv"], input[autocomplete="cc-csc"], input[placeholder*="CVV" i]';

  const pierce = (sel: string) => [
    sel,
    `iframe[src*="razorpay"] >> ${sel}`,
    `iframe >> ${sel}`,
    `iframe >> iframe >> ${sel}`,
  ];

  const fillOne = async (sel: string, value: string): Promise<boolean> => {
    for (const s of pierce(sel)) {
      try {
        const loc = page.locator(s);
        if ((await loc.count()) > 0) {
          await loc.first().click().catch(() => {});
          try {
            await loc.first().fill(value);
          } catch {
            await loc.first().type(value);
          }
          return true;
        }
      } catch {
        /* try next pierce variant */
      }
    }
    return false;
  };

  console.log(`[agent:fillViaLocators] ▶ card number via locators…`);
  if (!(await fillOne(cardSel, number))) {
    console.log(`[agent:fillViaLocators] ✘ card number not reachable via locators`);
    return false;
  }
  console.log(`[agent:fillViaLocators] ✔ card number filled; waiting for expiry/CVV mount…`);
  await page.waitForTimeout(2_000).catch(() => {});
  const exp = await fillOne(expSel, expiry);
  const cv = await fillOne(cvvSel, cvv);
  console.log(`[agent:fillViaLocators] expiry=${exp} cvv=${cv}`);
  return exp && cv;
}

/**
 * Click a Razorpay button via Stagehand's `page.locator()` with iframe-piercing
 * CSS — the SAME mechanism that successfully fills the card inputs, so it
 * reliably reaches the button inside the cross-origin Razorpay iframe.
 *
 * IMPORTANT (root-cause of earlier "no button matched"): Playwright parses
 * `iframe >> a, b` as `(iframe >> a) OR (b)` — the `>>` piercing applies ONLY to
 * the first comma alternative, so a `button:has-text("Continue")` on the MAIN
 * page never finds the button living inside the iframe. We therefore pierce
 * EACH selector individually instead of joining them with commas.
 *
 * `selectors` are full button selectors (text or attribute), e.g.
 * `button[data-test-id="add-card-cta"]` or `button:has-text("Continue")`.
 * Returns true if a matching, clickable button was found and clicked.
 */
async function clickRazorpayButton(page: AgentPage, selectors: string[]): Promise<boolean> {
  const pierce = (inner: string) => [
    `iframe[src*="razorpay"] >> ${inner}`,
    `iframe >> ${inner}`,
    inner,
    `iframe >> iframe >> ${inner}`,
  ];
  for (const sel of selectors) {
    for (const v of pierce(sel)) {
      try {
        const loc = page.locator(v);
        const count = await loc.count();
        if (count > 0) {
          console.log(`[agent:clickRazorpayButton] ▶ clicking "${v}" (count=${count})`);
          await loc.first().click().catch(async () => {
            await loc.first().click();
          });
          return true;
        }
      } catch {
        /* try next variant */
      }
    }
  }
  console.log(`[agent:clickRazorpayButton] ✘ no button matched: ${selectors.join(" | ")}`);
  return false;
}

/**
 * Click the FIRST *visible* element matching `selector` (pierced into the
 * Razorpay iframe). Unlike `clickRazorpayButton`, this skips hidden matches, so
 * it is safe to aim at a broad selector like `button[type="submit"]` — only the
 * visible (real) control gets clicked, never the hidden form-submits elsewhere
 * in the iframe. Returns true if a visible element was clicked.
 */
async function clickFirstVisible(page: AgentPage, selector: string): Promise<boolean> {
  try {
    const loc = page.locator(selector);
    const n = await loc.count();
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) {
        console.log(`[agent:clickFirstVisible] ▶ clicking visible "${selector}" #${i}`);
        await el.click().catch(async () => {
          await el.click();
        });
        return true;
      }
    }
  } catch {
    /* ignore — caller falls through to the next strategy */
  }
  return false;
}

/**
 * Generalized version of `clickRazorpayButton` that clicks ANY element (not just
 * buttons) inside the Razorpay checkout via the same iframe-piercing locators.
 * Needed for the wallet flow, where the payment-method picker and wallet list
 * are <label>/<div> rows (not <button>s) living in the cross-origin iframe.
 * `stagehand.act()` cannot reach cross-origin iframe content (it resolves an
 * xpath like /html/body/div/iframe/html/... that CDP rejects), so deterministic
 * locators are the reliable path — the same reason the card Continue button is
 * driven by `clickRazorpayButton`.
 */
async function clickRazorpayElement(page: AgentPage, selectors: string[]): Promise<boolean> {
  const pierce = (inner: string) => [
    `iframe[src*="razorpay"] >> ${inner}`,
    `iframe >> ${inner}`,
    inner,
    `iframe >> iframe >> ${inner}`,
  ];
  for (const sel of selectors) {
    for (const v of pierce(sel)) {
      try {
        const loc = page.locator(v);
        const count = await loc.count();
        if (count > 0) {
          console.log(`[agent:clickRazorpayElement] ▶ clicking "${v}" (count=${count})`);
          await loc.first().click().catch(async () => {
            await loc.first().click();
          });
          return true;
        }
      } catch {
        /* try next variant */
      }
    }
  }
  console.log(`[agent:clickRazorpayElement] ✘ no element matched: ${selectors.join(" | ")}`);
  return false;
}

/**
 * Dismiss Razorpay's "Save your card as per RBI guidelines?" tokenization
 * dialog by clicking "Maybe later" (button[name="pay_without_saving_card"]).
 * Per the user, this path completes the payment WITHOUT an OTP step. The dialog
 * can appear a moment AFTER clicking Continue (server round-trip), so we retry
 * for several seconds. Returns true if it was found and dismissed.
 */
async function dismissSaveCardDialog(page: AgentPage): Promise<boolean> {
  const selectors = [
    `button[name="pay_without_saving_card"]`,
    `button:has-text("Maybe later")`,
    `button:has-text("Maybe Later")`,
  ];
  for (let attempt = 0; attempt < 12; attempt++) {
    const clicked = await clickRazorpayButton(page, selectors);
    if (clicked) {
      console.log(`[agent:saveDialog] ✔ dismissed save-card dialog (attempt ${attempt + 1})`);
      return true;
    }
    if (attempt < 11) await page.waitForTimeout(1_000).catch(() => {});
  }
  return false;
}

/**
 * NOTE: The Razorpay Test Mode OTP/mock-bank step has been removed. In this
 * integration the card flow completes directly after clicking "Maybe later"
 * on the RBI tokenization dialog — no OTP entry and no Success/Failure bank
 * page is presented, and the merchant `handler` fires on success. If a future
 * build re-introduces the mock bank page, re-add a best-effort "Success" click
 * here (see git history for `completeRazorpayMockBank`).
 */

/**
 * Fill the Razorpay Test Mode card form.
 *
 * ROOT-CAUSE FIX (2026-08): Stagehand's `Page` wrapper has NO `frames()` method
 * (it's an RPC wrapper over CDP — see @browserbasehq/stagehand dist/index.d.mts),
 * so the previous Playwright-frame-based approach silently operated on an EMPTY
 * frame list and never found the card inputs. We now:
 *   1. inspect the REAL DOM via page.evaluate() (logs every iframe + its src),
 *   2. try a deterministic page.locator() fill with iframe-piercing selectors,
 *   3. fall back to stagehand.act() (Stagehand is frame-aware via CDP and is
 *      proven to reach the Razorpay card form) — staged into reveal + fill.
 * The caller (`completeRazorpayTestPayment`) submits via clickRazorpayButton()
 * (clicks Continue), dismisses the RBI tokenization "Save card?" dialog via
 * dismissSaveCardDialog() ("Maybe later"), and the payment then completes
 * directly — no OTP / mock-bank step is required in this Test Mode flow.
 */
async function fillRazorpayTestCard(
  page: AgentPage,
  stagehand: Stagehand,
  cardNumber: string,
  cardExpiry: string,
  cardCvv: string,
): Promise<boolean> {
  const number = cardNumber.replace(/\s+/g, "");
  console.log(
    `[agent:fillCard] START card=${number.slice(0, 4)}**** expiry=${cardExpiry} cvv=***`,
  );

  // Give the Razorpay modal a moment to mount its iframe, then inspect reality.
  await page.waitForSelector("iframe", { state: "visible", timeout: 15_000 }).catch(() => false);
  await inspectRazorpayDom(page, "fillCard:initial");

  // 1) Reveal the card form if a method picker is showing.
  const revealed = await stagehand.act(
    `In the open Razorpay checkout, if a list of payment methods is visible, click "Card" or "Add a new card" (Credit/Debit Card) to reveal the card entry form. If the card form is already visible, do nothing.`,
    { page },
  );
  console.log(
    `[agent:fillCard] reveal step: success=${revealed.data.success} actions=${revealed.data.actions.length}`,
  );
  await page.waitForTimeout(1_500).catch(() => {});
  await inspectRazorpayDom(page, "fillCard:afterReveal");

  // 2) Try deterministic locator fill (logged so we learn whether it pierces the iframe).
  const viaLocator = await fillViaLocators(page, number, cardExpiry, cardCvv);
  if (viaLocator) {
    console.log(`[agent:fillCard] ✔ filled via locators`);
    await inspectRazorpayDom(page, "fillCard:afterLocatorFill");
    return true;
  }
  console.log(`[agent:fillCard] locator fill failed — using stagehand.act() to fill fields`);

  // 3) Fallback: AI-driven fill (proven to reach the form through CDP).
  const filled = await stagehand.act(
    `In the Razorpay card form, fill: Card Number = ${number}, Expiry = ${cardExpiry}, CVV = ${cardCvv}. Use ONLY these test values; do not click decorative icons or SVGs.`,
    { page },
  );
  const ok = filled.data.success && filled.data.actions.length > 0;
  console.log(
    `[agent:fillCard] act fill: success=${filled.data.success} actions=${filled.data.actions.length}`,
  );
  await inspectRazorpayDom(page, "fillCard:afterFill");
  return ok;
}

async function paymentPageAfterGate(
  context: AgentBrowserContext,
  fallback: AgentPage,
): Promise<AgentPage> {
  await fallback.waitForTimeout(500).catch(() => {});
  const pages = await context.pages().catch(() => [] as AgentPage[]);
  for (const page of [...pages].reverse()) {
    const url = await page.url().catch(() => "");
    if (/razorpay|checkout/i.test(url) && page !== fallback) return page;
  }
  return fallback;
}

/**
 * Return the page we should be driving. Razorpay's bank/OTP/result step can open
 * in a NEW browser window/tab (not an iframe on the main page). If such a window
 * exists we target it; otherwise we stay on the main page.
 */
async function razorpayActivePage(context: AgentBrowserContext, main: AgentPage): Promise<AgentPage> {
  const pages = await context.pages().catch(() => [] as AgentPage[]);
  const urls = await Promise.all(pages.map((p) => p.url().catch(() => "?")));
  console.log(
    `[agent:rzPay:windows] ${pages.length} page(s): ` +
      urls.map((u, i) => `${i === pages.indexOf(main) ? "MAIN" : i}: ${u.slice(0, 72)}`).join(" | "),
  );
  const others = [...pages].reverse().filter((p) => p !== main);
  // Prefer a Razorpay/checkout/mock-bank window (the mocksharp payment page,
  // or a wallet provider's mock page opened after selecting a wallet).
  for (const p of others) {
    const url = await p.url().catch(() => "");
    if (/razorpay|checkout|mocksharp|gateway|payments|secure|bank|acs|wallet|mock/i.test(url)) return p;
  }
  // Fallback: any non-blank extra window (e.g. a bank/ACS mock in Test Mode).
  for (const p of others) {
    const url = await p.url().catch(() => "");
    if (url && !/^about:blank$|^$/.test(url)) return p;
  }
  return main;
}

type OrderConfirmation = {
  url: string;
  title: string;
  text: string;
  orderId: string | null;
  amount: string | null;
  statusText: string | null;
};

/**
 * After Razorpay's bank/result step, the merchant's main page redirects to its
 * order-confirmation route. `page` here may be the Razorpay surface (a separate
 * popup/tab), so locate the actual merchant page (the non-Razorpay origin).
 */
async function findMerchantPage(context: AgentBrowserContext, current: AgentPage): Promise<AgentPage> {
  const pages = await context.pages().catch(() => [] as AgentPage[]);
  for (const p of pages) {
    const url = await p.url().catch(() => "");
    if (!/razorpay|mocksharp|gateway|secure\.razorpay|wallet|mock/i.test(url)) return p;
  }
  return current;
}

/**
 * Read the merchant's order-confirmation page and pull out order details.
 * The confirmation may be the same page after an SPA redirect or a separate
 * route; poll every browser page for one whose URL looks like a confirmation
 * route, and read from it. Falls back to the merchant page we already located.
 */
async function captureOrderConfirmation(context: AgentBrowserContext, fallback: AgentPage): Promise<OrderConfirmation | null> {
  let target: AgentPage | null = null;
  for (let i = 0; i < 25; i++) {
    const pages = await context.pages().catch(() => [] as AgentPage[]);
    for (const p of pages) {
      const url = await p.url().catch(() => "");
      if (/order|confirm/i.test(url) && !/checkout|payment/i.test(url)) {
        target = p;
        break;
      }
    }
    if (target) break;
    if (i < 24) await fallback.waitForTimeout(1_000).catch(() => {});
  }
  const page = target ?? fallback;
  const data = (await page.evaluate(`
    (() => {
      const text = (document.body?.innerText || "").replace(/\\s+/g, " ").trim();
      const title = document.title || "";
      const orderIdMatch = text.match(/Order\\s*ID[:\\s-]*([A-Za-z0-9_-]{6,})/i) || text.match(/([A-Z]{3,}\\d[A-Za-z0-9]{5,})/);
      const amountMatch = text.match(/(?:₹|rs\\.?|inr)\\s?([\\d,]+(?:\\.\\d{1,2})?)/i);
      const statusMatch = text.match(/\\b(order (?:placed|confirmed|success(?:ful)?)|payment (?:success|successful|done|complete)|thank you(?: very much)?)\\b/i);
      return { text, title, orderId: orderIdMatch?.[1] ?? null, amount: amountMatch?.[1] ?? null, statusText: statusMatch?.[0] ?? null };
    })()
  `).catch(() => null)) as { text: string; title: string; orderId: string | null; amount: string | null; statusText: string | null } | null;
  if (!data) return null;
  return {
    url: await page.url().catch(() => ""),
    title: data.title,
    text: data.text.slice(0, 1800),
    orderId: data.orderId,
    amount: data.amount,
    statusText: data.statusText,
  };
}

/** Close leftover Razorpay / blank popup windows; keep the merchant page open. */
async function closeRazorpayWindows(context: AgentBrowserContext, keep: AgentPage): Promise<number> {
  const pages = await context.pages().catch(() => [] as AgentPage[]);
  let closed = 0;
  for (const p of pages) {
    if (p === keep) continue;
    const url = await p.url().catch(() => "");
    if (/razorpay|mocksharp|gateway|secure\.razorpay|wallet|mock|about:blank/i.test(url)) {
      await p.close().catch(() => {});
      closed++;
    }
  }
  return closed;
}

/**
 * Default-by-availability wallet codes for Razorpay Checkout Test Mode, mapped to
 * the human label shown in the wallet picker. Per the Razorpay docs
 * (payments/payment-methods/wallets.md) MobiKwik, Ola Money and Airtel Money are
 * available by default; the rest require dashboard approval.
 */
const WALLET_LABELS: Record<string, string> = {
  mobikwik: "MobiKwik",
  olamoney: "Ola Money",
  airtelmoney: "Airtel Money",
  payzapp: "PayZapp",
  phonepe: "PhonePe",
  phonepeswitch: "PhonePe Switch",
  amazonpay: "Amazon Pay",
  paypal: "PayPal",
  bajajpay: "Bajaj Pay",
};

/** Wallets that prompt for an OTP after "Pay" in Razorpay Test Mode (vs. Ola
 *  Money / Airtel Money which complete via the provider mock directly). The
 *  agent fills a test OTP for these instead of waiting for an SMS. */
const OTP_WALLETS = new Set(["mobikwik"]);

/**
 * Poll for Razorpay's mock bank / wallet / provider result window (a NEW browser
 * window/tab) and click its "Success" control, then capture the merchant
 * confirmation. This is shared by BOTH the card and wallet Test Mode flows — both
 * open a provider mock page (e.g. .../gateway/mocksharp/payment or a wallet
 * provider's mock) after submitting, and that window posts the callback that
 * fires the merchant handler.
 */
async function clickRazorpayMockSuccess(
  context: AgentBrowserContext,
  main: AgentPage,
  stagehand: Stagehand,
): Promise<boolean> {
  let successClicked = false;
  for (let i = 0; i < 15; i++) {
    const active = await razorpayActivePage(context, main);
    if (active !== main) {
      await context.setActivePage(active).catch(() => {}); // focus the popup for Stagehand
      const ok = await clickRazorpayButton(active, [
        `button[data-val="S"]`,
        `button.success`,
        `button:has-text("Success")`,
      ]);
      if (ok) {
        successClicked = true;
        console.log(`[agent:rzPay] ✔ clicked Success (locator) on new window (attempt ${i + 1})`);
        break;
      }
    } else {
      // Main page: clear any lingering RBI save-card / tokenization dialog that
      // would otherwise block completion of the payment.
      await clickRazorpayButton(active, [
        `button[name="pay_without_saving_card"]`,
        `button:has-text("Maybe later")`,
      ]);
    }
    if (i < 14) await main.waitForTimeout(1_500).catch(() => {});
  }
  // Phase 2: one LLM-driven attempt if a new window is still open (act is
  // frame-aware and can perceive the cross-origin popup).
  if (!successClicked) {
    const active = await razorpayActivePage(context, main);
    if (active !== main) {
      await context.setActivePage(active).catch(() => {});
      const act = await stagehand.act(
        "Click the Success button to complete this Razorpay test payment.",
        { page: active },
      ).catch(() => undefined);
      successClicked = !!(act?.data?.success && (act?.data?.actions?.length ?? 0) > 0);
      console.log(`[agent:rzPay] success act: success=${act?.data?.success} actions=${act?.data?.actions?.length}`);
    }
  }
  console.log(`[agent:rzPay] successClicked=${successClicked}`);
  return successClicked;
}

/**
 * Some wallets (e.g. MobiKwik) show an OTP screen after "Pay" in Test Mode.
 * Detect an OTP input — on the current Razorpay page OR a newly opened window —
 * fill it with the test OTP (`RAZORPAY_TEST_OTP`, default "123456"), and click
 * the verify/submit control so the provider mock page (Success / Failure) appears.
 * Returns true if an OTP field was found and filled. No-op for wallets that don't
 * ask for an OTP (Ola Money, Airtel Money).
 */
async function handleRazorpayOtp(
  context: AgentBrowserContext,
  main: AgentPage,
  stagehand: Stagehand,
): Promise<boolean> {
  const otp = process.env.RAZORPAY_TEST_OTP ?? "123456";
  const otpInputSel = [
    `input[inputmode="numeric"]`,
    `input[name*="otp" i]`,
    `input[autocomplete="one-time-code"]`,
    `input[maxlength="6"]`,
    `input[placeholder*="otp" i]`,
  ];
  // Verify controls (attribute/text based). Intentionally NOT `button[type=submit]`
  // bare — the Razorpay iframe contains several *hidden* form-submit buttons that
  // match it and would be clicked (and report success) without verifying. The
  // primary verify mechanism is the form-scoped visible button above.
  const submitSel = [
    `button[name*="otp" i]`,
    `button[id*="otp" i]`,
    `button[data-test-id*="otp" i]`,
    `button[class*="otp" i]`,
    `button:has-text("Verify")`,
    `button:has-text("Submit")`,
    `button:has-text("Confirm")`,
    `button:has-text("Proceed")`,
    `button:has-text("Pay")`,
    `button:has-text("Next")`,
    `button:has-text("Authenticate")`,
    `button[aria-label*="verify" i]`,
    `button[aria-label*="otp" i]`,
    `button[title*="verify" i]`,
  ];
  // Only pierce INTO the Razorpay iframe (and nested) — never the bare main-page
  // selector, which would risk filling a merchant field (e.g. pincode).
  const pierce = (sel: string) => [
    `iframe[src*="razorpay"] >> ${sel}`,
    `iframe >> ${sel}`,
    `iframe >> iframe >> ${sel}`,
  ];
  for (let i = 0; i < 12; i++) {
    const pages = await context.pages().catch(() => [] as AgentPage[]);
    for (const p of [main, ...pages.filter((x) => x !== main)]) {
      for (const sel of otpInputSel) {
        for (const v of pierce(sel)) {
          try {
            const loc = p.locator(v);
            if ((await loc.count()) > 0) {
              const input = loc.first();
              await input.fill(otp).catch(async () => {
                await input.type(otp);
              });
              console.log(`[agent:rzPay:otp] filled OTP (len=${otp.length}) via "${v}"`);
              // Debug: enumerate buttons in the Razorpay iframe (locators pierce
              // cross-origin, unlike page.evaluate) so we learn the real verify control.
              try {
                const all = p.locator(`iframe[src*="razorpay"] >> button`);
                const ac = await all.count();
                for (let b = 0; b < ac; b++) {
                  const el = all.nth(b);
                  const vis = await el.isVisible().catch(() => false);
                  const t = (await el.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
                  console.log(`[agent:rzPay:otp] btn#${b} vis=${vis} text="${t.slice(0, 30)}"`);
                }
              } catch (e) {
                console.log(`[agent:rzPay:otp] enumerate error: ${(e as Error)?.message ?? e}`);
              }
              // Submit the OTP (no LLM): click the VISIBLE verify/submit control.
              // Strategy order:
              //   1) the visible `button[type=submit]` in the iframe (the OTP verify
              //      button; hidden form-submits elsewhere are skipped via isVisible),
              //   2) the visible button inside the OTP input's own <form>,
              //   3) broad text/attribute selectors.
              let clicked =
                (await clickFirstVisible(p, `iframe[src*="razorpay"] >> button[type="submit"]`)) ||
                (await clickFirstVisible(
                  p,
                  `iframe[src*="razorpay"] >> input[name*="otp" i] >> xpath=ancestor::form >> button`,
                )) ||
                (await clickRazorpayButton(p, submitSel));
              if (clicked) {
                console.log(`[agent:rzPay:otp] ✔ clicked verify/submit control`);
                return true;
              }
              // Non-LLM fallback: focus the OTP field and dispatch Enter (submits the
              // OTP form). Stagehand's Page exposes keyPress (Locators have no
              // .press/.focus), so click to focus then keyPress on the page.
              console.log(`[agent:rzPay:otp] no locator verify control — dispatching Enter`);
              try {
                await input.click();
                await main.keyPress("Enter");
              } catch {
                /* ignore */
              }
              // Last resort: stagehand.act (LLM) — can hang on a flaky endpoint, so it
              // is truly last and we still return true afterwards.
              console.log(`[agent:rzPay:otp] Enter missed — using stagehand.act()`);
              const act = await stagehand.act(
                `In the Razorpay MobiKwik OTP screen, click the Verify or Submit button to authenticate the wallet with the OTP you just entered.`,
                { page: p },
              ).catch(() => undefined);
              if (act?.data?.success && (act?.data?.actions?.length ?? 0) > 0) {
                console.log(`[agent:rzPay:otp] ✔ act clicked verify (actions=${act.data.actions.length})`);
              }
              return true;
            }
          } catch {
            /* try next variant */
          }
        }
      }
    }
    if (i < 11) await main.waitForTimeout(1_000).catch(() => {});
  }
  return false;
}

/**
 * Complete only Razorpay's documented Test Mode payment flow. `method` selects
 * which payment method to drive: "card" (default) or "wallet". This is
 * intentionally opt-in at the policy layer and never runs with live mode or
 * arbitrary providers.
 */
async function completeRazorpayTestPayment(
  page: AgentPage,
  stagehand: Stagehand,
  context: AgentBrowserContext,
  method: "card" | "wallet" = "card",
): Promise<{
  status: "submitted" | "failed";
  message: string;
  orderConfirmation?: OrderConfirmation | null;
  closedWindows?: number;
}> {
  const cardNumber = process.env.RAZORPAY_TEST_CARD_NUMBER ?? "4100 2800 0000 1007";
  const cardCvv = process.env.RAZORPAY_TEST_CARD_CVV ?? "567";
  const cardExpiry = process.env.RAZORPAY_TEST_CARD_EXPIRY ?? "02/28";
  try {
    // Route wallet payments to the dedicated wallet flow; default stays on card.
    if (method === "wallet") {
      const walletCode = (process.env.RAZORPAY_TEST_WALLET ?? "olamoney").toLowerCase();
      return completeRazorpayTestWalletPayment(page, stagehand, context, walletCode);
    }
    console.log(`[agent:rzPay] === completeRazorpayTestPayment START ===`);
    console.log(`[agent:rzPay] card=${cardNumber.slice(0,4)}**** expiry=${cardExpiry} cvv=***`);

    // fillRazorpayTestCard now drives the form via Stagehand (frame-aware); it
    // logs every step internally. Frame-based clicks are dead in Stagehand, so
    // submit/OTP below are also done via stagehand.act().
    const enteredCard = await fillRazorpayTestCard(
      page,
      stagehand,
      cardNumber,
      cardExpiry,
      cardCvv,
    );
    console.log(`[agent:rzPay] fillRazorpayTestCard returned: ${enteredCard}`);
    if (!enteredCard) {
      await inspectRazorpayDom(page, "rzPay:fillFailed");
      return { status: "failed", message: "Razorpay Test Mode card fields could not be filled; payment was not attempted." };
    }

    // 2) Submit the card form. The Razorpay card form's submit button reads
    //    "Continue" (data-test-id="add-card-cta") — NOT "Pay". We click it via
    //    locator piercing (proven to reach the iframe), with an act() fallback.
    //    Per the official Test Mode card flow the steps are:
    //      Continue -> (Save-this-card? -> "Maybe later") -> bank page -> Success.
    console.log(`[agent:rzPay] clicking card form Continue…`);
    await page.waitForTimeout(2_000).catch(() => {}); // let Razorpay validate + enable Continue
    const clickedContinue = await clickRazorpayButton(page, [
      `button[data-test-id="add-card-cta"]`,
      `button:has-text("Continue")`,
      `button:has-text("Pay")`,
    ]);
    if (!clickedContinue) {
      console.log(`[agent:rzPay] locator Continue missed — using stagehand.act()`);
      const cont = await stagehand.act(
        `In the Razorpay card form, click the "Continue" button to proceed with the test payment. Do not close the checkout.`,
        { page },
      );
      console.log(`[agent:rzPay] continue act: success=${cont.data.success} actions=${cont.data.actions.length}`);
      if (!cont.data.success || cont.data.actions.length === 0) {
        return { status: "failed", message: "Razorpay Test Mode card Continue control was not available; payment was not attempted." };
      }
    } else {
      console.log(`[agent:rzPay] ✔ clicked Continue via locator`);
    }
    await page.waitForTimeout(1_500).catch(() => {});
    await inspectRazorpayDom(page, "rzPay:afterContinue");

    // 3) Dismiss the "Save your card as per RBI guidelines?" (RBI tokenization)
    //    dialog if it appears. Clicking "Maybe later" (name="pay_without_saving_card")
    //    proceeds WITHOUT vaulting the card and (per the user) completes the
    //    payment without an OTP step. Retry because it can appear after Continue.
    console.log(`[agent:rzPay] checking for save-card prompt…`);
    const dismissedSave = await dismissSaveCardDialog(page);
    if (dismissedSave) {
      console.log(`[agent:rzPay] ✔ dismissed save-card dialog (Maybe later)`);
    } else {
      console.log(`[agent:rzPay] no save-card prompt`);
    }
    await page.waitForTimeout(1_500).catch(() => {});
    await inspectRazorpayDom(page, "rzPay:afterMaybeLater");

    // 4) The payment may complete directly, OR Razorpay opens its mock bank /
    //    result step in a NEW browser window (e.g. .../gateway/mocksharp/payment)
    //    showing Success / Failure buttons. That window posts the callback that
    //    fires the merchant handler, so we must click "Success" there. The shared
    //    helper polls for the window, clears any save-card dialog on the main
    //    page, and falls back to an LLM click when a locator can't reach it.
    console.log(`[agent:rzPay] awaiting payment confirmation (incl. new windows)…`);
    await clickRazorpayMockSuccess(context, page, stagehand);
    // 5) Capture the merchant's order confirmation and close stray Razorpay
    //    windows so the run ends cleanly on the confirmation page.
    const merchantPage = await findMerchantPage(context, page);
    const orderConfirmation = await captureOrderConfirmation(context, merchantPage);
    const closedWindows = await closeRazorpayWindows(context, merchantPage);
    console.log(`[agent:rzPay] orderConfirmation=${orderConfirmation ? "captured" : "none"} closedWindows=${closedWindows}`);
    await inspectRazorpayDom(page, "rzPay:done");
    return {
      status: "submitted",
      message: "Razorpay Test Mode card payment was submitted through the merchant checkout; awaiting merchant server confirmation.",
      orderConfirmation,
      closedWindows,
    };
  } catch (e) {
    console.warn(`[agent:rzPay] threw: ${(e as Error).message}`);
    return { status: "failed", message: "Could not operate the Razorpay Test Mode card checkout; payment was not attempted." };
  }
}

/**
 * Complete Razorpay's documented Test Mode WALLET flow (per
 * payments/payment-methods/wallets.md). Wallets available by default in Test
 * Mode are MobiKwik, Ola Money and Airtel Money. The flow is analogous to the
 * card flow but without a card-number form:
 *   1. Click the "Wallets" payment-method tab on the checkout.
 *   2. Click the chosen wallet (e.g. MobiKwik) in the revealed list.
 *   3. Click "Pay" — Razorpay opens the wallet provider's mock page in a NEW
 *      window showing Success / Failure (same shape as the card mock-bank page).
 *   4. Click "Success" on that mock page (shared clickRazorpayMockSuccess helper).
 * Test Mode only — never runs against live Razorpay keys.
 */
async function completeRazorpayTestWalletPayment(
  page: AgentPage,
  stagehand: Stagehand,
  context: AgentBrowserContext,
  walletCode: string,
): Promise<{
  status: "submitted" | "failed";
  message: string;
  orderConfirmation?: OrderConfirmation | null;
  closedWindows?: number;
}> {
  const walletLabel = WALLET_LABELS[walletCode] ?? walletCode;
  try {
    console.log(`[agent:rzPay:wallet] === completeRazorpayTestWalletPayment START (wallet=${walletCode} / ${walletLabel}) ===`);

    await page.waitForSelector("iframe", { state: "visible", timeout: 15_000 }).catch(() => false);
    await inspectRazorpayDom(page, "wallet:initial");

    // 1) Reveal the Wallets tab. Drive it with iframe-piercing locators (the
    //    proven mechanism for reaching the cross-origin Razorpay iframe — see
    //    clickRazorpayButton). The tab is a <label> wrapping a radio with
    //    data-testid="wallet" / data-value="wallet" (label text "Wallet").
    const revealedWallet = await clickRazorpayElement(page, [
      `[data-testid="wallet"]`,
      `[data-value="wallet"]`,
      `label:has-text("Wallet")`,
      `div[role="button"][data-value="wallet"]`,
      `[data-testid*="wallet" i]`,
    ]);
    if (!revealedWallet) {
      const r = await stagehand.act(
        `In the open Razorpay checkout, click the "Wallets" payment method tab (not Card, Netbanking or UPI) to reveal the list of available wallets.`,
        { page },
      ).catch(() => undefined);
      if (!(r?.data?.success && (r?.data?.actions?.length ?? 0) > 0)) {
        return {
          status: "failed",
          message: `Razorpay "Wallets" tab was not available in this checkout; payment was not attempted.`,
        };
      }
    }
    console.log(`[agent:rzPay:wallet] Wallets tab clicked=${revealedWallet}`);
    await page.waitForTimeout(1_500).catch(() => {});
    await inspectRazorpayDom(page, "wallet:afterTab");

    // 2) Pick the requested wallet from the list (locator-first). Each option is
    //    a <label> whose inner <div role="button"> carries data-value="<code>"
    //    (e.g. data-value="mobikwik"); the visible text is the wallet name.
    const pickedWallet = await clickRazorpayElement(page, [
      `[data-value="${walletCode}"]`,
      `label:has-text("${walletLabel}")`,
      `div[role="button"][data-value="${walletCode}"]`,
      `div:has-text("${walletLabel}")`,
    ]);
    if (!pickedWallet) {
      const p = await stagehand.act(
        `In the Wallets list, click "${walletLabel}" to select it as the payment method.`,
        { page },
      ).catch(() => undefined);
      if (!(p?.data?.success && (p?.data?.actions?.length ?? 0) > 0)) {
        return {
          status: "failed",
          message: `Razorpay wallet "${walletLabel}" was not available in the list; payment was not attempted.`,
        };
      }
    }
    console.log(`[agent:rzPay:wallet] wallet ${walletLabel} clicked=${pickedWallet}`);
    await page.waitForTimeout(1_500).catch(() => {});
    await inspectRazorpayDom(page, "wallet:afterPick");

    // 3) Selecting the wallet option is what triggers the wallet flow: Razorpay
    //    opens the provider's mock page in a NEW window
    //    (…/gateway/mocksharp/payment — the same shape as the card mock-bank
    //    window). There is no separate "Pay" control to click for Ola Money /
    //    Airtel Money. Some wallet configs still surface an in-checkout "Pay"
    //    button, so attempt it best-effort — but do NOT fail if it's absent, since
    //    the new window is the real trigger and is handled in step 4.
    console.log(`[agent:rzPay:wallet] attempting best-effort in-checkout Pay (if any)…`);
    const clickedPay = await clickRazorpayButton(page, [
      `button[data-test-id="wallet-pay"]`,
      `button:has-text("Pay")`,
      `button:has-text("Proceed")`,
      `button:has-text("Continue")`,
    ]).catch(() => false);
    if (clickedPay) console.log(`[agent:rzPay:wallet] ✔ clicked Pay via locator`);
    await page.waitForTimeout(1_500).catch(() => {});
    await inspectRazorpayDom(page, "wallet:afterPick2");

    // 3b) MobiKwik (and any OTP-gated wallet) shows an OTP screen after Pay;
    //     fill the test OTP and submit so the provider mock page appears.
    if (OTP_WALLETS.has(walletCode)) {
      const otpHandled = await handleRazorpayOtp(context, page, stagehand);
      console.log(`[agent:rzPay:wallet] otpHandled=${otpHandled} (wallet=${walletCode})`);
    }

    // 4) Wallet provider mock page (Success / Failure) — identical shape to the
    //    card mock-bank page, so reuse the shared success-click helper.
    console.log(`[agent:rzPay:wallet] awaiting wallet mock confirmation (incl. new windows)…`);
    await clickRazorpayMockSuccess(context, page, stagehand);

    // 5) Capture the merchant's order confirmation and close stray Razorpay /
    //    wallet mock windows so the run ends cleanly on the confirmation page.
    const merchantPage = await findMerchantPage(context, page);
    const orderConfirmation = await captureOrderConfirmation(context, merchantPage);
    const closedWindows = await closeRazorpayWindows(context, merchantPage);
    console.log(
      `[agent:rzPay:wallet] orderConfirmation=${orderConfirmation ? "captured" : "none"} closedWindows=${closedWindows}`,
    );
    await inspectRazorpayDom(page, "wallet:done");
    return {
      status: "submitted",
      message: `Razorpay Test Mode wallet payment (${walletLabel}) was submitted through the merchant checkout; awaiting merchant server confirmation.`,
      orderConfirmation,
      closedWindows,
    };
  } catch (e) {
    console.warn(`[agent:rzPay:wallet] threw: ${(e as Error).message}`);
    return {
      status: "failed",
      message: `Could not operate the Razorpay Test Mode wallet checkout (${walletLabel}); payment was not attempted.`,
    };
  }
}

/** Dispose a retained merchant payment session, closing its browser + Stagehand. */
export async function closeMerchantPaymentSession(sessionId: string): Promise<void> {
  const session = liveBrowserSessionRegistry.remove(sessionId);
  if (!session) return;
  // Finalize the screencast BEFORE tearing down Stagehand so the .webm is saved.
  await stopSessionRecording(session);
  await session.stagehand.close().catch(() => {});
  await session.browser.close().catch(() => {});
}

/**
 * Reconnect to a retained Browserbase session by its durable session id.
 *
 * This only works for sessions created with `keepAlive: true` (set on every
 * Browserbase launch in this module), which per Stagehand/Browserbase docs
 * keeps the cloud browser alive after `close()`/process exit so it can be
 * re-attached with `browserbase.connect({ sessionId })`. The reconnected
 * instance is registered under the PROVIDER session id, which is exactly the
 * handle persisted in the DB `browser_sessions.provider_session_id` column —
 * so recovery works after a restart or from another API process.
 *
 * Returns true when a live handle is now registered under `providerSessionId`.
 * Best-effort: any failure returns false (callers degrade to not_found).
 */
export async function reconnectMerchantPaymentSession(
  providerSessionId: string,
  opts: { browserbaseApiKey: string },
): Promise<boolean> {
  if (liveBrowserSessionRegistry.has(providerSessionId)) return true;
  try {
    const browser = await browserbase.connect({
      apiKey: opts.browserbaseApiKey,
      sessionId: providerSessionId,
    });
    const stagehand = await Stagehand.create({ browser, cache: true });
    const page = (await browser.context.pages())[0];
    if (!page) {
      await stagehand.close().catch(() => {});
      await browser.close().catch(() => {});
      return false;
    }
    liveBrowserSessionRegistry.register(providerSessionId, {
      browser,
      stagehand,
      page,
      createdAt: Date.now(),
    });
    return true;
  } catch {
    // Session gone (released/expired/timed out) or provider error.
    return false;
  }
}

/**
 * Best-effort read of the merchant's *current* checkout total from a retained
 * browser session. Returns null when the session is missing, expired, or the
 * total is unreadable. The amount is reported in the page's own currency (not
 * assumed INR) so price re-validation works for any merchant currency. Used only
 * to re-confirm the price before executing a payment — inability to read never
 * blocks the transaction.
 */
export async function getSessionCheckoutTotal(
  sessionId: string,
): Promise<{ amountInMinor: number; currency: string } | null> {
  const session = liveBrowserSessionRegistry.get(sessionId);
  if (!session) return null;
  if (Date.now() - session.createdAt > 15 * 60_000) return null;
  try {
    const text = await Promise.race<string | null>([
      session.page.evaluate(`
        (() => {
          const t = (document.body?.innerText || "").replace(/\\s+/g, " ").trim();
          return t || null;
        })()
      `),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("checkout total read timed out")), 5_000),
      ),
    ]);
    if (!text) return null;
    // Pure, currency-aware parse (unit-tested in checkout-total.test.ts).
    return parseCheckoutTotal(text);
  } catch {
    return null;
  }
}

/** Identify a merchant payment control from rendered UI only. */
async function detectPaymentGate(page: AgentPage): Promise<PaymentGate | undefined> {
  return (await page.evaluate(`
    (() => {
      const candidates = Array.from(document.querySelectorAll(
        'button, [role="button"], a, input[type="submit"], input[type="button"]'
      ));
      const pageText = document.body?.innerText || '';
      const mentionsRazorpay = /razorpay/i.test(pageText);
      for (const element of candidates) {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) continue;
        const label = [element.innerText, element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('value')]
          .filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim();
        if (!label) continue;
        if (/razorpay/i.test(label) || (mentionsRazorpay && /pay now|pay securely|place order|proceed to payment|complete order|confirm order|checkout/i.test(label))) {
          return { provider: 'razorpay', label };
        }
        if (/(pay now|pay securely|place order|proceed to payment|complete order|confirm order|checkout)/i.test(label)) {
          return { provider: 'unknown', label };
        }
      }
      return undefined;
    })()
  `).catch(() => undefined)) as PaymentGate | undefined;
}

/** Click the already-detected merchant payment control after explicit approval. */
async function clickPaymentGate(page: AgentPage): Promise<PaymentGate | undefined> {
  const gate = await detectPaymentGate(page);
  if (!gate) return undefined;
  const pattern = gate.provider === "razorpay"
    ? /(razorpay|pay now|pay securely|place order|proceed to payment|complete order|confirm order|checkout)/i
    : /(pay now|pay securely|place order|proceed to payment|complete order|confirm order|checkout)/i;
  return (await clickVisibleText(page, pattern).catch(() => false)) ? gate : undefined;
}

export interface MerchantPaymentDriveOptions {
  completeTestPayment?: boolean;
  method?: "card" | "wallet";
  /**
   * Provider that owns the retained session ("local" | "browserbase"). When
   * "browserbase", a session missing from THIS process is reconnected using the
   * durable Browserbase session id instead of failing with not_found.
   */
  provider?: string;
  /** Browserbase API key used for the reconnect above. */
  browserbaseApiKey?: string;
}

export async function approveMerchantPayment(
  sessionId: string,
  options: MerchantPaymentDriveOptions = {},
): Promise<{
  status: "opened" | "submitted" | "expired" | "not_found" | "failed";
  message: string;
  provider?: PaymentGate["provider"];
  orderConfirmation?: OrderConfirmation | null;
  closedWindows?: number;
}> {
  let session = liveBrowserSessionRegistry.get(sessionId);
  if (!session && options.provider === "browserbase" && options.browserbaseApiKey) {
    // Durability path: the live handle died with the creating process, but the
    // Browserbase cloud session survives (keepAlive). Reconnect to the SAME
    // session id and re-register it under its providerSessionId so subsequent
    // lookups hit the registry directly.
    const reconnected = await reconnectMerchantPaymentSession(sessionId, {
      browserbaseApiKey: options.browserbaseApiKey,
    });
    if (reconnected) session = liveBrowserSessionRegistry.get(sessionId);
  }
  if (!session) return { status: "not_found", message: "Merchant checkout session was not found or has expired." };
  if (Date.now() - session.createdAt > 15 * 60_000) {
    liveBrowserSessionRegistry.remove(sessionId);
    await stopSessionRecording(session);
    await session.stagehand.close().catch(() => {});
    await session.browser.close().catch(() => {});
    return { status: "expired", message: "Merchant checkout session expired; run the agent again." };
  }
  try {
    await session.browser.context.setActivePage(session.page).catch(() => {});
    const gate = await clickPaymentGate(session.page);
    if (!gate) return { status: "failed", message: "The merchant payment control is no longer available." };
    if (options.completeTestPayment && gate.provider === "razorpay") {
      const paymentPage = await paymentPageAfterGate(session.browser.context, session.page);
      await session.browser.context.setActivePage(paymentPage).catch(() => {});
      const payment = await completeRazorpayTestPayment(
        paymentPage,
        session.stagehand,
        session.browser.context,
        options.method ?? "card",
      );
      return { status: payment.status, message: payment.message, provider: gate.provider, orderConfirmation: payment.orderConfirmation, closedWindows: payment.closedWindows };
    }
    return {
      status: "opened",
      message: `Opened the merchant's ${gate.provider} payment control. Complete the merchant checkout there; Cartwright did not create a separate order.`,
      provider: gate.provider,
    };
  } catch (error) {
    return { status: "failed", message: error instanceof Error ? error.message : "Could not open merchant payment." };
  }
}

async function runLocalMerchantCheckout(page: AgentPage, alreadyAdded = false): Promise<CheckoutResult> {
  const steps: CheckoutStep[] = [];
  const log = (action: string, status: CheckoutStep["status"], detail?: string) =>
    steps.push({ action, status, detail });

  const added = alreadyAdded || (await clickVisibleText(page, /add to (cart|bag)/i).catch(() => false));
  log("add_to_cart", added ? "done" : "failed");
  if (!added) return { status: "failed", steps, error: "Add-to-cart button was not found." };
  await page.waitForTimeout(300).catch(() => {});

  const onCheckoutRoute = /\/checkout(?:[/?#]|$)/i.test(await page.url());
  const proceeded = onCheckoutRoute || await clickVisibleText(page, /checkout|view cart|cart/i).catch(() => false);
  log("proceed_to_checkout", proceeded ? "done" : "failed");
  if (!proceeded) return { status: "failed", steps, error: "Checkout button was not found." };
  await page.waitForLoadState("networkidle", 15_000).catch(() => {});

  const fields: Array<[string, string]> = [
    ['input[name*="first" i], input[placeholder*="first" i]', "Test"],
    ['input[name*="last" i], input[placeholder*="last" i]', "Buyer"],
    ['input[type="email"], input[name*="email" i]', "test@example.com"],
    ['input[name*="phone" i], input[type="tel"]', "9999999999"],
    ['input[name*="address" i], input[placeholder*="address" i]', "123 Test Street"],
    ['input[name*="city" i], input[placeholder*="city" i]', "Mumbai"],
    ['input[name*="pin" i], input[name*="zip" i], input[placeholder*="pin" i]', "400001"],
  ];
  // Raven's form labels are visual-only (the inputs have no name/for
  // attributes), so fill its seven inputs by their stable DOM order.
  const ravenInputs = page.locator("main input");
  const ravenValues = ["Test", "Buyer", "test@example.com", "9999999999", "123 Test Street", "Mumbai", "400001"];
  const ravenInputCount = await ravenInputs.count().catch(() => 0);
  for (let i = 0; i < Math.min(ravenInputCount, ravenValues.length); i++) {
    await ravenInputs.nth(i).fill(ravenValues[i] ?? "").catch(() => {});
  }
  for (const [selector, value] of fields) {
    const input = page.locator(selector).first();
    if ((await input.count().catch(() => 0)) > 0) await input.fill(value).catch(() => {});
  }
  const stateSelect = page.locator("select").first();
  const hasStateSelect = (await stateSelect.count().catch(() => 0)) > 0;
  if (hasStateSelect) {
    await stateSelect.selectOption("Maharashtra").catch(() => {});
  }
  const stateSelected = !hasStateSelect || await page.evaluate(
    `document.querySelector('select')?.value === 'Maharashtra'`,
  ).catch(() => false);
  if (!stateSelected) {
    log("fill_shipping", "failed", "State dropdown was not set to Maharashtra");
    return { status: "failed", steps, error: "Could not select Maharashtra in the State dropdown." };
  }

  const continued = await clickVisibleText(page, /continue|review|place order|proceed/i).catch(() => false);
  log("fill_shipping", continued ? "done" : "skipped");
  await page.waitForLoadState("networkidle", 15_000).catch(() => {});

  const paymentGate = await detectPaymentGate(page);
  log("reach_payment_gate", paymentGate ? "done" : "skipped", paymentGate?.label);
  if (!paymentGate) {
    return {
      status: "checkout_reached",
      steps,
      error: "No merchant payment control was detected. No payment was attempted.",
    };
  }

  return {
    status: "checkout_reached",
    steps,
    paymentGate,
    error: "Merchant payment control detected; stopped before payment approval.",
  };
}

const RAVEN_TEST_BASKET: Record<string, { slug: string; priceValue: number; price: string }> = {
  gardenia: { slug: "raven-gardenia", priceValue: 349, price: "₹349" },
  "dark ocean": { slug: "raven-dark-ocean", priceValue: 999, price: "₹999" },
  "bad boy": { slug: "raven-bad-boy", priceValue: 999, price: "₹999" },
};

async function runRavenBasket(
  page: AgentPage,
  context: AgentBrowserContext,
  basket: Array<{ name: string; quantity: number }>,
): Promise<{ matches: Product[]; picked: Product; basket: BasketItem[]; checkout: CheckoutResult }> {
  const matches: Product[] = [];
  const basketItems: BasketItem[] = [];
  let total = 0;

  for (const item of basket) {
    const key = item.name.trim().toLowerCase();
    const product = RAVEN_TEST_BASKET[key];
    if (!product || !Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error(`Unsupported Raven test basket item: ${item.name} x${item.quantity}`);
    }

    const picked: Product = {
      name: item.name,
      price: product.price,
      priceValue: product.priceValue,
      currency: "INR",
      url: `http://localhost:5173/product/${product.slug}`,
    };
    matches.push(picked);
    basketItems.push({ ...picked, quantity: item.quantity, currency: "INR" });
    total += product.priceValue * item.quantity;

    await page.goto(`http://localhost:5173/product/${product.slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", 15_000).catch(() => {});
    await context.setActivePage(page).catch(() => {});
    await page.waitForTimeout(500).catch(() => {});
    for (let i = 0; i < item.quantity; i++) {
      if (!(await clickVisibleText(page, /add to (cart|bag)/i).catch(() => false))) {
        throw new Error(`Could not add ${item.name} to the Raven cart.`);
      }
      const expectedQuantity = basketItems.reduce(
        (sum, current) => sum + current.quantity,
        0,
      ) - item.quantity + i + 1;
      for (let attempt = 0; attempt < 20; attempt++) {
        const persistedQuantity = await page.evaluate(
          `(() => {
            try {
              const raw = localStorage.getItem('raven-cart');
              const state = raw ? JSON.parse(raw)?.state : null;
              return (state?.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            } catch { return 0; }
          })()`,
        ).catch(() => 0);
        if (Number(persistedQuantity) >= expectedQuantity) break;
        await page.waitForTimeout(250).catch(() => {});
      }
      await page.waitForTimeout(400).catch(() => {});
    }
  }

  // Visit the rendered cart first. This lets the merchant finish its persisted
  // cart update before checkout validates that at least one item is selected.
  await page.goto("http://localhost:5173/cart", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", 15_000).catch(() => {});
  await context.setActivePage(page).catch(() => {});
  for (let attempt = 0; attempt < 40; attempt++) {
    const cartReady = await page.evaluate(
      `(() => {
        const text = (document.body.innerText || '').toLowerCase();
        return text.includes('proceed to checkout') &&
          (text.includes('dark ocean') || text.includes('gardenia') || text.includes('bad boy'));
      })()`,
    ).catch(() => false);
    if (cartReady) break;
    await page.waitForTimeout(250).catch(() => {});
  }
  const proceededFromCart = await clickVisibleText(page, /proceed to checkout/i).catch(() => false);
  if (!proceededFromCart) {
    const cartText = await page.evaluate(`(document.body.innerText || '').slice(0, 800)`).catch(() => "");
    throw new Error(`Raven cart did not expose a checkout link with the requested item. Visible cart: ${cartText}`);
  }
  await page.waitForLoadState("networkidle", 15_000).catch(() => {});
  await page.waitForTimeout(500).catch(() => {});
  const checkout = await runLocalMerchantCheckout(page, true);
  if (checkout.status !== "failed" && !checkout.orderSummary?.total) {
    const shipping = total >= 5000 ? 0 : 299;
    const merchantTotal = total + shipping;
    checkout.orderSummary = {
      items: basket.map((item) => ({
        name: `${item.name} ×${item.quantity}`,
        price: `₹${(RAVEN_TEST_BASKET[item.name.trim().toLowerCase()]!.priceValue * item.quantity).toLocaleString()}`,
      })),
      subtotal: `₹${total.toLocaleString()}`,
      shipping: `₹${shipping.toLocaleString()}`,
      total: `₹${merchantTotal.toLocaleString()}`,
    };
    checkout.orderSummarySource = "basket";
  }

  return { matches, picked: matches[0]!, basket: basketItems, checkout };
}

/**
 * Drive the picked product's page through add-to-cart and (best-effort) checkout,
 * then extract the order summary. The agent deliberately stops before any payment
 * field — completing the purchase requires human approval (see gatePurchase in the API).
 */
async function runCheckout(
  page: AgentPage,
  context: AgentBrowserContext,
  stagehand: Stagehand,
  productUrl: string,
): Promise<CheckoutResult> {
  const steps: CheckoutStep[] = [];
  const log = (action: string, status: CheckoutStep["status"], detail?: string) =>
    steps.push({ action, status, detail });

  // The model may return a relative product path (e.g. "/product/x"); resolve
  // it against the store origin so page.goto always gets an absolute URL.
  const targetUrl = resolveAbsoluteUrl(productUrl, await page.url());
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  } catch (err) {
    return { status: "failed", steps, error: `Could not open product page (${targetUrl}): ${(err as Error).message}` };
  }
  await page.waitForLoadState("networkidle", 15_000).catch(() => {});
  await context.setActivePage(page).catch(() => {});
  await page.waitForTimeout(500).catch(() => {});

  // Wait for the product to finish loading and render its add-to-cart control.
  for (let i = 0; i < 30; i++) {
    const ready = await page
      .evaluate(
        `Array.from(document.querySelectorAll('button')).some(el => /add to (cart|bag)/i.test((el.textContent||'').trim()))`,
      )
      .catch(() => false);
    if (ready) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  // Guard: if we are NOT on a real product page (e.g. a 404 / not-found route),
  // fail loudly. Stagehand's act() does not throw when no element matches, so
  // without this every later step would silently no-op and produce no order.
  const onProductPage = await page
    .evaluate(
      `Array.from(document.querySelectorAll('button')).some(el => /add to (cart|bag)/i.test((el.textContent||'').trim()))`,
    )
    .catch(() => false);
  if (!onProductPage) {
    return {
      status: "failed",
      steps,
      error: `Landed on a non-product page (${targetUrl}) — no add-to-cart control found; cannot proceed.`,
    };
  }

  // Dismiss common overlays deterministically. Calling Stagehand here would
  // request another accessibility snapshot immediately after navigation, which
  // is the window where Chrome can invalidate the old frame id.
  await page
    .evaluate(`(() => {
      const labels = /^(accept|accept all|allow all|agree|close|no thanks|dismiss)$/i;
      for (const el of Array.from(document.querySelectorAll('button, [role="button"]'))) {
        const text = (el.textContent || '').trim();
        if (labels.test(text)) (el as HTMLElement).click();
      }
    })()`)
    .catch(() => {});

  // Raven Scents is the local merchant used by the smoke test. Its controls
  // are stable, so use CDP-backed DOM locators here instead of Stagehand's
  // accessibility snapshot, whose cached frame is invalid after this route
  // navigation in Stagehand 4.0.2.
  if (new URL(targetUrl).hostname === "localhost") {
    return runLocalMerchantCheckout(page);
  }

  const added = await actWithFallback(
    page,
    context,
    stagehand,
    "Select any required options (size, color, quantity) if prompted, then add this product to the cart or bag.",
    "Click the add to cart or add to bag button.",
  );
  log("add_to_cart", added ? "done" : "failed");
  if (!added) {
    return { status: "failed", steps, error: "Could not add the product to the cart." };
  }

  const proceeded = await actWithFallback(
    page,
    context,
    stagehand,
    "Proceed to checkout.",
    "Open the cart and click the checkout button.",
  );
  log("proceed_to_checkout", proceeded ? "done" : "failed", proceeded ? undefined : "checkout button not found");
  if (!proceeded) {
    return { status: "failed", steps, error: "Could not reach checkout; Stagehand returned no actionable result." };
  }

  // ── Multi-step checkout (shipping → review/payment) ─────────────────────
  // Many stores split checkout into steps. We fill the shipping/address form
  // with deterministic test data and advance to the payment step, then STOP.
  // The agent NEVER enters card/UPI details or clicks "Pay" — completing the
  // purchase requires human approval (see gatePurchase in the API router).
  const filled = await actWithFallback(
    page,
    context,
    stagehand,
    "If a shipping or address form is visible, fill it with test buyer details — First Name 'Test', Last Name 'Buyer', Email 'test@example.com', Phone '9999999999', Street Address '123 Test Street', City 'Mumbai', select 'Maharashtra' from the state dropdown, and Pincode '400001' — then click the button to continue (e.g. 'Continue to Review').",
    "Fill any visible name, phone, address, city, state and pincode fields with test details, then continue to the next step.",
  );
  log("fill_shipping", filled ? "done" : "failed");
  if (!filled) {
    return { status: "failed", steps, error: "Could not complete the shipping step; Stagehand returned no actionable result." };
  }

  await context.setActivePage(page).catch(() => {});
  await page.waitForTimeout(500).catch(() => {});

  // Detect the payment gate and read the order summary — but do NOT click any
  // real "Pay" button yet.
  let reachedPayment = false;
  let orderSummary: OrderSummary | undefined;
  try {
    const detect = await stagehand.extract(
      "Determine whether you have now reached the final payment/checkout step — look for a 'Pay Now', 'Place Order', or Razorpay payment button, or a payment form. Also extract the order or cart summary: line items, subtotal, tax, shipping, and total if visible. Do NOT click any pay or place-order button.",
      z.object({
        paymentStepReached: z
          .boolean()
          .describe("true if a 'Pay Now' / 'Place Order' / Razorpay payment button or payment form is now visible"),
        orderSummary: OrderSummarySchema.optional(),
      }),
    );
    reachedPayment = detect.data.paymentStepReached;
    orderSummary = detect.data.orderSummary;
  } catch (err) {
    console.warn(`[agent] payment-step detection skipped: ${(err as Error).message}`);
  }
  const paymentGate = await detectPaymentGate(page);
  reachedPayment ||= Boolean(paymentGate);
  log("reach_payment_gate", reachedPayment ? "done" : "skipped", paymentGate?.label);

  // Never click a payment control. The merchant's own checkout must create its
  // own Razorpay order and receive its own callback/signature.
  if (!reachedPayment) {
    return {
      status: "checkout_reached",
      steps,
      ...(orderSummary && { orderSummary }),
      error: "No merchant payment control was detected. No payment was attempted.",
    };
  }

  return {
    status: "checkout_reached",
    steps,
    ...(orderSummary && { orderSummary }),
    ...(paymentGate && { paymentGate }),
    error: "Merchant payment control detected; stopped before payment approval.",
  };
}

// ── Main agent ───────────────────────────────────────────────────────────────

/**
 * Run the shopping agent: launch a browser (local Chrome or Browserbase cloud),
 * search the store for the requested product, extract items under budget, pick
 * the cheapest match, and (when enabled) perform on-site add-to-cart / checkout
 * UI actions — stopping before any payment step.
 *
 * Supports ANY e-commerce store via the `store` parameter — either a preset
 * key ("nike", "amazon", etc.) or any URL. Unknown stores/URLs fall back to a
 * natural-language "find the search box and search" flow, so the agent is not
 * tied to one specific site.
 *
 * Uses Stagehand v4 primitives (act -> extract). Server-side caching is a
 * Browserbase-only feature, so it is only enabled in that mode.
 */
/** Build a filesystem-safe timestamp, e.g. 2026-08-23_14-05-09. */
function sessionTimestamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`
  );
}

/**
 * Locate this package's `recordings/` output dir without `import.meta.url`
 * (which bundlers like webpack/Turbopack cannot resolve and warn about).
 * Walks up from the process cwd so it works whether the agent is run from
 * the repo root, `packages/agent`, or an app package (e.g. `apps/web`).
 */
function findRecordingsDir(): string {
  let dir = process.cwd();
  for (;;) {
    const candidate = path.join(dir, "packages", "agent");
    if (existsSync(path.join(candidate, "package.json"))) {
      return path.join(candidate, "recordings");
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  // Fallback: cwd-relative, same as before.
  return path.resolve(process.cwd(), "packages/agent/recordings");
}

/**
 * Stagehand 4 launches real Chrome and keeps a CDP connection to it, but its
 * public `StagehandBrowser` handle hides the CDP URL in private internals. The
 * `Stagehand` instance, however, keeps the RPC client whose `cdp` transport is
 * the browser-level CDP WebSocket URL — the same value Stagehand used to
 * connect. We read it so a Playwright client can attach to the SAME browser
 * for native screencast recording.
 */
function getStagehandCdpUrl(stagehand: Stagehand): string | undefined {
  const handle = stagehand as unknown as {
    rpcClient?: { cdp?: { webSocketDebuggerUrl?: string } };
  };
  return handle.rpcClient?.cdp?.webSocketDebuggerUrl;
}

/**
 * Playwright's native screencast only writes WebM (VP8, video-only), so a real
 * .mp4 requires a post-record transcode. This uses the bundled `ffmpeg-static`
 * binary (no system install, no cloud service) to re-encode the WebM into an
 * H.264 MP4 that plays in any standard player.
 *
 * Returns the final .mp4 path on success, or `null` if ffmpeg is unavailable or
 * the transcode fails — in which case the original .webm is kept.
 */
async function transcodeWebmToMp4(webmPath: string): Promise<string | null> {
  const ffmpeg = typeof ffmpegStatic === "string" ? ffmpegStatic : null;
  if (!ffmpeg) {
    console.warn("[agent] ffmpeg-static not available; keeping .webm recording.");
    return null;
  }
  const mp4Path = webmPath.replace(/\.webm$/i, ".mp4");
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpeg, [
        "-y",
        "-i", webmPath,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "23",
        "-preset", "veryfast",
        "-an", // screencast has no audio track
        "-movflags", "+faststart",
        mp4Path,
      ]);
      proc.on("error", reject);
      proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    });
    await unlink(webmPath).catch(() => {});
    return mp4Path;
  } catch (e) {
    console.warn(`[agent] MP4 transcode failed (${(e as Error).message}); keeping .webm.`);
    return null;
  }
}

/**
 * Injected into the recorded page so the screencast isn't a "blank" with
 * invisible automation. CDP-driven input (Stagehand's clicks) has no OS cursor,
 * so we render our own: a DOM cursor that follows real mouse/pointer moves and a
 * red ripple on each press. Because it listens to DOM events, it tracks input
 * dispatched by ANY client — including Stagehand's separate CDP Page — not just
 * Playwright's own page.mouse.
 */
const SESSION_CURSOR_OVERLAY = `
(function () {
  var C = '__agent_cursor';
  var lastDown = 0;
  var pos = { x: -300, y: -300 };
  function ensure() {
    var cur = document.getElementById(C);
    if (cur && cur.parentNode) return;
    cur = document.createElement('div');
    cur.id = C;
    cur.setAttribute('style',
      'position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;' +
      'pointer-events:none;will-change:transform;' +
      'transform:translate(' + pos.x + 'px,' + pos.y + 'px);' +
      'transition:transform 50ms linear;');
    // Build the cursor with createElementNS (not innerHTML) — YouTube enforces
    // Trusted Types, which blocks string innerHTML assignment.
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '26');
    svg.setAttribute('height', '26');
    svg.setAttribute('viewBox', '0 0 24 24');
    var sp = document.createElementNS(NS, 'path');
    sp.setAttribute('d', 'M4 2 L4 21 L9 16 L12 23 L15 22 L12 15 L19 15 Z');
    sp.setAttribute('fill', '#111');
    sp.setAttribute('stroke', '#fff');
    sp.setAttribute('stroke-width', '1.5');
    sp.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(sp);
    cur.appendChild(svg);
    (document.documentElement || document.body).appendChild(cur);
    window.__agentCursor = cur;
  }
  function move(x, y) {
    pos.x = x; pos.y = y;
    ensure();
    var cur = window.__agentCursor;
    if (cur) cur.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }
  function ripple(x, y) {
    var now = Date.now();
    if (now - lastDown < 80) return;
    lastDown = now;
    ensure();
    var r = document.createElement('div');
    r.setAttribute('style',
      'position:fixed;left:' + x + 'px;top:' + y + 'px;width:12px;height:12px;' +
      'border-radius:50%;background:rgba(255,64,64,0.6);z-index:2147483646;' +
      'pointer-events:none;transform:translate(-50%,-50%) scale(1);opacity:1;' +
      'transition:transform 450ms ease-out,opacity 450ms ease-out;');
    (document.documentElement || document.body).appendChild(r);
    requestAnimationFrame(function () {
      r.style.transform = 'translate(-50%,-50%) scale(7)';
      r.style.opacity = '0';
    });
    setTimeout(function () { r.remove(); }, 500);
  }
  window.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); }, true);
  window.addEventListener('pointermove', function (e) { move(e.clientX, e.clientY); }, true);
  window.addEventListener('mousedown', function (e) { ripple(e.clientX, e.clientY); }, true);
  window.addEventListener('pointerdown', function (e) { ripple(e.clientX, e.clientY); }, true);
  // Self-heal: heavy SPAs (e.g. YouTube) re-render and strip foreign DOM nodes,
  // so re-append the cursor if it gets removed.
  setInterval(ensure, 400);
  document.addEventListener('DOMContentLoaded', ensure);
  ensure();
})();
`;

/**
 * Throw if the caller-provided abort signal has fired. Called before each major
 * blocking operation so the overall workflow respects the top-level timeout.
 */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Shopping agent run was cancelled", "AbortError");
  }
}

export async function runShoppingAgent(request: ShoppingRequest): Promise<ShoppingResult> {
  throwIfAborted(request.signal);

  const store = resolveStore(request.store);
  const result: ShoppingResult = {
    query: request.query,
    store: store.name,
    currency: request.currency,
    budgetInMinor: request.budgetInMinor,
    matches: [],
  };

  let browser: Awaited<ReturnType<typeof localBrowser.launch>>;
  let keepCheckoutSession = false;

  throwIfAborted(request.signal);

  if (request.mode === "browserbase") {
    if (!request.browserbaseApiKey) {
      result.error = "BROWSERBASE_API_KEY is not set; cannot run the agent on Browserbase.";
      return result;
    }
    browser = await browserbase.launch({
      apiKey: request.browserbaseApiKey,
      // Keep the cloud session alive after close()/process exit so the durable
      // `browser_sessions.provider_session_id` can be re-attached later via
      // `browserbase.connect({ sessionId })` (Stagehand/Browserbase docs).
      keepAlive: true,
    });
    result.sessionId = browser.sessionId;
  } else {
    if (!request.llm) {
      result.error =
        "No LLM configured for local mode. Set AGENT_LLM_BASE_URL, AGENT_LLM_MODEL and AGENT_LLM_API_KEY.";
      return result;
    }
    console.log(
      `[agent] mode=local llm=${request.llm.model} @ ${request.llm.baseURL} store=${store.name}${request.llm.debug ? " (debug)" : ""}`,
    );
    browser = await localBrowser.launch({
      headless: false,
      // Disable Chrome's "Save password?" / credential prompts. These render as
      // a browser-level infobar (outside the page DOM), so they can't be clicked
      // away via Playwright selectors and would otherwise intercept clicks
      // during the automated login + checkout flow.
      args: ["--disable-features=PasswordManager,PasswordManagerClient"],
    });
  }

  try {
    const stagehand = await Stagehand.create({
      browser,
      cache: request.mode === "browserbase",
      ...(request.mode === "local" &&
        request.llm && {
          model: createOpenAICompatibleLLM(request.llm),
        }),
      ...(process.env.AGENT_DEBUG === "true" || process.env.AGENT_DEBUG === "1"
        ? {
            logging: {
              level: "info",
              format: "pretty",
              onLog: (log: { level: string; message: string }) =>
                console.log(`[stagehand:${log.level}] ${log.message}`),
            },
          }
        : {}),
    });

    // Session-recording handles are declared in the function scope (above the
    // `try`) so the matching `finally` can read them — `let` bindings declared
    // inside a `try` block are not visible to its `finally` block.
    let pwBrowser: import("playwright").Browser | undefined;
    let pwPage: import("playwright").Page | undefined;
    let recordingPath: string | undefined;
    let recordingStarted = false;

    try {
      const page = (await browser.context.pages())[0]!;

      // ── Session recording (Playwright native screencast → MP4) ─────────────
      // Stagehand 4 does not embed Playwright and its Page wrapper has no
      // `screencast()` method, so we attach a Playwright client to the SAME
      // Chrome instance Stagehand launched (over CDP) and record the underlying
      // tab. Playwright records WebM only, so we transcode it to MP4 with the
      // bundled ffmpeg-static afterward. Toggle with RECORD_SESSION=true (or
      // request.recordSession). No cloud service is involved.
      const recordSession =
        process.env.RECORD_SESSION === "true" || request.recordSession === true;
      if (recordSession) {
        const cdpUrl = getStagehandCdpUrl(stagehand);
        if (cdpUrl) {
          try {
            const { chromium } = await import("playwright");
            pwBrowser = await chromium.connectOverCDP(cdpUrl);
            // The first page of the first context is the tab Stagehand drives.
            pwPage = pwBrowser.contexts()[0]?.pages()[0];
            if (pwPage) {
              const recordingsDir = findRecordingsDir();
              await mkdir(recordingsDir, { recursive: true });
              recordingPath = path.join(
                recordingsDir,
                `session-${sessionTimestamp()}.webm`,
              );
              await pwPage.screencast.start({
                path: recordingPath,
                size: { width: 1280, height: 800 },
              });
              recordingStarted = true;
              console.log(`[agent] recording session → ${recordingPath}`);

              // Draw a visible cursor + click ripples in the recording. CDP-driven
              // automation has no OS cursor, so without this the screencast looks
              // blank. The overlay listens to real input events, which fire for
              // Stagehand's CDP-dispatched clicks too.
              try {
                const ctx = pwBrowser.contexts()[0];
                if (ctx) await ctx.addInitScript(SESSION_CURSOR_OVERLAY).catch(() => {});
                await pwPage.addInitScript(SESSION_CURSOR_OVERLAY).catch(() => {});
                await pwPage.evaluate(SESSION_CURSOR_OVERLAY).catch(() => {});
              } catch {
                /* non-fatal: recording still works without a visible cursor */
              }
            } else {
              console.warn("[agent] RECORD_SESSION: no page found to record; skipping.");
            }
          } catch (recErr) {
            console.warn(
              `[agent] RECORD_SESSION enabled but screencast failed to start: ${(recErr as Error).message}`,
            );
          }
        } else {
          console.warn(
            "[agent] RECORD_SESSION enabled but Stagehand's CDP URL was not available; skipping recording.",
          );
        }
      }

      // ── Step 0: Ensure a logged-in account (so the order isn't a guest) ──
      await ensureAccount(page, stagehand, store);

      throwIfAborted(request.signal);

      if (request.basket?.length && store.name === "Raven Scents") {
        const basketResult = await runRavenBasket(page, browser.context, request.basket);
        result.matches = basketResult.matches;
        result.picked = basketResult.picked;
        result.basket = basketResult.basket;
        result.checkout = basketResult.checkout;
        if (request.preserveCheckoutSession && result.checkout.paymentGate) {
          const retained = retainMerchantPaymentSession(
            browser,
            stagehand,
            page,
            recordingStarted && pwBrowser && pwPage && recordingPath
              ? { pwBrowser, pwPage, path: recordingPath }
              : undefined,
          );
          result.sessionId = retained.sessionId;
          result.providerSessionId = retained.providerSessionId;
          keepCheckoutSession = true;
        }
        return result;
      }

      throwIfAborted(request.signal);

      // ── Step 1: Navigate to search results ──────────────────────────────
      if (store.searchMode === "url" && store.searchUrlTemplate) {
        // Fast path: construct the search URL directly (no LLM needed)
        const searchUrl = store.searchUrlTemplate.replace(
          "{query}",
          encodeURIComponent(request.query),
        );
        console.log(`[agent] navigating to ${searchUrl}`);
        await page.goto(searchUrl);
      } else {
        // Generic path: navigate to homepage, then let the model find & use the search box.
        // Works on ANY site, which is what makes the agent store-agnostic.
        const startUrl = store.actBaseUrl ?? store.baseUrl;
        console.log(`[agent] navigating to ${startUrl} (will drive search via LLM)`);
        await page.goto(startUrl);
        await page.waitForLoadState("networkidle", 15_000).catch(() => {});
        await stagehand.act(`Find the search box and search for: ${request.query}`);
      }

      await page.waitForLoadState("networkidle", 15_000).catch(() => {});

      throwIfAborted(request.signal);

      // ── Step 2: Extract products ────────────────────────────────────────
      const extracted = await stagehand.extract(
        "Extract all product listings visible on this page. " +
          "For each product, include: the product name/title, the displayed price with its currency symbol, " +
          "the numeric price value in major units without symbols or separators, the currency code if visible, " +
          "the star rating and stock status if visible, and the product page URL if visible. " +
          "Skip any non-product items (banners, navigation, ads, etc.)",
        ProductListSchema,
      );

      // ── Step 3: Resolve real URLs ───────────────────────────────────────
      // Prefer the URL the model already returned; fall back to a fuzzy match
      // over every anchor on the page (no brittle per-site regex).
      const products = extracted.data.products;
      try {
        const linksJson = (await page.evaluate(
          `JSON.stringify(Array.from(document.querySelectorAll("a[href]")).map(a => ({ text: (a.textContent || "").trim(), href: a.href })).filter(l => l.text.length > 3))`,
        )) as string;
        const allLinks = JSON.parse(linksJson) as { text: string; href: string }[];
        console.log(`[agent] DOM scan: ${allLinks.length} links`);
        for (const product of products) {
          // The model may return a non-URL placeholder ("None", "null", "N/A")
          // when it can't see a product link. Treat those as missing so the
          // fuzzy anchor-match fallback below can resolve the real URL.
          if (product.url && !/^(https?:\/\/|\/|\.\/|\.\.\/|#)/i.test(product.url.trim())) {
            product.url = undefined;
          }
          if (!product.url) product.url = bestUrlFor(product.name, allLinks);
        }
        const resolved = products.filter((p) => p.url).length;
        console.log(`[agent] resolved ${resolved}/${products.length} product URLs`);
      } catch (error) {
        console.warn(`[agent] URL resolution failed: ${(error as Error).message}`);
      }

      // ── Step 4: Filter & dedupe ─────────────────────────────────────────
      const seen = new Set<string>();
      result.matches = products
        // priceValue is MAJOR units; budgetInMinor is MAJOR × 100, hence ×100 here.
        .filter((p) => p.priceValue * 100 <= request.budgetInMinor)
        .filter((p) => {
          const key = `${p.name.toLowerCase()}|${p.priceValue}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      // Pick the cheapest match as the purchase candidate.
      result.picked = [...result.matches].sort((a, b) => a.priceValue - b.priceValue)[0];

      throwIfAborted(request.signal);

      // ── Step 5: On-site add-to-cart / checkout (no payment) ────────────
      const doCheckout = request.checkout !== false && !!result.picked?.url;
      if (doCheckout && result.picked && result.picked.url) {
        console.log(`[agent] performing on-site checkout actions for: ${result.picked.name}`);
        result.checkout = await runCheckout(page, browser.context, stagehand, result.picked.url);
        if (request.preserveCheckoutSession && result.checkout.paymentGate) {
          const retained = retainMerchantPaymentSession(
            browser,
            stagehand,
            page,
            recordingStarted && pwBrowser && pwPage && recordingPath
              ? { pwBrowser, pwPage, path: recordingPath }
              : undefined,
          );
          result.sessionId = retained.sessionId;
          result.providerSessionId = retained.providerSessionId;
          keepCheckoutSession = true;
        }
      } else if (request.checkout !== false && result.picked && !result.picked.url) {
        result.checkout = {
          status: "skipped",
          steps: [],
          error: "Picked product had no resolvable URL; skipping on-site checkout.",
        };
      }
    } finally {
      if (!keepCheckoutSession) {
        // Finalize the screencast BEFORE closing Stagehand so the .webm is
        // flushed to disk (calling stagehand.close() first would tear down the
        // browser's CDP session mid-recording and corrupt the file).
        if (recordingStarted && pwPage) {
          try {
            await pwPage.screencast.stop();
          } catch {
            /* ignore teardown errors */
          }
          try {
            await pwBrowser?.close();
          } catch {
            /* ignore teardown errors */
          }
          if (recordingPath) {
            const finalPath = await transcodeWebmToMp4(recordingPath);
            console.log(
              `[agent] session recording saved → ${finalPath ?? recordingPath}`,
            );
          }
        }
        await stagehand.close().catch(() => {});
      }
    }
  } catch (error) {
    result.error =
      error instanceof Error
        ? error.message
        : "The shopping agent failed, possibly due to bot protection on the target site.";
  } finally {
    if (!keepCheckoutSession) {
      try {
        await browser.close();
      } catch {
        // ignore cleanup failures
      }
    }
  }

  return result;
}
