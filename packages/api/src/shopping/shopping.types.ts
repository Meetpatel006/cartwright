export type { PurchasePlan, Recommendation, ShoppingIntent } from "@cartwright/agent";
import type { PurchasePlan, Recommendation, ShoppingIntent } from "@cartwright/agent";

import type { TransactionResult } from "../transactions/transaction.types";

export type ShoppingSessionStatus =
  | "created"
  | "processing"
  | "recommended"
  | "selected"
  | "converted"
  | "expired";

export interface RunShoppingInput {
  userId: string;
  query: string;
  /** Store preset key or URL, e.g. "raven". */
  store?: string;
  /** Client idempotency key; reused to dedupe repeated shopping requests. */
  idempotencyKey?: string;
}

export interface ShoppingSessionView {
  sessionId: string;
  status: ShoppingSessionStatus;
  rawQuery: string;
  intent: ShoppingIntent;
  recommendations: Recommendation[];
  createdAt: string;
  /** Browser backend that executed this run ("local" Chrome or "browserbase"
   *  cloud). Absent on idempotent replays of an earlier session. */
  browserMode?: "local" | "browserbase";
}

export interface SelectProductInput {
  userId: string;
  sessionId: string;
  productId: string;
  idempotencyKey?: string;
  /** Use Cartwright's provider-independent Test Mode gateway for this session. */
  paymentMode?: "merchant" | "cartwright";
}

export interface SelectProductOutput {
  /** Part B's structured selection (NOT a payment instruction). */
  plan: PurchasePlan;
  /** Part A's authoritative, policy-gated transaction result. */
  purchase: TransactionResult;
}
