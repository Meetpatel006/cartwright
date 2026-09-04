/**
 * JSON-LD Product & Offer Detector
 *
 * Extracts structured product data from schema.org JSON-LD scripts.
 */

import { tryCatchGuard } from "../core/error-boundary";
import type { CanonicalProduct } from "../events/canonical-types";

interface SchemaOffer {
  "@type"?: string;
  price?: number | string;
  priceCurrency?: string;
  availability?: string;
  sku?: string;
  url?: string;
}

interface SchemaProduct {
  "@type"?: string | string[];
  name?: string;
  title?: string;
  sku?: string;
  productID?: string;
  identifier?: string;
  image?: string | string[] | { url?: string };
  offers?: SchemaOffer | SchemaOffer[];
  brand?: string | { name?: string };
  category?: string;
  description?: string;
}

export function extractJsonLdProduct(targetDoc?: Document): CanonicalProduct | null {
  const doc = targetDoc || (typeof document !== "undefined" ? document : undefined);
  if (!doc) return null;

  return tryCatchGuard(() => {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    if (!scripts || scripts.length === 0) return null;

    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      if (!script?.textContent) continue;

      let json: unknown;
      try {
        json = JSON.parse(script.textContent);
      } catch {
        continue;
      }

      const product = findProductInJson(json);
      if (product) {
        return normalizeSchemaProduct(product);
      }
    }

    return null;
  }, null);
}

function findProductInJson(json: unknown): SchemaProduct | null {
  if (!json || typeof json !== "object") return null;

  if (Array.isArray(json)) {
    for (const item of json) {
      const found = findProductInJson(item);
      if (found) return found;
    }
    return null;
  }

  const obj = json as Record<string, unknown>;

  // Check if this object is Product
  const type = obj["@type"];
  if (
    type === "Product" ||
    (Array.isArray(type) && type.includes("Product")) ||
    type === "IndividualProduct"
  ) {
    return obj as SchemaProduct;
  }

  // Check @graph array
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) {
      const found = findProductInJson(item);
      if (found) return found;
    }
  }

  return null;
}

function normalizeSchemaProduct(prod: SchemaProduct): CanonicalProduct {
  const title = prod.name || prod.title || "";
  const sku = prod.sku || prod.productID || prod.identifier || "";
  const product_id = sku || title.toLowerCase().replace(/\s+/g, "-") || "product";

  let price: number | undefined;
  let currency: string | undefined;
  let in_stock: boolean | undefined;

  const offers = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
  if (offers) {
    if (offers.price !== undefined) {
      const parsedPrice = typeof offers.price === "number" ? offers.price : parseFloat(String(offers.price));
      if (!isNaN(parsedPrice)) {
        price = parsedPrice;
      }
    }
    if (offers.priceCurrency) {
      currency = offers.priceCurrency.toUpperCase();
    }
    if (offers.availability) {
      in_stock = String(offers.availability).toLowerCase().includes("instock");
    }
  }

  let brand: string | undefined;
  if (typeof prod.brand === "string") {
    brand = prod.brand;
  } else if (prod.brand && typeof prod.brand === "object" && "name" in prod.brand) {
    brand = String(prod.brand.name);
  }

  let image_url: string | undefined;
  if (typeof prod.image === "string") {
    image_url = prod.image;
  } else if (Array.isArray(prod.image) && typeof prod.image[0] === "string") {
    image_url = prod.image[0];
  } else if (prod.image && typeof prod.image === "object" && "url" in prod.image) {
    image_url = String(prod.image.url);
  }

  return {
    product_id,
    sku: sku || undefined,
    title,
    price,
    currency,
    brand,
    category: prod.category,
    image_url,
    in_stock,
  };
}
