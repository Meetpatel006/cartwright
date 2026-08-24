import { randomUUID } from "node:crypto";
import type { AuditEventRow, NewAuditEventRow } from "@cartwright/db/schema";
import { insertAuditEvent } from "@cartwright/db/repositories/audit.repository";

export interface AuditEventInput {
  eventType: NewAuditEventRow["eventType"];
  transactionId?: string;
  userId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  /** Correlation id linking related operations across the same request/user flow. */
  correlationId?: string;
  /** Shopping session id when the event relates to Part B. */
  shoppingSessionId?: string | null;
  /** Entity state before the operation. */
  previousState?: string;
  /** Entity state after the operation. */
  resultingState?: string;
  /** Structured outcome classification. */
  outcome?: NewAuditEventRow["outcome"];
  /** Failure taxonomy code when the event represents a failure. */
  failureClassification?: string;
}

/** Web-safe view of an audit event (no DB row type, no secrets). */
export interface AuditEventView {
  id: string;
  transactionId: string | null;
  userId: string | null;
  eventType: NewAuditEventRow["eventType"];
  correlationId: string | null;
  shoppingSessionId: string | null;
  previousState: string | null;
  resultingState: string | null;
  outcome: string | null;
  failureClassification: string | null;
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
    correlationId: row.correlationId,
    shoppingSessionId: row.shoppingSessionId,
    previousState: row.previousState,
    resultingState: row.resultingState,
    outcome: row.outcome,
    failureClassification: row.failureClassification,
    reason: row.reason,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

/** Generate a correlation id for linking related operations in a single flow. */
export function generateCorrelationId(): string {
  return randomUUID();
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
    correlationId: input.correlationId ?? null,
    shoppingSessionId: input.shoppingSessionId ?? null,
    previousState: input.previousState ?? null,
    resultingState: input.resultingState ?? null,
    outcome: input.outcome ?? null,
    failureClassification: input.failureClassification ?? null,
  });
}
