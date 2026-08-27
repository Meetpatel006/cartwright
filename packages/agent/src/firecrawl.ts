/**
 * Reusable Firecrawl web-search client + generic product-URL helpers.
 *
 * `resolveProductUrls` resolves canonical, already-validated product-page URLs
 * via Firecrawl web search. `resolveAbsoluteUrl` / `isSameOriginOrRelative`
 * validate/normalize whatever URL the discovery layer ends up with (model-
 * extracted or Firecrawl-resolved) before the browser navigates to it.
 *
 * Everything here is store-agnostic and has no Stagehand / browser deps, so it
 * is unit-testable in isolation (see ./firecrawl.test.ts).
 */

const FIRECRAWL_DEFAULT_BASE = "https://api.firecrawl.dev/v1";

export interface FirecrawlResult {
  url: string;
  title?: string;
  description?: string;
}

export interface FirecrawlSearchOptions {
  /** API key; defaults to process.env.FIRECRAWL_API_KEY. */
  apiKey?: string;
  /** API base URL; defaults to process.env.FIRECRAWL_BASE_URL or the public API. */
  baseUrl?: string;
  /** Max results to request. */
  limit?: number;
  /** Per-request timeout (ms). */
  timeoutMs?: number;
  /** Extra body fields forwarded to the Firecrawl /search endpoint. */
  extra?: Record<string, unknown>;
}

/** Minimal contract so callers (and tests) can inject a search implementation. */
export interface SearchFn {
  (query: string): Promise<FirecrawlResult[]>;
}

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: Array<{ url?: string; title?: string; description?: string }>;
}

/** Strip a leading "www." and lowercase a host for comparison. */
export function normalizeHost(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}

/** Host of a base URL (e.g. "https://www.nike.com/in" -> "www.nike.com"). */
export function storeDomainFromUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/**
 * True when `url` belongs to `storeDomain` (exact host, or a subdomain of it,
 * e.g. "store.nike.com" matches "nike.com"). Uses a leading-dot suffix check so
 * look-alike domains ("evilenike.com", "nike.com.co") do NOT match.
 */
export function isSameStoreHost(url: string, storeDomain: string): boolean {
  try {
    const a = normalizeHost(new URL(url).host);
    const b = normalizeHost(storeDomain);
    return a === b || a.endsWith(`.${b}`);
  } catch {
    return false;
  }
}

/** Pick the first result whose host belongs to the store domain. */
export function selectStoreUrl(results: FirecrawlResult[], storeDomain: string): string | undefined {
  const match = results.find((r) => isSameStoreHost(r.url, storeDomain));
  return match?.url;
}

/** Build a search query biased to the store (uses the engine's site: operator). */
export function buildProductSearchQuery(productName: string, storeDomain: string): string {
  return `${productName} site:${storeDomain}`;
}

/**
 * Resolve a canonical product URL for each product via web search.
 * Runs searches with bounded concurrency and never throws for an individual
 * product failure — unresolved products are simply absent from the returned map,
 * letting the caller fall back to its own heuristic.
 */
export async function resolveProductUrls(
  products: Array<{ name: string }>,
  storeDomain: string,
  search: SearchFn,
  opts: { concurrency?: number } = {},
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const concurrency = Math.max(1, opts.concurrency ?? 5);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < products.length) {
      const product = products[cursor++]!;
      try {
        const results = await search(buildProductSearchQuery(product.name, storeDomain));
        const url = selectStoreUrl(results, storeDomain);
        if (url) out.set(product.name, url);
      } catch {
        // leave unresolved; caller falls back
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

/** Thin Firecrawl /search client. Its `search` method satisfies {@link SearchFn}. */
export class FirecrawlClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly limit: number;
  private readonly timeoutMs: number;
  private readonly extra: Record<string, unknown>;

  constructor(opts: FirecrawlSearchOptions = {}) {
    this.apiKey = opts.apiKey || process.env.FIRECRAWL_API_KEY;
    this.baseUrl = (opts.baseUrl ?? process.env.FIRECRAWL_BASE_URL ?? FIRECRAWL_DEFAULT_BASE).replace(
      /\/$/,
      "",
    );
    this.limit = opts.limit ?? 5;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.extra = opts.extra ?? {};
  }

  async search(query: string): Promise<FirecrawlResult[]> {
    if (!this.apiKey) {
      throw new Error("FIRECRAWL_API_KEY is not set (needed for product URL resolution)");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, limit: this.limit, ...this.extra }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Firecrawl search failed (${res.status}): ${body.slice(0, 200)}`);
      }
      const json = (await res.json()) as FirecrawlSearchResponse;
      const data = Array.isArray(json?.data) ? json.data : [];
      return data
        .map((d) => ({
          url: String(d?.url ?? ""),
          title: d?.title ? String(d.title) : undefined,
          description: d?.description ? String(d.description) : undefined,
        }))
        .filter((r) => r.url.length > 0);
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic URL helpers (no Firecrawl dependency) — used to validate/normalize
// whatever URL the discovery layer ends up with (model-extracted or
// Firecrawl-resolved) before the browser navigates to it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The model's extract may return a relative product path (e.g. "/product/x" or
 * "product/x"). page.goto rejects those with "Cannot navigate to invalid URL",
 * so resolve against the store origin. Absolute URLs (incl. other domains)
 * pass through unchanged.
 */
export function resolveAbsoluteUrl(url: string, base: string): string {
  if (!url) return base;
  const trimmed = url.trim();
  // Only treat values that look like real URLs / path-relative refs as URLs.
  // The model sometimes emits a placeholder (e.g. the literal "None", "null",
  // "N/A") when it can't see a product link - passing that to `new URL` would
  // resolve it as a path segment (localhost:5173/None). Reject such junk and
  // fall back to `base` instead of producing a bogus URL.
  if (!/^(https?:\/\/|\/|\.\/|\.\.\/|#|mailto:)/i.test(trimmed)) return base;
  try {
    const origin = new URL(base).origin;
    return new URL(trimmed, `${origin}/`).href;
  } catch {
    return url;
  }
}

/**
 * True when `url` is safe to use as a product link on the current store page:
 * either a relative/path reference that resolves against `base`, or an absolute
 * URL on the SAME origin as `base`. Off-origin URLs (e.g. a model-hallucinated
 * "https://www.nike.in/5-3920" when the store actually lives at
 * www.nike.com/in) are rejected so we fall back to a real in-page anchor
 * instead of navigating the browser to a 404.
 */
export function isSameOriginOrRelative(url: string, base: string): boolean {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return true; // relative / path / anchor ref → resolves against base
  try {
    return new URL(trimmed).origin === new URL(base).origin;
  } catch {
    return false;
  }
}
