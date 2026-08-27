/**
 * LLM-driven query-relevance gate.
 *
 * After the agent extracts product listings from a search-results page, the
 * candidates often include sponsored, "you-may-also-like", and loosely-related
 * items that are NOT what the shopper asked for. Auto-adding the cheapest of
 * those — or worse, adding a product the human never chose — violates the
 * human-in-the-loop rule: "only the matching items are added".
 *
 * This module asks the model (ONE call, all candidates at once) to mark which
 * listings actually match the shopper's query (including variants/sizes/colors
 * of the same product, e.g. "Dark Ocean EDP" for "dark ocean") and which are
 * unrelated. Only the relevant ones are kept.
 *
 * This is the relevance half of the fix; the selection half (deferring the
 * add-to-cart to the human's explicit choice) lives in `fulfillSelection`
 * (shopping-agent.ts) and the API's `selectProductForSession`.
 */

import { z } from "zod";
import type { Stagehand } from "@browserbasehq/stagehand";
// Type-only — erased at build time, so no runtime dependency on shopping-agent.
import type { Product } from "../shopping-agent";

export interface QueryRelevanceResult {
  /** Candidates that actually match the query (variants included). */
  kept: Product[];
  /** Candidates dropped as off-topic, with the model's reasoning. */
  filteredOut: Array<{ name: string; reason: string }>;
}

/**
 * Keep only the products that match `query`.
 *
 * - With 0–1 candidates we cannot meaningfully filter, so everything is kept.
 * - On any LLM/parse failure we FAIL OPEN (keep everything) rather than hide a
 *   possibly-valid product behind a misclassification.
 * - We never drop *every* candidate: if the model marks all as irrelevant we
 *   keep the original set so discovery can still surface something.
 */
export async function filterProductsByQueryRelevance(
  query: string,
  products: Product[],
  stagehand: Stagehand,
): Promise<QueryRelevanceResult> {
  const keptAll: QueryRelevanceResult = { kept: [...products], filteredOut: [] };
  if (products.length <= 1) return keptAll;

  try {
    const list = products.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
    const schema = z.object({
      judgments: z.array(
        z.object({
          index: z.number().int().describe("1-based index of the listing"),
          relevant: z
            .boolean()
            .describe("true if it matches the shopper's query (variants count as relevant)"),
          reason: z.string().describe("one short phrase explaining the verdict"),
        }),
      ),
    });

    const res = await stagehand.extract(
      [
        `A shopper searched for: "${query}".`,
        "Below are product listings shown on the search-results page.",
        "For EACH listing, decide whether it is actually a match for the shopper's query",
        "(including variants, sizes, colors, or bundles of the same product — e.g. \"Dark Ocean EDP\"",
        "matches \"dark ocean\") OR an unrelated / sponsored / upsell item.",
        "Return one judgment per listing using its 1-based index.",
        "",
        list,
      ].join("\n"),
      schema,
    );

    const judgments = res.data.judgments ?? [];
    const irrelevantIdx = new Set<number>();
    for (const j of judgments) {
      const idx = j.index - 1;
      if (idx < 0 || idx >= products.length) continue;
      if (!j.relevant) {
        irrelevantIdx.add(idx);
      }
    }

    if (irrelevantIdx.size === 0) return keptAll;

    const kept = products.filter((_, i) => !irrelevantIdx.has(i));
    if (kept.length === 0) return keptAll; // never drop everything

    const filteredOut = [...irrelevantIdx]
      .sort((a, b) => a - b)
      .map((i) => ({
        name: products[i]!.name,
        reason: judgments.find((j) => j.index - 1 === i)?.reason ?? "Does not match query",
      }));

    return { kept, filteredOut };
  } catch {
    // Relevance check is a safety net, never a hard gate: keep everything.
    return keptAll;
  }
}
