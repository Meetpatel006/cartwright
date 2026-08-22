/**
 * Raw health probe of the NVIDIA endpoint: one tiny chat-completion request
 * with a 60s client timeout. Prints status + body slice (never the API key).
 */
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: fileURLToPath(new URL("../../../apps/web/.env", import.meta.url)) });

const baseURL = process.env.AGENT_LLM_BASE_URL!;
const model = process.env.AGENT_LLM_MODEL!;
const apiKey = process.env.AGENT_LLM_API_KEY!;

console.log(`[raw] POST ${baseURL}/chat/completions model=${model}`);
console.log(`[raw] key present: ${apiKey ? `yes (len ${apiKey.length})` : "NO"}`);

const t0 = Date.now();
try {
  const res = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, Connection: "close" },
    body: JSON.stringify({
      model,
      max_tokens: 10,
      messages: [{ role: "user", content: "Reply with the single word: PONG" }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  console.log(`[raw] status ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`[raw] body: ${text.slice(0, 300)}`);
} catch (e) {
  console.log(`[raw] FAILED in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${(e as Error).message}`);
  process.exit(1);
}
