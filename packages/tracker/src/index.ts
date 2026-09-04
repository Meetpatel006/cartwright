/**
 * Cartwright Universal Tracker SDK
 *
 * @packageDocumentation
 */

import { bootstrapTracker } from "./bootstrap/bootstrap";

export { CartwrightTracker } from "./core/tracker";
export { BoundedEventQueue } from "./core/queue";
export { ScopedDomObserver } from "./core/dom-observer";
export { tryCatchGuard, tryCatchAsync } from "./core/error-boundary";
export { IdentityManager } from "./identity/identity";
export { SessionManager } from "./session/session";
export { SpaNavigator } from "./session/spa-navigator";
export { createCanonicalEvent, extractPageContext } from "./events/event-factory";
export { sanitizeObject, sanitizeUrl, isSensitiveKey, isSensitiveValue } from "./privacy/sanitizer";
export { ConsentManager } from "./privacy/consent";
export { resolveSiteConfig, extractScriptConfig } from "./config/config";
export { detectPlatform } from "./detection/platform-detector";
export { resolveProductLayered, isConfidentProduct, isNonProductPage } from "./detection/product-resolver";
export { extractJsonLdProduct } from "./detection/jsonld-detector";
export { extractMicrodataProduct } from "./detection/schema-org-detector";
export { extractMetaProduct } from "./detection/meta-detector";
export {
  extractDomHeuristicProduct,
  extractDomHeuristicCart,
  extractExplicitMarkupProduct,
  parsePriceText,
} from "./detection/dom-heuristics";
export { extractSearchQuery, extractSearchFromFormSubmit } from "./detection/search-detector";
export { AdapterRegistry } from "./adapters/adapter-registry";
export { ShopifyAdapter } from "./adapters/shopify-adapter";
export { WooCommerceAdapter } from "./adapters/woocommerce-adapter";
export { MagentoAdapter } from "./adapters/magento-adapter";
export { BigCommerceAdapter } from "./adapters/bigcommerce-adapter";
export { WixAdapter } from "./adapters/wix-adapter";
export { GenericAdapter } from "./adapters/generic-adapter";
export { PostHogTransport } from "./posthog/posthog-client";
export { mapCanonicalToPostHog } from "./posthog/posthog-mapper";
export { createCartwrightAPI } from "./public-api/cartwright-api";

export type * from "./events/canonical-types";
export type * from "./config/config";
export type * from "./adapters/adapter.interface";
export type * from "./public-api/cartwright-api";

// Auto-run bootstrap when loaded in browser script tag
if (typeof window !== "undefined") {
  bootstrapTracker();
}
