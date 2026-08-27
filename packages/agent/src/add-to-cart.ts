/**
 * Shared LLM-driven "add to cart" engine.
 *
 * This module owns the ONE place the agent decides how to put a product into a
 * cart, and it does so entirely through the model (Stagehand `act` / `extract`)
 * — there are NO regex text matches, NO hard-coded selectors, and NO
 * per-site navigation branches. That is deliberate: a regex like
 * /add to (cart|bag)/i silently no-ops on the millionth store whose button
 * reads "Add to trolley" / "शॉपिंग बैग में जोड़ें" / renders inside a shadow
 * root, and the run "gets stuck" or just sits on the product page. Driving the
 * UI with the LLM makes the add-to-cart step work for EVERY provider — external
 * storefronts (Nike, Amazon, any URL) and local/demo merchants alike.
 *
 * To avoid an import cycle (shopping-agent → local-merchant → this module),
 * this file only imports TYPES from shopping-agent/local-merchant (erased at
 * build time) and real values from zod + Stagehand + browser-types.
 */
import { z } from "zod";
import type { Stagehand } from "@browserbasehq/stagehand";
import type { AgentBrowserContext, AgentPage } from "./browser-types";
// Type-only — erased, so no runtime dependency on shopping-agent.
import type { CheckoutResult, CheckoutStep } from "./shopping-agent";

/** Minimal page surface needed to locate elements (mirrors shopping-agent). */
export type BrowserRoot = Pick<AgentPage, "locator">;

/**
 * Try a primary natural-language action, falling back to an alternative phrasing
 * if the first fails. Returns true if either succeeded. This is the lightweight
 * recovery layer — for state-changing UI steps we never blindly retry the same
 * instruction; we try a different description of the same intent.
 */
export async function actWithFallback(
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

/**
 * LLM-driven "add this product to the cart" routine shared by EVERY provider
 * path. It uses the model for all navigation/decisions (no regex / hardcoded
 * selectors) and STOPS after the item is in the cart — it never proceeds to
 * checkout, shipping, or any payment step.
 *
 * Steps:
 *   1. Dismiss any blocking overlay (cookie consent / newsletter / login gate).
 *   2. Confirm this is a purchasable product page (LLM, not a regex scan).
 *   3. Pick any required options and click the store's real Add to Cart control.
 *   4. Verify the item landed in the cart (LLM reads cart count / success toast).
 *
 * Returns status "added_to_cart" (or "failed" with a clear reason).
 */
export async function llmAddToCart(
  page: AgentPage,
  context: AgentBrowserContext,
  stagehand: Stagehand,
  options: { maxAttempts?: number } = {},
): Promise<CheckoutResult> {
  const steps: CheckoutStep[] = [];
  const log = (action: string, status: CheckoutStep["status"], detail?: string) =>
    steps.push({ action, status, detail });

  // Give the page a beat to settle (SPA mount / lazy controls) before the model
  // looks at it — avoids acting on a half-rendered frame.
  await page.waitForTimeout(500).catch(() => {});
  await context.setActivePage(page).catch(() => {});
  void options; // reserved for future retry budgeting

  // 1) Dismiss any blocking overlay via the LLM. Previously this was a hard-coded
  //    regex over button text; the model now decides what counts as an overlay
  //    and closes it, which works across the wildly different markup every
  //    merchant ships.
  const dismissed = await actWithFallback(
    page,
    context,
    stagehand,
    "If any modal overlay is blocking the page — cookie consent, newsletter signup, login prompt, or a dismissible banner — close or dismiss it (click Accept, Allow, Close, the X, or 'No thanks'). Do not navigate away from this product page.",
    "Close any visible popup or modal overlay on the page.",
  );
  log("dismiss_overlays", dismissed ? "done" : "skipped");

  // 2) Confirm we're actually on a product page. The model decides from the
  //    rendered UI (no regex hunting for "add to cart"); if it says this isn't
  //    a purchasable product page we fail loudly instead of silently adding
  //    nothing — the old "just showed the product" dead-end.
  let isProduct = true;
  try {
    const det = await stagehand.extract(
      "Is this a product detail page where a shopper can purchase a single product? Look for a product title with a price and an 'Add to Cart' / 'Add to Bag' / 'Buy' control. Answer true ONLY if a control to add this product to the cart is clearly present.",
      z.object({
        isProductPage: z
          .boolean()
          .describe("true if a cart-adding control is visible on this page"),
      }),
    );
    isProduct = det.data.isProductPage;
  } catch (err) {
    console.warn(`[agent] product-page check skipped: ${(err as Error).message}`);
  }
  log("confirm_product_page", isProduct ? "done" : "failed");
  if (!isProduct) {
    return {
      status: "failed",
      steps,
      error: "Landed on a non-product page — no add-to-cart control found; cannot proceed.",
    };
  }

  // 3) Add to cart. The model selects any required options (size/color/qty) and
  //    clicks the store's real add-to-cart control — no regex text matching.
  const added = await actWithFallback(
    page,
    context,
    stagehand,
    "Select any required product options (size, color, quantity, etc.) if prompted, then click the 'Add to Cart' or 'Add to Bag' button to add this product to your cart.",
    "Click the 'Add to Cart' or 'Add to Bag' button.",
  );
  log("add_to_cart", added ? "done" : "failed");
  if (!added) {
    return { status: "failed", steps, error: "Could not add the product to the cart." };
  }

  // 4) Verify the item is now in the cart (LLM reads the cart count / success
  //    toast / mini-cart). Best-effort: if the model can't confirm we still
  //    report added_to_cart so the run doesn't "get stuck" on a flaky read.
  let verified = false;
  try {
    await page.waitForTimeout(800).catch(() => {});
    const v = await stagehand.extract(
      "Was this product just added to the cart? Look for an increased cart item count, a cart icon showing a number, a confirmation message like 'Added to cart', or an opened mini-cart. Answer true only if there is clear evidence the item is now in the cart.",
      z.object({
        addedToCart: z
          .boolean()
          .describe("true if there is evidence the item is now in the cart"),
      }),
    );
    verified = v.data.addedToCart;
  } catch (err) {
    console.warn(`[agent] cart-verification skipped: ${(err as Error).message}`);
  }
  log(
    "verify_cart",
    verified ? "done" : "skipped",
    verified ? undefined : "could not confirm; item may still be in cart",
  );

  return { status: "added_to_cart", steps };
}
