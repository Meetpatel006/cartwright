import { randomUUID } from "node:crypto";
import { z } from "zod";

import { env } from "@cartwright/env/server";
import {
  parseBudget,
  runShoppingAgent,
  type AgentBrowserMode,
  type CheckoutResult,
  type Product,
} from "@cartwright/agent";

import { protectedProcedure, router } from "../index";
import { createPurchaseTransaction } from "../transactions/transaction.service";
import type { PurchaseProposal } from "../transactions/transaction.types";

/**
 * Parse a human-readable amount like "$49.99", "₹7,995.00" or "1.299,00 €"
 * into minor units + ISO currency. Returns null when nothing parseable.
 */
function parseDisplayAmount(raw: string): { amountInMinor: number; currency: string } | null {
  if (!raw) return null;
  const symbolMap: Record<string, string> = {
    "₹": "INR", rs: "INR", inr: "INR",
    $: "USD", usd: "USD",
    "€": "EUR", eur: "EUR",
    "£": "GBP", gbp: "GBP",
    "¥": "JPY", jpy: "JPY",
    chf: "CHF",
  };
  let currency = "USD";
  for (const [sym, code] of Object.entries(symbolMap)) {
    if (raw.toLowerCase().includes(sym)) {
      currency = code;
      break;
    }
  }
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let num = raw.replace(/[^0-9.,]/g, "");
  if (!num) return null;
  if (hasComma && hasDot) {
    num = num.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    num = /,\d{2}$/.test(raw) ? num.replace(",", ".") : num.replace(/,/g, "");
  }
  const major = Number.parseFloat(num);
  if (Number.isNaN(major)) return null;
  return { amountInMinor: Math.round(major * 100), currency };
}

interface PurchaseRequest {
  picked: Product;
  queryCurrency: string;
  store: string;
  sessionId?: string;
  checkout?: CheckoutResult;
}

/**
 * Derive the server-authoritative charged amount from the REAL checkout total
 * when available, else the picked product price. The AI never sets the final
 * amount — this is derived and then validated by the policy engine.
 */
function deriveAmount(req: PurchaseRequest): { amountInMinor: number; currency: string } {
  const summaryTotal = req.checkout?.orderSummary?.total;
  const parsed = summaryTotal ? parseDisplayAmount(summaryTotal) : null;
  if (parsed && parsed.amountInMinor > 0) {
    return { amountInMinor: parsed.amountInMinor, currency: parsed.currency };
  }
  return {
    amountInMinor: Math.round(req.picked.priceValue * 100),
    currency: req.queryCurrency,
  };
}

function resolveAgentBrowserMode(): AgentBrowserMode {
  if (env.SHOPPING_AGENT_BROWSER) return env.SHOPPING_AGENT_BROWSER;
  return env.NODE_ENV === "production" ? "browserbase" : "local";
}

function parseRavenBasket(query: string, store: string | undefined) {
  if (store?.toLowerCase() !== "raven") return undefined;
  const gardeniaMatch = query.match(/(?:(\d+)\s+)?gardenia/i);
  const darkOceanMatch = query.match(/(?:(\d+)\s+)?dark\s+ocean/i);
  const badBoyMatch = query.match(/(?:(\d+)\s+)?bad\s+boy/i);
  if (!gardeniaMatch && !darkOceanMatch && !badBoyMatch) return undefined;
  return [
    ...(gardeniaMatch ? [{ name: "Gardenia", quantity: Number(gardeniaMatch[1] ?? 1) }] : []),
    ...(darkOceanMatch ? [{ name: "Dark Ocean", quantity: Number(darkOceanMatch[1] ?? 1) }] : []),
    ...(badBoyMatch ? [{ name: "Bad Boy", quantity: Number(badBoyMatch[1] ?? 1) }] : []),
  ];
}

export const agentRouter = router({
  shop: protectedProcedure
    .input(
      z.object({
        query: z.string().min(3).describe('e.g. "wireless headphones under $100"'),
        store: z.string().min(1).optional().describe('store preset or URL, e.g. "raven"'),
        /** Client idempotency key for the purchase request (dedupes retries). */
        idempotencyKey: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const budget = parseBudget(
        input.query,
        input.store?.toLowerCase() === "raven" ? "INR" : env.WALLET_CURRENCY,
      ) ?? {
        amountInMinor: env.WALLET_BALANCE_PAISE,
        currency: env.WALLET_CURRENCY,
      };

      const mode = resolveAgentBrowserMode();
      const basket = parseRavenBasket(input.query, input.store);
      const result = await runShoppingAgent({
        query: input.query,
        store: input.store,
        basket,
        preserveCheckoutSession: true,
        budgetInMinor: budget.amountInMinor,
        currency: budget.currency,
        mode,
        browserbaseApiKey:
          mode === "browserbase" ? env.BROWSERBASE_API_KEY : undefined,
        llm:
          mode === "local" &&
          env.AGENT_LLM_BASE_URL &&
          env.AGENT_LLM_MODEL
            ? {
                baseURL: env.AGENT_LLM_BASE_URL,
                model: env.AGENT_LLM_MODEL,
                apiKey: env.AGENT_LLM_API_KEY,
                ...(env.AGENT_LLM_API_KEY_FALLBACK && {
                  apiKeys: [env.AGENT_LLM_API_KEY, env.AGENT_LLM_API_KEY_FALLBACK].filter(
                    Boolean,
                  ) as string[],
                }),
                debug: env.AGENT_DEBUG !== undefined,
                ...(env.AGENT_LLM_EXTRA_BODY && {
                  extraBody: JSON.parse(env.AGENT_LLM_EXTRA_BODY) as Record<string, unknown>,
                }),
              }
            : undefined,
      });

      if (!result.picked) {
        return {
          ...result,
          purchase: null,
        };
      }

      const { amountInMinor, currency } = deriveAmount({
        picked: result.picked,
        queryCurrency: result.currency,
        store: result.store,
        sessionId: result.sessionId,
        checkout: result.checkout,
      });

      const proposal: PurchaseProposal = {
        userId,
        idempotencyKey: input.idempotencyKey ?? randomUUID(),
        merchantName: result.store,
        amountInMinor,
        currency,
        browserSessionId: result.sessionId,
      };

      const purchase = await createPurchaseTransaction(proposal);
      return { ...result, purchase };
    }),
});
