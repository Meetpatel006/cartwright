"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@cartwright/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cartwright/ui/components/card";
import { Input } from "@cartwright/ui/components/input";
import { Label } from "@cartwright/ui/components/label";
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

export default function PolicySettings() {
  const policy = useQuery(trpc.policies.get.queryOptions());

  const [maxTransactionAmount, setMaxTransactionAmount] = useState("");
  const [maxTotalSpending, setMaxTotalSpending] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [requireUserApproval, setRequireUserApproval] = useState(false);
  const [allowedMerchants, setAllowedMerchants] = useState("");
  const [blockedMerchants, setBlockedMerchants] = useState("");
  const [frequencyLimit, setFrequencyLimit] = useState("");
  const [seeded, setSeeded] = useState(false);

  // Seed the form once the policy loads (guarded so clearing a field never re-seeds).
  useEffect(() => {
    if (policy.data && !seeded) {
      setMaxTransactionAmount(String(policy.data.maxTransactionAmount));
      setMaxTotalSpending(String(policy.data.maxTotalSpending));
      setCurrency(policy.data.currency);
      setRequireUserApproval(policy.data.requireUserApproval);
      setAllowedMerchants((policy.data.allowedMerchants ?? []).join(", "));
      setBlockedMerchants((policy.data.blockedMerchants ?? []).join(", "));
      setFrequencyLimit(
        policy.data.frequencyLimit === null || policy.data.frequencyLimit === undefined
          ? ""
          : String(policy.data.frequencyLimit),
      );
      setSeeded(true);
    }
  }, [policy.data, seeded]);

  const update = useMutation(
    trpc.policies.update.mutationOptions({
      onSuccess: () => policy.refetch(),
    }),
  );

  const dirty =
    policy.data &&
    (String(policy.data.maxTransactionAmount) !== maxTransactionAmount ||
      String(policy.data.maxTotalSpending) !== maxTotalSpending ||
      policy.data.currency !== currency ||
      policy.data.requireUserApproval !== requireUserApproval ||
      (policy.data.allowedMerchants ?? []).join(", ") !== allowedMerchants.trim() ||
      (policy.data.blockedMerchants ?? []).join(", ") !== blockedMerchants.trim() ||
      String(policy.data.frequencyLimit ?? "") !== frequencyLimit.trim());

  const parseMerchants = (raw: string) =>
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

  const submit = () => {
    const maxTx = Number.parseInt(maxTransactionAmount, 10);
    const maxTotal = Number.parseInt(maxTotalSpending, 10);
    if (!Number.isInteger(maxTx) || maxTx <= 0) return;
    if (!Number.isInteger(maxTotal) || maxTotal <= 0) return;
    update.mutate({
      maxTransactionAmount: maxTx,
      maxTotalSpending: maxTotal,
      currency: currency.trim().toUpperCase(),
      requireUserApproval,
      allowedMerchants: parseMerchants(allowedMerchants),
      blockedMerchants: parseMerchants(blockedMerchants),
      frequencyLimit:
        frequencyLimit.trim() === ""
          ? null
          : Number.parseInt(frequencyLimit, 10),
    });
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Spending policy</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        These are your hard boundaries. The backend evaluates them on every
        purchase request and blocks anything that breaks them — before any
        money moves.
      </p>

      {policy.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {policy.error && <p className="text-sm text-red-500">Could not load policy.</p>}

      {policy.data && (
        <Card>
          <CardHeader>
            <CardTitle>Edit policy</CardTitle>
            <CardDescription>
              Current effective limit:{" "}
              {formatCurrency(policy.data.maxTransactionAmount, policy.data.currency)} per
              transaction, {formatCurrency(policy.data.maxTotalSpending, policy.data.currency)}{" "}
              total.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1">
                <Label htmlFor="maxTx">Max per transaction (minor units)</Label>
                <Input
                  id="maxTx"
                  value={maxTransactionAmount}
                  onChange={(e) => setMaxTransactionAmount(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="maxTotal">Max total spending (minor units)</Label>
                <Input
                  id="maxTotal"
                  value={maxTotalSpending}
                  onChange={(e) => setMaxTotalSpending(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="grid gap-1">
              <Label htmlFor="currency">Currency</Label>
              {/* Hard-INR product: currency is fixed, not editable. */}
              <Input id="currency" value={currency} readOnly maxLength={3} />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requireUserApproval}
                onChange={(e) => setRequireUserApproval(e.target.checked)}
              />
              Require explicit approval for every purchase
            </label>

            <div className="grid gap-1">
              <Label htmlFor="allowed">Allowed merchants (comma-separated, empty = allow all)</Label>
              <Input
                id="allowed"
                value={allowedMerchants}
                onChange={(e) => setAllowedMerchants(e.target.value)}
                placeholder="e.g. raven, nike"
              />
            </div>

            <div className="grid gap-1">
              <Label htmlFor="blocked">Blocked merchants (comma-separated)</Label>
              <Input
                id="blocked"
                value={blockedMerchants}
                onChange={(e) => setBlockedMerchants(e.target.value)}
                placeholder="e.g. shady-store"
              />
            </div>

            <div className="grid gap-1">
              <Label htmlFor="freq">Approval frequency limit (per hour, empty = unlimited)</Label>
              <Input
                id="freq"
                value={frequencyLimit}
                onChange={(e) => setFrequencyLimit(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 10"
              />
            </div>

            <Button onClick={submit} disabled={!dirty || update.isPending}>
              {update.isPending ? "Saving…" : "Save policy"}
            </Button>
            {update.isError && (
              <p className="text-sm text-red-500">{String(update.error.message)}</p>
            )}
            {update.isSuccess && (
              <p className="text-sm text-green-600">Policy saved.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
