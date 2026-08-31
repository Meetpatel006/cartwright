/**
 * OpenGraph & Meta Tag Product Detector
 *
 * Extracts product metadata from standard OpenGraph, Twitter, and ecommerce meta tags.
 */

import { tryCatchGuard } from "../core/error-boundary";
import type { CanonicalProduct } from "../events/canonical-types";

export function extractMetaProduct(targetDoc?: Document): CanonicalProduct | null {
  const doc = targetDoc || (typeof document !== "undefined" ? document : undefined);
  if (!doc) return null;

  return tryCatchGuard(() => {
    const ogType = doc.querySelector('meta[property="og:type"]')?.getAttribute("content");
    const isProduct = ogType === "product" || ogType === "og:product";

    const title =
      doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
      doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content") ||
      "";

    if (!title && !isProduct) return null;

    const priceStr =
      doc.querySelector('meta[property="product:price:amount"]')?.getAttribute("content") ||
      doc.querySelector('meta[property="og:price:amount"]')?.getAttribute("content") ||
      "";

    const parsedPrice = priceStr ? parseFloat(priceStr.replace(/[^0-9.]/g, "")) : NaN;
    const price = !isNaN(parsedPrice) ? parsedPrice : undefined;

    const currency =
      doc.querySelector('meta[property="product:price:currency"]')?.getAttribute("content")?.toUpperCase() ||
      doc.querySelector('meta[property="og:price:currency"]')?.getAttribute("content")?.toUpperCase() ||
      undefined;

    const brand =
      doc.querySelector('meta[property="product:brand"]')?.getAttribute("content") ||
      doc.querySelector('meta[name="twitter:data1"]')?.getAttribute("content") ||
      undefined;

    const image_url =
      doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
      doc.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ||
      undefined;

    if (!title && !price) return null;

    return {
      product_id: title.toLowerCase().replace(/\s+/g, "-") || "product",
      title: title || doc.title || "",
      price,
      currency,
      brand,
      image_url,
    };
  }, null);
}
