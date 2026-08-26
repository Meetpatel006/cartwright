/**
 * Debug probe: run discovery end-to-end (same call shape as
 * shopping.service.runShoppingSession) WITHOUT the web/tRPC layer.
 *
 *   bun scripts/debug-discovery.ts "wireless headphones"
 */
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: fileURLToPath(new URL("../../../apps/web/.env", import.meta.url)) });

import { discoverProducts } from "../src/discovery/discover-products";
import { parseShoppingRequest } from "../src/request/parse-shopping-request";

const query = process.argv[2] ?? "wireless headphones";
const store = process.argv[3] ?? "amazon";

const intent = parseShoppingRequest({
  query,
  store,
  defaultCurrency: "INR",
  fallbackBudgetInMinor: null,
});
console.log("[probe] intent:", JSON.stringify(intent, null, 2));

try {
  const { candidates } = await discoverProducts({
    query: intent.rawQuery,
    store,
    budgetInMinor: intent.budgetInMinor,
    currency: intent.currency,
    mode: "local",
    llm: {
      baseURL: process.env.AGENT_LLM_BASE_URL!,
      model: process.env.AGENT_LLM_MODEL!,
      apiKey: process.env.AGENT_LLM_API_KEY,
      ...(process.env.AGENT_LLM_RESPONSE_FORMAT && {
        responseFormatMode: process.env.AGENT_LLM_RESPONSE_FORMAT as "provider" | "prompt",
      }),
      debug: true,
    },
    recordSession: false,
  });
  console.log(`[probe] SUCCESS: ${candidates.length} candidates`);
  for (const c of candidates.slice(0, 8)) {
    console.log(`  - ${c.title.slice(0, 60)} | ${c.rawPrice} ${c.currency ?? "?"} | ${c.productUrl?.slice(0, 60)}`);
  }
} catch (error) {
  console.error(`[probe] DISCOVERY FAILED: ${(error as Error).name}: ${(error as Error).message}`);
}
