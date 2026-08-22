/**
 * 1) List models the account can actually see via /v1/models
 * 2) Probe a curated set of agentic/structured-capable candidates and report
 *    HTTP status + latency so we can pick a working, capable model.
 */
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: fileURLToPath(new URL("../../../apps/web/.env", import.meta.url)) });

const baseURL = process.env.AGENT_LLM_BASE_URL!;
const apiKey = process.env.AGENT_LLM_API_KEY!;

// ---- 1) account model catalog ----
console.log("=== /v1/models (account catalog) ===");
try {
  const res = await fetch(`${baseURL.replace(/\/$/, "")}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json()) as { data?: { id: string }[] };
  const ids = (json.data ?? []).map((m) => m.id).sort();
  console.log(`status ${res.status}, ${ids.length} models`);
  console.log(ids.join("\n"));
} catch (e) {
  console.log(`catalog fetch failed: ${(e as Error).message}`);
}

// ---- 2) probe candidates ----
const candidates = [
  "meta/llama-3.1-8b-instruct",
  "meta/llama-3.2-3b-instruct",
  "meta/llama-3.1-70b-instruct",
  "meta/llama-3.3-70b-instruct",
  "nvidia/llama-3.1-nemotron-nano-8b-v1",
  "nvidia/llama-3.3-nemotron-super-49b-v1",
  "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "deepseek-ai/deepseek-v4-pro",
  "mistralai/mistral-small-3.1-24b-instruct",
  "qwen/qwen2.5-72b-instruct",
];

async function tryModel(model: string): Promise<string> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, Connection: "close" },
      body: JSON.stringify({
        model,
        max_tokens: 20,
        messages: [{ role: "user", content: 'Return JSON: {"ok": true}' }],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(35_000),
    });
    const text = await res.text();
    return `status ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s :: ${text.slice(0, 100)}`;
  } catch (e) {
    return `FAILED in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${(e as Error).message}`;
  }
}

console.log("\n=== candidate probe (json_object) ===");
for (const m of candidates) {
  const r = await tryModel(m);
  console.log(`• ${m}\n    ${r}`);
}
