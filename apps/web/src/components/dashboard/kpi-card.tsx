import { cn } from "@cartwright/ui/lib/utils";
import type { TrendResult } from "@/utils/metrics";

interface KPICardProps {
  label: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  trend?: TrendResult;
  subtext?: React.ReactNode;
  className?: string;
}

export function KPICard({ label, icon, value, trend, subtext, className }: KPICardProps) {
  return (
    <div className={cn("p-4 sm:p-5 flex flex-col justify-between", className)}>
      <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
        <span>{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold font-mono text-foreground mt-2 tracking-tight">{value}</div>
      {(trend || subtext) && (
        <div className="text-[11px] flex items-center gap-1.5 mt-1">
          {trend && trend.value !== 0 && (
            <span className={cn("font-medium whitespace-nowrap", trend.direction === "up" ? "text-emerald-500" : trend.direction === "down" ? "text-rose-500" : "text-muted-foreground")}>
              {trend.direction === "up" ? "↗" : trend.direction === "down" ? "↘" : "→"} {trend.label}
            </span>
          )}
          {subtext && <span className="text-muted-foreground truncate">{subtext}</span>}
        </div>
      )}
    </div>
  );
}
