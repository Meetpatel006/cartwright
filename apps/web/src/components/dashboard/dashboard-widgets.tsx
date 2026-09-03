"use client";

import { useState } from "react";
import { AlertTriangle, Info, Lightbulb } from "lucide-react";

import { cn } from "@cartwright/ui/lib/utils";

export function ConversionFunnel({ data }: { data: { stage: string; count: number; rate: string; drop: string }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between pb-3">
        <h2 className="text-sm font-semibold text-foreground">Conversion Funnel</h2>
        <span className="text-[11px] text-muted-foreground font-mono">Conv: <strong className="text-foreground">{data[data.length - 1]?.rate || "0%"}</strong></span>
      </div>
      <div className="space-y-2 pt-3">
        {data.map((stage, i) => {
          const w = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
          const last = i === data.length - 1;
          return (
            <div key={stage.stage}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground font-medium">{stage.stage}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-foreground">{stage.count.toLocaleString()}</span>
                  <span className="text-[10px] font-mono text-muted-foreground w-12 text-right">{stage.rate}</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-500", last ? "bg-emerald-500" : "bg-purple-500/70")} style={{ width: `${w}%` }} />
              </div>
              {!last && stage.drop !== "—" && <div className="text-[10px] text-red-500 font-mono mt-0.5 text-right">{stage.drop}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Search Queries ──────────────────────────────────────────────────────────
export function SearchQueriesPanel({ data }: { data: { query: string; searches: number; suggestion: string }[] }) {
  if (data.length === 0) return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between pb-3"><h2 className="text-sm font-semibold text-foreground">Top Search Queries</h2></div>
      <div className="space-y-1">
        {[
          { query: "wireless headphones", searches: 234 },
          { query: "running shoes", searches: 189 },
          { query: "laptop stand", searches: 156 },
          { query: "mechanical keyboard", searches: 134 },
          { query: "usb c hub", searches: 112 },
          { query: "phone case iphone 15", searches: 98 },
          { query: "yoga mat thick", searches: 87 },
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between p-2 text-xs">
            <span className="text-foreground font-medium truncate max-w-[70%]">&ldquo;{item.query}&rdquo;</span>
            <span className="font-mono text-muted-foreground text-[11px]">{item.searches} searches</span>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between pb-3">
        <h2 className="text-sm font-semibold text-foreground">Top Search Queries</h2>
        <span className="text-[11px] text-muted-foreground">{data.length} queries</span>
      </div>
      <div className="space-y-1">
        {data.slice(0, 7).map((item, i) => (
          <div key={i} className="flex items-center justify-between p-2 text-xs">
            <span className="text-foreground font-medium truncate max-w-[70%]">&ldquo;{item.query}&rdquo;</span>
            <span className="font-mono text-muted-foreground text-[11px]">{item.searches} searches</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Agent Radar ─────────────────────────────────────────────────────────────
export function AgentRadarChart({ agentSharePct = 0, data }: { agentSharePct?: number; data?: Array<{ key: string; label: string; ai: number; hu: number }> }) {
  const [hIdx, setHIdx] = useState<number | null>(null);
  const dims: Array<{ key: string; label: string; ai: number; hu: number }> =
    data && data.length > 0
      ? data
      : agentSharePct > 0
        ? [
            { key: "volume", label: "Volume", ai: agentSharePct, hu: 100 - agentSharePct },
            { key: "conversion", label: "Conversion", ai: agentSharePct, hu: 100 - agentSharePct },
          ]
        : [];
  if (dims.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Agent Intelligence</h2>
        <p className="mt-4 text-xs text-muted-foreground">No agent comparison data reported by the API.</p>
      </div>
    );
  }
  const cx = 190, cy = 125, r = 75, n = dims.length;
  const gc = (i: number, s: number) => { const a = (i * 2 * Math.PI) / n - Math.PI / 2; const rr = (r * s) / 100; return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) }; };
  const lc = (i: number) => { const a = (i * 2 * Math.PI) / n - Math.PI / 2; const lr = r + 24; return { x: cx + lr * Math.cos(a), y: cy + lr * Math.sin(a) }; };
  const aiPts = dims.map((d, i) => { const { x, y } = gc(i, d.ai); return `${x},${y}`; }).join(" ");
  const huPts = dims.map((d, i) => { const { x, y } = gc(i, d.hu); return `${x},${y}`; }).join(" ");
  const gl = [0.25, 0.5, 0.75, 1.0];
  const hd = hIdx !== null ? dims[hIdx] : null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <h2 className="text-sm font-semibold text-foreground">Agent Intelligence</h2>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /><span className="text-muted-foreground">Human</span></div>
          <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple-500" /><span className="text-muted-foreground">AI Agent</span></div>
        </div>
      </div>
      <div className="relative flex items-center justify-center pt-2 pb-1">
        <svg viewBox="0 0 380 250" className="w-full max-w-[380px] h-[230px] overflow-visible select-none">
          {gl.map((lvl, idx) => <polygon key={idx} points={dims.map((_, i) => { const { x, y } = gc(i, lvl * 100); return `${x},${y}`; }).join(" ")} fill="none" stroke="currentColor" strokeWidth={idx === gl.length - 1 ? "1.2" : "0.8"} strokeDasharray={idx === gl.length - 1 ? "none" : "3,3"} className="text-border" />)}
          {dims.map((_, i) => { const { x, y } = gc(i, 100); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="currentColor" strokeWidth="1" className="text-border" />; })}
          <polygon points={huPts} fill="rgba(59,130,246,0.14)" stroke="#3b82f6" strokeWidth="1.75" strokeDasharray="4,2" />
          <polygon points={aiPts} fill="rgba(168,85,247,0.20)" stroke="#a855f7" strokeWidth="2" />
          {dims.map((dim, i) => {
            const ai = gc(i, dim.ai), hu = gc(i, dim.hu), lp = lc(i), h = hIdx === i;
            let ta: "middle" | "start" | "end" = "middle";
            if (i === 1 || i === 2) ta = "start"; if (i === 4 || i === 5) ta = "end";
            return (
              <g key={i}>
                <text x={lp.x} y={lp.y + (i === 0 ? -4 : i === 3 ? 12 : 4)} textAnchor={ta} className={cn("text-[11px] font-medium cursor-pointer select-none transition-colors", h ? "fill-purple-400 font-semibold" : "fill-muted-foreground")} onMouseEnter={() => setHIdx(i)} onMouseLeave={() => setHIdx(null)}>{dim.label}</text>
                <circle cx={hu.x} cy={hu.y} r={h ? 4.5 : 3} fill={h ? "#93c5fd" : "#3b82f6"} stroke="currentColor" strokeWidth="1" className="text-background pointer-events-none" />
                <circle cx={ai.x} cy={ai.y} r={h ? 6 : 4} fill={h ? "#c084fc" : "#a855f7"} stroke="currentColor" strokeWidth={h ? "2" : "1"} className="text-background pointer-events-none" />
                <circle cx={ai.x} cy={ai.y} r={18} fill="transparent" className="cursor-pointer" onMouseEnter={() => setHIdx(i)} onMouseLeave={() => setHIdx(null)} />
              </g>
            );
          })}
        </svg>
        {hd && hIdx !== null && (
          <div className={cn("absolute pointer-events-none z-30 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in zoom-in-95 min-w-[150px]", hIdx === 0 && "top-2 left-1/2 -translate-x-1/2", (hIdx === 1 || hIdx === 2) && "top-1/4 right-3", hIdx === 3 && "bottom-2 left-1/2 -translate-x-1/2", (hIdx === 4 || hIdx === 5) && "top-1/4 left-3")}>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" /><span className="text-muted-foreground text-[11px]">AI Agent</span></div><span className="font-mono font-bold text-foreground text-xs">{hd.ai}%</span></div>
              <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" /><span className="text-muted-foreground text-[11px]">Human</span></div><span className="font-mono font-bold text-foreground text-xs">{hd.hu}%</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Insight Card ────────────────────────────────────────────────────────────
export function InsightCard({ insight }: { insight: { id: string; type: string; severity: string; title: string; summary: string; confidence: string } }) {
  const iconMap: Record<string, typeof Lightbulb> = { underperforming_recommendation: Lightbulb, selection_purchase_dropoff: AlertTriangle, rank_position_selection_gap: Info };
  const toneMap: Record<string, string> = { opportunity: "border-amber-500/30 bg-amber-500/5", warning: "border-rose-500/30 bg-rose-500/5", info: "border-blue-500/30 bg-blue-500/5" };
  const iconToneMap: Record<string, string> = { opportunity: "text-amber-500", warning: "text-rose-500", info: "text-blue-500" };
  const Icon = iconMap[insight.type] || Lightbulb;
  return (
    <div className={cn("rounded-lg border p-3 space-y-1.5", toneMap[insight.severity] || toneMap.info)}>
      <div className="flex items-start gap-2">
        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", iconToneMap[insight.severity] || iconToneMap.info)} />
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground leading-tight">{insight.title}</div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{insight.summary}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pl-6">
        <span className="capitalize">{insight.confidence}</span><span>·</span><span className="capitalize">{insight.severity}</span>
      </div>
    </div>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────
