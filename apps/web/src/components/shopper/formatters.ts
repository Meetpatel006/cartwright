export function formatCurrency(minor: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `₹${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function availabilityTone(availability: "in_stock" | "limited" | "out_of_stock" | "unknown"): string {
  switch (availability) {
    case "in_stock":
      return "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400";
    case "limited":
      return "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "out_of_stock":
      return "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

