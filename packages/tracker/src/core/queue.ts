/**
 * Bounded In-Memory Event Queue & Deterministic Deduplication
 */

import type { CanonicalEvent } from "../events/canonical-types";

export interface QueueOptions {
  maxSize?: number;
  dedupWindowMs?: number;
}

export class BoundedEventQueue {
  private queue: CanonicalEvent[] = [];
  private recentFingerprints: Map<string, number> = new Map();
  private maxSize: number;
  private dedupWindowMs: number;

  constructor(options: QueueOptions = {}) {
    this.maxSize = options.maxSize || 100;
    this.dedupWindowMs = options.dedupWindowMs ?? 3000;
  }

  public createFingerprint(event: CanonicalEvent): string {
    const u = event.page?.url || event.page?.pathname || "";
    const prodId = event.product?.product_id || "";
    const cartCount = event.cart?.item_count ?? "";
    const orderId = event.order?.order_id || "";
    const searchQuery = event.search?.query || "";

    switch (event.event_name) {
      case "page_viewed":
        return `page_viewed:${u}`;
      case "product_viewed":
        return `product_viewed:${u}:${prodId}`;
      case "add_to_cart":
        return `add_to_cart:${prodId}:${cartCount}`;
      case "checkout_started":
        return `checkout_started:${u}`;
      case "purchase_completed":
        return `purchase_completed:${orderId || u}`;
      case "search_performed":
        return `search_performed:${searchQuery}`;
      default:
        return `${event.event_name}:${u}:${prodId}:${cartCount}:${orderId}`;
    }
  }

  public enqueue(event: CanonicalEvent): boolean {
    const now = Date.now();
    const fp = this.createFingerprint(event);

    // If dedupWindowMs is > 0, check duplicate
    if (this.dedupWindowMs > 0) {
      // Clean up expired fingerprints
      for (const [key, time] of this.recentFingerprints.entries()) {
        if (now - time > this.dedupWindowMs) {
          this.recentFingerprints.delete(key);
        }
      }

      if (this.recentFingerprints.has(fp)) {
        return false;
      }

      this.recentFingerprints.set(fp, now);
    }

    if (this.queue.length >= this.maxSize) {
      // Drop oldest event to maintain bounded memory
      this.queue.shift();
    }

    this.queue.push(event);
    return true;
  }

  public drain(): CanonicalEvent[] {
    const items = [...this.queue];
    this.queue = [];
    return items;
  }

  public size(): number {
    return this.queue.length;
  }

  public clear(): void {
    this.queue = [];
    this.recentFingerprints.clear();
  }
}
