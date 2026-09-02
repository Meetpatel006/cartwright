"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@cartwright/ui/lib/utils";

function getEventBadge(eventType: string) {
  const norm = (eventType || "").toUpperCase();
  const isFailure =
    norm.includes("FAIL") ||
    norm.includes("BLOCK") ||
    norm.includes("REJECT") ||
    norm.includes("ERROR") ||
    norm.includes("CANCEL");
  const isSuccess = norm.includes("SUCCESS") || norm.includes("COMPLETE") || norm.includes("DONE");

  if (isFailure) {
    return {
      dotClass: "bg-rose-500",
      lineClass: "bg-rose-300 dark:bg-rose-800/60",
      badgeBg: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300",
    };
  }

  if (isSuccess) {
    return {
      dotClass: "bg-emerald-500",
      lineClass: "bg-emerald-300 dark:bg-emerald-800/60",
      badgeBg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300",
    };
  }

  return {
    dotClass: "bg-slate-400 dark:bg-slate-500",
    lineClass: "bg-slate-200 dark:bg-slate-700",
    badgeBg: "bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300",
  };
}

function AuditTrailPanel({
  audit,
}: {
  transaction?: any;
  audit: any;
  onClose?: () => void;
}) {
  const [expandedPayloads, setExpandedPayloads] = useState<Record<string, boolean>>({});

  const togglePayload = (id: string) => {
    setExpandedPayloads((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const sortedEvents = useMemo(() => {
    if (!audit.data || !Array.isArray(audit.data)) return [];
    return [...audit.data].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [audit.data]);

  return (
    <div className="text-xs">
      {audit.isLoading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground pl-4">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-foreground" />
          <span>Fetching event timeline…</span>
        </div>
      ) : sortedEvents.length === 0 ? (
        <p className="py-4 text-muted-foreground pl-4">No audit events recorded for this transaction.</p>
      ) : (
        <div className="relative">
          {sortedEvents.map((event: any, idx: number) => {
            const eventId = String(event.id || idx);
            const style = getEventBadge(event.eventType);
            const hasMetadata =
              event.metadata && Object.keys(event.metadata).length > 0;
            const isPayloadOpen = Boolean(expandedPayloads[eventId]);
            const isFirst = idx === 0;
            const isLast = idx === sortedEvents.length - 1;

            return (
              <div key={eventId} className="relative flex gap-3">
                {/* Dot column — fixed width, centered on the continuous line */}
                <div className="relative flex flex-col items-center w-3 shrink-0">
                  {/* Dot */}
                  <div
                    className={cn(
                      "h-2.5 w-2.5 rounded-full z-10 bg-card border-2 shrink-0",
                      style.dotClass
                    )}
                  />
                  {/* Line segment below dot */}
                  {!isLast && (
                    <div className={cn("w-px grow -mt-px", style.lineClass)} />
                  )}
                </div>

                {/* Event content */}
                <div className="grow min-w-0 pb-5">
                  <div
                    onClick={() => hasMetadata && togglePayload(eventId)}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 p-1 -m-1 rounded transition-colors",
                      hasMetadata ? "cursor-pointer hover:bg-muted/50" : "cursor-default"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "font-mono font-semibold text-[11px] px-2 py-0.5 rounded border inline-flex items-center gap-1 transition-colors shrink-0",
                          style.badgeBg
                        )}
                      >
                        {event.eventType}
                        {hasMetadata && (
                          <ChevronDown
                            className={cn(
                              "h-3 w-3 text-muted-foreground transition-transform duration-200",
                              isPayloadOpen ? "rotate-180" : "rotate-0"
                            )}
                          />
                        )}
                      </span>
                      {event.reason && (
                        <span className="text-foreground font-medium text-[11px] truncate">
                          {event.reason}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {hasMetadata && isPayloadOpen && (
                    <div className="mt-1.5">
                      <pre className="rounded border border-border p-2.5 font-mono text-[10px] text-foreground overflow-x-auto leading-relaxed bg-card animate-in fade-in-0 duration-150">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AuditTrailPanel;

