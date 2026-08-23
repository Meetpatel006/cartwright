import { and, eq, sql } from "drizzle-orm";

import { env } from "@cartwright/env/server";

import { db } from "../index";
import {
  type NewPaymentPolicyRow,
  paymentPolicies,
  type PaymentPolicyRow,
} from "../schema";

export interface EffectivePolicy {
  userId: string;
  maxTransactionAmount: number;
  maxTotalSpending: number;
  currency: string;
  requireUserApproval: boolean;
  allowedMerchants: string[];
  blockedMerchants: string[];
  frequencyLimit: number | null;
}

/** Global defaults used when a user has no explicit policy row yet. */
function defaultPolicyRow(userId: string): NewPaymentPolicyRow {
  return {
    userId,
    maxTransactionAmount: env.WALLET_BALANCE_PAISE,
    maxTotalSpending: env.WALLET_BALANCE_PAISE,
    currency: env.WALLET_CURRENCY,
    requireUserApproval: false,
    allowedMerchants: [],
    blockedMerchants: [],
    frequencyLimit: null,
    consumedInMinor: 0,
  };
}

export async function getPolicyRow(
  userId: string,
): Promise<PaymentPolicyRow | undefined> {
  const rows = await db
    .select()
    .from(paymentPolicies)
    .where(eq(paymentPolicies.userId, userId))
    .limit(1);
  return rows[0];
}

/**
 * Ensure a policy row exists for the user (synthesized from env defaults) and
 * return it. Idempotent — inserts only once.
 */
export async function ensurePolicy(userId: string): Promise<PaymentPolicyRow> {
  const existing = await getPolicyRow(userId);
  if (existing) return existing;
  const [created] = await db
    .insert(paymentPolicies)
    .values(defaultPolicyRow(userId))
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const after = await getPolicyRow(userId);
  if (!after) throw new Error("Failed to ensure payment policy row");
  return after;
}

export async function getEffectivePolicy(
  userId: string,
): Promise<EffectivePolicy> {
  const row = await ensurePolicy(userId);
  return {
    userId: row.userId,
    maxTransactionAmount: row.maxTransactionAmount,
    maxTotalSpending: row.maxTotalSpending,
    currency: row.currency,
    requireUserApproval: row.requireUserApproval,
    allowedMerchants: row.allowedMerchants ?? [],
    blockedMerchants: row.blockedMerchants ?? [],
    frequencyLimit: row.frequencyLimit,
  };
}

export interface PolicyUpdateInput {
  maxTransactionAmount: number;
  maxTotalSpending: number;
  currency: string;
  requireUserApproval?: boolean;
  allowedMerchants?: string[];
  blockedMerchants?: string[];
  frequencyLimit?: number | null;
}

/**
 * Create-or-update the user's payment policy. Synthesizes a row first if none
 * exists, then applies the supplied fields. Rejects lowering `maxTotalSpending`
 * below what is already consumed (reserved + settled) so the budget can never
 * be shrunk beneath live commitments.
 */
export async function upsertPolicy(
  userId: string,
  input: PolicyUpdateInput,
): Promise<PaymentPolicyRow> {
  const existing = await ensurePolicy(userId);
  if (input.maxTotalSpending < existing.consumedInMinor) {
    throw new Error(
      `maxTotalSpending (${input.maxTotalSpending}) cannot be below the currently consumed spending (${existing.consumedInMinor}).`,
    );
  }
  const [updated] = await db
    .update(paymentPolicies)
    .set({
      maxTransactionAmount: input.maxTransactionAmount,
      maxTotalSpending: input.maxTotalSpending,
      currency: input.currency,
      requireUserApproval: input.requireUserApproval ?? existing.requireUserApproval,
      allowedMerchants: input.allowedMerchants ?? existing.allowedMerchants,
      blockedMerchants: input.blockedMerchants ?? existing.blockedMerchants,
      frequencyLimit:
        input.frequencyLimit !== undefined ? input.frequencyLimit : existing.frequencyLimit,
      updatedAt: new Date(),
    })
    .where(eq(paymentPolicies.userId, userId))
    .returning();
  if (!updated) throw new Error("Failed to update payment policy");
  return updated;
}

/**
 * Atomically reserve `amount` of the user's spending budget. The UPDATE takes a
 * row lock on the policy row and serializes concurrent callers, so the budget
 * cannot be overspent even under concurrency. Returns the updated row, or
 * `undefined` when the reservation would exceed `maxTotalSpending`.
 */
export async function incrementConsumed(
  userId: string,
  amount: number,
): Promise<PaymentPolicyRow | undefined> {
  const [updated] = await db
    .update(paymentPolicies)
    .set({
      consumedInMinor: sql`${paymentPolicies.consumedInMinor} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentPolicies.userId, userId),
        sql`${paymentPolicies.consumedInMinor} + ${amount} <= ${paymentPolicies.maxTotalSpending}`,
      ),
    )
    .returning();
  return updated;
}

/** Release a previously reserved amount back to the available budget. */
export async function decrementConsumed(
  userId: string,
  amount: number,
): Promise<void> {
  await db
    .update(paymentPolicies)
    .set({
      consumedInMinor: sql`GREATEST(0, ${paymentPolicies.consumedInMinor} - ${amount})`,
      updatedAt: new Date(),
    })
    .where(eq(paymentPolicies.userId, userId));
}
