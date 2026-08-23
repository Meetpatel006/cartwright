import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "../index";
import {
  auditEvents,
  type AuditEventRow,
  type NewAuditEventRow,
} from "../schema";

export async function insertAuditEvent(
  row: NewAuditEventRow,
): Promise<AuditEventRow> {
  const [created] = await db.insert(auditEvents).values(row).returning();
  if (!created) throw new Error("Failed to insert audit event");
  return created;
}

/** Count audit events of a type for a user since `since`. Used for frequency limits. */
export async function countAuditEventsSince(
  userId: string,
  eventType: AuditEventRow["eventType"],
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.userId, userId),
        eq(auditEvents.eventType, eventType),
        gte(auditEvents.createdAt, since),
      ),
    );
  return rows.length;
}

/** List audit events, optionally filtered by user / transaction, newest first. */
export async function listAuditEvents(
  opts: { userId?: string; transactionId?: string; limit?: number } = {},
): Promise<AuditEventRow[]> {
  const conditions = [];
  if (opts.userId) conditions.push(eq(auditEvents.userId, opts.userId));
  if (opts.transactionId) conditions.push(eq(auditEvents.transactionId, opts.transactionId));
  return db
    .select()
    .from(auditEvents)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${auditEvents.createdAt} desc`)
    .limit(opts.limit ?? 200);
}
