import { eq } from "drizzle-orm";

import { db } from "../index";
import {
  type NewSpendingReservationRow,
  spendingReservations,
  type SpendingReservationRow,
} from "../schema";
import { decrementConsumed } from "./payment-policy.repository";

export async function insertReservation(
  row: NewSpendingReservationRow,
): Promise<SpendingReservationRow> {
  const [created] = await db.insert(spendingReservations).values(row).returning();
  if (!created) throw new Error("Failed to insert spending reservation");
  return created;
}

export async function getReservationByTransactionId(
  transactionId: string,
): Promise<SpendingReservationRow | undefined> {
  const rows = await db
    .select()
    .from(spendingReservations)
    .where(eq(spendingReservations.transactionId, transactionId))
    .limit(1);
  return rows[0];
}

export async function setReservationStatus(
  id: string,
  status: SpendingReservationRow["status"],
): Promise<void> {
  await db
    .update(spendingReservations)
    .set({ status, updatedAt: new Date() })
    .where(eq(spendingReservations.id, id));
}

/**
 * Mark a reservation RELEASED and return its amount to the available budget.
 * Safe to call when no reservation exists (idempotent cleanup).
 */
export async function releaseReservation(transactionId: string): Promise<void> {
  const reservation = await getReservationByTransactionId(transactionId);
  if (!reservation || reservation.status === "RELEASED") return;
  await setReservationStatus(reservation.id, "RELEASED");
  await decrementConsumed(reservation.userId, reservation.amountInMinor);
}

/** Mark a reservation SETTLED (consumption already counted, no change). */
export async function settleReservation(transactionId: string): Promise<void> {
  const reservation = await getReservationByTransactionId(transactionId);
  if (!reservation || reservation.status === "SETTLED") return;
  await setReservationStatus(reservation.id, "SETTLED");
}
