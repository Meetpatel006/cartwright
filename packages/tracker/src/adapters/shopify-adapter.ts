/**
 * Shopify Storefront Adapter
 */

import { tryCatchGuard } from "../core/error-boundary";
import { createCanonicalEvent } from "../events/event-factory";
import type {
  CanonicalCart,
  CanonicalOrder,
  CanonicalProduct,
  PlatformType,
} from "../events/canonical-types";
import type { AdapterContext, EventEmitter, PlatformAdapter } from "./adapter.interface";
import { extractJsonLdProduct } from "../detection/jsonld-detector";
import { extractMetaProduct } from "../detection/meta-detector";

export class ShopifyAdapter implements PlatformAdapter {
  public readonly name: PlatformType = "shopify";
  private emitter: EventEmitter | null = null;
  private context: AdapterContext | null = null;
  private formListener: ((e: Event) => void) | null = null;

  public detect(win?: Window, doc?: Document): boolean {
    const w = win || (typeof window !== "undefined" ? window : undefined);
    const d = doc || (typeof document !== "undefined" ? document : undefined);

    const hasGlobals = Boolean(
      (w as unknown as { Shopify?: unknown })?.Shopify ||
        (w as unknown as { ShopifyAnalytics?: unknown })?.ShopifyAnalytics,
    );
    const hasDom = Boolean(
      d?.querySelector('link[href*="cdn.shopify.com"]') ||
        d?.querySelector('meta[id="shopify-digital-wallet"]'),
    );

    return hasGlobals || hasDom;
  }

  public init(emitter: EventEmitter, context: AdapterContext): void {
    this.emitter = emitter;
    this.context = context;

    if (typeof document === "undefined") return;

    // Listen for Add to Cart form submissions
    this.formListener = (e: Event) => {
      tryCatchGuard(() => {
        const form = (e.target as HTMLElement)?.closest?.("form") || (e.target as HTMLFormElement);
        if (!form) return;

        const action = (form.getAttribute?.("action") || form.action || "").toLowerCase();
        if (!action.includes("/cart/add") && !action.includes("cart/add")) return;

        const product = this.extractProduct(document);
        if (product && this.emitter && this.context) {
          const event = createCanonicalEvent({
            site_id: this.context.siteId,
            visitor_id: this.context.visitorId,
            session_id: this.context.sessionId,
            event_name: "add_to_cart",
            platform: "shopify",
            source: "auto_adapter",
            product,
          });
          this.emitter(event);
        }
      }, undefined, this.context?.debug, "ShopifyAdapter:formSubmit");
    };

    document.addEventListener("submit", this.formListener, true);
  }

  public extractProduct(doc?: Document): CanonicalProduct | null {
    const d = doc || (typeof document !== "undefined" ? document : undefined);
    if (!d) return null;

    // 1. Try ShopifyAnalytics metadata
    if (typeof window !== "undefined") {
      const sa = (window as unknown as {
        ShopifyAnalytics?: { meta?: { product?: { id?: number; title?: string; price?: number; type?: string; vendor?: string } } };
      }).ShopifyAnalytics;

      const p = sa?.meta?.product;
      if (p && p.title) {
        return {
          product_id: String(p.id || p.title.toLowerCase().replace(/\s+/g, "-")),
          title: p.title,
          price: p.price !== undefined ? p.price / 100 : undefined,
          category: p.type,
          brand: p.vendor,
        };
      }
    }

    // 2. Try JSON-LD or Meta
    return extractJsonLdProduct(d) || extractMetaProduct(d);
  }

  public extractCart(doc?: Document): CanonicalCart | null {
    const d = doc || (typeof document !== "undefined" ? document : undefined);
    if (!d) return null;

    const countEl = d.querySelector('[data-cart-count], .cart-count, .cart__item-count');
    const rawCount = countEl?.textContent?.replace(/[^0-9]/g, "");
    const count = rawCount ? parseInt(rawCount, 10) : 0;

    return {
      item_count: isNaN(count) ? 0 : count,
      items: [],
    };
  }

  public extractOrder(doc?: Document): CanonicalOrder | null {
    const d = doc || (typeof document !== "undefined" ? document : undefined);
    if (!d) return null;

    if (typeof window !== "undefined") {
      const checkout = (window as unknown as { Shopify?: { checkout?: { order_id?: string; total_price?: string; currency?: string } } })
        .Shopify?.checkout;

      if (checkout && checkout.order_id && checkout.total_price) {
        return {
          order_id: String(checkout.order_id),
          total_amount: parseFloat(checkout.total_price),
          currency: checkout.currency || "USD",
        };
      }
    }

    return null;
  }

  public destroy(): void {
    if (this.formListener && typeof document !== "undefined") {
      document.removeEventListener("submit", this.formListener, true);
    }
    this.emitter = null;
    this.context = null;
  }
}
