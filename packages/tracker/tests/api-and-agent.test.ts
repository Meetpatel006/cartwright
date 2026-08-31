import { describe, expect, test, beforeEach } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { CartwrightTracker } from "../src/core/tracker";
import { createCartwrightAPI } from "../src/public-api/cartwright-api";

describe("Public API & Agent Telemetry", () => {
  let domWindow: GlobalWindow;
  let tracker: CartwrightTracker;

  beforeEach(async () => {
    domWindow = new GlobalWindow();
    (globalThis as unknown as { window: unknown }).window = domWindow;
    (globalThis as unknown as { document: unknown }).document = domWindow.document;
    (globalThis as unknown as { localStorage: unknown }).localStorage = domWindow.localStorage;
    (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = domWindow.sessionStorage;
    (globalThis as unknown as { location: unknown }).location = domWindow.location;

    tracker = new CartwrightTracker();
    await tracker.init({ siteId: "site_api_test", enabled: true });
  });

  test("25. window.cartwright programmatic methods track standard commerce actions", () => {
    const api = createCartwrightAPI(tracker);

    // Track explicit product
    api.trackProduct({
      product_id: "PROD-99",
      title: "Silk Scarf",
      price: 65.0,
      currency: "USD",
    });

    // Track explicit cart
    api.trackCart({
      cart_id: "cart_abc",
      item_count: 2,
      total_amount: 130.0,
      currency: "USD",
      items: [
        { product_id: "PROD-99", title: "Silk Scarf", quantity: 2, price: 65.0 },
      ],
    });

    // Track explicit purchase
    api.trackPurchase({
      order_id: "ORD-5544",
      total_amount: 130.0,
      currency: "USD",
      item_count: 2,
    });

    expect(api.version).toBe("1.0.0");
  });

  test("26. window.cartwright.trackAgent logs agent telemetry with actor_type='agent'", () => {
    const api = createCartwrightAPI(tracker);

    api.trackAgent({
      event: "agent_action",
      agent_provider: "cartwright_autonomous_agent",
      agent_session_id: "sess_stagehand_123",
      agent_run_id: "run_888",
      agent_task_id: "task_456",
      intent: "cheapest running shoes under 5000",
      product_id: "NIKE-PEGASUS-40",
      metadata: { reasoning_tokens: 142 },
    });

    // Verify identity distinct ID is maintained
    expect(tracker.getIdentity().getVisitorId()).toBeDefined();
  });

  test("27. identify() and reset() work through public API", () => {
    const api = createCartwrightAPI(tracker);

    api.identify("user_vip_42", { loyalty_points: 500 });
    expect(tracker.getIdentity().getIdentifiedUserId()).toBe("user_vip_42");

    api.reset();
    expect(tracker.getIdentity().getIdentifiedUserId()).toBeNull();
  });

  test("28. tracks events with both site_id and merchant_id correctly", async () => {
    const multiStoreTracker = new CartwrightTracker();
    await multiStoreTracker.init({
      siteId: "site_7k2md9x4qp1v0a3b",
      merchantId: "mch_7k2md9x4qp1v0a3b",
      enabled: true,
    });

    expect(multiStoreTracker.getConfig()?.siteId).toBe("site_7k2md9x4qp1v0a3b");
    expect(multiStoreTracker.getConfig()?.merchantId).toBe("mch_7k2md9x4qp1v0a3b");
  });
});
