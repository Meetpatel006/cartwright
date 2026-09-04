import { describe, expect, test, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GlobalWindow } from "happy-dom";
import { AdapterRegistry } from "../src/adapters/adapter-registry";
import { ShopifyAdapter } from "../src/adapters/shopify-adapter";
import { resolveProductLayered } from "../src/detection/product-resolver";
import type { CanonicalEvent } from "../src/events/canonical-types";

function loadFixture(filename: string): string {
  const baseDir = typeof __dirname !== "undefined" ? __dirname : resolve(process.cwd(), "tests");
  const p = resolve(baseDir, "fixtures", filename);
  return readFileSync(p, "utf-8");
}

describe("Storefront Platform & Framework Compatibility (10 Frameworks)", () => {
  let domWindow: GlobalWindow;
  let registry: AdapterRegistry;

  beforeEach(() => {
    domWindow = new GlobalWindow();
    (globalThis as unknown as { window: unknown }).window = domWindow;
    (globalThis as unknown as { document: unknown }).document = domWindow.document;
    (globalThis as unknown as { location: unknown }).location = domWindow.location;
    registry = new AdapterRegistry();
  });

  test("1. Plain HTML ecommerce fixture extraction", () => {
    const html = loadFixture("plain-html.html");
    domWindow.document.documentElement.innerHTML = html;

    const product = resolveProductLayered(domWindow.document as unknown as Document, domWindow.location as unknown as Location);
    expect(product).not.toBeNull();
    expect(product?.title).toBe("Artisan Lavender Candle");
    expect(product?.price).toBe(18.5);
    expect(product?.sku).toBe("CANDLE-LAV-01");
  });

  test("2. React SPA fixture extraction", () => {
    const html = loadFixture("custom-react.html");
    domWindow.document.documentElement.innerHTML = html;

    const product = resolveProductLayered(domWindow.document as unknown as Document, domWindow.location as unknown as Location);
    expect(product).not.toBeNull();
    expect(product?.title).toBe("Wireless Noise-Cancelling Headphones");
    expect(product?.price).toBe(199.99);
  });

  test("3. Next.js App Router fixture extraction", () => {
    const html = loadFixture("nextjs-app-router.html");
    domWindow.document.documentElement.innerHTML = html;

    const product = resolveProductLayered(domWindow.document as unknown as Document, domWindow.location as unknown as Location);
    expect(product).not.toBeNull();
    expect(product?.title).toBe("Minimalist Desk Lamp");
    expect(product?.price).toBe(89);
    expect(product?.sku).toBe("LAMP-MIN-001");
  });

  test("4. Next.js Pages Router fixture extraction", () => {
    const html = loadFixture("nextjs-pages-router.html");
    domWindow.document.documentElement.innerHTML = html;

    const product = resolveProductLayered(domWindow.document as unknown as Document, domWindow.location as unknown as Location);
    expect(product).not.toBeNull();
    expect(product?.title).toBe("Wireless Mechanical Keyboard");
    expect(product?.price).toBe(129.99);
  });

  test("5. Vue SPA fixture extraction", () => {
    const html = loadFixture("vue-spa.html");
    domWindow.document.documentElement.innerHTML = html;

    const product = resolveProductLayered(domWindow.document as unknown as Document, domWindow.location as unknown as Location);
    expect(product).not.toBeNull();
    expect(product?.title).toBe("Artisan Ceramic Teapot");
    expect(product?.price).toBe(48);
  });

  test("6. Shopify Adapter & fixture extraction", () => {
    const html = loadFixture("shopify.html");
    domWindow.document.documentElement.innerHTML = html;

    const adapter = registry.resolveAdapter(domWindow as unknown as Window, domWindow.document as unknown as Document);
    expect(adapter.name).toBe("shopify");

    const product = adapter.extractProduct?.(domWindow.document as unknown as Document);
    expect(product?.title).toBe("Classic Leather Shoes");
    expect(product?.price).toBe(149.99);

    const cart = adapter.extractCart?.(domWindow.document as unknown as Document);
    expect(cart?.item_count).toBe(2);
  });

  test("7. WooCommerce Adapter & fixture extraction", () => {
    const html = loadFixture("woocommerce.html");
    domWindow.document.documentElement.innerHTML = html;

    const adapter = registry.resolveAdapter(domWindow as unknown as Window, domWindow.document as unknown as Document);
    expect(adapter.name).toBe("woocommerce");

    const product = adapter.extractProduct?.(domWindow.document as unknown as Document);
    expect(product?.title).toBe("Organic Cotton Hoodie");
    expect(product?.price).toBe(45);
    expect(product?.sku).toBe("HOODIE-01");

    const cart = adapter.extractCart?.(domWindow.document as unknown as Document);
    expect(cart?.item_count).toBe(3);
  });

  test("8. Magento Adapter & fixture extraction", () => {
    const html = loadFixture("magento.html");
    domWindow.document.documentElement.innerHTML = html;

    const adapter = registry.resolveAdapter(domWindow as unknown as Window, domWindow.document as unknown as Document);
    expect(adapter.name).toBe("magento");

    const product = adapter.extractProduct?.(domWindow.document as unknown as Document);
    expect(product?.title).toBe("Pro Chronograph Watch");
    expect(product?.price).toBe(299);
    expect(product?.sku).toBe("WATCH-990");
  });

  test("9. BigCommerce Adapter & fixture extraction", () => {
    const html = loadFixture("bigcommerce.html");
    domWindow.document.documentElement.innerHTML = html;

    const adapter = registry.resolveAdapter(domWindow as unknown as Window, domWindow.document as unknown as Document);
    expect(adapter.name).toBe("bigcommerce");

    const product = adapter.extractProduct?.(domWindow.document as unknown as Document);
    expect(product?.title).toBe("Trailblazer Mountain Bike");
    expect(product?.price).toBe(799);
    expect(product?.sku).toBe("BIKE-MTN-700");

    const cart = adapter.extractCart?.(domWindow.document as unknown as Document);
    expect(cart?.item_count).toBe(5);
  });

  test("10. Wix Adapter & fixture extraction", () => {
    const html = loadFixture("wix.html");
    domWindow.document.documentElement.innerHTML = html;

    const adapter = registry.resolveAdapter(domWindow as unknown as Window, domWindow.document as unknown as Document);
    expect(adapter.name).toBe("wix");

    const product = adapter.extractProduct?.(domWindow.document as unknown as Document);
    expect(product?.title).toBe("Handmade Ceramic Mug");
    expect(product?.price).toBe(24);
  });

  test("11. Unknown custom storefront with explicit data-cartwright attributes", () => {
    const html = loadFixture("custom-markup.html");
    domWindow.document.documentElement.innerHTML = html;

    const product = resolveProductLayered(domWindow.document as unknown as Document, domWindow.location as unknown as Location);
    expect(product).not.toBeNull();
    expect(product?.product_id).toBe("PROD_RUNNER_77");
    expect(product?.title).toBe("Ultralight Carbon Running Shoes");
    expect(product?.price).toBe(189);
    expect(product?.currency).toBe("USD");
  });

  test("12. Explicit data-cartwright-event on click emits add_to_cart without calling preventDefault", () => {
    const html = loadFixture("custom-markup.html");
    domWindow.document.documentElement.innerHTML = html;

    const adapter = registry.resolveAdapter(domWindow as unknown as Window, domWindow.document as unknown as Document);
    const events: CanonicalEvent[] = [];

    adapter.init(
      (evt) => events.push(evt),
      { siteId: "site_custom", visitorId: "vis_1", sessionId: "ses_1" },
    );

    const btn = domWindow.document.querySelector("button[data-cartwright-event='add_to_cart']");
    const clickEvent = new domWindow.Event("click", { bubbles: true, cancelable: true });
    btn?.dispatchEvent(clickEvent);

    expect(events.length).toBe(1);
    expect(events[0]?.event_name).toBe("add_to_cart");
    expect(events[0]?.product?.product_id).toBe("PROD_RUNNER_77");
    // Verify preventDefault was NOT called, preserving merchant form/navigation behavior
    expect(clickEvent.defaultPrevented).toBe(false);
  });

  test("13. Add to cart form event triggers listener correctly", async () => {
    const html = loadFixture("shopify.html");
    domWindow.document.documentElement.innerHTML = html;

    const adapter = new ShopifyAdapter();
    const emittedEvents: CanonicalEvent[] = [];

    adapter.init(
      (evt) => {
        emittedEvents.push(evt);
      },
      { siteId: "site_test", visitorId: "vis_123", sessionId: "ses_123" },
    );

    const form = domWindow.document.querySelector("form");
    const submitEvent = new domWindow.Event("submit", { bubbles: true, cancelable: true });
    form?.dispatchEvent(submitEvent);

    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0]?.event_name).toBe("add_to_cart");
    expect(emittedEvents[0]?.platform).toBe("shopify");
    expect(emittedEvents[0]?.product?.title).toBe("Classic Leather Shoes");
    expect(submitEvent.defaultPrevented).toBe(false);
    adapter.destroy();
  });
});
