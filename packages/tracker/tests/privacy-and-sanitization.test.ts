import { describe, expect, test, beforeEach } from "bun:test";
import { GlobalWindow } from "happy-dom";
import {
  isSensitiveKey,
  isSensitiveValue,
  sanitizeObject,
  sanitizeUrl,
  MAX_STRING_LENGTH,
  MAX_ARRAY_LENGTH,
  MAX_OBJECT_KEYS,
} from "../src/privacy/sanitizer";
import { ConsentManager } from "../src/privacy/consent";

describe("Privacy & Sanitization", () => {
  let domWindow: GlobalWindow;

  beforeEach(() => {
    domWindow = new GlobalWindow();
    (globalThis as unknown as { window: unknown }).window = domWindow;
    (globalThis as unknown as { navigator: unknown }).navigator = domWindow.navigator;
    (globalThis as unknown as { localStorage: unknown }).localStorage = domWindow.localStorage;
  });

  test("28. detects sensitive keys and credit card values", () => {
    expect(isSensitiveKey("password")).toBe(true);
    expect(isSensitiveKey("user_password")).toBe(true);
    expect(isSensitiveKey("card_number")).toBe(true);
    expect(isSensitiveKey("cvv")).toBe(true);
    expect(isSensitiveKey("api_key")).toBe(true);
    expect(isSensitiveKey("auth_token")).toBe(true);
    expect(isSensitiveKey("otp")).toBe(true);
    expect(isSensitiveKey("title")).toBe(false);

    expect(isSensitiveValue("4111 2222 3333 4444")).toBe(true);
    expect(isSensitiveValue("4111222233334444")).toBe(true);
    expect(isSensitiveValue("Classic Leather Shoes")).toBe(false);
  });

  test("29. sanitizes URLs with sensitive parameters", () => {
    const raw = "https://store.com/checkout?step=2&token=secret123&password=pass&utm_source=google";
    const cleaned = sanitizeUrl(raw);
    expect(cleaned).not.toContain("token=secret123");
    expect(cleaned).not.toContain("password=pass");
    expect(cleaned).toContain("step=2");
    expect(cleaned).toContain("utm_source=google");
  });

  test("30. recursively sanitizes event object payloads", () => {
    const dirty = {
      product: {
        id: "123",
        title: "T-Shirt",
      },
      form: {
        user_password: "mysecretpassword",
        credit_card: "4111 2222 3333 4444",
        cvv: "123",
        email: "shopper@example.com",
      },
    };

    const sanitized = sanitizeObject(dirty);
    expect(sanitized.product.title).toBe("T-Shirt");
    expect(sanitized.form.user_password).toBe("[REDACTED]");
    expect(sanitized.form.credit_card).toBe("[REDACTED]");
    expect(sanitized.form.cvv).toBe("[REDACTED]");
  });

  test("31. respects Do Not Track (DNT) and GPC", () => {
    const consent = new ConsentManager(true);
    expect(consent.isAllowed()).toBe(true);

    // Mock DNT = "1" via Object.defineProperty
    Object.defineProperty(domWindow.navigator, "doNotTrack", {
      value: "1",
      configurable: true,
    });
    expect(consent.isDntEnabled()).toBe(true);
    expect(consent.isAllowed()).toBe(false);
  });

  test("32. respects explicit user consent settings", () => {
    const consent = new ConsentManager(false);
    expect(consent.isAllowed()).toBe(true);

    consent.setConsent(false);
    expect(consent.getConsent()).toBe("denied");
    expect(consent.isAllowed()).toBe(false);

    consent.setConsent(true);
    expect(consent.getConsent()).toBe("granted");
    expect(consent.isAllowed()).toBe(true);
  });

  test("33. enforces payload bounds on oversized strings, arrays, and objects", () => {
    const giantString = "a".repeat(2000);
    const giantArray = Array.from({ length: 100 }, (_, i) => `item_${i}`);
    const giantObject: Record<string, string> = {};
    for (let i = 0; i < 100; i++) {
      giantObject[`key_${i}`] = `value_${i}`;
    }

    const payload = {
      longStr: giantString,
      bigArr: giantArray,
      bigObj: giantObject,
      nested: {
        l1: {
          l2: {
            l3: {
              l4: {
                l5: "too_deep",
              },
            },
          },
        },
      },
    };

    const sanitized = sanitizeObject(payload);
    expect(sanitized.longStr.length).toBe(MAX_STRING_LENGTH);
    expect(sanitized.bigArr.length).toBe(MAX_ARRAY_LENGTH);
    expect(Object.keys(sanitized.bigObj).length).toBe(MAX_OBJECT_KEYS);
    expect(typeof sanitized.nested.l1.l2.l3).toBe("object");
  });
});
