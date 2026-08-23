import type { AuditEventRow, NewAuditEventRow } from "@cartwright/db/schema";
import { insertAuditEvent } from "@cartwright/db/repositories/audit.repository";

export interface AuditEventInput {
  eventType: NewAuditEventRow["eventType"];
  transactionId?: string;
  userId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/** Web-safe view of an audit event (no DB row type, no secrets). */
export interface AuditEventView {
  id: string;
  transactionId: string | null;
  userId: string | null;
  eventType: NewAuditEventRow["eventType"];
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export function toAuditEventView(row: AuditEventRow): AuditEventView {
  return {
    id: row.id,
    transactionId: row.transactionId,
    userId: row.userId,
    eventType: row.eventType,
    reason: row.reason,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

/**
 * Single entry point for writing audit events. Callers must go through this so
 * audit rows stay append-only and consistent (no ad-hoc inserts elsewhere).
 */
export async function recordAuditEvent(
  input: AuditEventInput,
): Promise<AuditEventRow> {
  return insertAuditEvent({
    eventType: input.eventType,
    transactionId: input.transactionId ?? null,
    userId: input.userId ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
  });
}
