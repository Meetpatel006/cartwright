/**
 * Storefront Platform Detector
 *
 * Deterministically classifies the merchant platform using multi-signal heuristics.
 * If uncertain, returns "unknown" for safe fallback to the generic adapter.
 */

import { tryCatchGuard } from "../core/error-boundary";
import type { PlatformType } from "../events/canonical-types";

export function detectPlatform(targetWin?: Window, targetDoc?: Document): PlatformType {
  const win = targetWin || (typeof window !== "undefined" ? window : undefined);
  const doc = targetDoc || (typeof document !== "undefined" ? document : undefined);

  if (!win && !doc) return "unknown";

  return tryCatchGuard(() => {
    // 1. Shopify Detection
    const hasShopifyGlobals =
      win &&
      Boolean(
        (win as unknown as { Shopify?: unknown }).Shopify ||
          (win as unknown as { ShopifyAnalytics?: unknown }).ShopifyAnalytics ||
          (win as unknown as { BOOMR?: { shopify?: unknown } }).BOOMR?.shopify,
      );

    const hasShopifyDom =
      doc &&
      Boolean(
        doc.querySelector('link[href*="cdn.shopify.com"]') ||
          doc.querySelector('script[src*="cdn.shopify.com"]') ||
          doc.querySelector('meta[id="shopify-digital-wallet"]') ||
          doc.querySelector('form[action*="/cart/add"] input[name="id"]'),
      );

    if (hasShopifyGlobals || hasShopifyDom) {
      return "shopify";
    }

    // 2. WooCommerce Detection
    const hasWooGlobals =
      win &&
      Boolean(
        (win as unknown as { wc_add_to_cart_params?: unknown }).wc_add_to_cart_params ||
          (win as unknown as { woocommerce_params?: unknown }).woocommerce_params ||
          (win as unknown as { wc_cart_fragments_params?: unknown }).wc_cart_fragments_params,
      );

    const hasWooDom =
      doc &&
      Boolean(
        doc.body?.classList.contains("woocommerce") ||
          doc.body?.classList.contains("woocommerce-page") ||
          doc.querySelector('link[href*="woocommerce"]') ||
          doc.querySelector(".woocommerce-cart-form"),
      );

    if (hasWooGlobals || hasWooDom) {
      return "woocommerce";
    }

    // 3. Magento / Adobe Commerce Detection
    const hasMagentoGlobals =
      win &&
      Boolean(
        (win as unknown as { Mage?: unknown }).Mage ||
          (win as unknown as { magento?: unknown }).magento,
      );

    const hasMagentoDom =
      doc &&
      Boolean(
        doc.querySelector('script[src*="mage/"]') ||
          doc.querySelector('script[type="text/x-magento-init"]') ||
          doc.body?.classList.contains("catalog-product-view") ||
          doc.querySelector('[data-role="priceBox"]'),
      );

    if (hasMagentoGlobals || hasMagentoDom) {
      return "magento";
    }

    // 4. BigCommerce Detection
    const hasBigCommerceGlobals =
      win &&
      Boolean(
        (win as unknown as { BCData?: unknown }).BCData ||
          (win as unknown as { stencilUtils?: unknown }).stencilUtils,
      );

    const hasBigCommerceDom =
      doc &&
      Boolean(
        doc.querySelector('link[href*="cdn11.bigcommerce.com"]') ||
          doc.querySelector('form[data-cart-item-add]') ||
          doc.querySelector('[data-stencil-product]'),
      );

    if (hasBigCommerceGlobals || hasBigCommerceDom) {
      return "bigcommerce";
    }

    // 5. Wix Detection
    const hasWixGlobals =
      win &&
      Boolean(
        (win as unknown as { wixData?: unknown }).wixData ||
          (win as unknown as { wixStores?: unknown }).wixStores,
      );

    const hasWixDom =
      doc &&
      Boolean(
        doc.querySelector('meta[name="generator"][content*="Wix"]') ||
          doc.querySelector('link[href*="static.wixstatic.com"]') ||
          doc.querySelector("wix-dropdown-menu"),
      );

    if (hasWixGlobals || hasWixDom) {
      return "wix";
    }

    // 6. Custom SPA (React / Next.js / Vue)
    const hasSpaGlobals =
      win &&
      Boolean(
        (win as unknown as { __NEXT_DATA__?: unknown }).__NEXT_DATA__ ||
          (win as unknown as { __NUXT__?: unknown }).__NUXT__,
      );

    const hasSpaDom =
      doc &&
      Boolean(
        doc.getElementById("__next") ||
          doc.getElementById("root") ||
          doc.querySelector('[data-reactroot]'),
      );

    if (hasSpaGlobals || hasSpaDom) {
      return "custom_spa";
    }

    return "unknown";
  }, "unknown");
}
