import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    BROWSERBASE_API_KEY: z.string().min(1).optional(),
    /** Which browser backend the shopping agent uses: free local Chrome or paid Browserbase cloud.
     *  Unset => auto: "local" in development, "browserbase" in production. */
    AGENT_BROWSER: z.enum(["local", "browserbase"]).optional(),
    /** LLM used by the agent in local browser mode — any OpenAI-compatible endpoint.
     *  Required when AGENT_BROWSER is "local". */
    AGENT_LLM_BASE_URL: z.url().optional(),
    AGENT_LLM_MODEL: z.string().min(1).optional(),
    AGENT_LLM_API_KEY: z.string().min(1).optional(),
    AGENT_LLM_API_KEY_FALLBACK: z.string().min(1).optional(),
    /** Extra JSON merged into every LLM request body, e.g. {"chat_template_kwargs":{"enable_thinking":false}} */
    AGENT_LLM_EXTRA_BODY: z.string().min(1).optional(),
    /** Set to "true" or "1" for verbose agent + LLM request logging */
    AGENT_DEBUG: z.union([z.literal("true"), z.literal("1")]).optional(),
    /** Which browser backend the shopping agent uses: free local Chrome or paid Browserbase cloud.
     *  Unset => auto: "local" in development, "browserbase" in production. */
    SHOPPING_AGENT_BROWSER: z.enum(["local", "browserbase"]).optional(),
    RAZORPAY_KEY_ID: z.string().min(1).optional(),
    RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
    /** Payment environment. Test Mode is sandbox-only and never represents bank funds. */
    RAZORPAY_MODE: z.enum(["test", "live"]).default("test"),
    /** Razorpay's documented successful Test Mode UPI value. Never use in Live Mode. */
    RAZORPAY_TEST_UPI_ID: z.string().min(1).default("success@razorpay"),
    /** Shopping wallet balance in MINOR units of WALLET_CURRENCY (default 1000000 = 10,000.00). */
    WALLET_BALANCE_PAISE: z.coerce.number().int().positive().default(1_000_000),
    /** ISO 4217 currency of the wallet balance above (default "INR"). */
    WALLET_CURRENCY: z.string().length(3).default("INR"),
    /** How long (minutes) a retained browser/checkout session stays usable
     *  before it is lazily expired and its underlying browser is cleaned up. */
    BROWSER_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    /** How long (minutes) a shopping session stays selectable before it is
     *  lazily expired and its retained browser session is cleaned up. */
    SHOPPING_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    /** Maximum execution time (seconds) for the entire shopping agent run.
     *  Individual operation timeouts do not bound the overall workflow. */
    AGENT_RUN_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(180),
    /** Maximum Test Mode payment that may be opened without a user approval action. */
    PAYMENT_AUTO_APPROVAL_LIMIT_PAISE: z.coerce.number().int().nonnegative().default(150_000),
    /** Explicitly allow Cartwright to create a server-side Razorpay order when a black-box merchant has no payment UI. */
    AGENT_RAZORPAY_ORDER_FALLBACK: z.union([z.literal("true"), z.literal("false")]).default("false"),
    /** Razorpay webhook secret — a SEPARATE credential from the API secret. */
    RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
