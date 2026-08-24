import { describe, expect, test } from "bun:test";

import {
  assertTransition,
  canTransition,
  isTerminal,
  type TransactionStatus,
} from "./transaction.state";

describe("transaction state machine", () => {
  test("legal transitions do not throw", () => {
    expect(() => assertTransition("CREATED", "POLICY_CHECKING")).not.toThrow();
    expect(() => assertTransition("AWAITING_APPROVAL", "APPROVED")).not.toThrow();
    expect(() => assertTransition("APPROVED", "PAYMENT_PROCESSING")).not.toThrow();
    expect(() => assertTransition("PAYMENT_PROCESSING", "PAYMENT_SUCCEEDED")).not.toThrow();
  });

  test("illegal transitions throw and are reported as impossible", () => {
    expect(canTransition("CREATED", "APPROVED")).toBe(false);
    expect(canTransition("POLICY_BLOCKED", "APPROVED")).toBe(false);
    expect(canTransition("PAYMENT_SUCCEEDED", "CANCELLED")).toBe(false);
    expect(canTransition("AWAITING_APPROVAL", "POLICY_BLOCKED")).toBe(false);
    expect(() => assertTransition("CREATED", "APPROVED")).toThrow();
  });

  test("terminal states have no outgoing transitions", () => {
    const terminals: TransactionStatus[] = [
      "POLICY_BLOCKED",
      "PAYMENT_SUCCEEDED",
      "PAYMENT_FAILED",
      "PRICE_CHANGED",
      "CANCELLED",
    ];
    for (const s of terminals) {
      expect(isTerminal(s)).toBe(true);
      // No legal move out of a terminal state.
      const all: TransactionStatus[] = [
        "CREATED",
        "POLICY_CHECKING",
        "POLICY_BLOCKED",
        "AWAITING_APPROVAL",
        "APPROVED",
        "PAYMENT_PROCESSING",
        "PAYMENT_SUCCEEDED",
        "PAYMENT_FAILED",
        "PRICE_CHANGED",
        "CANCELLED",
      ];
      for (const to of all) {
        expect(canTransition(s, to)).toBe(false);
      }
    }
  });

  test("AWAITING_APPROVAL may resolve to approved, cancelled, or price-changed", () => {
    expect(canTransition("AWAITING_APPROVAL", "APPROVED")).toBe(true);
    expect(canTransition("AWAITING_APPROVAL", "CANCELLED")).toBe(true);
    expect(canTransition("AWAITING_APPROVAL", "PRICE_CHANGED")).toBe(true);
  });

  test("a blocked transaction can never be approved or paid", () => {
    expect(canTransition("POLICY_BLOCKED", "APPROVED")).toBe(false);
    expect(canTransition("POLICY_BLOCKED", "AWAITING_APPROVAL")).toBe(false);
    expect(canTransition("POLICY_BLOCKED", "PAYMENT_PROCESSING")).toBe(false);
  });
});
