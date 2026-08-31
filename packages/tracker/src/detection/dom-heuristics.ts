/**
 * DOM Heuristics & Explicit Markup Detector
 *
 * Discovers product attributes from explicit data attributes (e.g. data-cartwright-product-id)
 * and generic DOM patterns on custom/unknown storefronts.
 */

import { tryCatchGuard } from "../core/error-boundary";
import type { CanonicalCart, CanonicalProduct } from "../events/canonical-types";

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
  "¥": "JPY",
  "A$": "AUD",
  "C$": "CAD",
};

export function parsePriceText(text: string): { price?: number; currency?: string } {
  if (!text) return {};
  const cleaned = text.trim();

  // Find currency symbol
  let currency: string | undefined;
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (cleaned.includes(sym)) {
      currency = code;
      break;
    }
  }

  // Find ISO currency code if present (e.g. USD, EUR, INR)
  const codeMatch = cleaned.match(/\b(USD|EUR|GBP|INR|CAD|AUD|JPY)\b/i);
  if (codeMatch && codeMatch[1]) {
    currency = codeMatch[1].toUpperCase();
  }

  // Match price number like 1,299.00 or 29.99
  const numMatch = cleaned.match(/([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/);
  if (numMatch && numMatch[1]) {
    const rawNum = numMatch[1].replace(/,/g, "");
    const price = parseFloat(rawNum);
    if (!isNaN(price)) {
      return { price, currency };
    }
  }

  return { currency };
}

export function extractExplicitMarkupProduct(targetDoc?: Document): CanonicalProduct | null {
  const doc = targetDoc || (typeof document !== "undefined" ? document : undefined);
  if (!doc) return null;

  return tryCatchGuard(() => {
    // 1. Look for elements with data-cartwright-product-id or data-cartwright-product-name
    const el = doc.querySelector("[data-cartwright-product-id], [data-cartwright-product-name]");
    if (!el) return null;

    const product_id = el.getAttribute("data-cartwright-product-id") || "";
    let title = el.getAttribute("data-cartwright-product-name") || "";
    
    // If no explicit product name attribute, resolve from H1 or og:title rather than button text
    if (!title) {
      const h1 = doc.querySelector("h1");
      const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
      if (h1?.textContent?.trim()) {
        title = h1.textContent.trim();
      } else if (ogTitle) {
        title = ogTitle.trim();
      } else if (el.tagName !== "BUTTON" && el.tagName !== "INPUT") {
        title = el.textContent?.trim() || "";
      }
    }

    const priceStr = el.getAttribute("data-cartwright-product-price") || "";
    const currency = el.getAttribute("data-cartwright-product-currency")?.toUpperCase() || undefined;
    const sku = el.getAttribute("data-cartwright-product-sku") || undefined;
    const brand = el.getAttribute("data-cartwright-product-brand") || undefined;

    let price: number | undefined;
    if (priceStr) {
      const parsedPrice = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
      if (!isNaN(parsedPrice)) price = parsedPrice;
    } else {
      // Check for price on the page
      const priceEl = doc.querySelector('.current-price, .price, [class*="price"]');
      if (priceEl?.textContent) {
        const parsed = parsePriceText(priceEl.textContent);
        price = parsed.price;
      }
    }

    if (!product_id && !title) return null;

    return {
      product_id: product_id || title.toLowerCase().replace(/\s+/g, "-"),
      title: title || product_id,
      price,
      currency,
      sku,
      brand,
    };
  }, null);
}

export function extractDomHeuristicProduct(targetDoc?: Document): CanonicalProduct | null {
  const doc = targetDoc || (typeof document !== "undefined" ? document : undefined);
  if (!doc) return null;

  return tryCatchGuard(() => {
    // Check if this page has an H1 and a price near an add-to-cart button
    const h1 = doc.querySelector("h1");
    const title = h1?.textContent?.trim() || "";
    if (!title || title.length > 150) return null;

    // Check for add to cart button
    const btn = doc.querySelector(
      'button[name="add"], button[name="add-to-cart"], button[id*="add-to-cart"], button[id*="addToCart"], button[class*="add-to-cart"], button[class*="addToCart"], input[type="submit"][value*="Add to Cart"]',
    );

    // Look for price elements
    const priceEl = doc.querySelector(
      '.price, [class*="product-price"], [class*="product__price"], [id*="product-price"], .current-price, .amount',
    );

    let price: number | undefined;
    let currency: string | undefined;

    if (priceEl && priceEl.textContent) {
      const parsed = parsePriceText(priceEl.textContent);
      price = parsed.price;
      currency = parsed.currency;
    }

    if (!btn && !price) return null;

    return {
      product_id: title.toLowerCase().replace(/\s+/g, "-"),
      title,
      price,
      currency,
    };
  }, null);
}

export function extractDomHeuristicCart(targetDoc?: Document): CanonicalCart | null {
  const doc = targetDoc || (typeof document !== "undefined" ? document : undefined);
  if (!doc) return null;

  return tryCatchGuard(() => {
    const cartEl = doc.querySelector('.cart, #cart, [class*="cart-drawer"], [class*="cart-table"], .woocommerce-cart-form');
    if (!cartEl) return null;

    const countEl = doc.querySelector('[data-cart-count], .cart-count, .cart-item-count, [class*="cart-count"]');
    const rawCount = countEl?.textContent?.replace(/[^0-9]/g, "");
    const itemCount = rawCount ? parseInt(rawCount, 10) : 0;

    return {
      item_count: isNaN(itemCount) ? 0 : itemCount,
      items: [],
    };
  }, null);
}
