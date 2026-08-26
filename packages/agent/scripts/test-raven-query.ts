/**
 * Temp smoke test for the GENERALIZED Raven flow (the same path the web
 * /shopper UI takes): discoverProducts -> parseRavenBasket -> live-catalog
 * fuzzy match -> cart + checkout.
 */
import { discoverProducts } from "../src/discovery/discover-products";
import { createOpenAICompatibleLLM } from "../src/custom-llm";
// Register the Raven Scents local-merchant profile for this smoke test.
import "../src/merchants/raven-scents";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: fileURLToPath(new URL("../../../apps/web/.env", import.meta.url)) });

const query = process.argv[2] ?? "2x Professional Gold Edition";
console.log(`\n=== discoverProducts("${query}") ===`);

const { candidates, raw } = await discoverProducts({
  query,
  store: "raven",
  budgetInMinor: 1_000_000,
  currency: "INR",
  mode: "local",
  llm: {
    baseURL: process.env.AGENT_LLM_BASE_URL,
    model: process.env.AGENT_LLM_MODEL,
    apiKey: process.env.AGENT_LLM_API_KEY,
    debug: false,
  },
});

if (raw.error) console.log(`raw.error: ${raw.error}`);
console.log(`candidates (${candidates.length}):`);
for (const c of candidates) {
  console.log(`  - ${c.title} | ${c.rawPrice} | ${c.productUrl}`);
}
if (raw.checkout) {
  console.log(`checkout: ${raw.checkout.status}`);
  if (raw.checkout.orderSummary?.total) console.log(`  total: ${raw.checkout.orderSummary.total}`);
}
process.exit(0);
