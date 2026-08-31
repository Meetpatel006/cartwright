/**
 * Layered Product Detection Engine
 *
 * Resolves product information following strict priority order:
 * 1. Explicit Cartwright data attributes
 * 2. Schema.org JSON-LD
 * 3. Schema.org Microdata
 * 4. Platform Adapter extraction
 * 5. Safe DOM heuristics
 * 6. URL slug heuristics (last resort)
 *
 * Enforces confidence thresholds: never returns a product on generic pages (cart, checkout, home, search)
 * or when the derived title is a UI button label or empty.
 */

import { tryCatchGuard } from "../core/error-boundary";
import type { CanonicalProduct } from "../events/canonical-types";
import { extractExplicitMarkupProduct, extractDomHeuristicProduct } from "./dom-heuristics";
import { extractJsonLdProduct } from "./jsonld-detector";
import { extractMicrodataProduct } from "./schema-org-detector";
import { extractMetaProduct } from "./meta-detector";
import type { PlatformAdapter } from "../adapters/adapter.interface";

const INVALID_TITLES = new Set([
  "home",
  "cart",
  "shopping cart",
  "checkout",
  "search",
  "search results",
  "add to cart",
  "buy now",
  "submit",
  "order confirmation",
  "thank you",
  "login",
  "sign in",
  "register",
]);

export function isNonProductPage(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  if (lower === "/" || lower === "") return true;
  if (lower.includes("/cart") || lower.includes("/bag") || lower.includes("/basket")) return true;
  if (lower.includes("/checkout")) return true;
  if (lower.includes("/search")) return true;
  if (lower.includes("/account") || lower.includes("/login") || lower.includes("/signin")) return true;
  if (lower.includes("/thank-you") || lower.includes("/order-received") || lower.includes("/order-confirmation")) return true;
  return false;
}

export function isConfidentProduct(product: CanonicalProduct | null, pathname = ""): boolean {
  if (!product) return false;
  if (!product.title || product.title.trim().length === 0) return false;

  const titleLower = product.title.trim().toLowerCase();
  if (INVALID_TITLES.has(titleLower)) return false;
  if (titleLower.length > 200) return false;

  if (isNonProductPage(pathname)) {
    // On non-product pages, only accept explicit markup with valid product_id
    return Boolean(product.product_id && product.product_id !== "product");
  }

  return true;
}

export function resolveProductLayered(
  doc?: Document,
  loc?: Location,
  adapter?: PlatformAdapter | null,
): CanonicalProduct | null {
  const d = doc || (typeof document !== "undefined" ? document : undefined);
  const l = loc || (typeof location !== "undefined" ? location : undefined);
  const pathname = l?.pathname || "";

  return tryCatchGuard(() => {
    // Priority 1: Explicit Cartwright data attributes
    const explicit = extractExplicitMarkupProduct(d);
    if (explicit && isConfidentProduct(explicit, pathname)) {
      return explicit;
    }

    // Priority 2: Schema.org JSON-LD Product
    const jsonLd = extractJsonLdProduct(d);
    if (jsonLd && isConfidentProduct(jsonLd, pathname)) {
      return jsonLd;
    }

    // Priority 3: Schema.org Microdata
    const microdata = extractMicrodataProduct(d);
    if (microdata && isConfidentProduct(microdata, pathname)) {
      return microdata;
    }

    // Priority 4: Platform Adapter specific extraction
    if (adapter?.extractProduct) {
      const adapterProduct = adapter.extractProduct(d);
      if (adapterProduct && isConfidentProduct(adapterProduct, pathname)) {
        return adapterProduct;
      }
    }

    // Priority 5: OpenGraph & Meta tags
    const meta = extractMetaProduct(d);
    if (meta && isConfidentProduct(meta, pathname)) {
      return meta;
    }

    // Priority 6: Safe DOM heuristics (H1 heading + price regex near buy control)
    const dom = extractDomHeuristicProduct(d);
    if (dom && isConfidentProduct(dom, pathname)) {
      return dom;
    }

    // Priority 7: URL slug heuristic as absolute last resort
    if (pathname && (pathname.includes("/product/") || pathname.includes("/p/") || pathname.includes("/item/"))) {
      const segments = pathname.split("/").filter(Boolean);
      const slug = segments[segments.length - 1];
      if (slug && slug.length > 2) {
        const title = slug
          .replace(/[-_]/g, " ")
          .replace(/\.[a-z0-9]+$/i, "")
          .replace(/\b\w/g, (c) => c.toUpperCase());

        const candidate: CanonicalProduct = {
          product_id: slug,
          title,
        };
        if (isConfidentProduct(candidate, pathname)) {
          return candidate;
        }
      }
    }

    return null;
  }, null);
}
