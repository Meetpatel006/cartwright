/**
 * Schema.org Microdata Product Detector
 *
 * Extracts product metadata from HTML microdata attributes
 * (e.g. itemscope itemtype="http://schema.org/Product").
 */

import { tryCatchGuard } from "../core/error-boundary";
import type { CanonicalProduct } from "../events/canonical-types";

export function extractMicrodataProduct(targetDoc?: Document): CanonicalProduct | null {
  const doc = targetDoc || (typeof document !== "undefined" ? document : undefined);
  if (!doc) return null;

  return tryCatchGuard(() => {
    const productEl = doc.querySelector('[itemscope][itemtype*="schema.org/Product"], [itemscope][itemtype*="schema.org/IndividualProduct"]');
    if (!productEl) return null;

    const titleEl = productEl.querySelector('[itemprop="name"]');
    const title = titleEl?.textContent?.trim() || "";
    if (!title) return null;

    const skuEl = productEl.querySelector('[itemprop="sku"], [itemprop="productID"]');
    const sku = skuEl?.getAttribute("content") || skuEl?.textContent?.trim() || "";

    const priceEl = productEl.querySelector('[itemprop="price"]');
    const priceStr = priceEl?.getAttribute("content") || priceEl?.textContent?.trim() || "";
    const parsedPrice = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
    const price = !isNaN(parsedPrice) ? parsedPrice : undefined;

    const currencyEl = productEl.querySelector('[itemprop="priceCurrency"]');
    const currency = currencyEl?.getAttribute("content") || currencyEl?.textContent?.trim()?.toUpperCase();

    const brandEl = productEl.querySelector('[itemprop="brand"]');
    const brand = brandEl?.getAttribute("content") || brandEl?.textContent?.trim();

    const imageEl = productEl.querySelector('img[itemprop="image"], [itemprop="image"]');
    const image_url = imageEl?.getAttribute("src") || imageEl?.getAttribute("content") || undefined;

    return {
      product_id: sku || title.toLowerCase().replace(/\s+/g, "-"),
      sku: sku || undefined,
      title,
      price,
      currency,
      brand,
      image_url,
    };
  }, null);
}
