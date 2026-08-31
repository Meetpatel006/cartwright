import { describe, expect, test, beforeEach } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { extractScriptConfig, resolveSiteConfig } from "../src/config/config";
import { CartwrightTracker } from "../src/core/tracker";
import { PostHogTransport } from "../src/posthog/posthog-client";

describe("Script Bootstrap & Configuration", () => {
  let domWindow: GlobalWindow;

  beforeEach(() => {
    domWindow = new GlobalWindow();
    (globalThis as unknown as { window: unknown }).window = domWindow;
    (globalThis as unknown as { document: unknown }).document = domWindow.document;
  });

  test("1. extracts data-site and attributes from script tag", () => {
    const script = domWindow.document.createElement("script");
    script.src = "https://cdn.cartwright.com/tracker/v1.js";
    script.setAttribute("data-site", "site_7k2md9x4qp1v0a3b");
    script.setAttribute("data-merchant", "mch_7k2md9x4qp1v0a3b");
    script.setAttribute("data-debug", "true");
    script.setAttribute("data-posthog-key", "phc_custom_test");
    domWindow.document.head.appendChild(script);

    const cfg = extractScriptConfig(domWindow.document as unknown as Document);
    expect(cfg.siteId).toBe("site_7k2md9x4qp1v0a3b");
    expect(cfg.merchantId).toBe("mch_7k2md9x4qp1v0a3b");
    expect(cfg.debug).toBe(true);
    expect(cfg.posthogApiKey).toBe("phc_custom_test");
  });

  test("2. handles missing data-site safely by disabling tracker", async () => {
    // No script tag with data-site
    const cfg = await resolveSiteConfig({}, false);
    expect(cfg.siteId).toBe("");
    expect(cfg.enabled).toBe(false);

    const tracker = new CartwrightTracker();
    const initialized = await tracker.init({});
    expect(initialized).toBe(false);
  });

  test("3. handles invalid or empty data-site gracefully", async () => {
    const tracker = new CartwrightTracker();
    const initialized = await tracker.init({ siteId: "" });
    expect(initialized).toBe(false);
  });

  test("4. falls back to client defaults when remote config fails", async () => {
    const cfg = await resolveSiteConfig(
      { siteId: "site_offline_99", apiEndpoint: "http://invalid-unreachable-domain.test/config" },
      true,
    );
    expect(cfg.siteId).toBe("site_offline_99");
    expect(cfg.enabled).toBe(true);
    expect(cfg.posthogHost).toBe("https://us.i.posthog.com");
  });

  test("5. initializes PostHog transport without throwing", () => {
    const transport = new PostHogTransport({
      apiKey: "phc_mock_key",
      apiHost: "https://us.i.posthog.com",
      debug: false,
    });
    const ok = transport.init();
    expect(ok).toBe(true);
  });
});
