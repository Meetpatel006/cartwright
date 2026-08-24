"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@cartwright/ui/components/card";
import { trpc } from "@/utils/trpc";

function formatCurrency(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toLocaleString()}`;
  }
}

const STATUS_TONE: Record<string, string> = {
  CREATED: "bg-gray-500/10 text-gray-600",
  POLICY_CHECKING: "bg-blue-500/10 text-blue-600",
  POLICY_BLOCKED: "bg-red-500/10 text-red-600",
  AWAITING_APPROVAL: "bg-amber-500/10 text-amber-600",
  APPROVED: "bg-green-500/10 text-green-600",
  PAYMENT_PROCESSING: "bg-indigo-500/10 text-indigo-600",
  PAYMENT_SUCCEEDED: "bg-green-500/10 text-green-600",
  PAYMENT_FAILED: "bg-red-500/10 text-red-600",
  PRICE_CHANGED: "bg-red-500/10 text-red-600",
  CANCELLED: "bg-gray-500/10 text-gray-600",
};

export default function TransactionsList() {
  const list = useQuery(trpc.transactions.list.queryOptions());
  const [selected, setSelected] = useState<string | null>(null);

  const audit = useQuery(
    trpc.transactions.audit.queryOptions(
      { transactionId: selected! },
      { enabled: selected !== null },
    ),
  );

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Transactions</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Every purchase request and its server-validated lifecycle. Click a row to
        see its audit trail.
      </p>

      {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {list.error && <p className="text-sm text-red-500">Could not load transactions.</p>}

      {list.data && list.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No transactions yet.</p>
      )}

      <div className="grid gap-2">
        {list.data?.map((tx) => (
          <button
            key={tx.transactionId}
            type="button"
            onClick={() => setSelected(tx.transactionId === selected ? null : tx.transactionId)}
            className="rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {tx.merchantName ?? tx.merchantId ?? "Purchase"}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  STATUS_TONE[tx.status] ?? "bg-gray-500/10 text-gray-600"
                }`}
              >
                {tx.status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatCurrency(tx.amountInMinor, tx.currency)}</span>
              <span>{new Date(tx.createdAt).toLocaleString()}</span>

            </div>
            {tx.failureReason && (
              <p className="mt-1 text-xs text-red-500">{tx.failureReason}</p>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Audit trail</CardTitle>
          </CardHeader>
          <CardContent>
            {audit.isLoading && (
              <p className="text-sm text-muted-foreground">Loading trail…</p>
            )}
            {audit.data && audit.data.length === 0 && (
              <p className="text-sm text-muted-foreground">No events.</p>
            )}
            <ol className="grid gap-2">
              {audit.data?.map((event) => (
                <li key={event.id} className="rounded-md border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{event.eventType}</span>
                    <span className="text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {event.reason && (
                    <p className="mt-1 text-muted-foreground">{event.reason}</p>
                  )}
                  {event.metadata && (
                    <pre className="mt-1 overflow-x-auto text-muted-foreground">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
