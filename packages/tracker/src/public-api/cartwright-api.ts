/**
 * Public Cartwright Global API
 *
 * Exposes window.cartwright for programmatic merchant and agent tracking.
 */

import type { CartwrightTracker } from "../core/tracker";
import type {
  CanonicalCart,
  CanonicalOrder,
  CanonicalProduct,
  EventType,
} from "../events/canonical-types";

export interface CartwrightGlobalAPI {
  version: string;
  tracker: CartwrightTracker;
  track(event: EventType, properties?: Record<string, unknown>): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
  reset(): void;
  trackProduct(product: CanonicalProduct, event?: EventType): void;
  trackCart(cart: CanonicalCart, event?: EventType): void;
  trackPurchase(order: CanonicalOrder): void;
  trackSearch(query: string, resultsCount?: number): void;
  trackAgent(params: {
    event?: EventType;
    agent_provider?: string;
    agent_session_id?: string;
    agent_run_id?: string;
    agent_task_id?: string;
    intent?: string;
    product_id?: string;
    metadata?: Record<string, unknown>;
  }): void;
  consent(granted: boolean): void;
}

export function createCartwrightAPI(tracker: CartwrightTracker): CartwrightGlobalAPI {
  return {
    version: "1.0.0",
    tracker,
    track: (event, properties) => tracker.track(event, { metadata: properties }),
    identify: (userId, traits) => tracker.identify(userId, traits),
    reset: () => tracker.reset(),
    trackProduct: (product, event) => tracker.trackProduct(product, event),
    trackCart: (cart, event) => tracker.trackCart(cart, event),
    trackPurchase: (order) => tracker.trackPurchase(order),
    trackSearch: (query, count) => tracker.trackSearch(query, count),
    trackAgent: (params) => tracker.trackAgent(params),
    consent: (granted) => tracker.consent(granted),
  };
}
