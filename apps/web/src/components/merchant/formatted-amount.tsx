import { cn } from "@cartwright/ui/lib/utils";

export function FormattedAmount({ amount, className }: { amount: number; className?: string }) {
  const parts = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).formatToParts(amount);

  const symbol = parts.find((part) => part.type === "currency")?.value || "₹";
  const value = parts
    .filter((part) => part.type !== "currency")
    .map((part) => part.value)
    .join("")
    .trim();

  return (
    <span suppressHydrationWarning className={cn("font-mono whitespace-nowrap", className)}>
      <span className="mr-0.5 font-normal text-muted-foreground">{symbol}</span>
      <span className="font-bold text-foreground">{value}</span>
    </span>
  );
}
