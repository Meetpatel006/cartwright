import { describe, expect, test, beforeEach } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { extractJsonLdProduct } from "../src/detection/jsonld-detector";
import { extractMicrodataProduct } from "../src/detection/schema-org-detector";
import { extractMetaProduct } from "../src/detection/meta-detector";
import { extractDomHeuristicProduct, parsePriceText } from "../src/detection/dom-heuristics";
import { extractSearchQuery } from "../src/detection/search-detector";
import { detectPlatform } from "../src/detection/platform-detector";

describe("Detection & Metadata Extraction", () => {
  let domWindow: GlobalWindow;

  beforeEach(() => {
    domWindow = new GlobalWindow();
    (globalThis as unknown as { window: unknown }).window = domWindow;
    (globalThis as unknown as { document: unknown }).document = domWindow.document;
    (globalThis as unknown as { location: unknown }).location = domWindow.location;
  });

  test("10. extracts product from Schema.org JSON-LD", () => {
    domWindow.document.body.innerHTML = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": "Velvet Armchair",
        "sku": "ARM-001",
        "brand": "ModFurn",
        "offers": {
          "@type": "Offer",
          "price": 349.00,
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock"
        }
      }
      </script>
    `;

    const product = extractJsonLdProduct(domWindow.document as unknown as Document);
    expect(product).not.toBeNull();
    expect(product?.title).toBe("Velvet Armchair");
    expect(product?.sku).toBe("ARM-001");
    expect(product?.price).toBe(349);
    expect(product?.currency).toBe("USD");
    expect(product?.in_stock).toBe(true);
  });

  test("11. extracts product from Schema.org Microdata", () => {
    domWindow.document.body.innerHTML = `
      <div itemscope itemtype="http://schema.org/Product">
        <h1 itemprop="name">Bamboo Desk Organizer</h1>
        <span itemprop="sku">ORG-BAMBOO</span>
        <div itemprop="offers" itemscope itemtype="http://schema.org/Offer">
          <span itemprop="price">25.50</span>
          <span itemprop="priceCurrency">USD</span>
        </div>
      </div>
    `;

    const product = extractMicrodataProduct(domWindow.document as unknown as Document);
    expect(product).not.toBeNull();
    expect(product?.title).toBe("Bamboo Desk Organizer");
    expect(product?.sku).toBe("ORG-BAMBOO");
    expect(product?.price).toBe(25.5);
    expect(product?.currency).toBe("USD");
  });

  test("12. extracts product from OpenGraph and Meta tags", () => {
    domWindow.document.head.innerHTML = `
      <meta property="og:type" content="product">
      <meta property="og:title" content="Wireless Mechanical Keyboard">
      <meta property="product:price:amount" content="120.00">
      <meta property="product:price:currency" content="EUR">
    `;

    const product = extractMetaProduct(domWindow.document as unknown as Document);
    expect(product).not.toBeNull();
    expect(product?.title).toBe("Wireless Mechanical Keyboard");
    expect(product?.price).toBe(120);
    expect(product?.currency).toBe("EUR");
  });

  test("13. extracts product using DOM heuristics and price parsing", () => {
    domWindow.document.body.innerHTML = `
      <h1>Ceramic Pour-Over Coffee Dripper</h1>
      <div class="product-price">$32.00 USD</div>
      <button class="add-to-cart-btn">Add to Cart</button>
    `;

    const product = extractDomHeuristicProduct(domWindow.document as unknown as Document);
    expect(product).not.toBeNull();
    expect(product?.title).toBe("Ceramic Pour-Over Coffee Dripper");
    expect(product?.price).toBe(32);
    expect(product?.currency).toBe("USD");
  });

  test("14. extracts search queries from URL parameters and search inputs", () => {
    domWindow.location.search = "?q=linen+shirt&sort=price_asc";
    const q1 = extractSearchQuery(domWindow.document as unknown as Document, domWindow.location as unknown as Location);
    expect(q1).toBe("linen shirt");

    domWindow.location.search = "";
    domWindow.document.body.innerHTML = `
      <input type="search" name="search" value="espresso beans">
    `;
    const q2 = extractSearchQuery(domWindow.document as unknown as Document, domWindow.location as unknown as Location);
    expect(q2).toBe("espresso beans");
  });

  test("15. parses varied price currency strings correctly", () => {
    expect(parsePriceText("$1,499.50")).toEqual({ price: 1499.5, currency: "USD" });
    expect(parsePriceText("€49.99")).toEqual({ price: 49.99, currency: "EUR" });
    expect(parsePriceText("₹1,299.00")).toEqual({ price: 1299, currency: "INR" });
    expect(parsePriceText("£15.00")).toEqual({ price: 15, currency: "GBP" });
  });

  test("16. detects platform accurately or defaults to unknown", () => {
    // Unknown plain HTML
    domWindow.document.body.innerHTML = `<div>Simple static site</div>`;
    expect(detectPlatform(domWindow as unknown as Window, domWindow.document as unknown as Document)).toBe("unknown");

    // Shopify signal
    domWindow.document.head.innerHTML = `<link rel="dns-prefetch" href="//cdn.shopify.com">`;
    expect(detectPlatform(domWindow as unknown as Window, domWindow.document as unknown as Document)).toBe("shopify");

    // WooCommerce signal
    domWindow.document.head.innerHTML = "";
    domWindow.document.body.className = "woocommerce";
    expect(detectPlatform(domWindow as unknown as Window, domWindow.document as unknown as Document)).toBe("woocommerce");

    // Magento signal
    domWindow.document.body.className = "catalog-product-view";
    expect(detectPlatform(domWindow as unknown as Window, domWindow.document as unknown as Document)).toBe("magento");

    // BigCommerce signal
    domWindow.document.body.className = "";
    domWindow.document.body.setAttribute("data-page-type", "product");
    domWindow.document.head.innerHTML = `<link rel="stylesheet" href="https://cdn11.bigcommerce.com/style.css">`;
    expect(detectPlatform(domWindow as unknown as Window, domWindow.document as unknown as Document)).toBe("bigcommerce");

    // Wix signal
    domWindow.document.head.innerHTML = `<meta name="generator" content="Wix.com Website Builder">`;
    expect(detectPlatform(domWindow as unknown as Window, domWindow.document as unknown as Document)).toBe("wix");
  });
});
