/**
 * Normalize a discovered `ProductCandidate` into the stable `NormalizedProduct`
 * schema. This is where messy, page-scraped strings become machine-safe integer
 * minor-unit money, typed availability, and a per-product data-confidence score.
 *
 * Anything that cannot be turned into a trustworthy product is rejected with a
 * `ProductNormalizationError` — Part B never fabricates a price it could not
 * read. The confidence score (0..1) lets the ranker penalize low-quality data.
 */

import {
  SUPPORTED_CURRENCIES,
  type Availability,
  type NormalizedProduct,
  type ProductCandidate,
  type SupportedCurrency,
} from "../commerce/types";
import { ProductNormalizationError } from "../errors";

const SYMBOL_TO_CURRENCY: Record<string, string> = {
  "₹": "INR",
  rs: "INR",
  inr: "INR",
  $: "USD",
  usd: "USD",
  "€": "EUR",
  eur: "EUR",
  "£": "GBP",
  gbp: "GBP",
  "¥": "JPY",
  jpy: "JPY",
  chf: "CHF",
};

function isSupported(currency: string): currency is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(currency.toUpperCase());
}

/** Detect an ISO currency from a raw price string's symbols/letters. */
export function detectCurrencyFromText(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [symbol, code] of Object.entries(SYMBOL_TO_CURRENCY)) {
    if (lower.includes(symbol.toLowerCase())) return code;
  }
  return null;
}

/**
 * Parse a raw displayed price into minor units + ISO currency.
 * Handles "₹7,995.00", "$49.99", "1,29,900", "7995", and EU "1.299,00".
 * Returns null when no number can be extracted. Does NOT throw.
 */
export function parsePriceToMinor(
  raw: string,
  hintCurrency?: string | null,
): { amountInMinor: number; currency: string } | null {
  if (!raw) return null;
  const detected = detectCurrencyFromText(raw);
  const currency = detected ?? (hintCurrency && isSupported(hintCurrency) ? hintCurrency : null);
  if (!currency) return null;

  let cleaned = raw.replace(/[^0-9.,]/g, "").trim();
  if (!cleaned) return null;

  // EU format: "1.299,00" → comma is decimal, dot is thousands.
  if (/,\d+$/.test(cleaned) && cleaned.includes(".")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Western / Indian grouping: drop thousands separators.
    cleaned = cleaned.replace(/,/g, "");
  }

  const major = Number.parseFloat(cleaned);
  if (!Number.isFinite(major) || major <= 0) return null;
  return { amountInMinor: Math.round(major * 100), currency };
}

function mapAvailability(text: string | null): Availability {
  if (!text) return "unknown";
  const t = text.toLowerCase();
  if (/(out of stock|sold out|unavailable|not available|backorder)/.test(t)) return "out_of_stock";
  if (/(limited|only \d+ left|low stock|few left|hurry)/.test(t)) return "limited";
  if (/(in stock|available|ready to ship|inventory)/.test(t)) return "in_stock";
  return "unknown";
}

/** Stable, dependency-free id from the product's identity fields. */
function stableId(merchant: string, title: string, url: string | null): string {
  const basis = `${merchant.toLowerCase()}|${title.toLowerCase().trim()}|${url ?? title.toLowerCase()}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export interface NormalizeOptions {
  /** Currency assumed when the candidate reports none and none is detected. */
  defaultCurrency: string;
}

/**
 * Normalize a single candidate. Throws `ProductNormalizationError` when the
 * amount is missing/invalid or the currency cannot be resolved to a supported
 * ISO code. Returns a fully populated `NormalizedProduct` otherwise.
 */
export function normalizeProduct(
  candidate: ProductCandidate,
  options: NormalizeOptions,
): NormalizedProduct {
  const resolvedCurrency = candidate.currency ?? detectCurrencyFromText(candidate.rawPrice) ?? options.defaultCurrency;
  if (!isSupported(resolvedCurrency)) {
    throw new ProductNormalizationError(
      `Unsupported or unresolved currency for "${candidate.title}".`,
      { candidate: { title: candidate.title, currency: candidate.currency, rawPrice: candidate.rawPrice } },
    );
  }

  // Prefer a structured major-unit value when the discovery layer supplied one
  // (most reliable); otherwise parse the displayed string.
  const structuredValue = candidate.evidence.priceValue;
  const structuredMajor =
    typeof structuredValue === "number" && Number.isFinite(structuredValue) && structuredValue > 0
      ? structuredValue
      : null;

  let amountInMinor: number;
  let usedStructured = false;
  if (structuredMajor !== null) {
    amountInMinor = Math.round(structuredMajor * 100);
    usedStructured = true;
  } else {
    const parsed = parsePriceToMinor(candidate.rawPrice, resolvedCurrency);
    if (!parsed) {
      throw new ProductNormalizationError(
        `Could not parse a valid price from "${candidate.rawPrice}" for "${candidate.title}".`,
        { candidate: { title: candidate.title, rawPrice: candidate.rawPrice } },
      );
    }
    amountInMinor = parsed.amountInMinor;
  }

  const availability = mapAvailability(candidate.availabilityText);

  // Confidence: start trustworthy, subtract for missing/derived signals.
  let confidence = 1;
  const reasons: string[] = [];
  const sourceCurrency = candidate.currency ?? detectCurrencyFromText(candidate.rawPrice);
  if (!sourceCurrency) {
    confidence -= 0.15;
    reasons.push("currency was not reported by the source; defaulted by intent");
  }
  if (!candidate.productUrl) {
    confidence -= 0.1;
    reasons.push("no product URL provided");
  }
  if (!candidate.availabilityText) {
    confidence -= 0.1;
    reasons.push("availability unknown");
  }
  if (!usedStructured) {
    confidence -= 0.1;
    reasons.push("price parsed from displayed text (no structured value)");
  }
  confidence = Math.max(0.2, Math.round(confidence * 100) / 100);

  const canonicalTitle = (candidate.title ?? "").trim() || "Untitled product";

  const attributes: Record<string, string> = {};
  if (candidate.availabilityText) attributes.availability_text = candidate.availabilityText.toLowerCase();
  if (typeof candidate.evidence.rating === "number") attributes.rating = String(candidate.evidence.rating);

  return {
    id: stableId(candidate.merchant, canonicalTitle, candidate.productUrl),
    merchant: candidate.merchant,
    canonicalTitle,
    amountInMinor,
    currency: resolvedCurrency,
    productUrl: candidate.productUrl,
    availability,
    confidence,
    attributes,
    confidenceReasons: reasons,
  };
}
