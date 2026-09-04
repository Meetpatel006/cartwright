/**
 * BigCommerce Storefront Adapter
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
import { parsePriceText } from "../detection/dom-heuristics";

export class BigCommerceAdapter implements PlatformAdapter {
  public readonly name: PlatformType = "bigcommerce";
  private emitter: EventEmitter | null = null;
  private context: AdapterContext | null = null;
  private clickListener: ((e: Event) => void) | null = null;

  public detect(win?: Window, doc?: Document): boolean {
    const w = win || (typeof window !== "undefined" ? window : undefined);
    const d = doc || (typeof document !== "undefined" ? document : undefined);

    const hasGlobals = Boolean(
      (w as unknown as { BCData?: unknown })?.BCData ||
        (w as unknown as { stencilUtils?: unknown })?.stencilUtils,
    );
    const hasDom = Boolean(
      d?.querySelector('link[href*="cdn11.bigcommerce.com"]') ||
        d?.querySelector("form[data-cart-item-add]") ||
        d?.querySelector("[data-stencil-product]"),
    );

    return hasGlobals || hasDom;
  }

  public init(emitter: EventEmitter, context: AdapterContext): void {
    this.emitter = emitter;
    this.context = context;

    if (typeof document === "undefined") return;

    this.clickListener = (e: Event) => {
      tryCatchGuard(() => {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        const btn = target.closest(
          "#form-action-addToCart, input#form-action-addToCart, [data-button-purchase]",
        );
        if (!btn) return;

        const product = this.extractProduct(document);
        if (product && this.emitter && this.context) {
          const event = createCanonicalEvent({
            site_id: this.context.siteId,
            visitor_id: this.context.visitorId,
            session_id: this.context.sessionId,
            event_name: "add_to_cart",
            platform: "bigcommerce",
            source: "auto_adapter",
            product,
          });
          this.emitter(event);
        }
      }, undefined, this.context?.debug, "BigCommerceAdapter:addToCartClick");
    };

    document.addEventListener("click", this.clickListener, true);
  }

  public extractProduct(doc?: Document): CanonicalProduct | null {
    const d = doc || (typeof document !== "undefined" ? document : undefined);
    if (!d) return null;

    const structured = extractJsonLdProduct(d);
    if (structured) return structured;

    return tryCatchGuard(() => {
      const titleEl = d.querySelector(".productView-title, h1.productView-title");
      const title = titleEl?.textContent?.trim() || "";
      if (!title) return null;

      const priceEl = d.querySelector(".price--withoutTax, .price--withTax, .price-section .price");
      const parsed = priceEl?.textContent ? parsePriceText(priceEl.textContent) : {};

      const skuEl = d.querySelector('[data-product-sku], .productView-info-value--sku');
      const sku = skuEl?.textContent?.trim();

      return {
        product_id: sku || title.toLowerCase().replace(/\s+/g, "-"),
        sku,
        title,
        price: parsed.price,
        currency: parsed.currency,
      };
    }, null);
  }

  public extractCart(doc?: Document): CanonicalCart | null {
    const d = doc || (typeof document !== "undefined" ? document : undefined);
    if (!d) return null;

    const countEl = d.querySelector(".cart-quantity, .countPill");
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

    return tryCatchGuard(() => {
      const orderEl = d.querySelector("[data-order-id], .orderConfirmation-section strong");
      if (orderEl && orderEl.textContent) {
        return {
          order_id: orderEl.textContent.trim(),
          total_amount: 0,
          currency: "USD",
        };
      }
      return null;
    }, null);
  }

  public destroy(): void {
    if (this.clickListener && typeof document !== "undefined") {
      document.removeEventListener("click", this.clickListener, true);
    }
    this.emitter = null;
    this.context = null;
  }
}
