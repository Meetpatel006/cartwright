/**
 * Canonical Event Factory
 *
 * Assembles and validates standardized Cartwright tracking events.
 */

import type {
  ActorType,
  AgentTelemetry,
  CanonicalCart,
  CanonicalEvent,
  CanonicalOrder,
  CanonicalProduct,
  EventSource,
  EventType,
  PageContext,
  PlatformType,
} from "./canonical-types";
import { sanitizeObject, sanitizeUrl } from "../privacy/sanitizer";

function generateEventId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `evt_${crypto.randomUUID()}`;
  }
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function extractPageContext(doc?: Document): PageContext {
  const d = doc || (typeof document !== "undefined" ? document : undefined);
  const loc = typeof location !== "undefined" ? location : undefined;

  const url = sanitizeUrl(loc?.href || "");
  const pathname = loc?.pathname || "";
  const referrer = sanitizeUrl(d?.referrer || "");
  const title = d?.title || "";

  let page_type: PageContext["page_type"] = "other";
  const lowerPath = pathname.toLowerCase();

  if (lowerPath === "/" || lowerPath === "") {
    page_type = "home";
  } else if (lowerPath.includes("/collection") || lowerPath.includes("/category") || lowerPath.includes("/shop")) {
    page_type = "collection";
  } else if (lowerPath.includes("/product") || lowerPath.includes("/item") || lowerPath.includes("/p/")) {
    page_type = "product";
  } else if (lowerPath.includes("/cart") || lowerPath.includes("/bag") || lowerPath.includes("/basket")) {
    page_type = "cart";
  } else if (lowerPath.includes("/checkout")) {
    page_type = "checkout";
  } else if (
    lowerPath.includes("/order-received") ||
    lowerPath.includes("/thank-you") ||
    lowerPath.includes("/order-confirmation") ||
    lowerPath.includes("/confirmed")
  ) {
    page_type = "order_confirmed";
  } else if (lowerPath.includes("/search")) {
    page_type = "search";
  }

  return {
    url,
    pathname,
    referrer,
    title,
    page_type,
  };
}

export interface CreateEventParams<T = Record<string, unknown>> {
  site_id: string;
  merchant_id?: string;
  visitor_id: string;
  session_id: string;
  event_name: EventType;
  actor_type?: ActorType;
  platform?: PlatformType;
  source?: EventSource;
  page?: Partial<PageContext>;
  product?: CanonicalProduct;
  cart?: CanonicalCart;
  order?: CanonicalOrder;
  agent?: AgentTelemetry;
  search?: { query: string; results_count?: number };
  metadata?: T;
}

export function createCanonicalEvent<T = Record<string, unknown>>(
  params: CreateEventParams<T>,
): CanonicalEvent<T> {
  const basePage = extractPageContext();
  const page: PageContext = {
    ...basePage,
    ...(params.page || {}),
  };

  const rawEvent: CanonicalEvent<T> = {
    event_id: generateEventId(),
    site_id: params.site_id,
    merchant_id: params.merchant_id,
    visitor_id: params.visitor_id,
    session_id: params.session_id,
    event_name: params.event_name,
    timestamp: new Date().toISOString(),
    actor_type: params.actor_type || "shopper",
    platform: params.platform || "unknown",
    source: params.source || "auto_adapter",
    page,
    product: params.product,
    cart: params.cart,
    order: params.order,
    agent: params.agent,
    search: params.search,
    metadata: params.metadata,
  };

  return sanitizeObject(rawEvent);
}
