/**
 * Quick probe of the custom OpenAI-compatible LLM adapter against the live
 * endpoint configured in apps/web/.env. Exercises both the text (act) and
 * structured (json_schema -> json_object fallback) paths in isolation, so we
 * can confirm the NVIDIA endpoint behaves before the full browser run.
 */
import { createOpenAICompatibleLLM } from "../src/custom-llm";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: fileURLToPath(new URL("../../../apps/web/.env", import.meta.url)) });

const model = process.argv[2] ?? process.env.AGENT_LLM_MODEL!;
const endpoint = {
  baseURL: process.env.AGENT_LLM_BASE_URL!,
  model,
  apiKey: process.env.AGENT_LLM_API_KEY,
  debug: true,
};

console.log(`[probe] endpoint=${endpoint.baseURL} model=${endpoint.model}`);
const llm = createOpenAICompatibleLLM(endpoint);

async function main() {
  // 1) Text path (act-style)
  console.log("\n=== TEXT (act) ===");
  const t0 = Date.now();
  const text = await llm.generate({
    messages: [{ role: "user", content: [{ type: "text", text: "Reply with the single word: PONG" }] }],
  });
  console.log(`[probe] text ok in ${((Date.now() - t0) / 1000).toFixed(1)}s ->`, JSON.stringify(text.content));

  // 2) Structured path (extract-style) — this is the one that used to fail
  console.log("\n=== STRUCTURED (extract / json_schema) ===");
  const t1 = Date.now();
  const structured = await llm.generate({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract: the product is 'Saffron Musk', price 999 INR, in stock true.",
          },
        ],
      },
    ],
    responseFormat: {
      type: "json_schema",
      name: "product",
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          price: { type: "number" },
          inStock: { type: "boolean" },
        },
        required: ["name", "price", "inStock"],
      },
    },
  });
  console.log(`[probe] structured ok in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log("[probe] structured:", JSON.stringify(structured));
}

main().catch((e) => {
  console.error("[probe] FAILED:", e);
  process.exit(1);
});
