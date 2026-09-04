/**
 * Generic Storefront Adapter (Universal Fallback)
 *
 * Runs on custom React / Next.js stores, Vue SPAs, plain HTML websites, and unknown platforms.
 * Uses structured data (JSON-LD, microdata, OpenGraph) and heuristic DOM detection.
 * Strictly non-blocking: never calls preventDefault on clicks or form submissions.
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
import {
  extractDomHeuristicCart,
  extractDomHeuristicProduct,
  extractExplicitMarkupProduct,
  parsePriceText,
} from "../detection/dom-heuristics";
import { extractJsonLdProduct } from "../detection/jsonld-detector";
import { extractMicrodataProduct } from "../detection/schema-org-detector";
import { extractMetaProduct } from "../detection/meta-detector";

export class GenericAdapter implements PlatformAdapter {
  public readonly name: PlatformType = "unknown";
  private emitter: EventEmitter | null = null;
  private context: AdapterContext | null = null;
  private clickListener: ((e: Event) => void) | null = null;
  private submitListener: ((e: Event) => void) | null = null;

  public detect(_win?: Window, _doc?: Document): boolean {
    // Generic adapter is always available as fallback
    return true;
  }

  public init(emitter: EventEmitter, context: AdapterContext): void {
    this.emitter = emitter;
    this.context = context;

    if (typeof document === "undefined") return;

    // 1. Generic Click Listener for Add to Cart or explicit Cartwright events
    this.clickListener = (e: Event) => {
      tryCatchGuard(() => {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        // Check for explicit markup: data-cartwright-event="add_to_cart"
        const explicitEl = target.closest("[data-cartwright-event]");
        if (explicitEl) {
          const eventType = explicitEl.getAttribute("data-cartwright-event");
          if (eventType === "add_to_cart" && this.emitter && this.context) {
            const explicitProdId = explicitEl.getAttribute("data-cartwright-product-id");
            let product = this.extractProduct(document);
            if (explicitProdId && (!product || product.product_id !== explicitProdId)) {
              product = {
                product_id: explicitProdId,
                title: explicitEl.getAttribute("data-cartwright-product-name") || product?.title || explicitProdId,
                price: product?.price,
                currency: product?.currency,
              };
            }

            const event = createCanonicalEvent({
              site_id: this.context.siteId,
              visitor_id: this.context.visitorId,
              session_id: this.context.sessionId,
              event_name: "add_to_cart",
              platform: "unknown",
              source: "explicit_api",
              product: product || undefined,
            });
            this.emitter(event);
            return;
          }
        }

        // Generic button heuristic
        const btn = target.closest(
          'button[name*="add-to-cart"], button[id*="add-to-cart"], button[id*="addToCart"], button[class*="add-to-cart"], button[class*="addToCart"], [data-action="add-to-cart"], .add-to-cart-btn',
        );

        if (!btn) {
          // Check text content of button if it's a direct button
          if (target.tagName === "BUTTON" || target.tagName === "A") {
            const text = target.textContent?.trim().toLowerCase() || "";
            if (text === "add to cart" || text === "add to bag" || text === "buy now") {
              this.emitAddToCart();
            }
          }
          return;
        }

        this.emitAddToCart();
      }, undefined, this.context?.debug, "GenericAdapter:click");
    };

    // 2. Generic Form Submit Listener
    this.submitListener = (e: Event) => {
      tryCatchGuard(() => {
        const form = (e.target as HTMLElement)?.closest?.("form") || (e.target as HTMLFormElement | null);
        if (!form) return;

        const action = (form.getAttribute?.("action") || form.action || "").toLowerCase();
        if (action.includes("/cart/add") || action.includes("add-to-cart") || action.includes("addtocart")) {
          this.emitAddToCart();
        }
      }, undefined, this.context?.debug, "GenericAdapter:submit");
    };

    document.addEventListener("click", this.clickListener, true);
    document.addEventListener("submit", this.submitListener, true);
  }

  private emitAddToCart(): void {
    if (!this.emitter || !this.context) return;
    const product = this.extractProduct(document);
    const event = createCanonicalEvent({
      site_id: this.context.siteId,
      visitor_id: this.context.visitorId,
      session_id: this.context.sessionId,
      event_name: "add_to_cart",
      platform: "unknown",
      source: "dom_heuristic",
      product: product || undefined,
    });
    this.emitter(event);
  }

  public extractProduct(doc?: Document): CanonicalProduct | null {
    const d = doc || (typeof document !== "undefined" ? document : undefined);
    if (!d) return null;

    // Try layered extractors in order of confidence:
    // 1. Explicit markup
    // 2. JSON-LD
    // 3. Schema.org Microdata
    // 4. OpenGraph / Meta
    // 5. DOM Heuristics
    return (
      extractExplicitMarkupProduct(d) ||
      extractJsonLdProduct(d) ||
      extractMicrodataProduct(d) ||
      extractMetaProduct(d) ||
      extractDomHeuristicProduct(d)
    );
  }

  public extractCart(doc?: Document): CanonicalCart | null {
    const d = doc || (typeof document !== "undefined" ? document : undefined);
    if (!d) return null;
    return extractDomHeuristicCart(d);
  }

  public extractOrder(doc?: Document): CanonicalOrder | null {
    const d = doc || (typeof document !== "undefined" ? document : undefined);
    if (!d) return null;

    return tryCatchGuard(() => {
      const loc = typeof location !== "undefined" ? location.pathname.toLowerCase() : "";
      if (
        loc.includes("/thank-you") ||
        loc.includes("/order-received") ||
        loc.includes("/order-confirmation") ||
        loc.includes("/confirmed")
      ) {
        const orderEl = d.querySelector('[data-order-id], .order-number, #order-id, .order-id');
        const orderId = orderEl?.textContent?.trim() || `ord_${Date.now()}`;

        const totalEl = d.querySelector('.order-total, .total-amount, [data-order-total]');
        const parsed = totalEl?.textContent ? parsePriceText(totalEl.textContent) : {};

        return {
          order_id: orderId,
          total_amount: parsed.price || 0,
          currency: parsed.currency || "USD",
        };
      }
      return null;
    }, null);
  }

  public destroy(): void {
    if (this.clickListener && typeof document !== "undefined") {
      document.removeEventListener("click", this.clickListener, true);
    }
    if (this.submitListener && typeof document !== "undefined") {
      document.removeEventListener("submit", this.submitListener, true);
    }
    this.emitter = null;
    this.context = null;
  }
}
