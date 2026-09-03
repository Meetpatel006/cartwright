"use client";

import { useState, useRef } from "react";
import { cn } from "@cartwright/ui/lib/utils";
import { Plus, Minus, RotateCcw } from "lucide-react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { INDIA_STATE_PATHS } from "./india-states-data";

export interface GeoCityDatum {
  city: string;
  state: string;
  stateId?: string;
  orders: number;
  share: number;
  revenue: number;
  coords: { x: number; y: number };
}

function FormattedAmount({ amount }: { amount: number }) {
  const parts = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).formatToParts(amount);

  const symbol = parts.find((p) => p.type === "currency")?.value || "₹";
  const num = parts.filter((p) => p.type !== "currency").map((p) => p.value).join("").trim();

  return (
    <span suppressHydrationWarning className="font-mono whitespace-nowrap">
      <span className="text-muted-foreground font-normal mr-0.5">{symbol}</span>
      <span className="font-bold text-foreground">{num}</span>
    </span>
  );
}

export function IndiaMapChart({
  hubs = [],
  title = "Geographic Distribution",
}: {
  hubs?: GeoCityDatum[];
  title?: string;
}) {
  const [hoveredCity, setHoveredCity] = useState<GeoCityDatum | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const transformComponentRef = useRef<ReactZoomPanPinchRef | null>(null);

  // Map state IDs to hub data for state coloring
  const hubByStateId = new Map<string, GeoCityDatum>();
  hubs.forEach((h) => {
    if (h.stateId) hubByStateId.set(h.stateId, h);
    if (h.state.includes("Karnataka")) hubByStateId.set("INKA", h);
    if (h.state.includes("Delhi")) hubByStateId.set("INDL", h);
    if (h.state.includes("Maharashtra")) hubByStateId.set("INMH", h);
    if (h.state.includes("Telangana")) hubByStateId.set("INTG", h);
    if (h.state.includes("Tamil Nadu")) hubByStateId.set("INTN", h);
    if (h.state.includes("Gujarat")) hubByStateId.set("INGJ", h);
    if (h.state.includes("West Bengal")) hubByStateId.set("INWB", h);
  });

  return (
    <div className="group rounded-xl border border-border bg-card text-card-foreground p-5 flex flex-col justify-between relative overflow-hidden">
      <div>
        {/* Card Header */}
        <div className="flex items-center justify-between gap-2 pb-1">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          </div>
        </div>

        {/* Interactive Zoomable Map Container */}
        <div className="relative flex items-center justify-center min-h-[350px] w-full pt-1 pb-1 overflow-hidden">
          <TransformWrapper
            ref={transformComponentRef}
            initialScale={1}
            minScale={0.8}
            maxScale={4}
            centerOnInit
            wheel={{ step: 0.1 }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                {/* Floating Map Controls - Visible on Hover Only */}
                <div className="absolute right-3 bottom-3 z-30 flex flex-col gap-1.5 bg-background/90 backdrop-blur-md border border-border rounded-lg p-1 shadow-none opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none group-hover:pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => zoomIn(0.3)}
                    aria-label="Zoom in"
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => zoomOut(0.3)}
                    aria-label="Zoom out"
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => resetTransform()}
                    aria-label="Reset view"
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border-t border-border/50 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                </div>

                {/* SVG Pan & Zoom Layer */}
                <TransformComponent
                  wrapperClass="!w-full !h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
                  contentClass="!w-full !h-full flex items-center justify-center"
                >
                  <svg
                    viewBox="90 40 790 890"
                    className="w-full max-w-[500px] h-[340px] overflow-visible select-none"
                  >
                    {/* Render Authentic India State Boundaries */}
                    <g id="india-states">
                      {INDIA_STATE_PATHS.map((state) => {
                        const hub = hubByStateId.get(state.id);
                        const isStateHovered = hoveredState === state.name || hoveredCity?.stateId === state.id;
                        const hasHub = Boolean(hub);

                        return (
                          <path
                            key={state.id}
                            d={state.d}
                            id={state.id}
                            className={cn(
                              "transition-all duration-200 cursor-pointer stroke-[0.8px]",
                              hasHub
                                ? isStateHovered
                                  ? "fill-emerald-500/30 stroke-emerald-500"
                                  : "fill-emerald-500/15 stroke-border"
                                : isStateHovered
                                ? "fill-muted/60 stroke-muted-foreground/50"
                                : "fill-muted/25 stroke-border/60 hover:fill-muted/50"
                            )}
                            onMouseEnter={() => {
                              setHoveredState(state.name);
                              if (hub) setHoveredCity(hub);
                            }}
                            onMouseLeave={() => {
                              setHoveredState(null);
                              setHoveredCity(null);
                            }}
                          />
                        );
                      })}
                    </g>

                    {/* City Hub Beacon Markers */}
                    <g id="city-markers">
                      {hubs.map((hub) => {
                        const isHovered = hoveredCity?.city === hub.city;
                        const dotRadius = Math.max(7, Math.min(13, hub.share / 2.8));

                        return (
                          <g
                            key={hub.city}
                            className="cursor-pointer transition-transform duration-200"
                            onMouseEnter={() => {
                              setHoveredCity(hub);
                              if (hub.state) setHoveredState(hub.state);
                            }}
                            onMouseLeave={() => {
                              setHoveredCity(null);
                              setHoveredState(null);
                            }}
                          >
                            {/* Pulsing Outer Radar Ring */}
                            <circle
                              cx={hub.coords.x}
                              cy={hub.coords.y}
                              r={dotRadius * (isHovered ? 2.8 : 1.9)}
                              fill="#10b981"
                              opacity={isHovered ? 0.45 : 0.22}
                              className={cn(isHovered && "animate-pulse")}
                            />

                            {/* Core Hub Dot */}
                            <circle
                              cx={hub.coords.x}
                              cy={hub.coords.y}
                              r={isHovered ? dotRadius + 3 : dotRadius}
                              fill={isHovered ? "#10b981" : "#3b82f6"}
                              stroke="#ffffff"
                              strokeWidth="2"
                              className="transition-all duration-200"
                            />

                            {/* City Name Label */}
                            <text
                              x={
                                hub.city === "Mumbai" || hub.city === "Bengaluru"
                                  ? hub.coords.x - (dotRadius + 8)
                                  : hub.coords.x + (dotRadius + 8)
                              }
                              y={
                                hub.city === "Bengaluru"
                                  ? hub.coords.y + 14
                                  : hub.city === "Chennai"
                                  ? hub.coords.y + 14
                                  : hub.coords.y + 4
                              }
                              textAnchor={
                                hub.city === "Mumbai" || hub.city === "Bengaluru"
                                  ? "end"
                                  : "start"
                              }
                              className={cn(
                                "text-[16px] font-semibold tracking-tight transition-all pointer-events-none select-none",
                                isHovered
                                  ? "fill-emerald-400 font-bold"
                                  : "fill-foreground/90 font-medium"
                              )}
                            >
                              {hub.city}
                            </text>

                            {/* Large Hit Area */}
                            <circle
                              cx={hub.coords.x}
                              cy={hub.coords.y}
                              r={28}
                              fill="transparent"
                            />
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                </TransformComponent>
              </>
            )}
          </TransformWrapper>

          {/* Hover Tooltip Overlay */}
          {hoveredCity && (
            <div className="absolute pointer-events-none z-30 bottom-3 left-3 rounded-lg border border-border bg-popover/95 px-3 py-1.5 text-xs text-popover-foreground shadow-none backdrop-blur-md min-w-[150px] animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-1">
                <span className="font-semibold text-foreground text-xs">
                  {hoveredCity.city}
                  <span className="text-[10px] text-muted-foreground font-normal ml-1">({hoveredCity.state})</span>
                </span>
                <span className="font-mono text-[10px] text-emerald-500 font-bold">{hoveredCity.share}%</span>
              </div>
              <div className="pt-1 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{hoveredCity.orders} orders</span>
                <span className="font-mono font-semibold text-foreground">
                  <FormattedAmount amount={hoveredCity.revenue} />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default IndiaMapChart;
