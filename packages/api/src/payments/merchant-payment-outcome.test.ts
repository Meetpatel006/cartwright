import { describe, expect, test } from "bun:test";

import { evaluateMerchantPaymentOutcome } from "./merchant-payment-outcome";

const CONFIRMED_PAGE = {
  url: "http://localhost:5173/order-confirmation",
  title: "Order Confirmed | Raven Scents",
  text: "Thank you for your order",
  orderId: "RVN52FLH8XO1",
  amount: null,
  statusText: "Order Confirmed",
};

describe("evaluateMerchantPaymentOutcome (Task 1: no false success)", () => {
  test("not_found is a failure — never PAYMENT_SUCCEEDED", () => {
    const decision = evaluateMerchantPaymentOutcome({
      status: "not_found",
      message: "Merchant checkout session was not found or has expired.",
    });
    expect(decision.outcome).toBe("failed");
  });

  test("expired drive is a failure", () => {
    expect(
      evaluateMerchantPaymentOutcome({
        status: "expired",
        message: "Merchant checkout session expired.",
      }).outcome,
    ).toBe("failed");
  });

  test("failed drive is a failure", () => {
    expect(
      evaluateMerchantPaymentOutcome({
        status: "failed",
        message: "payment control unavailable",
      }).outcome,
    ).toBe("failed");
  });

  test("submitted WITH an independent confirmed order page settles", () => {
    const decision = evaluateMerchantPaymentOutcome({
      status: "submitted",
      message: "Razorpay Test Mode card payment was submitted.",
      orderConfirmation: CONFIRMED_PAGE,
    });
    expect(decision.outcome).toBe("confirmed");
    expect(decision.reason).toContain("RVN52FLH8XO1");
  });

  test("submitted WITHOUT confirmation evidence stays pending (no fake success)", () => {
    // This is the exact case the old code recorded as PAYMENT_SUCCEEDED.
    const decision = evaluateMerchantPaymentOutcome({
      status: "submitted",
      message: "submitted; awaiting merchant server confirmation.",
      orderConfirmation: null,
    });
    expect(decision.outcome).toBe("pending");
  });

  test("a captured confirmation page reporting failure is a failure", () => {
    const decision = evaluateMerchantPaymentOutcome({
      status: "submitted",
      message: "submitted",
      orderConfirmation: {
        ...CONFIRMED_PAGE,
        statusText: "Payment Failed",
        text: "We could not process your payment",
        orderId: null,
      },
    });
    expect(decision.outcome).toBe("failed");
  });

  test("an unclear confirmation page stays pending (never settles on guesswork)", () => {
    const decision = evaluateMerchantPaymentOutcome({
      status: "submitted",
      message: "submitted",
      orderConfirmation: {
        ...CONFIRMED_PAGE,
        statusText: null,
        title: "Checkout | Raven Scents",
        text: "",
        orderId: null,
      },
    });
    expect(decision.outcome).toBe("pending");
  });

  test("merely 'opened' (gate clicked, nothing paid) is a failure", () => {
    expect(
      evaluateMerchantPaymentOutcome({ status: "opened", message: "gate opened" })
        .outcome,
    ).toBe("failed");
  });
});
