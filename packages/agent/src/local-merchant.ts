/**
 * Generic "local merchant" engine.
 *
 * Some merchants (typically local dev/demo storefronts) are plain SPAs with
 * stable DOM and no bot protection. For those, the agent can skip LLM-driven
 * actions entirely and drive the UI deterministically — but the specifics
 * (URLs, cart storage shape, shipping rule, checkout form layout) differ per
 * merchant. This module holds ALL of that generic machinery; each merchant is
 * described by a pure-data {@link LocalMerchantProfile} registered at startup.
 *
 * Nothing in here may reference a specific merchant — see
 * `src/merchants/raven-scents.ts` for an example profile.
 */
import type { Stagehand } from "@browserbasehq/stagehand";
import type { AgentBrowserContext, AgentPage } from "./browser-types";
// Shared LLM-driven add-to-cart engine (no regex / hard-coded selectors) used by
// EVERY provider, including local/demo merchants, so they navigate via the model.
import { actWithFallback, llmAddToCart } from "./add-to-cart";
// Type-only import — erased at build time, so no runtime cycle with the agent.
import type { BasketItem, CheckoutResult, CheckoutStep, Product } from "./shopping-agent";

// ── Profile ──────────────────────────────────────────────────────────────────

export interface LocalMerchantProfile {
  /** Store preset key that activates this profile (e.g. "raven"). */
  key: string;
  /** Display name reported as `ShoppingResult.store`. */
  name: string;
  /** Store origin, e.g. "http://localhost:5173". */
  baseUrl: string;
  /** Route showing the product catalog (search box lives here for SPAs). */
  shopPath: string;
  /** Cart route visited before proceeding to checkout (if the store has one). */
  cartPath?: string;
  /** Login route (when the merchant attributes orders to signed-in users). */
  loginPath?: string;
  /** Href prefix of product pages, e.g. "/product/". */
  productHrefPrefix: string;
  /** ISO 4217 currency code prices are displayed in (e.g. "INR"). */
  currency: string;
  /** Currency symbol used in rendered prices (e.g. "₹"). */
  currencySymbol: string;
  /**
   * JS expression (evaluated in the page) returning the TOTAL number of items
   * in the persisted cart, or 0 when unreadable. Lets the engine wait for the
   * merchant's cart state to settle after every add-to-cart without knowing
   * the storage shape.
   */
  persistedCartCountExpr?: string;
  /** JS expression clearing the merchant's persisted cart (e.g. a localStorage
   * key). Run before adding so only the explicitly selected item is ever
   * charged — local SPAs persist carts across navigations and repeated
   * add-to-cart retries otherwise accumulate phantom units. */
  clearCartExpr?: string;
  /** Free-shipping / flat-rate rule in MAJOR units. */
  shippingRule?: (subtotalMajor: number) => number;
  /** How to fill the checkout's shipping form. */
  checkoutForm?: {
    /** Values filled into `main input` elements by DOM order (visual-only forms). */
    positionalValues?: string[];
    /** Selector-based fields: [selector, value]. */
    fields?: Array<[string, string]>;
    /** A <select> that must end up on this exact value (e.g. the state dropdown). */
    requiredSelect?: { selector: string; value: string };
  };
  /** Test account used to sign in so orders aren't guest checkouts. Credentials
   *  come from the environment — never hardcode them in source. */
  account?: { emailEnv: string; passwordEnv: string; fullNameEnv?: string };
  /** Domain vocabulary ignored when fuzzy-matching basket items to catalog
   *  products (e.g. "perfume" for a fragrance store). */
  basketStopTokens?: string[];
}

// ── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, LocalMerchantProfile>();

/** Register a merchant profile. Later registrations win (useful for tests). */
export function registerLocalMerchant(profile: LocalMerchantProfile): void {
  registry.set(profile.key.toLowerCase(), profile);
}

/** All registered profiles (read-only). */
export function getRegisteredLocalMerchants(): readonly LocalMerchantProfile[] {
  return [...registry.values()];
}

/** Look a profile up by store key ("raven", "local-merchant", "local merchant") — case-insensitive. */
export function findLocalMerchant(storeKey: string | undefined): LocalMerchantProfile | undefined {
  if (!storeKey) return undefined;
  const key = storeKey.trim().toLowerCase();
  const normalized = key.replace(/[\s_]+/g, "-");
  return registry.get(key) ?? registry.get(normalized);
}

/** Find the profile whose origin matches a full target URL, if any. */
export function findLocalMerchantForUrl(url: string): LocalMerchantProfile | undefined {
  let origin: string | undefined;
  try {
    origin = new URL(url).origin;
  } catch {
    return undefined;
  }
  for (const profile of registry.values()) {
    try {
      if (new URL(profile.baseUrl).origin === origin) return profile;
    } catch {
      /* malformed profile baseUrl — skip */
    }
  }
  return undefined;
}

/** True when `storeKey` refers to a registered local merchant. */
export function isRegisteredLocalMerchant(storeKey: string | undefined): boolean {
  return findLocalMerchant(storeKey) !== undefined;
}

/** Build the StorePreset accelerator for a registered merchant. */
export function merchantStorePreset(profile: LocalMerchantProfile) {
  const origin = new URL(profile.baseUrl).origin;
  return {
    name: profile.name,
    baseUrl: origin,
    searchMode: "act" as const,
    actBaseUrl: `${origin}${profile.shopPath}`,
  };
}

// ── Catalog scraping ─────────────────────────────────────────────────────────

export interface MerchantCatalogProduct {
  /** Best-effort product title (card text before the price). */
  name: string;
  slug: string;
  url: string;
  /** Full card text (lowercased) used for fuzzy matching. */
  searchText: string;
  priceValue: number | null;
  price: string | null;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Scrape a merchant's LIVE rendered catalog from its shop page DOM — no
 * hard-coded product list, so any product the merchant adds works. Assumes an
 * SPA whose product cards anchor to `{productHrefPrefix}<slug>` and render a
 * price containing the profile's currency symbol.
 */
export async function scrapeMerchantCatalog(
  page: AgentPage,
  profile: LocalMerchantProfile,
): Promise<MerchantCatalogProduct[]> {
  const shopUrl = `${new URL(profile.baseUrl).origin}${profile.shopPath}`;
  await page.goto(shopUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", 15_000).catch(() => {});
  // The grid renders after React mounts + data loads; poll for cards.
  for (let attempt = 0; attempt < 24; attempt++) {
    const count = await page
      .evaluate(`document.querySelectorAll('a[href^="${profile.productHrefPrefix}"]').length`)
      .catch(() => 0);
    if (Number(count) > 0) break;
    await page.waitForTimeout(250).catch(() => {});
  }

  const symbol = escapeRegExp(profile.currencySymbol);
  const pricePattern = new RegExp(`${symbol}\\s?([\\d,]+(?:\\.\\d+)?)`);
  const hasPricePattern = new RegExp(`${symbol}\\s?[\\d,]`);

  const raw = (await page.evaluate(
    `(function () {
      var prefix = ${JSON.stringify(profile.productHrefPrefix)};
      var priceRe = ${pricePattern.toString()};
      var cardPriceRe = ${hasPricePattern.toString()};
      var out = new Map();
      for (var a of document.querySelectorAll('a[href^="' + prefix + '"]')) {
        // Walk up to the enclosing card that also contains a price.
        var card = a;
        for (var i = 0; i < 5 && card.parentElement; i++) {
          if (cardPriceRe.test(card.innerText || "")) break;
          card = card.parentElement;
        }
        var text = (card.innerText || "").replace(/\\s+/g, " ").trim();
        var href = a.getAttribute("href") || "";
        var m = text.match(priceRe);
        if (!out.has(href)) {
          out.set(href, { text: text.slice(0, 300), price: m ? m[1].replace(/,/g, "") : null });
        }
      }
      return Array.from(out.entries());
    })()`,
  ).catch(() => [])) as Array<[string, { text: string; price: string | null }]>;

  const origin = new URL(profile.baseUrl).origin;
  const stripPrefix = new RegExp(`^${escapeRegExp(profile.productHrefPrefix)}`);
  return raw.map(([href, info]) => {
    // Card text is typically "<Name> ₹<price> Add to Cart ..." — take the part
    // before the price as the display name.
    const beforePrice = info.text.split(profile.currencySymbol)[0] ?? "";
    const name = beforePrice
      .replace(/\badd to (cart|bag)\b/gi, "")
      .replace(/[|\-–—·]+$/, "")
      .trim() || href.replace(stripPrefix, "").replace(/-/g, " ");
    return {
      name,
      slug: href.replace(stripPrefix, ""),
      url: `${origin}${href}`,
      searchText: `${name} ${info.text}`.toLowerCase(),
      priceValue: info.price ? Number(info.price) : null,
      price: info.price ? `${profile.currencySymbol}${info.price}` : null,
    };
  }).filter((p) => p.slug.length > 0);
}

// ── Query → catalog matching ────────────────────────────────────────────────

/**
 * Fuzzy-match a free-form item phrase against catalog products using
 * normalized token overlap (the standard e-commerce query→catalog approach):
 * every meaningful token of the phrase found in the product's text scores,
 * with a bonus for full-phrase substring matches.
 */
export function matchCatalogProduct(
  phrase: string,
  catalog: MerchantCatalogProduct[],
  options: {
    /** Domain words to ignore ("perfume", "scent", …). */
    stopTokens?: string[];
    /** Major-unit budget cap for ONE unit; candidates above it are ignored
     *  unless nothing cheaper exists. */
    maxUnitPrice?: number | null;
  } = {},
): { product: MerchantCatalogProduct; score: number } | null {
  const DEFAULT_STOP_TOKENS = ["the", "a", "an", "of", "for", "with", "and", "my", "me", "some", "please", "buy", "get", "order", "want", "need", "item", "product"];
  const stopTokens = new Set([...DEFAULT_STOP_TOKENS, ...(options.stopTokens ?? [])]);
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const phraseNorm = normalize(phrase);
  const tokens = phraseNorm.split(" ").filter((t) => t.length > 1 && !stopTokens.has(t));
  if (!tokens.length || !catalog.length) return null;

  // Prefer affordable candidates; fall back to the whole catalog only when
  // every product exceeds the budget (better to return something than nothing).
  let candidates = catalog;
  if (options.maxUnitPrice != null && options.maxUnitPrice > 0) {
    const affordable = catalog.filter(
      (p) => p.priceValue == null || p.priceValue <= options.maxUnitPrice!,
    );
    if (affordable.length) candidates = affordable;
  }

  let best: { product: MerchantCatalogProduct; score: number } | null = null;
  for (const product of candidates) {
    const hay = normalize(product.searchText);
    const matched = tokens.filter((t) => hay.includes(t)).length;
    let score = matched / tokens.length;
    if (hay.includes(phraseNorm)) score += 0.25; // full phrase substring bonus
    if (!best || score > best.score) best = { product, score };
  }
  // Require at least half the tokens to match — otherwise it isn't a match.
  return best && best.score >= 0.5 ? best : null;
}

// ── Account login ────────────────────────────────────────────────────────────

/**
 * Sign in through the merchant's real /login UI with the configured test
 * account so the browser holds a valid session and placed orders are
 * attributed to a user instead of a guest. Credentials are read from the
 * environment (never stored in source). If the account doesn't exist yet, it
 * is created via the Supabase admin API (when configured) before retrying.
 * Best-effort: any failure just logs and continues as guest.
 */
export async function ensureLocalMerchantAccount(
  page: AgentPage,
  profile: LocalMerchantProfile,
): Promise<void> {
  if (!profile.loginPath || !profile.account) return;
  const email = process.env[profile.account.emailEnv];
  const password = process.env[profile.account.passwordEnv];
  if (!email || !password) {
    console.log(
      `[agent] ${profile.name}: ${profile.account.emailEnv}/${profile.account.passwordEnv} not set — continuing as guest`,
    );
    return;
  }
  const fullName = profile.account.fullNameEnv ? process.env[profile.account.fullNameEnv] : undefined;

  const loginUrl = `${new URL(profile.baseUrl).origin}${profile.loginPath}`;
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
        set(document.querySelector('input[type="email"]'), ${JSON.stringify(email)});
        set(document.querySelector('input[type="password"]'), ${JSON.stringify(password)});
      })();
    `);
    await page.evaluate(`document.querySelector('button[type="submit"]')?.click();`);
    for (let i = 0; i < 30; i++) {
      if (!(await page.evaluate(`location.pathname.includes(${JSON.stringify(profile.loginPath)})`))) return true;
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
            email,
            password,
            email_confirm: true,
            user_metadata: fullName ? { full_name: fullName } : {},
          }),
        }).catch(() => {});
        await loginViaUI();
      }
    }
    console.log(`[agent] signed in as ${email} (landed at ${await page.url()})`);
  } catch (e) {
    console.warn(`[agent] login failed — continuing as guest: ${(e as Error).message}`);
  }
}

// ── Deterministic checkout (no payment) ──────────────────────────────────────

/**
 * Empty the merchant's persisted cart (when the profile knows how) and reload
 * so the UI reflects it. Best-effort: profiles without `clearCartExpr` keep
 * whatever the browser holds. Returns the post-clear item count.
 */
export async function clearMerchantCart(
  page: AgentPage,
  profile: LocalMerchantProfile,
): Promise<number> {
  if (!profile.clearCartExpr) return -1;
  await page.evaluate(profile.clearCartExpr).catch(() => {});
  const here = await page.url().catch(() => "");
  if (here) await page.goto(here, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForLoadState("networkidle", 15_000).catch(() => {});
  const count = profile.persistedCartCountExpr
    ? Number(await page.evaluate(profile.persistedCartCountExpr).catch(() => -1))
    : -1;
  console.log(`[agent] cleared ${profile.name} cart (items now: ${count})`);
  return count;
}

/**
 * Drive a local merchant's deterministic add-to-cart → checkout flow using the
 * profile's form description. Stops before any payment control — completing
 * the purchase requires explicit approval (see approveMerchantPayment).
 */
export async function runLocalMerchantCheckout(
  page: AgentPage,
  profile: LocalMerchantProfile,
  alreadyAdded = false,
  opts?: { context?: AgentBrowserContext; stagehand?: Stagehand; proceedToCheckout?: boolean },
): Promise<CheckoutResult> {
  const steps: CheckoutStep[] = [];
  const log = (action: string, status: CheckoutStep["status"], detail?: string) =>
    steps.push({ action, status, detail });

  // LLM-driven path: when a Stagehand instance is available we use the shared
  // add-to-cart engine (no regex / hard-coded selectors) for EVERY provider,
  // including local/demo merchants. This satisfies the requirement that the
  // agent complete the cart journey via the model rather than brittle text
  // matching that silently no-ops on unfamiliar button copy.
  const stagehand = opts?.stagehand;
  const context = opts?.context;
  if (stagehand && context) {
    if (!alreadyAdded) {
      // Start from an empty merchant cart so only the selected item is ever
      // charged (Raven persists its cart in localStorage — stale runs left
      // 3× Dark Ocean + extras behind, producing ₹3,246 totals).
      await clearMerchantCart(page, profile);
      const cart = await llmAddToCart(page, context, stagehand);
      if (cart.status !== "added_to_cart") return cart;
      // Default: stop once the item is in the cart. Only continue to the
      // payment gate when the caller explicitly asks (e.g. --pay-now).
      if (!opts?.proceedToCheckout) return cart;
    } else {
      log("add_to_cart", "done", "already added");
    }

    // ── Optional deeper checkout (LLM-driven navigation) ──────────────────
    const proceeded = await actWithFallback(
      page,
      context,
      stagehand,
      "Open the cart and proceed to checkout.",
      "Click the cart icon, then click the checkout button.",
    );
    log("proceed_to_checkout", proceeded ? "done" : "failed");
    if (!proceeded) return { status: "failed", steps, error: "Checkout button was not found." };
    await page.waitForLoadState("networkidle", 15_000).catch(() => {});

    // Profile-described selector fields (these target the merchant's known
    // inputs, NOT regex navigation) are still applied deterministically.
    for (const [selector, value] of profile.checkoutForm?.fields ?? []) {
      const input = page.locator(selector).first();
      if ((await input.count().catch(() => 0)) > 0) await input.fill(value).catch(() => {});
    }
    const positionalValues = profile.checkoutForm?.positionalValues;
    if (positionalValues?.length) {
      const inputs = page.locator("main input");
      const inputCount = await inputs.count().catch(() => 0);
      for (let i = 0; i < Math.min(inputCount, positionalValues.length); i++) {
        await inputs.nth(i).fill(positionalValues[i] ?? "").catch(() => {});
      }
    }
    const requiredSelect = profile.checkoutForm?.requiredSelect;
    if (requiredSelect) {
      const select = requiredSelect.selector
        ? page.locator(requiredSelect.selector).first()
        : page.locator("select").first();
      const hasSelect = (await select.count().catch(() => 0)) > 0;
      if (hasSelect) await select.selectOption(requiredSelect.value).catch(() => {});
      const selected = !hasSelect || (await page.evaluate(
        `document.querySelector('select')?.value === ${JSON.stringify(requiredSelect.value)}`,
      ).catch(() => false));
      if (!selected) {
        log("fill_shipping", "failed", `Required dropdown was not set to "${requiredSelect.value}"`);
        return {
          status: "failed",
          steps,
          error: `Could not select "${requiredSelect.value}" in the required dropdown.`,
        };
      }
    }

    // Raven-style checkouts are multi-step (Shipping → "Continue to Review →"
    // → Review & Pay → "Pay Now" → Razorpay). The old code clicked continue
    // once and then gave up, leaving the retained session parked on the
    // Shipping step — approveMerchantPayment later found no gate and failed
    // with "no visible Razorpay payment control". Advance step-by-step until
    // a payment gate appears (or we run out of continue controls).
    // Best-effort: select a saved address when the merchant offers one, so
    // "Continue to Review" is enabled.
    await page.evaluate(`
      (() => {
        const els = Array.from(document.querySelectorAll('input[type="radio"], [role="radio"]'));
        const target = els.find((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && el.getAttribute('aria-checked') !== 'true' && !(el instanceof HTMLInputElement && el.checked);
        });
        if (target) target.click();
      })()
    `).catch(() => {});
    let continued = false;
    for (let round = 0; round < 3; round++) {
      const gateEarly = await detectPaymentGate(page);
      if (gateEarly) break;
      // DOM-evaluate click first: immune to split text nodes
      // ("Continue to Review" + "→") that locator innerText matching can miss.
      const viaDom = await page.evaluate(`
        (() => {
          const re = /continue to review/i;
          const candidates = Array.from(document.querySelectorAll(
            'button, [role="button"], a, input[type="submit"], input[type="button"]'
          ));
          for (const element of candidates) {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) continue;
            const label = [element.innerText, element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('value')]
              .filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim();
            if (re.test(label)) {
              element.click();
              return true;
            }
          }
          return false;
        })()
      `).catch(() => false);
      const clicked =
        viaDom ||
        (await clickVisibleText(page, /continue to review/i).catch(() => false)) ||
        (await actWithFallback(
          page,
          context,
          stagehand,
          "Click the 'Continue to Review' button to advance from Shipping to Review & Pay. If a saved address is shown, select it first.",
          "Click the continue to review button.",
        ));
      if (!clicked) {
        // Diagnostics: prove what controls the agent actually saw.
        const visible = await page.evaluate(`
          (() => {
            const out = [];
            for (const el of document.querySelectorAll('button, [role="button"], a')) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              const t = (el.innerText || "").replace(/\\s+/g, " ").trim();
              if (t) out.push(t.slice(0, 60));
              if (out.length >= 25) break;
            }
            return out;
          })()
        `).catch(() => [] as string[]);
        console.log(`[agent:checkout] no continue control clicked; visible: ${JSON.stringify(visible)}`);
        break;
      }
      continued = true;
      await page.waitForLoadState("networkidle", 15_000).catch(() => {});
      await page.waitForTimeout(800).catch(() => {});
    }
    // One final generic continue attempt for non-Raven copy ("Continue",
    // "Review order", ...), then stop — payment itself needs approval.
    if (!(await detectPaymentGate(page))) {
      const generic = await actWithFallback(
        page,
        context,
        stagehand,
        "Click the button to continue, review, or place the order.",
        "Click the continue, review, or proceed button.",
      );
      continued = continued || generic;
      await page.waitForLoadState("networkidle", 15_000).catch(() => {});
    }
    log("fill_shipping", continued ? "done" : "skipped");

    // Verify the step actually advanced. Raven's handleNext() (Checkout.tsx)
    // stays on Shipping when validateShipping() fails — the click "lands" but
    // nothing moves, which previously looked like "Continue to Review was
    // never clicked". Surface the inline validation errors and make one
    // targeted repair attempt instead of failing blind.
    const readPageText = async (): Promise<string> =>
      ((await page.evaluate(`(document.body?.innerText || "")`).catch(() => "")) as string);
    let pageText = await readPageText();
    let onReviewStep = /review your order|pay now/i.test(pageText);
    if (!onReviewStep && /shipping information/i.test(pageText)) {
      const fieldErrors = (await page.evaluate(`
        (() => {
          const out = [];
          for (const el of document.querySelectorAll('p, span')) {
            const t = (el.innerText || "").replace(/\\s+/g, " ").trim();
            if (/^(required|valid email required|10-digit number required|6-digit pincode required)$/i.test(t)) out.push(t);
            if (out.length >= 8) break;
          }
          return out;
        })()
      `).catch(() => [])) as string[];
      console.log(`[agent:checkout] still on Shipping; validation errors: ${JSON.stringify(fieldErrors)}`);
      log("fill_shipping", "failed", fieldErrors.length ? `Validation: ${fieldErrors.join("; ")}` : "Still on Shipping step");
      const repaired = await actWithFallback(
        page,
        context,
        stagehand,
        `The checkout is stuck on Shipping Information${fieldErrors.length ? ` with validation errors: ${fieldErrors.join("; ")}` : ""}. Fix it: ${fieldErrors.length ? "fill each flagged field with valid test data (names/address/city non-empty, valid email, 10-digit phone, 6-digit pincode, state Maharashtra)" : "select the shown saved address card"} — then click 'Continue to Review →' to reach Review & Pay.`,
        "Fix the flagged shipping fields with valid test data, then click continue to review.",
      );
      if (repaired) {
        await page.waitForLoadState("networkidle", 15_000).catch(() => {});
        await page.waitForTimeout(800).catch(() => {});
        pageText = await readPageText();
        onReviewStep = /review your order|pay now/i.test(pageText);
        log("repair_shipping", onReviewStep ? "done" : "failed");
      }
    }

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

  // ── Deterministic (no-LLM) path ──────────────────────────────────────────
  // Used by the deterministic basket test, which supplies no Stagehand
  // instance. Preserved for backward compatibility; it still does the full
  // add -> checkout -> payment-gate journey on the merchant's known markup.
  const added = alreadyAdded || (await clickVisibleText(page, /add to (cart|bag)/i).catch(() => false));
  log("add_to_cart", added ? "done" : "failed");
  if (!added) return { status: "failed", steps, error: "Add-to-cart button was not found." };
  await page.waitForTimeout(300).catch(() => {});

  const onCheckoutRoute = /\/checkout(?:[/?#]|$)/i.test(await page.url());
  const proceeded = onCheckoutRoute || await clickVisibleText(page, /checkout|view cart|cart/i).catch(() => false);
  log("proceed_to_checkout", proceeded ? "done" : "failed");
  if (!proceeded) return { status: "failed", steps, error: "Checkout button was not found." };
  await page.waitForLoadState("networkidle", 15_000).catch(() => {});

  for (const [selector, value] of profile.checkoutForm?.fields ?? []) {
    const input = page.locator(selector).first();
    if ((await input.count().catch(() => 0)) > 0) await input.fill(value).catch(() => {});
  }
  const positionalValues = profile.checkoutForm?.positionalValues;
  if (positionalValues?.length) {
    const inputs = page.locator("main input");
    const inputCount = await inputs.count().catch(() => 0);
    for (let i = 0; i < Math.min(inputCount, positionalValues.length); i++) {
      await inputs.nth(i).fill(positionalValues[i] ?? "").catch(() => {});
    }
  }
  const requiredSelect = profile.checkoutForm?.requiredSelect;
  if (requiredSelect) {
    const select = requiredSelect.selector
      ? page.locator(requiredSelect.selector).first()
      : page.locator("select").first();
    const hasSelect = (await select.count().catch(() => 0)) > 0;
    if (hasSelect) await select.selectOption(requiredSelect.value).catch(() => {});
    const selected = !hasSelect || (await page.evaluate(
      `document.querySelector('select')?.value === ${JSON.stringify(requiredSelect.value)}`,
    ).catch(() => false));
    if (!selected) {
      log("fill_shipping", "failed", `Required dropdown was not set to "${requiredSelect.value}"`);
      return {
        status: "failed",
        steps,
        error: `Could not select "${requiredSelect.value}" in the required dropdown.`,
      };
    }
  }

  // Multi-step checkouts (Shipping → Continue to Review → Review & Pay):
  // keep clicking continue controls until the payment gate appears.
  let continued = false;
  for (let round = 0; round < 3; round++) {
    if (await detectPaymentGate(page)) break;
    const clicked = await clickVisibleText(page, /continue to review|continue|review|place order|proceed/i).catch(() => false);
    if (!clicked) break;
    continued = true;
    await page.waitForLoadState("networkidle", 15_000).catch(() => {});
    await page.waitForTimeout(800).catch(() => {});
  }
  log("fill_shipping", continued ? "done" : "skipped");

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

async function clickVisibleText(page: AgentPage, pattern: RegExp): Promise<boolean> {
  for (const selector of ["button", '[role="button"]', "a"]) {
    const elements = page.locator(selector);
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

/** Mirror of shopping-agent.ts detectPaymentGate (kept DOM-identical). */
async function detectPaymentGate(page: AgentPage) {
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
  `).catch(() => undefined)) as { provider: "razorpay" | "unknown"; label: string } | undefined;
}

// ── Multi-item basket run ────────────────────────────────────────────────────

/**
 * Resolve a requested multi-item basket against the merchant's live catalog,
 * add every item, proceed through cart → checkout, and stop at the payment
 * gate. Fully deterministic (no LLM calls).
 */
export async function runLocalMerchantBasket(
  page: AgentPage,
  context: AgentBrowserContext,
  profile: LocalMerchantProfile,
  basket: Array<{ name: string; quantity: number }>,
  budgetInMinor?: number,
): Promise<{ matches: Product[]; picked: Product; basket: BasketItem[]; checkout: CheckoutResult }> {
  // Resolve EVERY requested item against the live catalog up front so we fail
  // fast (with a helpful listing) instead of mid-checkout.
  await clearMerchantCart(page, profile);
  const catalog = await scrapeMerchantCatalog(page, profile);
  if (!catalog.length) {
    throw new Error(`Could not read the ${profile.name} product catalog from ${profile.shopPath}.`);
  }

  const resolved: Array<{
    item: { name: string; quantity: number };
    product: MerchantCatalogProduct;
  }> = [];
  // Budget is in MINOR units; catalog prices are in major units. All supported
  // local merchants use 2-decimal currencies (100 minor = 1 major).
  const minorPerMajor = 100;
  const maxUnitPrice =
    budgetInMinor != null && budgetInMinor > 0 ? budgetInMinor / minorPerMajor : null;
  for (const item of basket) {
    const best = matchCatalogProduct(item.name, catalog, {
      stopTokens: profile.basketStopTokens,
      maxUnitPrice,
    });
    if (!best) {
      throw new Error(
        `No ${profile.name} product matches "${item.name}". Available products: ${catalog.map((p) => p.name).join(", ")}`,
      );
    }
    resolved.push({ item, product: best.product });
  }

  const matches: Product[] = [];
  const basketItems: BasketItem[] = [];
  let total = 0;

  for (const { item, product } of resolved) {
    const picked: Product = {
      name: product.name,
      price: product.price ?? `${profile.currencySymbol}?`,
      priceValue: product.priceValue ?? 0,
      currency: profile.currency,
      url: product.url,
    };
    matches.push(picked);
    basketItems.push({ ...picked, quantity: item.quantity, currency: profile.currency });
    total += picked.priceValue * item.quantity;

    await page.goto(product.url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", 15_000).catch(() => {});
    await context.setActivePage(page).catch(() => {});
    await page.waitForTimeout(500).catch(() => {});
    for (let i = 0; i < item.quantity; i++) {
      if (!(await clickVisibleText(page, /add to (cart|bag)/i).catch(() => false))) {
        throw new Error(`Could not add ${item.name} to the ${profile.name} cart.`);
      }
      const expectedQuantity = basketItems.reduce(
        (sum, current) => sum + current.quantity,
        0,
      ) - item.quantity + i + 1;
      if (profile.persistedCartCountExpr) {
        for (let attempt = 0; attempt < 20; attempt++) {
          const persistedQuantity = Number(
            await page.evaluate(profile.persistedCartCountExpr).catch(() => 0),
          );
          if (persistedQuantity >= expectedQuantity) break;
          await page.waitForTimeout(250).catch(() => {});
        }
      }
      await page.waitForTimeout(400).catch(() => {});
    }
  }

  // Visit the rendered cart first (when the merchant has one). This lets the
  // merchant finish its persisted cart update before checkout validates that
  // at least one item is selected.
  if (profile.cartPath) {
    await page.goto(`${new URL(profile.baseUrl).origin}${profile.cartPath}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", 15_000).catch(() => {});
    await context.setActivePage(page).catch(() => {});
    for (let attempt = 0; attempt < 40; attempt++) {
      if (profile.persistedCartCountExpr) {
        const cartReady = await page.evaluate(
          `(function () {
            var count = Number((${profile.persistedCartCountExpr}) || 0);
            var text = (document.body.innerText || '').toLowerCase();
            return count > 0 && text.includes('proceed to checkout');
          })()`,
        ).catch(() => false);
        if (cartReady) break;
        await page.waitForTimeout(250).catch(() => {});
      } else {
        break;
      }
    }
    const proceededFromCart = await clickVisibleText(page, /proceed to checkout/i).catch(() => false);
    if (!proceededFromCart) {
      const cartText = await page.evaluate(`(document.body.innerText || '').slice(0, 800)`).catch(() => "");
      throw new Error(
        `${profile.name} cart did not expose a checkout link with the requested item. Visible cart: ${cartText}`,
      );
    }
    await page.waitForLoadState("networkidle", 15_000).catch(() => {});
    await page.waitForTimeout(500).catch(() => {});
  }

  const checkout = await runLocalMerchantCheckout(page, profile, true);
  if (checkout.status !== "failed" && !checkout.orderSummary?.total) {
    const shipping = profile.shippingRule ? profile.shippingRule(total) : 0;
    const merchantTotal = total + shipping;
    checkout.orderSummary = {
      items: resolved.map(({ item, product }) => ({
        name: `${product.name} ×${item.quantity}`,
        price: `${profile.currencySymbol}${((product.priceValue ?? 0) * item.quantity).toLocaleString()}`,
      })),
      subtotal: `${profile.currencySymbol}${total.toLocaleString()}`,
      tax: null,
      shipping: `${profile.currencySymbol}${shipping.toLocaleString()}`,
      total: `${profile.currencySymbol}${merchantTotal.toLocaleString()}`,
    };
    checkout.orderSummarySource = "basket";
  }

  return { matches, picked: matches[0]!, basket: basketItems, checkout };
}
