"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Building2,
  Store,
  Save,
  Plus,
  Ban,
  SlidersHorizontal,
  Pencil,
  Trash2,
  Search,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@cartwright/ui/components/button";
import {
  Dialog,
  DialogContent,
} from "@cartwright/ui/components/dialog";
import { cn } from "@cartwright/ui/lib/utils";
import { trpc } from "@/utils/trpc";

function formatRupees(amountInMajor: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amountInMajor);
}

function NikeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 7.8L6.442 15.276c-1.456.616-2.679.925-3.668.925-1.12 0-1.933-.392-2.437-1.177-.317-.504-.41-1.143-.28-1.918.13-.775.476-1.6 1.036-2.478.467-.71 1.232-1.643 2.297-2.8a6.122 6.122 0 00-.784 1.848c-.28 1.195-.028 2.072.756 2.632.373.261.886.392 1.54.392.522 0 1.11-.084 1.764-.252L24 7.8z" />
    </svg>
  );
}

function AmazonIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726a17.617 17.617 0 01-10.951-.577 17.88 17.88 0 01-5.43-3.35c-.1-.074-.151-.15-.151-.22 0-.047.021-.09.051-.13zm6.565-6.218c0-1.005.247-1.863.743-2.577.495-.71 1.17-1.25 2.04-1.615.796-.335 1.756-.575 2.912-.72.39-.046 1.033-.103 1.92-.174v-.37c0-.93-.105-1.558-.3-1.875-.302-.43-.78-.65-1.44-.65h-.182c-.48.046-.896.196-1.246.46-.35.27-.575.63-.675 1.096-.06.3-.206.465-.435.51l-2.52-.315c-.248-.06-.372-.18-.372-.39 0-.046.007-.09.022-.15.247-1.29.855-2.25 1.82-2.88.976-.616 2.1-.975 3.39-1.05h.54c1.65 0 2.957.434 3.888 1.29.135.15.27.3.405.48.12.165.224.314.283.45.075.134.15.33.195.57.06.254.105.42.135.51.03.104.062.3.076.615.01.313.02.493.02.553v5.28c0 .376.06.72.165 1.036.105.313.21.54.315.674l.51.674c.09.136.136.256.136.36 0 .12-.06.226-.18.314-1.2 1.05-1.86 1.62-1.963 1.71-.165.135-.375.15-.63.045a6.062 6.062 0 01-.526-.496l-.31-.347a9.391 9.391 0 01-.317-.42l-.3-.435c-.81.886-1.603 1.44-2.4 1.665-.494.15-1.093.227-1.83.227-1.11 0-2.04-.343-2.76-1.034-.72-.69-1.08-1.665-1.08-2.94l-.05-.076zm3.753-.438c0 .566.14 1.02.425 1.364.285.34.675.512 1.155.512.045 0 .106-.007.195-.02.09-.016.134-.023.166-.023.614-.16 1.08-.553 1.424-1.178.165-.28.285-.58.36-.91.09-.32.12-.59.135-.8.015-.195.015-.54.015-1.005v-.54c-.84 0-1.484.06-1.92.18-1.275.36-1.92 1.17-1.92 2.43l-.035-.02zm9.162 7.027c.03-.06.075-.11.132-.17.362-.243.714-.41 1.05-.5a8.094 8.094 0 011.612-.24c.14-.012.28 0 .41.03.65.06 1.05.168 1.172.33.063.09.099.228.099.39v.15c0 .51-.149 1.11-.424 1.8-.278.69-.664 1.248-1.156 1.68-.073.06-.14.09-.197.09-.03 0-.06 0-.09-.012-.09-.044-.107-.12-.064-.24.54-1.26.806-2.143.806-2.64 0-.15-.03-.27-.087-.344-.145-.166-.55-.257-1.224-.257-.243 0-.533.016-.87.046-.363.045-.7.09-1 .135-.09 0-.148-.014-.18-.044-.03-.03-.036-.047-.02-.077 0-.017.006-.03.02-.063v-.06z" />
    </svg>
  );
}

function FlipkartIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.833 1.333a.993.993 0 0 0-.333.061V1c0-.551.449-1 1-1h14.667c.551 0 1 .449 1 1v.333H3.833zm17.334 2.334H2.833c-.551 0-1 .449-1 1V23c0 .551.449 1 1 1h7.3l1.098-5.645h-2.24c-.051 0-5.158-.241-5.158-.241l4.639-.327-.078-.366-1.978-.285 1.882-.158-.124-.449-3.075-.467s3.341-.373 3.392-.373h3.232l.247-1.331c.289-1.616.945-2.807 1.973-3.693 1.033-.892 2.344-1.332 3.937-1.332.643 0 1.053.151 1.231.463.118.186.201.516.279.859.074.352.14.671.095.903-.057.345-.461.465-1.197.465h-.253c-1.327 0-2.134.763-2.405 2.31l-.243 1.355h1.54c.574 0 .781.402.622 1.306-.17.941-.539 1.36-1.111 1.36H14.9L13.804 24h7.362c.551 0 1-.449 1-1V4.667a1 1 0 0 0-.999-1zM20.5 2.333A.334.334 0 0 0 20.167 2H3.833a.334.334 0 0 0-.333.333V3h17v-.667z" />
    </svg>
  );
}

function AppleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.54c.66-.82 1.11-1.96.99-3.09-1 .04-2.18.66-2.88 1.48-.61.71-1.15 1.87-.99 2.97 1.11.08 2.22-.54 2.88-1.36z" />
    </svg>
  );
}

function AdidasIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="m24 19.535-8.697-15.07-4.659 2.687 7.145 12.383Zm-8.287 0L9.969 9.59 5.31 12.277l4.192 7.258ZM4.658 14.723l-2.029 1.171L0 19.535h4.658Z" />
    </svg>
  );
}

function ShopifyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z" />
    </svg>
  );
}

function SonyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.55 9.89c.92 0 1.66.23 2.22.74.39.35.6.85.6 1.37a1.9 1.9 0 0 1-.6 1.37c-.52.49-1.34.74-2.22.74-.87 0-1.68-.25-2.21-.74a1.9 1.9 0 0 1-.6-1.37c0-.52.21-1.02.6-1.37.5-.45 1.39-.74 2.21-.74zm.01 3.67c.46 0 .89-.16 1.19-.46.3-.3.43-.66.43-1.1 0-.43-.15-.82-.43-1.1-.3-.3-.74-.46-1.19-.46s-.9.16-1.19.46c-.29.28-.44.68-.44 1.1 0 .41.15.8.44 1.1.3.3.73.46 1.19.46zm-4.84-1.97c.16.04.31.09.46.16.14.07.27.16.38.26.2.2.31.48.31.77 0 .31-.13.58-.38.78-.21.17-.45.29-.71.35a3.72 3.72 0 0 1-1.19.17c-.35 0-.55-.04-.82-.1l-.07-.01a3.02 3.02 0 0 1-.86-.28.07.07 0 0 0-.04-.01c-.05 0-.08.04-.08.08v.2H.12v-1.48h.53c.03.15.08.29.13.42.22.26.44.36.66.44.37.12.75.18 1.14.2.55 0 .87-.14.94-.17.07-.02.32-.11.32-.39 0-.27-.24-.33-.39-.37l-.02-.01c-.17-.04-.56-.08-.99-.13l-.15-.02c-.49-.05-.97-.13-1.2-.17-.5-.11-.7-.29-.82-.41A1.02 1.02 0 0 1 .03 10.9c0-.31.14-.6.38-.79.23-.19.51-.31.8-.37.37-.08.76-.12 1.15-.12.3 0 .46.03.7.07.24.05.47.12.69.21.05.02.09.02.12 0 .04-.03.06-.07.06-.11v-.15h.57v1.44h-.47a.78.78 0 0 0-.13-.39c-.19-.24-.38-.34-.58-.4a3.14 3.14 0 0 0-.96-.16c-.46 0-.74.1-.81.12-.08.03-.35.12-.35.39 0 .23.18.3.3.34.13.04.45.08.79.11l.16.02c.51.05 1.03.12 1.28.18.49.12.69.3.8.41l.01.01zM18.89 9.9h.65l3.29 4.88v-4.88h1.05v5.86h-.66l-3.29-4.88v4.88h-1.04V9.9zm-4.71 0h1.16l1.79 3.09 1.77-3.09h1.17l-2.4 4.02v1.84h-1.07v-1.84l-2.42-4.02z" />
    </svg>
  );
}

function MerchantLogo({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const text = name.toLowerCase().trim();

  if (text.includes("nike") || text.includes("jordan")) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/90 text-zinc-200 shadow-xs">
        <NikeIcon className={className} />
      </span>
    );
  }
  if (text.includes("amazon") || text.includes("amzn") || text.includes("prime")) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/90 text-zinc-200 shadow-xs">
        <AmazonIcon className={className} />
      </span>
    );
  }
  if (text.includes("flipkart")) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/90 text-zinc-200 shadow-xs">
        <FlipkartIcon className={className} />
      </span>
    );
  }
  if (text.includes("apple") || text.includes("iphone") || text.includes("macbook")) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/90 text-zinc-200 shadow-xs">
        <AppleIcon className={className} />
      </span>
    );
  }
  if (text.includes("adidas") || text.includes("yeezy") || text.includes("samba")) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/90 text-zinc-200 shadow-xs">
        <AdidasIcon className={className} />
      </span>
    );
  }
  if (text.includes("shopify")) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/90 text-zinc-200 shadow-xs">
        <ShopifyIcon className={className} />
      </span>
    );
  }
  if (text.includes("sony") || text.includes("playstation") || text.includes("ps5")) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/90 text-zinc-200 shadow-xs">
        <SonyIcon className={className} />
      </span>
    );
  }

  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/90 text-zinc-400 shadow-xs">
      <Store className={className} />
    </span>
  );
}

function parseInputToRupees(val: string): number {
  const clean = val.replace(/[^0-9.]/g, "");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

type ActiveDialog = "merchants" | null;
type EditingStat = "singleTx" | "lifetime" | "velocity" | null;

export default function PolicySettings() {
  const policy = useQuery(trpc.policies.get.queryOptions());

  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [editingStat, setEditingStat] = useState<EditingStat>(null);

  // Form values in whole Rupees (major currency units)
  const [maxTxRupees, setMaxTxRupees] = useState<string>("");
  const [maxTotalRupees, setMaxTotalRupees] = useState<string>("");
  const [currency, setCurrency] = useState("INR");
  const [requireUserApproval, setRequireUserApproval] = useState(false);
  const [blockedMerchants, setBlockedMerchants] = useState<string[]>([]);
  const [frequencyLimit, setFrequencyLimit] = useState<string>("");

  // Merchant dialog input states
  const [merchantInput, setMerchantInput] = useState("");

  const [tableSearch, setTableSearch] = useState("");
  const [tableFilter, setTableFilter] = useState<"ALL" | "blacklist">("ALL");

  const [seeded, setSeeded] = useState(false);

  const syncFormFromData = () => {
    if (!policy.data) return;
    setMaxTxRupees(String(policy.data.maxTransactionAmount / 100));
    setMaxTotalRupees(String(policy.data.maxTotalSpending / 100));
    setCurrency(policy.data.currency || "INR");
    setRequireUserApproval(Boolean(policy.data.requireUserApproval));
    setBlockedMerchants(policy.data.blockedMerchants ?? []);
    setFrequencyLimit(
      policy.data.frequencyLimit === null || policy.data.frequencyLimit === undefined
        ? ""
        : String(policy.data.frequencyLimit)
    );
    setMerchantInput("");
  };

  useEffect(() => {
    if (policy.data && !seeded) {
      syncFormFromData();
      setSeeded(true);
    }
  }, [policy.data, seeded]);

  const update = useMutation(
    trpc.policies.update.mutationOptions({
      onSuccess: () => {
        policy.refetch();
        setActiveDialog(null);
        setEditingStat(null);
        toast.success("Spending policy guardrails updated successfully");
      },
      onError: (err) => {
        toast.error(`Failed to update policy: ${err.message}`);
      },
    })
  );

  const numMaxTx = parseInputToRupees(maxTxRupees);
  const numMaxTotal = parseInputToRupees(maxTotalRupees);
  const currentSavedTx = (policy.data?.maxTransactionAmount ?? 0) / 100;
  const currentSavedTotal = (policy.data?.maxTotalSpending ?? 0) / 100;
  const consumedRupees = (policy.data?.consumedInMinor ?? 0) / 100;
  const utilizationPercent =
    currentSavedTotal > 0
      ? Math.min(100, Math.round((consumedRupees / currentSavedTotal) * 100))
      : 0;

  const handleSaveSingleTx = (customVal?: number) => {
    const val = customVal !== undefined ? customVal : parseInputToRupees(maxTxRupees);
    if (val <= 0) {
      toast.error("Single order limit must be greater than 0");
      return;
    }
    setMaxTxRupees(String(val));
    update.mutate({
      maxTransactionAmount: Math.round(val * 100),
      maxTotalSpending: policy.data?.maxTotalSpending ?? 0,
      currency: policy.data?.currency || "INR",
      requireUserApproval: Boolean(policy.data?.requireUserApproval),
      blockedMerchants: policy.data?.blockedMerchants ?? [],
      frequencyLimit: policy.data?.frequencyLimit ?? null,
    });
  };

  const handleSaveLifetime = (customVal?: number) => {
    const val = customVal !== undefined ? customVal : parseInputToRupees(maxTotalRupees);
    if (val <= 0) {
      toast.error("Lifetime budget cap must be greater than 0");
      return;
    }
    const valInPaisa = Math.round(val * 100);
    if (valInPaisa < (policy.data?.consumedInMinor ?? 0)) {
      toast.error(
        `Lifetime budget cannot be lower than spent amount (${formatRupees(consumedRupees)})`
      );
      return;
    }
    setMaxTotalRupees(String(val));
    update.mutate({
      maxTransactionAmount: policy.data?.maxTransactionAmount ?? 0,
      maxTotalSpending: valInPaisa,
      currency: policy.data?.currency || "INR",
      requireUserApproval: Boolean(policy.data?.requireUserApproval),
      blockedMerchants: policy.data?.blockedMerchants ?? [],
      frequencyLimit: policy.data?.frequencyLimit ?? null,
    });
  };

  const handleToggleApproval = (requireApproval: boolean) => {
    setRequireUserApproval(requireApproval);
    update.mutate({
      maxTransactionAmount: policy.data?.maxTransactionAmount ?? 0,
      maxTotalSpending: policy.data?.maxTotalSpending ?? 0,
      currency: policy.data?.currency || "INR",
      requireUserApproval: requireApproval,
      blockedMerchants: policy.data?.blockedMerchants ?? [],
      frequencyLimit: policy.data?.frequencyLimit ?? null,
    });
  };

  const handleSaveVelocity = (customVal?: string) => {
    const rawVal = customVal !== undefined ? customVal : frequencyLimit;
    const trimmed = rawVal.trim();
    const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
    if (parsed !== null && (isNaN(parsed) || parsed <= 0)) {
      toast.error("Velocity limit must be a positive number or blank for unlimited");
      return;
    }
    setFrequencyLimit(trimmed);
    update.mutate({
      maxTransactionAmount: policy.data?.maxTransactionAmount ?? 0,
      maxTotalSpending: policy.data?.maxTotalSpending ?? 0,
      currency: policy.data?.currency || "INR",
      requireUserApproval: Boolean(policy.data?.requireUserApproval),
      blockedMerchants: policy.data?.blockedMerchants ?? [],
      frequencyLimit: parsed,
    });
  };

  const startEditingSingleTx = () => {
    setMaxTxRupees(String((policy.data?.maxTransactionAmount ?? 0) / 100));
    setEditingStat("singleTx");
  };

  const startEditingLifetime = () => {
    setMaxTotalRupees(String((policy.data?.maxTotalSpending ?? 0) / 100));
    setEditingStat("lifetime");
  };

  const startEditingVelocity = () => {
    setFrequencyLimit(
      policy.data?.frequencyLimit !== null && policy.data?.frequencyLimit !== undefined
        ? String(policy.data.frequencyLimit)
        : ""
    );
    setEditingStat("velocity");
  };

  const handleOpenDialog = (dialog: ActiveDialog) => {
    syncFormFromData();
    setActiveDialog(dialog);
  };

  const handleCloseDialog = () => {
    syncFormFromData();
    setActiveDialog(null);
  };

  const handleSaveNewMerchantRule = (customName?: string) => {
    const target = (customName ?? merchantInput).trim().toLowerCase();
    if (!target) {
      toast.error("Please enter a merchant name or keyword");
      return;
    }
    const currentBlocked = policy.data?.blockedMerchants ?? [];
    let newBlocked = [...currentBlocked];
    if (!newBlocked.includes(target)) newBlocked.push(target);

    update.mutate({
      maxTransactionAmount: policy.data?.maxTransactionAmount ?? 0,
      maxTotalSpending: policy.data?.maxTotalSpending ?? 0,
      currency: policy.data?.currency || "INR",
      requireUserApproval: Boolean(policy.data?.requireUserApproval),
      blockedMerchants: newBlocked,
      frequencyLimit: policy.data?.frequencyLimit ?? null,
    });
  };

  const handleDeleteRuleDirect = (name: string) => {
    if (!policy.data) return;
    const newBlocked = (policy.data.blockedMerchants ?? []).filter((m) => m !== name);

    update.mutate({
      maxTransactionAmount: policy.data.maxTransactionAmount,
      maxTotalSpending: policy.data.maxTotalSpending,
      currency: policy.data.currency || "INR",
      requireUserApproval: Boolean(policy.data.requireUserApproval),
      blockedMerchants: newBlocked,
      frequencyLimit: policy.data.frequencyLimit,
    });
  };

  const savedBlocked = policy.data?.blockedMerchants ?? [];

  const combinedRules = useMemo(() => {
    const rules = savedBlocked.map((name) => ({ name, type: "blacklist" as const }));

    return rules.filter((rule) => {
      const matchesSearch = rule.name.toLowerCase().includes(tableSearch.trim().toLowerCase());
      const matchesFilter =
        tableFilter === "ALL" ? true : rule.type === tableFilter;
      return matchesSearch && matchesFilter;
    });
  }, [savedBlocked, tableSearch, tableFilter]);

  return (
    <div className="w-full text-foreground px-6 sm:px-8 pt-10 sm:pt-12 pb-24">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Policy Telemetry & Guardrail Stats Cards */}
        {policy.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="h-32 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/40" />
            <div className="h-32 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/40" />
            <div className="h-32 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/40" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Stat 1: Single Order Limit */}
            <div className="group relative flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-[#161616]/90 p-5 shadow-2xl transition-all hover:border-zinc-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">Single Order Limit</span>
                {editingStat !== "singleTx" && (
                  <button
                    type="button"
                    onClick={startEditingSingleTx}
                    className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Click to edit single order limit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {editingStat === "singleTx" ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <span className="text-2xl font-bold font-mono tracking-tight text-zinc-500">₹</span>
                    <input
                      type="text"
                      value={maxTxRupees}
                      onChange={(e) => setMaxTxRupees(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveSingleTx();
                        if (e.key === "Escape") setEditingStat(null);
                      }}
                      placeholder="10000"
                      className="w-full bg-transparent pb-0.5 font-mono text-2xl font-bold tracking-tight text-white focus:outline-none border-none"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSaveSingleTx()}
                      disabled={update.isPending}
                      className="p-1 rounded-md text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/50 transition-colors cursor-pointer"
                      title="Save limit (Enter)"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMaxTxRupees(String((policy.data?.maxTransactionAmount ?? 0) / 100));
                        setEditingStat(null);
                      }}
                      className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Cancel (Esc)"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={startEditingSingleTx}
                  className="cursor-pointer group/val"
                  title="Click to edit single order limit"
                >
                  <span className="text-2xl font-bold font-mono tracking-tight text-white group-hover/val:text-zinc-200">
                    {formatRupees(currentSavedTx)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-800/60">
                <span>Per checkout cap</span>
                <span className="text-emerald-400 font-medium">Active</span>
              </div>
            </div>

            {/* Stat 2: Lifetime Budget */}
            <div className="group relative flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-[#161616]/90 p-5 shadow-2xl transition-all hover:border-zinc-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">Lifetime Budget Cap</span>
                {editingStat !== "lifetime" && (
                  <button
                    type="button"
                    onClick={startEditingLifetime}
                    className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Click to edit lifetime budget"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {editingStat === "lifetime" ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <span className="text-2xl font-bold font-mono tracking-tight text-zinc-500">₹</span>
                    <input
                      type="text"
                      value={maxTotalRupees}
                      onChange={(e) => setMaxTotalRupees(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveLifetime();
                        if (e.key === "Escape") setEditingStat(null);
                      }}
                      placeholder="50000"
                      className="w-full bg-transparent pb-0.5 font-mono text-2xl font-bold tracking-tight text-white focus:outline-none border-none"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSaveLifetime()}
                      disabled={update.isPending}
                      className="p-1 rounded-md text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/50 transition-colors cursor-pointer"
                      title="Save budget (Enter)"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMaxTotalRupees(String((policy.data?.maxTotalSpending ?? 0) / 100));
                        setEditingStat(null);
                      }}
                      className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Cancel (Esc)"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={startEditingLifetime}
                  className="cursor-pointer group/val"
                  title="Click to edit lifetime budget"
                >
                  <span className="text-2xl font-bold font-mono tracking-tight text-white group-hover/val:text-zinc-200">
                    {formatRupees(currentSavedTotal)}
                  </span>
                </div>
              )}

              <div className="space-y-1.5 pt-1 border-t border-zinc-800/60">
                <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-500 rounded-full",
                      utilizationPercent > 85 ? "bg-amber-400" : "bg-emerald-400"
                    )}
                    style={{ width: `${Math.max(4, utilizationPercent)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
                  <span>Spent: {formatRupees(consumedRupees)}</span>
                  <span>{utilizationPercent}%</span>
                </div>
              </div>
            </div>

            {/* Stat 3: Hourly Velocity & Checkout Mode */}
            <div className="group relative flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-[#161616]/90 p-5 shadow-2xl transition-all hover:border-zinc-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">Hourly Velocity & Mode</span>
                {editingStat !== "velocity" && (
                  <button
                    type="button"
                    onClick={startEditingVelocity}
                    className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Click to edit velocity limit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {editingStat === "velocity" ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={frequencyLimit}
                      onChange={(e) => setFrequencyLimit(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveVelocity();
                        if (e.key === "Escape") setEditingStat(null);
                      }}
                      placeholder="Unlimited"
                      className="w-full bg-transparent pb-0.5 font-mono text-2xl font-bold tracking-tight text-white placeholder:text-zinc-600 focus:outline-none border-none"
                      autoFocus
                    />
                    <span className="text-sm font-mono font-semibold text-zinc-400 shrink-0">/hr</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSaveVelocity()}
                      disabled={update.isPending}
                      className="p-1 rounded-md text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/50 transition-colors cursor-pointer"
                      title="Save velocity (Enter)"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFrequencyLimit(
                          policy.data?.frequencyLimit ? String(policy.data.frequencyLimit) : ""
                        );
                        setEditingStat(null);
                      }}
                      className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                      title="Cancel (Esc)"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div
                    onClick={startEditingVelocity}
                    className="cursor-pointer group/val"
                    title="Click to edit velocity limit"
                  >
                    <span className="text-2xl font-bold font-mono tracking-tight text-white group-hover/val:text-zinc-200">
                      {policy.data?.frequencyLimit ? `${policy.data.frequencyLimit}/hr` : "Unlimited"}
                    </span>
                  </div>

                  <div className="inline-flex items-center gap-1 p-0.5 rounded-lg border border-zinc-800 bg-zinc-950/80">
                    <button
                      type="button"
                      onClick={() => handleToggleApproval(false)}
                      disabled={update.isPending}
                      className={cn(
                        "flex items-center rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                        !policy.data?.requireUserApproval
                          ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 shadow-xs"
                          : "text-zinc-400 hover:text-zinc-200"
                      )}
                      title="Autonomous checkout within limits"
                    >
                      Autonomous
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleApproval(true)}
                      disabled={update.isPending}
                      className={cn(
                        "flex items-center rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
                        policy.data?.requireUserApproval
                          ? "bg-amber-950/80 text-amber-300 border border-amber-500/40 shadow-xs"
                          : "text-zinc-400 hover:text-zinc-200"
                      )}
                      title="Require manual user approval before checkout"
                    >
                      Manual
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-800/60">
                <span>Rolling 60m rate limit</span>
                <span className="text-[11px] font-mono">
                  {policy.data?.requireUserApproval ? (
                    <span className="text-amber-400 font-medium">Requires Approval</span>
                  ) : (
                    <span className="text-emerald-400 font-medium">Auto-Pass</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        )}

          {/* Merchant Rules Section Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2">
            {/* Left: Title */}
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Merchant Rules
              </h2>
            </div>

            {/* Right: Search + Filter + View Toggle (List / Board) + Add Rule */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative w-48 sm:w-56">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Search merchant rules..."
                  className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900/90 pl-9 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                />
              </div>

              {/* Status Filter Toggle */}
              <div className="inline-flex h-9 items-center rounded-lg border border-zinc-800 bg-zinc-900/90 p-0.5">
                <button
                  type="button"
                  onClick={() => setTableFilter("ALL")}
                  className={cn(
                    "inline-flex h-full items-center rounded-md px-3 text-xs font-semibold transition-colors cursor-pointer",
                    tableFilter === "ALL"
                      ? "bg-zinc-800 text-white shadow-xs"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setTableFilter("blacklist")}
                  className={cn(
                    "inline-flex h-full items-center rounded-md px-3 text-xs font-semibold transition-colors cursor-pointer",
                    tableFilter === "blacklist"
                      ? "bg-zinc-800 text-white shadow-xs"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  Blocked
                </button>
              </div>

              {/* Add Rule Button */}
              <Button
                type="button"
                onClick={() => handleOpenDialog("merchants")}
                className="h-9 px-3.5 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Rule</span>
              </Button>
            </div>
          </div>

          {/* Rules Content: Board Grid View */}
          {combinedRules.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/40 text-center">
              <Building2 className="mb-2 h-8 w-8 text-zinc-600" />
              <p className="text-sm font-medium text-zinc-300">
                {tableSearch ? `No rules matching "${tableSearch}"` : "No merchant rules configured"}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5 max-w-sm">
                All verified store checkouts are permitted under default pre-authorization guardrails.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenDialog("merchants")}
                className="mt-3 h-7.5 px-3 text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
              >
                Add First Rule
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {combinedRules.map((rule) => {
                return (
                  <div
                    key={`${rule.type}-${rule.name}`}
                    className="group relative flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-[#161616]/90 p-5 shadow-2xl transition-all hover:border-zinc-700/80 space-y-4"
                  >
                    {/* Top Row: Merchant Logo, Name & Delete Action */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <MerchantLogo name={rule.name} className="h-4 w-4 mt-0.5" />
                        <div className="min-w-0 space-y-0.5">
                          <h3 className="text-base font-bold text-white tracking-tight font-mono capitalize truncate">
                            {rule.name}
                          </h3>
                          <p className="text-xs text-zinc-400 font-sans leading-relaxed break-words">
                            "Instantly aborts pre-authorization checkout"
                          </p>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRuleDirect(rule.name)}
                        disabled={update.isPending}
                        className="h-7 w-7 p-0 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800/60 rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                        title="Remove rule"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Policy Details */}
                    <div className="space-y-2.5 pt-3 border-t border-zinc-800/60 text-xs">
                      <div className="flex items-center justify-between text-zinc-400">
                        <span>Enforcement Gate</span>
                        <span className="inline-flex items-center rounded-full border border-rose-500/40 bg-rose-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-rose-400">
                          Blocked merchant
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-zinc-400">
                        <span>Action Effect</span>
                        <span className="font-mono text-[11px] text-zinc-300">
                          "ABORT_REJECT"
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Merchant Rule Dialog */}
        <Dialog open={activeDialog === "merchants"} onOpenChange={(open) => !open && handleCloseDialog()}>
          <DialogContent className="top-[20%] translate-y-0 sm:max-w-md max-w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl p-0">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div>
                <span className="text-sm font-bold text-zinc-100 block">Add Merchant Rule</span>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Configure clearance rules for automated store checkouts
                </p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Field 1: Rule Type */}
              <div className="space-y-1.5">
                <label className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 p-2.5 text-xs font-semibold text-rose-300">
                  <Ban className="h-4 w-4 text-rose-400" />
                  Block this merchant
                </label>
              </div>

              {/* Field 2: Merchant Name / Keyword Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">
                  Merchant / Store Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={merchantInput}
                    onChange={(e) => setMerchantInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveNewMerchantRule();
                      }
                    }}
                    placeholder="e.g. Untrusted Vendor, Unknown Store"
                    className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-zinc-500">
                  "Orders at this merchant will be aborted immediately. All other merchants remain allowed by default."
                </p>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 bg-zinc-950/40 px-5 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCloseDialog}
                className="h-8 px-3 text-xs rounded-lg border-zinc-700 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleSaveNewMerchantRule()}
                disabled={update.isPending || !merchantInput.trim()}
                className="h-8 px-4 text-xs font-bold rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                <span>{update.isPending ? "Adding..." : "Add Rule"}</span>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
}
