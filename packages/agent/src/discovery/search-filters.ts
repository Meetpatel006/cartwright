import type { Stagehand } from "@browserbasehq/stagehand";

import type { AgentBrowserContext, AgentPage } from "../browser-types";

export interface OnSiteSearchFilterInput {
  budgetInMinor: number | null;
  currency: string;
  minRating?: number | null;
  constraints?: string[];
}

/** Build small, independently actionable store-filter requests from shopper intent. */
export function buildOnSiteSearchFilterInstructions(
  input: OnSiteSearchFilterInput,
): string[] {
  const instructions: string[] = [];
  if (input.budgetInMinor != null && input.budgetInMinor > 0) {
    instructions.push(
      `Use the visible price filter to set the maximum price to ${input.budgetInMinor / 100} ${input.currency}. Do not select a product or add anything to a cart.`,
    );
  }
  if (input.minRating != null && input.minRating > 0) {
    instructions.push(
      `Use the visible customer-rating filter to show products rated ${input.minRating} stars or higher. Do not select a product or add anything to a cart.`,
    );
  }
  for (const constraint of input.constraints ?? []) {
    const label = constraint.replace(/_/g, " ").trim();
    if (label) {
      instructions.push(
        `If this results page has a visible filter for "${label}", apply it. If it has no matching filter, leave the current results unchanged. Do not select a product or add anything to a cart.`,
      );
    }
  }
  return instructions;
}

/**
 * Ask the current merchant page whether a relevant control is actually present
 * before asking the browser agent to manipulate it. This keeps the flow
 * provider-independent and avoids a model inventing a facet on stores that do
 * not offer one.
 */
function filterControlDiscoveryInstruction(instruction: string): string {
  return (
    "Find a visible, interactive filter control on the current merchant search-results page " +
    `that can satisfy this shopper constraint: ${instruction} ` +
    "A visible Filters button that reveals the matching control also counts. " +
    "Do not select a product, open a product page, or add anything to a cart."
  );
}

/** Apply available merchant filters before extracting and ranking live listings. */
export async function applyOnSiteSearchFilters(
  page: AgentPage,
  context: AgentBrowserContext,
  stagehand: Stagehand,
  input: OnSiteSearchFilterInput,
): Promise<void> {
  for (const instruction of buildOnSiteSearchFilterInstructions(input)) {
    try {
      await context.setActivePage(page);
      const observation = await stagehand.observe(
        filterControlDiscoveryInstruction(instruction),
        { page },
      );
      if (observation.data.length === 0) {
        console.info("[agent] on-site filter control not found; preserving current results");
        continue;
      }
      const result = await stagehand.act(instruction, { page });
      if (result.data.success && result.data.actions.length > 0) {
        await page.waitForLoadState("networkidle", 10_000).catch(() => {});
      }
    } catch (error) {
      // A store may not expose every requested facet; server-side filtering remains authoritative.
      console.warn(`[agent] on-site filter unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
