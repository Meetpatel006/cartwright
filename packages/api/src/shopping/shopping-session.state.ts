/**
 * Centralized state machine for Part B shopping sessions.
 *
 * Every status transition for a shopping session is validated here and nowhere
 * else — the repository is a thin writer and the service consults this module
 * before persisting any status change. The status enum itself is owned by the
 * `shopping_session_status` pgEnum in `@cartwright/db`; this module is the
 * single source of truth for *which* transitions are legal.
 *
 * Lifecycle (forward):
 *   created      → session shell created, work not started
 *   processing   → LLM/browser discovery is running
 *   recommended  → candidates ranked + recommendations persisted
 *   selected     → user explicitly chose a product (PurchasePlan stored)
 *   converted    → the selected plan was handed to Part A's transaction gate
 *
 * `expired` is a terminal state reachable from any non-terminal state via the
 * expiry/cleanup path. It is intentionally NOT a normal forward step — once a
 * session expires it can never be selected or converted.
 */

import type { ShoppingSessionRow } from "@cartwright/db/schema";

export type ShoppingSessionStatus = ShoppingSessionRow["status"];

/** Allowed forward/expiry transitions. The empty array marks a terminal state. */
export const SHOPPING_SESSION_TRANSITIONS: Record<
  ShoppingSessionStatus,
  ShoppingSessionStatus[]
> = {
  // Keep the direct transition for callers that run without a pre-created
  // shell; the normal UI path uses created -> processing first.
  created: ["processing", "recommended", "expired"],
  processing: ["recommended", "expired"],
  recommended: ["selected", "expired"],
  selected: ["converted", "expired"],
  converted: ["expired"],
  expired: [],
};

export class ShoppingSessionStateError extends Error {
  readonly code = "SHOPPING_SESSION_INVALID_TRANSITION";
  constructor(
    public readonly from: ShoppingSessionStatus,
    public readonly to: ShoppingSessionStatus,
    message?: string,
  ) {
    super(
      message ??
        `Invalid shopping session transition: ${from} -> ${to}`,
    );
    this.name = "ShoppingSessionStateError";
  }
}

/** A terminal state has no outgoing transitions. */
export function isTerminalShoppingSession(
  status: ShoppingSessionStatus,
): boolean {
  return SHOPPING_SESSION_TRANSITIONS[status].length === 0;
}

export function canTransitionShoppingSession(
  from: ShoppingSessionStatus,
  to: ShoppingSessionStatus,
): boolean {
  return SHOPPING_SESSION_TRANSITIONS[from].includes(to);
}

/**
 * Re-asserting the current status is a safe no-op. Any other transition is
 * rejected unless it is present in {@link SHOPPING_SESSION_TRANSITIONS}.
 */
export function assertShoppingSessionTransition(
  from: ShoppingSessionStatus,
  to: ShoppingSessionStatus,
): void {
  if (from === to) return;
  if (!canTransitionShoppingSession(from, to)) {
    throw new ShoppingSessionStateError(from, to);
  }
}

/** Expiry is permitted from any non-terminal state. */
export function canExpireShoppingSession(
  status: ShoppingSessionStatus,
): boolean {
  return !isTerminalShoppingSession(status);
}

export function assertExpireShoppingSession(
  status: ShoppingSessionStatus,
): void {
  if (!canExpireShoppingSession(status)) {
    throw new ShoppingSessionStateError(status, "expired");
  }
}
