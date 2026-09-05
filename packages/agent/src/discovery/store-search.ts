import type { Stagehand } from "@browserbasehq/stagehand";

import type { AgentBrowserContext, AgentPage } from "../browser-types";

/**
 * Search a storefront through its live search input without asking the LLM to
 * generate a second browser action. `observe()` supplies the resilient locator;
 * the fill and submit are deterministic browser controls.
 *
 * Handles two common patterns:
 * 1. Visible text input (Amazon, Flipkart, Adidas): observe() → fill → Enter.
 * 2. Click-to-reveal icon (Nike India): observe() finds a click action on the
 *    search icon → click it → wait for the hidden <input> to appear → fill → Enter.
 */
export async function searchStorefront(
  page: AgentPage,
  context: AgentBrowserContext,
  stagehand: Stagehand,
  query: string,
): Promise<void> {
  await context.setActivePage(page);
  const observation = await stagehand.observe(
    "Find the visible text input used to search this merchant's product catalogue. " +
    "Do not select a product, open a product page, or add anything to a cart.",
    { page },
  );

  // Prefer a fillable element; fall back to whatever was observed (may be a
  // click-to-reveal search icon).
  const fillAction = observation.data.find(
    (action) => action.method === "fill" || action.method === "type",
  );
  const anyAction = observation.data[0];

  if (!fillAction && !anyAction) {
    throw new Error("The merchant page does not expose a usable product search input.");
  }

  // ── Pattern 2: click-to-reveal (e.g. Nike India search icon) ──────────────
  // If Stagehand found a click action rather than a fill/type action, the search
  // control is a magnifying-glass icon that reveals a hidden <input> on click.
  if (!fillAction && anyAction) {
    const icon = page.locator(anyAction.selector);
    if (await icon.isVisible().catch(() => false)) {
      await icon.click().catch(() => {});
      // Wait up to 3 s for a text input to become visible after the click.
      await page.waitForTimeout(800).catch(() => {});
    }
    // After clicking the icon, try DOM fallback selectors for the revealed input.
    const inputSelectors = [
      'input[type="search"]',
      'input[type="text"][name*="search" i]',
      'input[type="text"][placeholder*="search" i]',
      'input[aria-label*="search" i]',
      'input[type="text"]',
    ];
    for (const sel of inputSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        await el.fill(query);
        await page.keyPress("Enter");
        return;
      }
    }
    throw new Error("Clicked search icon but no text input appeared.");
  }

  // ── Pattern 1: directly visible input ─────────────────────────────────────
  const input = page.locator(fillAction!.selector);
  if (!(await input.isVisible().catch(() => false))) {
    throw new Error("The discovered product search input is no longer visible.");
  }

  await input.fill(query);
  await page.keyPress("Enter");
}
