/**
 * Canonical Cartwright Event Types & Schemas
 *
 * Defines the standard platform-agnostic event model for merchant storefront tracking.
 */

export type EventType =
  | "page_viewed"
  | "search_performed"
  | "product_list_viewed"
  | "product_viewed"
  | "product_selected"
  | "add_to_cart"
  | "remove_from_cart"
  | "cart_viewed"
  | "checkout_started"
  | "payment_started"
  | "purchase_completed"
  | "purchase_failed"
  | "agent_action";

export type ActorType = "shopper" | "agent";

export type PlatformType =
  | "shopify"
  | "woocommerce"
  | "magento"
  | "bigcommerce"
  | "wix"
  | "custom_spa"
  | "unknown";

export type EventSource =
  | "auto_adapter"
  | "dom_heuristic"
  | "explicit_api"
  | "agent_telemetry"
  | "history_change";

export interface PageContext {
  url: string;
  pathname: string;
  referrer: string;
  title: string;
  page_type?:
    | "home"
    | "collection"
    | "product"
    | "cart"
    | "checkout"
    | "order_confirmed"
    | "search"
    | "other";
  search_query?: string;
}

export interface CanonicalProduct {
  product_id: string;
  variant_id?: string;
  title: string;
  price?: number;
  original_price?: number;
  currency?: string;
  category?: string;
  brand?: string;
  sku?: string;
  url?: string;
  image_url?: string;
  in_stock?: boolean;
}

export interface CanonicalCartItem {
  product_id: string;
  variant_id?: string;
  title: string;
  quantity: number;
  price?: number;
  currency?: string;
  sku?: string;
  image_url?: string;
}

export interface CanonicalCart {
  cart_id?: string;
  item_count: number;
  total_amount?: number;
  currency?: string;
  items: CanonicalCartItem[];
}

export interface CanonicalOrder {
  order_id: string;
  total_amount: number;
  currency: string;
  subtotal_amount?: number;
  tax_amount?: number;
  shipping_amount?: number;
  discount_amount?: number;
  item_count?: number;
  items?: CanonicalCartItem[];
}

export interface AgentTelemetry {
  provider?: string;
  session_id?: string;
  run_id?: string;
  task_id?: string;
  intent?: string;
  metadata?: Record<string, unknown>;
}

export interface CanonicalEvent<T = Record<string, unknown>> {
  event_id: string;
  site_id: string;
  merchant_id?: string;
  visitor_id: string;
  session_id: string;
  event_name: EventType;
  timestamp: string; // ISO 8601 UTC
  actor_type: ActorType;
  platform: PlatformType;
  source: EventSource;
  page: PageContext;
  product?: CanonicalProduct;
  cart?: CanonicalCart;
  order?: CanonicalOrder;
  agent?: AgentTelemetry;
  search?: {
    query: string;
    results_count?: number;
  };
  metadata?: T;
}
