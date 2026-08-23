/**
 * Test preload. Runs before any test file (see bunfig.toml). It loads the
 * shared `apps/web/.env` so the `@cartwright/db` singleton connects to the same
 * Neon database the app uses, and pins a stable webhook secret used by the
 * Razorpay webhook signature tests.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "..", "..", "apps/web/.env");

function loadEnvFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

// Load the shared env BEFORE anything that imports @cartwright/env (which runs
// createEnv validation at module-eval time). A hoisted static import of the db
// would trigger that validation too early, so the warmup import is dynamic.
loadEnvFile(envPath);

// Pin a webhook secret so the signature-verification tests have a known value.
if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
}

// Neon's serverless Postgres pauses when idle; the first query after a pause can
// take several seconds. Warm the connection here (before any test runs) so each
// test's queries run against an already-awake database and stay within the
// per-test timeout.
const { db } = await import("@cartwright/db");
const { sql } = await import("drizzle-orm");
await db.execute(sql`select 1`);

