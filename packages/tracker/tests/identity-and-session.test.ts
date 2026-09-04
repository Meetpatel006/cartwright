import { describe, expect, test, beforeEach } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { IdentityManager } from "../src/identity/identity";
import { SessionManager } from "../src/session/session";
import { SpaNavigator } from "../src/session/spa-navigator";

describe("Identity & Session Management", () => {
  let domWindow: GlobalWindow;

  beforeEach(() => {
    domWindow = new GlobalWindow({ url: "https://example-store.com/" });
    (globalThis as unknown as { window: unknown }).window = domWindow;
    (globalThis as unknown as { document: unknown }).document = domWindow.document;
    (globalThis as unknown as { localStorage: unknown }).localStorage = domWindow.localStorage;
    (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = domWindow.sessionStorage;
    (globalThis as unknown as { history: unknown }).history = domWindow.history;
    (globalThis as unknown as { location: unknown }).location = domWindow.location;
  });

  test("6. generates persistent anonymous visitor ID", () => {
    const identity1 = new IdentityManager();
    const v1 = identity1.getVisitorId();
    expect(v1.startsWith("vis_")).toBe(true);

    // Second instance should read the same visitor ID from localStorage
    const identity2 = new IdentityManager();
    expect(identity2.getVisitorId()).toBe(v1);
  });

  test("7. supports identify() and reset()", () => {
    const identity = new IdentityManager();
    const initialAnonId = identity.getVisitorId();

    identity.identify("usr_cust_999", { plan: "pro", tier: "gold" });
    expect(identity.getIdentifiedUserId()).toBe("usr_cust_999");
    expect(identity.getDistinctId()).toBe("usr_cust_999");
    expect(identity.getUserTraits()).toEqual({ plan: "pro", tier: "gold" });

    // Reset clears user ID and assigns a new visitor ID
    identity.reset();
    expect(identity.getIdentifiedUserId()).toBeNull();
    expect(identity.getVisitorId().startsWith("vis_")).toBe(true);
    expect(identity.getVisitorId()).not.toBe(initialAnonId);
  });

  test("8. tracks session lifecycle, IDs, and touch updates", () => {
    const session = new SessionManager();
    const sId = session.getSessionId();
    expect(sId.startsWith("ses_")).toBe(true);

    session.recordPageNavigation();
    const data = session.getSessionData();
    expect(data.pageCount).toBe(1);

    session.touch();
    expect(session.getSessionId()).toBe(sId);
  });

  test("9. handles SPA navigation and history changes seamlessly", () => {
    const spa = new SpaNavigator(domWindow as unknown as Window);
    let navigatedUrl = "";
    let navigatedRef = "";

    spa.onNavigate((url, referrer) => {
      navigatedUrl = url;
      navigatedRef = referrer;
    });

    // Simulate navigation
    domWindow.location.href = "https://example-store.com/products/shoe";
    spa.handleUrlChange();

    expect(navigatedUrl).toContain("/products/shoe");
    expect(navigatedRef).toBe("https://example-store.com/");
    spa.unhook();
  });
});
