import type { Stagehand } from "@browserbasehq/stagehand";

import type { AgentBrowserContext, AgentPage } from "../browser-types";

/**
 * Search a storefront through its live search input without asking the LLM to
 * generate a second browser action. `observe()` supplies the resilient locator;
 * the fill and submit are deterministic browser controls.
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
  const searchInput = observation.data.find(
    (action) => action.method === "fill" || action.method === "type",
  ) ?? observation.data[0];

  if (!searchInput) {
    throw new Error("The merchant page does not expose a usable product search input.");
  }

  const input = page.locator(searchInput.selector);
  if (!(await input.isVisible())) {
    throw new Error("The discovered product search input is no longer visible.");
  }

  await input.fill(query);
  await page.keyPress("Enter");
}
