/**
 * Generalized LLM-driven Shopping Intent Parser.
 *
 * Replaces rigid regex-only parsing with structured LLM decomposition for
 * free-form, conversational prompts (e.g., "Go to Amazon, search for mechanical
 * keyboard from Keychron or Royal Kludge under 5,000 with 3.5+ star rating").
 *
 * Degrades gracefully to deterministic regex parsing (`parseShoppingRequest`)
 * if the LLM is unconfigured, unreachable, or returns malformed output.
 */

import { z } from "zod";
import type { ClarifyingQuestion, ShoppingIntent } from "../commerce/types";
import { ShoppingRequestValidationError } from "../errors";
import { parseShoppingRequest, type ParseShoppingRequestInput } from "./parse-shopping-request";
import { createOpenAICompatibleLLM, type CustomModelEndpoint } from "../custom-llm";

export const ClarifyingQuestionSchema = z.object({
  q: z.string().describe("Clear question to clarify user shopping preference"),
  type: z.enum(["radio", "check"]).default("radio").describe("'radio' for single-choice, 'check' for multi-choice"),
  options: z.array(z.string()).min(2).describe("2-4 concise selectable choices"),
});

export const ExtractedShoppingIntentSchema = z.object({
  store: z.string().nullable().optional().describe("Store name, preset key, or website URL (e.g., 'amazon', 'flipkart', 'raven', 'https://ravenscents.com')"),
  cleanSearchQuery: z.string().min(1).describe("Concise keywords suitable for a store search bar (e.g., 'mechanical keyboard') stripped of filler phrases and budget/rating constraints"),
  brands: z.array(z.string()).default([]).describe("Explicit brand names mentioned by user (e.g., ['Keychron', 'Royal Kludge'])"),
  category: z.string().nullable().optional().describe("High-level category (e.g., 'electronics', 'apparel', 'beauty', 'home')"),
  budgetInMinor: z.number().nullable().optional().describe("Numeric budget ceiling in minor units (e.g., 5000 INR = 500000 paise). Null if none specified"),
  currency: z.string().default("INR").describe("ISO 4217 currency code (e.g. 'INR', 'USD')"),
  minRating: z.number().nullable().optional().describe("Minimum customer review rating (e.g., 3.5, 4.0). Null if none"),
  requestedQuantity: z.number().int().min(1).default(1).describe("Number of items requested (e.g., 1, 2)"),
  constraints: z.array(z.string()).default([]).describe("Specific feature tags or constraints (e.g. ['mechanical', 'wireless', 'rgb', 'in_stock'])"),
  preferredMerchants: z.array(z.string()).default([]).describe("Merchants or stores preferred"),
  excludedMerchants: z.array(z.string()).default([]).describe("Merchants explicitly rejected"),
  clarifyingQuestions: z.array(ClarifyingQuestionSchema).default([]).describe("Human-in-the-loop clarifying questions if budget, store, or key attributes are unspecified"),
});

export type ExtractedShoppingIntent = z.infer<typeof ExtractedShoppingIntentSchema>;

export interface LLMIntentParserDeps {
  /** Optional custom LLM model endpoint configuration */
  llm?: CustomModelEndpoint;
  /** Injected LLM extraction function for tests */
  extractWithLlm?: (query: string, defaultCurrency: string) => Promise<Partial<ExtractedShoppingIntent> | null>;
}

const SYSTEM_PROMPT = `You are an expert e-commerce shopping intent parser for an autonomous shopping agent.
Your task is to analyze natural language user shopping requests and extract a clean, structured JSON object.

Key Rules:
1. "cleanSearchQuery": Extract ONLY the core product search keywords (e.g., "mechanical keyboard", "wireless gaming mouse", "vanilla perfume", "ASUS Marshmallow KW100"). Strip out conversational phrases like "Go to Amazon", "search about", "find me", "with 3.5 star", "under 5000", "any range and rating will fine", etc.
2. "store": If the user names a specific store or URL (e.g. Amazon, Flipkart, Nike, Raven Scents, https://...), capture it. Otherwise null.
3. "brands": List specific brand names mentioned (e.g. ["Keychron", "Royal Kludge", "Logitech", "Sony", "ASUS"]).
4. "budgetInMinor": Convert any budget mentioned to minor currency units (e.g. ₹5,000 or 5k in INR -> 500000; $100 in USD -> 10000). If no budget is stated or user says "any range" / "any budget" / "no limit", return null.
5. "minRating": Extract any minimum star rating specified (e.g. "3.5 star" -> 3.5, "4+ stars" -> 4.0). If none or user says "any rating" / "rating will fine", return null.
6. "requestedQuantity": Count requested items (e.g. "2 pairs" -> 2, "pack of 3" -> 3, "2 mice" -> 2). Default 1.
7. "constraints": Extract key feature tags (e.g. ["mechanical", "wireless", "rgb", "in_stock", "refurbished", "warranty"]).
8. "clarifyingQuestions": Generate 1 to 2 concise clarifying questions ONLY when crucial parameters are completely missing from a broad, underspecified query (e.g. user simply typed "keyboard" or "shoes" with no budget, no store, and no model).
   CRITICAL NEGATIVE RULES FOR clarifyingQuestions:
   - If the user specified a specific product brand/model (e.g. "ASUS Marshmallow KW100", "Keychron K2", "Sony WH-1000XM5"), DO NOT ask clarifying questions. Return [].
   - If the user explicitly stated "any range", "any budget", "no budget", "any price", "any rating", "rating will fine", or "any store", DO NOT ask questions for those parameters. Return [].
   - If all search information is already clear, return [].
   - When questions ARE generated, the final option for each question MUST ALWAYS be a general/flexible choice (e.g. "Any / No preference", "Flexible / Any budget", "Search all stores").
`;

/**
 * Execute LLM extraction using the custom LLM endpoint.
 */
async function callLlmForIntent(
  query: string,
  defaultCurrency: string,
  endpoint: CustomModelEndpoint,
): Promise<ExtractedShoppingIntent | null> {
  const boundedEndpoint: CustomModelEndpoint = {
    ...endpoint,
    timeoutMs: endpoint.timeoutMs ?? 5_000,
  };
  const client = createOpenAICompatibleLLM(boundedEndpoint);
  const jsonSchema = {
    type: "object",
    properties: {
      store: { type: "string" },
      cleanSearchQuery: { type: "string" },
      brands: { type: "array", items: { type: "string" } },
      category: { type: "string" },
      budgetInMinor: { type: "number" },
      currency: { type: "string" },
      minRating: { type: "number" },
      requestedQuantity: { type: "number" },
      constraints: { type: "array", items: { type: "string" } },
      preferredMerchants: { type: "array", items: { type: "string" } },
      excludedMerchants: { type: "array", items: { type: "string" } },
      clarifyingQuestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            q: { type: "string" },
            type: { type: "string", enum: ["radio", "check"] },
            options: { type: "array", items: { type: "string" } },
          },
          required: ["q", "type", "options"],
        },
      },
    },
    required: ["cleanSearchQuery", "currency", "requestedQuantity"],
  };

  const response = await client.generate({
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `User shopping request: "${query}"\nDefault currency: ${defaultCurrency}`,
          },
        ],
      },
    ],
    temperature: 0.1,
    responseFormat: {
      type: "json_schema",
      name: "ShoppingIntent",
      schema: jsonSchema,
    },
  });

  const resp = response as {
    structuredContent?: Record<string, unknown>;
    content?: Array<{ type?: string; text?: string }> | { type?: string; text?: string };
  };

  let raw: unknown = resp.structuredContent;
  if (!raw && resp.content) {
    const text = Array.isArray(resp.content)
      ? resp.content[0]?.text
      : (resp.content as { text?: string })?.text;
    if (text) {
      try {
        raw = JSON.parse(text);
      } catch {
        // ignore parse error
      }
    }
  }

  if (!raw || typeof raw !== "object") return null;

  const parsed = ExtractedShoppingIntentSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("[llm-parser] schema validation warnings:", parsed.error.issues);
    return raw as ExtractedShoppingIntent;
  }
  return parsed.data;
}

function generateDefaultClarifyingQuestions(
  query: string,
  intent: { budgetInMinor: number | null; store?: string; category?: string | null; cleanSearchQuery?: string },
): ClarifyingQuestion[] {
  const qList: ClarifyingQuestion[] = [];

  const hasExplicitBudget =
    intent.budgetInMinor !== null ||
    /\b(any\s*range|any\s*budget|no\s*budget|flexible\s*budget|any\s*price|no\s*limit)\b/i.test(query);

  const hasExplicitStore =
    Boolean(intent.store) ||
    /\b(any\s*store|any\s*merchant|search\s*all|everywhere|anywhere)\b/i.test(query);

  const isSpecificModel =
    /\b(kw\d+|md\d+|cw\d+|wh-\d+|k\d+|mx\s*master|g\d+|airpods|galaxy\s*buds)\b/i.test(query) ||
    (intent.cleanSearchQuery && intent.cleanSearchQuery.split(" ").length >= 3);

  if (!hasExplicitBudget && !isSpecificModel) {
    qList.push({
      q: "What is your target budget limit?",
      type: "radio",
      options: ["Under ₹2,000", "Under ₹5,000", "Under ₹10,000", "Flexible / Any budget"],
    });
  }

  if (!hasExplicitStore && !isSpecificModel) {
    qList.push({
      q: "Which store would you like to search?",
      type: "radio",
      options: ["Amazon", "Flipkart", "Raven Scents (Direct)", "Search all stores"],
    });
  }

  return qList;
}

/**
 * Parse a shopping request into a ShoppingIntent using LLM with deterministic fallback.
 */
export async function parseShoppingRequestWithLLM(
  input: ParseShoppingRequestInput,
  deps: LLMIntentParserDeps = {},
): Promise<ShoppingIntent> {
  const query = input.query?.trim();
  if (!query) {
    throw new ShoppingRequestValidationError("Shopping query must not be empty.");
  }

  const defaultCurrency = input.defaultCurrency ?? "INR";

  let extracted: Partial<ExtractedShoppingIntent> | null = null;

  if (deps.extractWithLlm) {
    try {
      extracted = await deps.extractWithLlm(query, defaultCurrency);
    } catch (err) {
      console.warn("[llm-parser] injected LLM extract failed, using fallback:", (err as Error).message);
    }
  } else if (deps.llm) {
    try {
      extracted = await callLlmForIntent(query, defaultCurrency, deps.llm);
    } catch (err) {
      console.warn("[llm-parser] LLM extraction call failed, using fallback:", (err as Error).message);
    }
  }

  // Fallback to deterministic regex parser
  const fallback = parseShoppingRequest(input);

  if (!extracted) {
    const clarifyingQuestions = generateDefaultClarifyingQuestions(query, {
      budgetInMinor: fallback.budgetInMinor,
      store: fallback.store,
      category: fallback.category,
      cleanSearchQuery: fallback.rawQuery,
    });
    return {
      ...fallback,
      cleanSearchQuery: fallback.rawQuery,
      brands: fallback.preferredMerchants,
      minRating: null,
      clarifyingQuestions,
    };
  }

  const targetStore = extracted.store?.trim() || input.store || fallback.store;
  const preferred = Array.from(
    new Set([
      ...(extracted.preferredMerchants ?? []),
      ...(extracted.brands ?? []),
      ...fallback.preferredMerchants,
    ]),
  );

  const budgetInMinor =
    typeof extracted.budgetInMinor === "number"
      ? extracted.budgetInMinor
      : fallback.budgetInMinor;

  const clarifyingQuestions =
    Array.isArray(extracted.clarifyingQuestions)
      ? extracted.clarifyingQuestions
      : generateDefaultClarifyingQuestions(query, {
          budgetInMinor,
          store: targetStore,
          category: extracted.category ?? fallback.category,
          cleanSearchQuery: extracted.cleanSearchQuery,
        });

  return {
    rawQuery: query,
    cleanSearchQuery: extracted.cleanSearchQuery?.trim() || fallback.rawQuery,
    category: extracted.category ?? fallback.category,
    budgetInMinor,
    currency: extracted.currency || fallback.currency || defaultCurrency,
    requestedQuantity: extracted.requestedQuantity ?? fallback.requestedQuantity ?? 1,
    brands: extracted.brands ?? [],
    minRating: typeof extracted.minRating === "number" ? extracted.minRating : null,
    preferredMerchants: preferred,
    excludedMerchants: extracted.excludedMerchants ?? fallback.excludedMerchants,
    constraints: Array.from(new Set([...(extracted.constraints ?? []), ...fallback.constraints])),
    store: targetStore || undefined,
    clarifyingQuestions,
  };
}
