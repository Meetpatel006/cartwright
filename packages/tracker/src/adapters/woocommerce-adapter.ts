/**
 * WooCommerce Storefront Adapter
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
import { extractMicrodataProduct } from "../detection/schema-org-detector";
import { parsePriceText } from "../detection/dom-heuristics";

export class WooCommerceAdapter implements PlatformAdapter {
  public readonly name: PlatformType = "woocommerce";
  private emitter: EventEmitter | null = null;
  private context: AdapterContext | null = null;
  private clickListener: ((e: Event) => void) | null = null;

  public detect(win?: Window, doc?: Document): boolean {
    const w = win || (typeof window !== "undefined" ? window : undefined);
    const d = doc || (typeof document !== "undefined" ? document : undefined);

    const hasGlobals = Boolean(
      (w as unknown as { wc_add_to_cart_params?: unknown })?.wc_add_to_cart_params ||
        (w as unknown as { woocommerce_params?: unknown })?.woocommerce_params,
    );
    const hasDom = Boolean(
      d?.body?.classList.contains("woocommerce") ||
        d?.body?.classList.contains("woocommerce-page") ||
        d?.querySelector(".woocommerce-cart-form"),
    );

    return hasGlobals || hasDom;
  }

  public init(emitter: EventEmitter, context: AdapterContext): void {
    this.emitter = emitter;
    this.context = context;

    if (typeof document === "undefined") return;

    // Listen for WooCommerce AJAX or standard add-to-cart clicks
    this.clickListener = (e: Event) => {
      tryCatchGuard(() => {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        const btn = target.closest(
          ".single_add_to_cart_button, .add_to_cart_button, [name='add-to-cart'], button[name='add-to-cart']",
        );
        if (!btn) return;

        const product = this.extractProduct(document);
        if (product && this.emitter && this.context) {
          const event = createCanonicalEvent({
            site_id: this.context.siteId,
            visitor_id: this.context.visitorId,
            session_id: this.context.sessionId,
            event_name: "add_to_cart",
            platform: "woocommerce",
            source: "auto_adapter",
            product,
          });
          this.emitter(event);
        }
      }, undefined, this.context?.debug, "WooCommerceAdapter:addToCartClick");
    };

    document.addEventListener("click", this.clickListener, true);
  }

  public extractProduct(doc?: Document): CanonicalProduct | null {
    const d = doc || (typeof document !== "undefined" ? document : undefined);
    if (!d) return null;

    // Try JSON-LD or Microdata
    const structured = extractJsonLdProduct(d) || extractMicrodataProduct(d);
    if (structured) return structured;

    // Fallback to Woo DOM
    return tryCatchGuard(() => {
      const titleEl = d.querySelector(".product_title, .woocommerce-loop-product__title");
      const title = titleEl?.textContent?.trim() || "";
      if (!title) return null;

      const priceEl = d.querySelector(".price .woocommerce-Price-amount, .woocommerce-Price-amount");
      const parsed = priceEl?.textContent ? parsePriceText(priceEl.textContent) : {};

      const skuEl = d.querySelector(".sku");
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

    const countEl = d.querySelector(".cart-contents .count, .cart-count, [class*='cart-contents']");
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
      const orderEl = d.querySelector(".woocommerce-order-overview__order strong, .order strong");
      const totalEl = d.querySelector(".woocommerce-order-overview__total strong, .woocommerce-Price-amount");

      if (orderEl && totalEl && orderEl.textContent && totalEl.textContent) {
        const order_id = orderEl.textContent.trim();
        const parsed = parsePriceText(totalEl.textContent);
        if (parsed.price !== undefined) {
          return {
            order_id,
            total_amount: parsed.price,
            currency: parsed.currency || "USD",
          };
        }
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
