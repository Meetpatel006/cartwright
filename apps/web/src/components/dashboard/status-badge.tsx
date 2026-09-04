import { cn } from "@cartwright/ui/lib/utils";

type StatusKind = "paid" | "pending" | "failed" | "blocked" | "processing";

interface StatusConfig {
  label: string;
  className: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  PAID: { label: "Paid", className: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" },
  PAYMENT_SUCCEEDED: { label: "Paid", className: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" },
  APPROVED: { label: "Paid", className: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" },
  DELIVERED: { label: "Paid", className: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" },
  CONFIRMED: { label: "Paid", className: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" },

  CREATED: { label: "Pending", className: "bg-amber-500/10 border-amber-500/30 text-amber-500" },
  POLICY_CHECKING: { label: "Pending", className: "bg-amber-500/10 border-amber-500/30 text-amber-500" },
  AWAITING_APPROVAL: { label: "Pending", className: "bg-amber-500/10 border-amber-500/30 text-amber-500" },
  PROCESSING: { label: "Processing", className: "bg-amber-500/10 border-amber-500/30 text-amber-500" },
  IN_TRANSIT: { label: "Processing", className: "bg-amber-500/10 border-amber-500/30 text-amber-500" },
  PAYMENT_PROCESSING: { label: "Processing", className: "bg-amber-500/10 border-amber-500/30 text-amber-500" },

  FAILED: { label: "Failed", className: "bg-rose-500/10 border-rose-500/30 text-rose-500" },
  CANCELLED: { label: "Failed", className: "bg-rose-500/10 border-rose-500/30 text-rose-500" },
  PAYMENT_FAILED: { label: "Failed", className: "bg-rose-500/10 border-rose-500/30 text-rose-500" },
  POLICY_BLOCKED: { label: "Blocked", className: "bg-rose-500/10 border-rose-500/30 text-rose-500" },
};

const DEFAULT_STATUS: StatusConfig = { label: "Pending", className: "bg-amber-500/10 border-amber-500/30 text-amber-500" };

export function getStatusDisplay(status: string): StatusConfig {
  return STATUS_MAP[(status || "").toUpperCase()] || DEFAULT_STATUS;
}

export function StatusBadge({ status }: { status: string }) {
  const { label, className } = getStatusDisplay(status);
  return (
    <span className={cn("inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium", className)}>
      {label}
    </span>
  );
}
