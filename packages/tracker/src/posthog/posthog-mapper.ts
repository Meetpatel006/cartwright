/**
 * PostHog Event Mapper
 *
 * Normalizes canonical Cartwright events into structured PostHog event payloads
 * enriched with super properties and sanitized metadata.
 */

import type { CanonicalEvent } from "../events/canonical-types";

export interface PostHogEventPayload {
  eventName: string;
  properties: Record<string, unknown>;
}

export function mapCanonicalToPostHog(event: CanonicalEvent): PostHogEventPayload {
  // Use semantic event name in PostHog
  const eventName = `cartwright_${event.event_name}`;

  const properties: Record<string, unknown> = {
    $current_url: event.page.url,
    $pathname: event.page.pathname,
    $referrer: event.page.referrer,
    $title: event.page.title,

    // Cartwright standard properties
    site_id: event.site_id,
    ...(event.merchant_id ? { merchant_id: event.merchant_id } : {}),
    visitor_id: event.visitor_id,
    session_id: event.session_id,
    event_id: event.event_id,
    event_name: event.event_name,
    timestamp: event.timestamp,
    actor_type: event.actor_type,
    platform: event.platform,
    source: event.source,
    page_type: event.page.page_type,
    cartwright_sdk_version: "1.0.0",
  };

  if (event.product) {
    properties.product_id = event.product.product_id;
    properties.product_title = event.product.title;
    properties.product_price = event.product.price;
    properties.product_currency = event.product.currency;
    properties.product_brand = event.product.brand;
    properties.product_category = event.product.category;
    properties.product_sku = event.product.sku;
    properties.product_in_stock = event.product.in_stock;
  }

  if (event.cart) {
    properties.cart_id = event.cart.cart_id;
    properties.cart_item_count = event.cart.item_count;
    properties.cart_total_amount = event.cart.total_amount;
    properties.cart_currency = event.cart.currency;
    properties.cart_items = event.cart.items;
  }

  if (event.order) {
    properties.order_id = event.order.order_id;
    properties.order_total_amount = event.order.total_amount;
    properties.order_currency = event.order.currency;
    properties.order_item_count = event.order.item_count;
    properties.order_tax_amount = event.order.tax_amount;
    properties.order_shipping_amount = event.order.shipping_amount;
  }

  if (event.search) {
    properties.search_query = event.search.query;
    properties.search_results_count = event.search.results_count;
  }

  if (event.agent) {
    properties.agent_provider = event.agent.provider;
    properties.agent_session_id = event.agent.session_id;
    properties.agent_run_id = event.agent.run_id;
    properties.agent_task_id = event.agent.task_id;
    properties.agent_intent = event.agent.intent;
    if (event.agent.metadata) {
      properties.agent_metadata = event.agent.metadata;
    }
  }

  if (event.metadata) {
    properties.custom_metadata = event.metadata;
  }

  return {
    eventName,
    properties,
  };
}
