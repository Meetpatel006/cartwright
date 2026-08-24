import { describe, expect, test } from "bun:test";

import {
  assertExpireShoppingSession,
  assertShoppingSessionTransition,
  canExpireShoppingSession,
  canTransitionShoppingSession,
  isTerminalShoppingSession,
  SHOPPING_SESSION_TRANSITIONS,
  ShoppingSessionStateError,
  type ShoppingSessionStatus,
} from "./shopping-session.state";

describe("shopping session state machine", () => {
  const validTransitions: Array<[string, string]> = [
    ["created", "recommended"],
    ["recommended", "selected"],
    ["selected", "converted"],
    ["created", "expired"],
    ["recommended", "expired"],
    ["selected", "expired"],
    ["converted", "expired"],
  ];

  test.each(validTransitions)(
    "allows valid transition %s -> %s",
    (from: ShoppingSessionStatus, to: ShoppingSessionStatus) => {
      expect(() =>
        assertShoppingSessionTransition(from, to),
      ).not.toThrow();
      expect(canTransitionShoppingSession(from, to)).toBe(true);
    },
  );

  test("re-asserting the same status is a safe no-op", () => {
    expect(() =>
      assertShoppingSessionTransition("recommended", "recommended"),
    ).not.toThrow();
  });

  const invalidTransitions: Array<[string, string]> = [
    ["created", "selected"],
    ["created", "converted"],
    ["recommended", "converted"],
    ["recommended", "created"],
    ["selected", "recommended"],
    ["selected", "created"],
    ["converted", "selected"],
    ["converted", "recommended"],
    ["converted", "created"],
    ["expired", "created"],
    ["expired", "recommended"],
    ["expired", "selected"],
    ["expired", "converted"],
  ];

  test.each(invalidTransitions)(
    "rejects invalid transition %s -> %s",
    (from: ShoppingSessionStatus, to: ShoppingSessionStatus) => {
      expect(() => assertShoppingSessionTransition(from, to)).toThrow(
        ShoppingSessionStateError,
      );
      expect(canTransitionShoppingSession(from, to)).toBe(false);
    },
  );

  test("terminal states have no outgoing transitions", () => {
    expect(isTerminalShoppingSession("expired")).toBe(true);
    expect(SHOPPING_SESSION_TRANSITIONS.expired).toEqual([]);
  });

  test("converted is not terminal (may still be expired)", () => {
    expect(isTerminalShoppingSession("converted")).toBe(false);
    expect(canTransitionShoppingSession("converted", "expired")).toBe(true);
  });

  test("expiry is allowed from any non-terminal state", () => {
    expect(canExpireShoppingSession("created")).toBe(true);
    expect(canExpireShoppingSession("recommended")).toBe(true);
    expect(canExpireShoppingSession("selected")).toBe(true);
    expect(canExpireShoppingSession("converted")).toBe(true);
    expect(canExpireShoppingSession("expired")).toBe(false);
    expect(() => assertExpireShoppingSession("expired")).toThrow(
      ShoppingSessionStateError,
    );
    expect(() => assertExpireShoppingSession("selected")).not.toThrow();
  });
});
