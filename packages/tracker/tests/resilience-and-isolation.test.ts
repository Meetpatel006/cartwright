import { describe, expect, test } from "bun:test";
import { tryCatchAsync, tryCatchGuard } from "../src/core/error-boundary";
import { BoundedEventQueue } from "../src/core/queue";
import { createCanonicalEvent } from "../src/events/event-factory";
import { CartwrightTracker } from "../src/core/tracker";

describe("Resilience, Queue Bounds & Isolation", () => {
  test("33. tryCatchGuard safely intercepts throws and returns fallback", () => {
    const fallback = { safe: true };
    const result = tryCatchGuard(() => {
      throw new Error("Simulated DOM access failure");
    }, fallback);

    expect(result).toBe(fallback);
  });

  test("34. tryCatchAsync safely intercepts promise rejections", async () => {
    const fallback = "safe_fallback";
    const result = await tryCatchAsync(async () => {
      throw new Error("Simulated Network Async Failure");
    }, fallback);

    expect(result).toBe(fallback);
  });

  test("35. BoundedEventQueue respects maximum queue limits and drops overflow", () => {
    const queue = new BoundedEventQueue({ maxSize: 3, dedupWindowMs: 0 });

    for (let i = 1; i <= 5; i++) {
      const evt = createCanonicalEvent({
        site_id: "site_q",
        visitor_id: "vis_q",
        session_id: "ses_q",
        event_name: "page_viewed",
        page: { url: `https://store.com/page-${i}` },
      });
      queue.enqueue(evt);
    }

    expect(queue.size()).toBe(3);
    const drained = queue.drain();
    expect(drained.length).toBe(3);
    // Should have dropped page-1 and page-2, keeping 3, 4, 5
    expect(drained[0]?.page.url).toBe("https://store.com/page-3");
    expect(drained[2]?.page.url).toBe("https://store.com/page-5");
  });

  test("36. BoundedEventQueue prevents duplicate event spamming within dedup window", () => {
    const queue = new BoundedEventQueue({ maxSize: 10, dedupWindowMs: 5000 });

    const evt = createCanonicalEvent({
      site_id: "site_q",
      visitor_id: "vis_q",
      session_id: "ses_q",
      event_name: "product_viewed",
      product: { product_id: "PROD-DUPE-1", title: "Duplicate Product" },
    });

    const first = queue.enqueue(evt);
    const second = queue.enqueue(evt);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(queue.size()).toBe(1);
  });

  test("37. Tracker never throws when initializing in an empty/corrupted environment", async () => {
    const tracker = new CartwrightTracker();
    // Intentionally pass invalid options
    const res = await tracker.init({ siteId: "" });
    expect(res).toBe(false);

    // Call tracking methods on uninitialized tracker — must fail silently without errors
    expect(() => {
      tracker.track("page_viewed");
      tracker.identify("user_123");
      tracker.reset();
      tracker.trackSearch("test");
    }).not.toThrow();
  });
});
